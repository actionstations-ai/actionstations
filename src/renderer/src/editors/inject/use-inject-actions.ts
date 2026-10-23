// Editor actions over IPC. Saves merge the draft onto the latest stored inject. While a
// generation job owns the scenario a save answers CONFLICT: the draft is kept, a banner says
// so, and the save runs again when the job finishes (the caller calls retryPending on job:done).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Inject } from '@shared/schemas/inject'
import type { JobKind } from '@shared/schemas/job'
import { toast } from '../../components/toast-store'
import { call, IpcError } from '../../lib/api'
import { queryClient } from '../../lib/query'
import { applyDraft, draftKey, useDrafts, type InjectDraft } from './draft'
import type { RenderPathId } from './media-utils'

export interface ActionContext {
  projectPath: string
  scenarioId: string
  injectId: string
  draft: InjectDraft
  dirty: boolean
  track: (jobId: string, kind: JobKind) => void
}

const isConflict = (e: unknown) => e instanceof IpcError && e.code === 'CONFLICT'
const WAIT = 'Generation is running for this scenario; try again when it finishes'

function refresh() {
  for (const key of ['injects:get', 'injects:list', 'scenarios:get'])
    void queryClient.invalidateQueries({ queryKey: [key] })
}

const idsOf = (c: ActionContext) => ({
  projectPath: c.projectPath,
  scenarioId: c.scenarioId,
  injectId: c.injectId,
})

async function writeInject(c: ActionContext, build: (latest: Inject) => Inject, note?: string) {
  const ids = idsOf(c)
  const latest = await call('injects:get', ids)
  const saved = await call('injects:save', {
    projectPath: c.projectPath,
    scenarioId: c.scenarioId,
    inject: build(latest),
    ...(note ? { note } : {}),
  })
  queryClient.setQueryData(['injects:get', ids], saved)
  refresh()
  return saved
}

type CtxRef = { readonly current: ActionContext }

/** Store the draft: true when saved, 'conflict' when a job owns the scenario, false on failure. */
async function storeDraft(c: ActionContext): Promise<boolean | 'conflict'> {
  try {
    await writeInject(c, (latest) => applyDraft(latest, c.draft))
    useDrafts.getState().drop(draftKey(c.scenarioId, c.injectId))
    toast.success('Inject saved')
    return true
  } catch (e) {
    if (isConflict(e)) return 'conflict'
    toast.error('Save failed', e)
    return false
  }
}

async function renderAssets(c: ActionContext) {
  try {
    const assets = await call('render:inject', idsOf(c))
    refresh()
    const files = assets.filter((a) => a.role === 'rendered' || a.role === 'composite')
    toast.success('Rendered', `${files.length} file(s) written`)
    return assets
  } catch (e) {
    toast.error(isConflict(e) ? WAIT : 'Render failed', e)
    return null
  }
}

async function changeLock(c: ActionContext, locked: boolean) {
  try {
    await writeInject(c, (l) => ({ ...l, locked }), locked ? 'locked' : 'unlocked')
    toast.info(locked ? 'Inject locked' : 'Inject unlocked')
  } catch (e) {
    toast.error(isConflict(e) ? WAIT : 'Could not change the lock', e)
  }
}

async function startTracked(
  ref: CtxRef,
  kind: JobKind,
  start: () => Promise<{ jobId: string }>,
): Promise<string | null> {
  try {
    const { jobId } = await start()
    ref.current.track(jobId, kind)
    return jobId
  } catch (e) {
    toast.error(
      isConflict(e)
        ? 'Another generation job is running for this scenario'
        : 'Could not start the job',
      e,
    )
    return null
  }
}

async function restoreVersion(c: ActionContext, versionIndex: number) {
  try {
    const saved = await call('injects:restore-version', { ...idsOf(c), versionIndex })
    useDrafts.getState().drop(draftKey(c.scenarioId, c.injectId))
    queryClient.setQueryData(['injects:get', idsOf(c)], saved)
    refresh()
    toast.success(`Restored version ${versionIndex + 1}`)
  } catch (e) {
    toast.error(isConflict(e) ? WAIT : 'Restore failed', e)
  }
}

async function deleteInject(c: ActionContext): Promise<boolean> {
  try {
    await call('injects:delete', idsOf(c))
    useDrafts.getState().drop(draftKey(c.scenarioId, c.injectId))
    refresh()
    toast.success('Inject deleted')
    return true
  } catch (e) {
    toast.error(isConflict(e) ? WAIT : 'Delete failed', e)
    return false
  }
}

async function saveLibraryItem(c: ActionContext, name: string) {
  try {
    await call('library:save', { ...idsOf(c), name })
    void queryClient.invalidateQueries({ queryKey: ['library:list'] })
    toast.success('Saved to library', name)
  } catch (e) {
    toast.error('Could not save to the library', e)
  }
}

/** Which action is running ('save', 'render', …): set for the length of `during(tag, run)`. */
export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null)
  const during = useCallback(async <T>(tag: string, run: () => Promise<T>): Promise<T> => {
    setBusy(tag)
    try {
      return await run()
    } finally {
      setBusy(null)
    }
  }, [])
  return { busy, during }
}

/** Start a "regenerate text" job for the inject, with optional instructions. */
const regenerateText = (ref: CtxRef, instructions: string) =>
  startTracked(ref, 'generate-injects', () =>
    call('injects:regenerate-text', {
      ...idsOf(ref.current),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    }),
  )

/** Start a "regenerate media" job for the chosen render paths. */
const regenerateMedia = (ref: CtxRef, paths: RenderPathId[]) =>
  startTracked(ref, 'render-media', () =>
    call('injects:regenerate-media', { ...idsOf(ref.current), paths }),
  )

export function useInjectActions(ctx: ActionContext) {
  const [pendingSave, setPendingSave] = useState(false)
  const { busy, during } = useBusy()
  const ctxRef = useRef(ctx)
  useEffect(() => {
    ctxRef.current = ctx
  })

  /** Save the draft. Resolves true when stored; false when queued behind a job or failed. */
  const save = useCallback(
    () =>
      during('save', async () => {
        const stored = await storeDraft(ctxRef.current)
        if (stored !== false) setPendingSave(stored === 'conflict')
        return stored === true
      }),
    [during],
  )

  const retryPending = useCallback(() => {
    if (pendingSave) void save()
  }, [pendingSave, save])

  /** Save first when dirty, so a render never shows stale text. */
  const savedFirst = async () => !ctxRef.current.dirty || (await save())

  const render = useCallback(async () => {
    if (ctxRef.current.dirty && !(await save())) return null
    return during('render', () => renderAssets(ctxRef.current))
  }, [save, during])

  return {
    busy,
    pendingSave,
    save,
    retryPending,
    render,
    setLocked: (locked: boolean) => during('lock', () => changeLock(ctxRef.current, locked)),
    regenerateText: (instructions: string) => regenerateText(ctxRef, instructions),
    regenerateMedia: (paths: RenderPathId[]) => regenerateMedia(ctxRef, paths),
    restore: (versionIndex: number) =>
      during('restore', () => restoreVersion(ctxRef.current, versionIndex)),
    remove: () => deleteInject(ctxRef.current),
    saveToLibrary: async (name: string) => {
      if (await savedFirst()) await saveLibraryItem(ctxRef.current, name)
    },
  }
}
