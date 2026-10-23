// Wires the editor reducer to main: debounced optimistic saves, CONFLICT handling while a
// generation job owns the scenario (retry on job:done), and lint after each save.
// Saves carry the updatedAt of the copy they were made from: when main holds a newer scenario
// (a job or another editor wrote it) the save is refused as stale and redone onto the newer
// copy, so only phases, MSEL and rubric links are ever replaced (#199). Leaving the editor
// saves a pending edit at once; refused because a job runs, it is parked in ../docs/pending-saves
// and taken back when the editor opens again (#193). Unsaved edits are reported before quit (#196).
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Scenario } from '@shared/schemas/scenario'
import { toast } from '../../components/toast-store'
import { IpcError, call, subscribe } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient } from '../../lib/query'
import { parkPendingSave, peekPending, pendingKey, usePendingSaves } from '../docs/pending-saves'
import { useUnsavedSource } from '../unsaved-work'
import { editorReducer, idsOf, initEditor, mergeDraft, type EditorState } from './editor-state'
import type { Draft } from './model'

export const SAVE_DEBOUNCE_MS = 700
export const SAVE_NOTE = 'MSEL edit'
export const MSEL_LABEL = 'MSEL'

export interface MselEditorApi {
  state: EditorState
  edit: (next: Draft) => void
  undo: () => void
  redo: () => void
  retryNow: () => void
  reload: () => Promise<void>
}

const conflictReason = (e: unknown): string | undefined =>
  e instanceof IpcError && e.code === 'CONFLICT'
    ? ((e.details as { reason?: string } | undefined)?.reason ?? 'busy')
    : undefined
const isStale = (e: unknown) => conflictReason(e) === 'stale'
/** CONFLICT because a generation job owns the scenario (retried on job:done). */
const isBusy = (e: unknown) => conflictReason(e) === 'busy'

/** Save `draft` onto `base`; when main has a newer scenario, onto that one instead (once). */
export async function writeDraft(
  projectPath: string,
  base: Scenario,
  draft: Draft,
  savedIds: Record<string, string>,
): Promise<Scenario> {
  const save = (onto: Scenario) =>
    call('scenarios:save', {
      projectPath,
      scenario: mergeDraft(onto, draft, savedIds),
      note: SAVE_NOTE,
      baseUpdatedAt: onto.updatedAt,
    })
  try {
    return await save(base)
  } catch (e) {
    if (!isStale(e)) throw e
    return save(await call('scenarios:get', { projectPath, scenarioId: base.id }))
  }
}

interface ParkedMsel {
  draft: Draft
  savedIds: Record<string, string>
}

const mselParkKey = (projectPath: string, scenarioId: string) =>
  pendingKey(projectPath, scenarioId, 'msel')

function parkMsel(projectPath: string, scenarioId: string, value: ParkedMsel): void {
  parkPendingSave({
    key: mselParkKey(projectPath, scenarioId),
    scenarioId,
    label: MSEL_LABEL,
    value,
    write: async (v) => {
      const { draft, savedIds } = v as ParkedMsel
      const latest = await call('scenarios:get', { projectPath, scenarioId })
      await writeDraft(projectPath, latest, draft, savedIds)
    },
  })
}

function refreshAfterSave(): void {
  void queryClient.invalidateQueries({ queryKey: ['scenarios:lint'] })
  void queryClient.invalidateQueries({ queryKey: ['scenarios:history'] })
}

/** What the last successful save wrote; ahead of the reducer state once the editor is gone. */
interface Committed {
  revision: number
  base: Scenario
  ids: Record<string, string>
}

export function useMselEditor(projectPath: string, scenario: Scenario): MselEditorApi {
  const [state, dispatch] = useReducer(editorReducer, scenario, initEditor)
  // Adopt newer scenarios from main during render (React's "adjust state on prop change").
  const [seen, setSeen] = useState(scenario)
  if (scenario !== seen) {
    setSeen(scenario)
    dispatch({ type: 'server', scenario })
  }
  const latest = useRef(state)
  useEffect(() => {
    latest.current = state
  })
  const committed = useRef<Committed>({ revision: 0, base: scenario, ids: state.savedIds })
  const inflight = useRef<Promise<unknown> | undefined>(undefined)

  const unsaved = useCallback(() => {
    const s = latest.current
    return s.revision !== s.savedRevision && s.revision !== committed.current.revision
  }, [])

  /** The newest known copy of the scenario and the row ids it was saved with. */
  const newestBase = useCallback((s: EditorState) => {
    const c = committed.current
    return c.base.updatedAt > s.base.updatedAt
      ? { base: c.base, ids: c.ids }
      : { base: s.base, ids: s.savedIds }
  }, [])

  const runSave = useCallback(
    async (s: EditorState) => {
      const revision = s.revision
      const ids = idsOf(s.draft)
      const { base, ids: savedIds } = newestBase(s)
      dispatch({ type: 'saving' })
      try {
        const saved = await writeDraft(projectPath, base, s.draft, savedIds)
        committed.current = { revision, base: saved, ids }
        dispatch({ type: 'saved', scenario: saved, revision, ids })
        refreshAfterSave()
      } catch (e) {
        if (conflictReason(e)) dispatch({ type: 'conflict', message: errorText(e) })
        else dispatch({ type: 'failed', message: errorText(e) })
      }
    },
    [projectPath, newestBase],
  )

  const track = useCallback((p: Promise<unknown>) => {
    inflight.current = p
    return p
  }, [])

  const save = useCallback(async () => {
    const s = latest.current
    if (!unsaved() || s.status === 'conflict' || s.status === 'saving') return
    await track(runSave(s))
  }, [runSave, track, unsaved])

  useEffect(() => {
    if (state.status !== 'pending') return
    const t = setTimeout(() => void save(), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [state.status, state.revision, save])

  // A generation job held the scenario: try again as soon as any job finishes.
  useEffect(
    () =>
      subscribe('job:done', () => {
        if (latest.current.status === 'conflict') dispatch({ type: 'retry' })
      }),
    [],
  )

  // Take back an edit parked when this MSEL was last left during generation.
  const parkKey = mselParkKey(projectPath, scenario.id)
  useEffect(() => {
    const parked = peekPending(parkKey)
    if (!parked) return
    usePendingSaves.getState().drop(parkKey)
    const { draft, savedIds } = parked.value as ParkedMsel
    dispatch({ type: 'restore', draft, savedIds })
  }, [parkKey])

  // Leaving the editor (tab, route, scenario) saves a pending edit now instead of dropping it.
  useEffect(() => {
    const scenarioId = scenario.id
    return () => {
      void (async () => {
        await inflight.current?.catch(() => undefined)
        if (!unsaved()) return
        const s = latest.current
        const { base, ids } = newestBase(s)
        try {
          await writeDraft(projectPath, base, s.draft, ids)
          refreshAfterSave()
        } catch (e) {
          if (isBusy(e)) parkMsel(projectPath, scenarioId, { draft: s.draft, savedIds: ids })
          else toast.error('Could not save your MSEL edit', e)
        }
      })()
    }
  }, [projectPath, scenario.id, unsaved, newestBase])

  // Before quitting: save a pending edit now; a refused one is reported as unsaved.
  useUnsavedSource(MSEL_LABEL, unsaved, async () => {
    await inflight.current?.catch(() => undefined)
    if (unsaved()) await track(runSave(latest.current))
  })

  const reload = useCallback(async () => {
    const fresh = await call('scenarios:get', { projectPath, scenarioId: scenario.id })
    dispatch({ type: 'reset', scenario: fresh })
  }, [projectPath, scenario.id])

  return {
    state,
    edit: useCallback((draft: Draft) => dispatch({ type: 'edit', draft }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    retryNow: useCallback(() => dispatch({ type: 'retry' }), []),
    reload,
  }
}
