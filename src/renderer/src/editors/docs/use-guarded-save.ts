// Saving that survives a running generation job. While a job owns the scenario the store
// answers CONFLICT; the edit stays in the editor, a banner explains why, and the save is
// retried automatically when a job finishes (job:done).
import { useCallback, useEffect, useRef, useState } from 'react'
import { IpcError, subscribe } from '../../lib/api'
import { useLatest } from './use-latest'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'blocked' | 'error'

export const isConflict = (e: unknown): boolean => e instanceof IpcError && e.code === 'CONFLICT'

export function useGuardedSave<T>(
  write: (value: T) => Promise<void>,
  onSaved?: (value: T) => void,
) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<{ value: T } | null>(null)
  const writeRef = useLatest(write)
  const savedRef = useLatest(onSaved)
  const statusRef = useRef<SaveStatus>('idle')
  const set = (s: SaveStatus) => {
    statusRef.current = s
    setStatus(s)
  }

  const save = useCallback(
    async (value: T): Promise<boolean> => {
      pending.current = { value }
      set('saving')
      setError(null)
      try {
        await writeRef.current(value)
        if (pending.current?.value === value) pending.current = null
        set('saved')
        savedRef.current?.(value)
        return true
      } catch (e) {
        if (isConflict(e)) {
          set('blocked')
        } else {
          setError(e instanceof Error ? e.message : String(e))
          set('error')
        }
        return false
      }
    },
    [writeRef, savedRef],
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
