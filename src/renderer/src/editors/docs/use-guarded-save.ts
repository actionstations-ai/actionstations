// Saving that survives a running generation job. While a job owns the scenario the store
// answers CONFLICT; the edit stays in the editor, a banner explains why, and the save is
// retried automatically when a job finishes (job:done). When the editor is already closed
// (its tab or document was left) the edit is parked in ./pending-saves instead (#115).
import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribe } from '../../lib/api'
import { isConflict } from './conflict'
import { parkPendingSave } from './pending-saves'
import { useLatest } from './use-latest'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'blocked' | 'error'

export { isConflict }

/** Where an edit goes when its save is refused after the editor closed. */
export interface ParkTarget {
  key: string
  scenarioId: string
  label: string
}

export function useGuardedSave<T>(
  write: (value: T) => Promise<void>,
  onSaved?: (value: T) => void,
  park?: ParkTarget,
) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<{ value: T } | null>(null)
  const writeRef = useLatest(write)
  const savedRef = useLatest(onSaved)
  const parkRef = useLatest(park)
  const statusRef = useRef<SaveStatus>('idle')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const set = (s: SaveStatus) => {
    statusRef.current = s
    setStatus(s)
  }

  const save = useCallback(
    async (value: T): Promise<boolean> => {
      pending.current = { value }
      set('saving')
      setError(null)
      const write = writeRef.current
      try {
        await write(value)
        if (pending.current?.value === value) pending.current = null
        set('saved')
        savedRef.current?.(value)
        return true
      } catch (e) {
        const target = parkRef.current
        if (isConflict(e) && !mounted.current && target) {
          parkPendingSave({ ...target, value, write: (v) => write(v as T) })
        } else if (isConflict(e)) {
          set('blocked')
        } else {
          setError(e instanceof Error ? e.message : String(e))
          set('error')
        }
        return false
      }
    },
    [writeRef, savedRef, parkRef],
  )

  const retry = useCallback(() => {
    const p = pending.current
    return p ? save(p.value) : Promise.resolve(true)
  }, [save])

  useEffect(
    () =>
      subscribe('job:done', () => {
        if (statusRef.current === 'blocked') void retry()
      }),
    [retry],
  )

  return { status, error, save, retry }
}
