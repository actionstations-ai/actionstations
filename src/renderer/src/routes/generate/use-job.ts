import { useEffect, useRef, useState } from 'react'
import type { JobDoneEvent, JobStatus } from '@shared/schemas/job'
import { call, subscribe } from '../../lib/api'

export interface JobState {
  status: JobStatus
  progress: number
  message: string
  error?: string
}

/** Follow one job's progress events until it finishes. Pass null to stop following. */
export function useJob(jobId: string | null, onDone?: (e: JobDoneEvent) => void) {
  const [state, setState] = useState<(JobState & { jobId: string }) | null>(null)
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    if (!jobId) return
    let reported = false
    const offs = [
      subscribe('job:progress', (e) => {
        if (e.jobId === jobId)
          setState({ jobId, status: e.status, progress: e.progress, message: e.message })
      }),
      subscribe('job:done', (e) => {
        if (e.jobId !== jobId) return
        reported = true
        setState((s) => ({
          jobId,
          status: e.status,
          progress: e.status === 'done' ? 1 : (s?.progress ?? 0),
          message: e.status === 'done' ? 'Done' : (e.error ?? e.status),
          ...(e.error ? { error: e.error } : {}),
        }))
        doneRef.current?.(e)
      }),
    ]
    // The job may have progressed (or finished) before we subscribed: read it once.
    void call('jobs:get', { jobId })
      .then((job) => {
        setState((s) =>
          s?.jobId === jobId
            ? s
            : { jobId, status: job.status, progress: job.progress, message: job.message },
        )
        if (['done', 'error', 'cancelled'].includes(job.status) && !reported) {
          reported = true
          const status = job.status as JobDoneEvent['status']
          doneRef.current?.({
            jobId,
            kind: job.kind,
            status,
            ...(job.error ? { error: job.error } : {}),
          })
        }
      })
      .catch(() => undefined)
    return () => {
      reported = true
      offs.forEach((off) => off())
    }
  }, [jobId])

  if (!jobId) return null
  if (state?.jobId !== jobId) return QUEUED
  return state
}

const QUEUED: JobState = { status: 'queued', progress: 0, message: 'Queued' }
