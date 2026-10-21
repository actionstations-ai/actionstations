import { useCallback, useEffect, useRef, useState } from 'react'
import type { JobDoneEvent, JobProgressEvent } from '@shared/schemas/job'
import { subscribe } from '../../lib/api'
import { applyProgress, clearJob, seedJob, type LiveMap } from './job-progress'

const EARLY_LIMIT = 50

/** Remember an event for a job we may not know yet, keeping only the most recent few. */
function remember<T>(map: Map<string, T>, jobId: string, value: T): void {
  map.delete(jobId)
  map.set(jobId, value)
  if (map.size > EARLY_LIMIT) map.delete(map.keys().next().value as string)
}

/**
 * Track jobs started from this screen and expose live progress per target.
 * Events that arrive before `track` is called (the job can start emitting before the
 * invoke resolves) are buffered and replayed.
 */
export function useJobProgress(onDone?: (e: JobDoneEvent, targets: string[]) => void) {
  const [live, setLive] = useState<LiveMap>({})
  const jobs = useRef(new Map<string, string[]>())
  const early = useRef(new Map<string, JobProgressEvent>())
  const earlyDone = useRef(new Map<string, JobDoneEvent>())
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  const finish = useCallback((e: JobDoneEvent, targets: string[]) => {
    jobs.current.delete(e.jobId)
    setLive((l) => clearJob(l, e.jobId))
    doneRef.current?.(e, targets)
  }, [])

  useEffect(() => {
    const offProgress = subscribe('job:progress', (e) => {
      const targets = jobs.current.get(e.jobId)
      if (!targets) {
        remember(early.current, e.jobId, e)
        return
      }
      setLive((l) => applyProgress(l, targets, e))
    })
    const offDone = subscribe('job:done', (e) => {
      const targets = jobs.current.get(e.jobId)
      if (!targets) {
        remember(earlyDone.current, e.jobId, e)
        return
      }
      finish(e, targets)
    })
    return () => {
      offProgress()
      offDone()
    }
  }, [finish])

  const track = useCallback(
    (jobId: string, targets: string[], message = 'Queued') => {
      jobs.current.set(jobId, targets)
      const done = earlyDone.current.get(jobId)
      if (done) {
        earlyDone.current.delete(jobId)
        early.current.delete(jobId)
        finish(done, targets)
        return
      }
      const pending = early.current.get(jobId)
      early.current.delete(jobId)
      setLive((l) => {
        const seeded = seedJob(l, jobId, targets, message)
        return pending ? applyProgress(seeded, targets, pending) : seeded
      })
    },
    [finish],
  )

  return { live, track }
}
