// Loads the facilitator session state once, keeps the working copy locally and saves it back:
// clock and delivery changes at once, typed notes after a short pause. Saves are serialized
// and always send the latest full state. A failed save keeps the changes unsaved and is
// retried; one that fails after the page was left is reported in a toast (#204).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FacilitatorState } from '@shared/ipc'
import { toast } from '../../components/toast-store'
import { useUnsavedSource } from '../../editors/unsaved-work'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export const NOTE_SAVE_DELAY_MS = 600
/** Wait before saving again after a failed save. */
export const SAVE_RETRY_MS = 3000

export interface FacilitatorStore {
  state: FacilitatorState | undefined
  loadError: string | undefined
  saveStatus: SaveStatus
  /** Apply a change; `debounce` waits for typing to pause before saving. */
  update: (fn: (s: FacilitatorState) => FacilitatorState, opts?: { debounce?: boolean }) => void
}

export function useFacilitatorState(projectPath: string, scenarioId: string): FacilitatorStore {
  const [state, setState] = useState<FacilitatorState>()
  const [loadError, setLoadError] = useState<string>()
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const latest = useRef<FacilitatorState | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const dirty = useRef(false)

  useEffect(() => {
    let live = true
    call('facilitator:state-get', { projectPath, scenarioId }).then(
      (s) => {
        if (!live) return
        latest.current = s
        setState(s)
      },
      (err: unknown) => live && setLoadError(errorText(err)),
    )
    return () => {
      live = false
    }
  }, [projectPath, scenarioId])

  // The scenario this page currently works on; a save result for another one is ignored.
  const scope = `${projectPath}\u0000${scenarioId}`
  const live = useRef<string | undefined>(undefined)
  useEffect(() => {
    live.current = scope
    return () => {
      live.current = undefined
    }
  }, [scope])
  const flushRef = useRef<() => Promise<unknown>>(() => Promise.resolve())

  const flush = useCallback((): Promise<unknown> => {
    clearTimeout(timer.current)
    timer.current = undefined
    if (!dirty.current || !latest.current) return chain.current
    dirty.current = false
    const state = latest.current
    setSaveStatus('saving')
    const saved = chain.current
      .catch(() => undefined)
      .then(() => call('facilitator:state-save', { projectPath, scenarioId, state }))
    chain.current = saved.then(
      () => {
        if (live.current === scope) setSaveStatus(dirty.current ? 'saving' : 'saved')
      },
      (err: unknown) => {
        if (live.current !== scope) {
          toast.error('Could not save the facilitator notes', err)
          return
        }
        // Still unsaved: the next save sends the latest full state again.
        dirty.current = true
        setSaveStatus('error')
        clearTimeout(timer.current)
        timer.current = setTimeout(() => void flushRef.current(), SAVE_RETRY_MS)
      },
    )
    return chain.current
  }, [projectPath, scenarioId, scope])
  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  const update = useCallback<FacilitatorStore['update']>(
    (fn, opts) => {
      if (!latest.current) return
      const next = fn(latest.current)
      latest.current = next
      setState(next)
      dirty.current = true
      if (opts?.debounce) {
        setSaveStatus('saving')
        clearTimeout(timer.current)
        timer.current = setTimeout(flush, NOTE_SAVE_DELAY_MS)
      } else flush()
    },
    [flush],
  )

  // Leaving the page (or switching scenario) saves pending notes immediately.
  useEffect(
    () => () => {
      void flush()
    },
    [flush],
  )
  // Before quitting: save now; a failed save is reported as unsaved.
  useUnsavedSource(
    'Facilitator notes',
    () => dirty.current,
    () => flush(),
  )

  return { state, loadError, saveStatus, update }
}
