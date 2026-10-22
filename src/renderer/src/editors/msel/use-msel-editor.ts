// Wires the editor reducer to main: debounced optimistic saves, CONFLICT handling while a
// generation job owns the scenario (retry on job:done), and lint after each save.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Scenario } from '@shared/schemas/scenario'
import { IpcError, call, subscribe } from '../../lib/api'
import { queryClient } from '../../lib/query'
import {
  editorReducer,
  idsOf,
  initEditor,
  isDirty,
  scenarioToSave,
  type EditorState,
} from './editor-state'
import type { Draft } from './model'
import { errorText } from '../../lib/errors'

export const SAVE_DEBOUNCE_MS = 700
export const SAVE_NOTE = 'MSEL edit'

export interface MselEditorApi {
  state: EditorState
  edit: (next: Draft) => void
  undo: () => void
  redo: () => void
  retryNow: () => void
  reload: () => Promise<void>
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

  const save = useCallback(async () => {
    const s = latest.current
    if (!isDirty(s) || s.status === 'conflict' || s.status === 'saving') return
    const revision = s.revision
    const ids = idsOf(s.draft)
    dispatch({ type: 'saving' })
    try {
      const saved = await call('scenarios:save', {
        projectPath,
        scenario: scenarioToSave(s),
        note: SAVE_NOTE,
      })
      dispatch({ type: 'saved', scenario: saved, revision, ids })
      void queryClient.invalidateQueries({ queryKey: ['scenarios:lint'] })
      void queryClient.invalidateQueries({ queryKey: ['scenarios:history'] })
    } catch (e) {
      const err = e as Error
      if (e instanceof IpcError && e.code === 'CONFLICT')
        dispatch({ type: 'conflict', message: errorText(err) })
      else dispatch({ type: 'failed', message: errorText(err) })
    }
  }, [projectPath])

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
