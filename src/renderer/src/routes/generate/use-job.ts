import { useEffect, useRef } from 'react'
import type { JobDoneEvent, JobStatus } from '@shared/schemas/job'
import { doneEventOf, isTerminal } from '../../state/jobs'
import { useTrackedJob } from '../../state/use-jobs'

export interface JobState {
  status: JobStatus
  progress: number
  message: string
  error?: string
}

/**
 * Follow one job (from the global job store, #197) until it finishes; `onDone` runs once per
 * job id, also when the job had already finished. Pass null to stop following.
 */
export function useJob(jobId: string | null, onDone?: (e: JobDoneEvent) => void) {
  const job = useTrackedJob(jobId)
  const doneRef = useRef(onDone)
  const reported = useRef<string | null>(null)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])
  useEffect(() => {
    if (!job || !isTerminal(job) || reported.current === job.id) return
    reported.current = job.id
    doneRef.current?.(doneEventOf(job))
  }, [job])

  if (!jobId) return null
  if (!job) return QUEUED
  const state: JobState = { status: job.status, progress: job.progress, message: job.message }
  return job.error ? { ...state, error: job.error } : state
}

const QUEUED: JobState = { status: 'queued', progress: 0, message: 'Queued' }
