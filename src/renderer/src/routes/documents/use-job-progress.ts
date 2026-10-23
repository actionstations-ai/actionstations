// Live ingest / index-rebuild progress for the Documents page, per "target" (a document id,
// or INDEX_TARGET for a rebuild). Read from the global job store (#197): progress and Cancel
// come back after navigating away and back, and include jobs started elsewhere.
import { useCallback, useMemo } from 'react'
import type { JobDoneEvent } from '@shared/schemas/job'
import { isRunning, trackJob, useJobsStore, type JobMap, type TrackedJob } from '../../state/jobs'
import { useJobSettled } from '../../state/use-jobs'
import { INDEX_TARGET, type LiveMap, type LiveProgress } from './job-progress'

interface IngestPayload {
  documentIds?: string[]
  mode?: string
}

/** The targets an ingest job drives: the index for a rebuild ('auto'), else its documents. */
export function ingestTargets(job: Pick<TrackedJob, 'kind' | 'payload'>): string[] {
  const p = (job.payload ?? {}) as IngestPayload
  if (p.mode === 'auto' || job.kind === 'reindex') return [INDEX_TARGET]
  return Array.isArray(p.documentIds) ? p.documentIds : []
}

/** Main runs rebuilds as 'ingest' jobs in 'auto' mode; 'reindex' is accepted as well. */
const isIngestFor = (j: TrackedJob, projectPath: string) =>
  (j.kind === 'ingest' || j.kind === 'reindex') && j.projectPath === projectPath

/**
 * Running ingest jobs of a project as a target → progress map. A document the job has
 * reported on shows its own line; the others wait at "Queued" until it reaches them.
 */
export function liveFromJobs(jobs: JobMap, projectPath: string): LiveMap {
  const live: LiveMap = {}
  const running = Object.values(jobs)
    .filter((j) => isRunning(j) && isIngestFor(j, projectPath))
    .sort((a, b) => a.seq - b.seq)
  for (const job of running) {
    const perItem = Object.keys(job.itemProgress).length > 0
    for (const t of ingestTargets(job)) {
      const item = job.itemProgress[t]
      const entry: LiveProgress = item
        ? { jobId: job.id, ...item }
        : perItem
          ? { jobId: job.id, progress: 0, message: 'Queued' }
          : { jobId: job.id, progress: job.progress, message: job.message }
      live[t] = entry
    }
  }
  return live
}

/** A re-chunk after a citation edit (title, short name) runs quietly: no toast for it. */
const isQuiet = (j: TrackedJob) => (j.payload as IngestPayload | undefined)?.mode === 'rechunk'

/**
 * Track ingest jobs started from this screen; `onDone` hears every import and rebuild of the
 * project that finishes while the screen is open.
 */
export function useJobProgress(
  projectPath: string,
  onDone?: (e: JobDoneEvent, targets: string[]) => void,
) {
  const jobs = useJobsStore((s) => s.jobs)
  const live = useMemo(() => liveFromJobs(jobs, projectPath), [jobs, projectPath])
  const mine = useCallback(
    (j: TrackedJob) => isIngestFor(j, projectPath) && !isQuiet(j),
    [projectPath],
  )
  useJobSettled(mine, onDone && ((e, job) => onDone(e, ingestTargets(job))))

  const track = useCallback(
    (jobId: string, targets: string[]) =>
      trackJob(jobId, {
        kind: 'ingest',
        projectPath,
        payload: targets.includes(INDEX_TARGET)
          ? { documentIds: [], mode: 'auto' }
          : { documentIds: targets, mode: 'ingest' },
      }),
    [projectPath],
  )

  return { live, track }
}
