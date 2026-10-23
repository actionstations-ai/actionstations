// React bindings for the job store (state/jobs.ts): hold the connection, read one job, and
// hear when matching jobs settle.
import { useEffect, useRef } from 'react'
import type { JobDoneEvent } from '@shared/schemas/job'
import {
  connectJobs,
  doneEventOf,
  ensureJob,
  isTerminal,
  useJobsStore,
  type TrackedJob,
} from './jobs'

/** Keep the store connected to main while the calling component is mounted. */
export function useJobsConnection(): void {
  useEffect(() => connectJobs(), [])
}

/** One job by id (null for none). Reads it from main when the store has not seen it. */
export function useTrackedJob(jobId: string | null): TrackedJob | null {
  useJobsConnection()
  useEffect(() => {
    if (jobId) ensureJob(jobId)
  }, [jobId])
  return useJobsStore((s) => (jobId ? (s.jobs[jobId] ?? null) : null))
}

const settled = (j: TrackedJob | undefined): boolean => !!j && j.known && isTerminal(j)

/**
 * Call `onSettled` once for each job matching `match` that settles (done / error /
 * cancelled, with its project and scenario known) while the caller is mounted.
 */
export function useJobSettled(
  match: (job: TrackedJob) => boolean,
  onSettled: ((e: JobDoneEvent, job: TrackedJob) => void) | undefined,
): void {
  const ref = useRef({ match, onSettled })
  useEffect(() => {
    ref.current = { match, onSettled }
  })
  useJobsConnection()
  useEffect(
    () =>
      useJobsStore.subscribe((state, prev) => {
        for (const job of Object.values(state.jobs)) {
          if (job === prev.jobs[job.id] || !settled(job) || settled(prev.jobs[job.id])) continue
          if (ref.current.match(job)) ref.current.onSettled?.(doneEventOf(job), job)
        }
      }),
    [],
  )
}
