// Loads the facilitator session state once, keeps the working copy locally and saves it back:
// clock and delivery changes at once, typed notes after a short pause. Saves are serialized
// and always send the latest full state.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FacilitatorState } from '@shared/ipc'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export const NOTE_SAVE_DELAY_MS = 600

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

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    if (!dirty.current || !latest.current) return
    dirty.current = false
    setSaveStatus('saving')
    chain.current = chain.current
      .catch(() => undefined)
      .then(() =>
        call('facilitator:state-save', { projectPath, scenarioId, state: latest.current! }),
      )
      .then(
        () => setSaveStatus(dirty.current ? 'saving' : 'saved'),
        () => setSaveStatus('error'),
      )
  }, [projectPath, scenarioId])

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
  useEffect(() => () => flush(), [flush])

  return { state, loadError, saveStatus, update }
}
