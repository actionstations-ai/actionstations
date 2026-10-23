// The generation job (if any) that currently owns a scenario. Only one runs per scenario
// (#98): while it does, saves answer CONFLICT. Read from the global job store (#197), so it
// reattaches after navigation and restart. A job an app exit interrupted (paused) does not
// own the scenario (#194): it comes back as `interrupted`, for Resume / Dismiss.
import { useCallback, useMemo } from 'react'
import type { JobDoneEvent, JobKind, JobStatus } from '@shared/schemas/job'
import {
  interruptedJob,
  SCENARIO_OWNER_KINDS,
  scenarioOwner,
  trackJob,
  useJobsStore,
  type TrackedJob,
} from '../../state/jobs'
import { useJobSettled } from '../../state/use-jobs'

export interface ScenarioJob {
  jobId: string
  kind: JobKind
  status: JobStatus
  progress: number
  message: string
  /** Item ids (inject or row ids) in the order the job reached them; the last is current. */
  items: string[]
}

export function useScenarioJob(
  projectPath: string,
  scenarioId: string,
  onDone?: (e: JobDoneEvent) => void,
) {
  const owner = useJobsStore((s) => scenarioOwner(s.jobs, projectPath, scenarioId))
  const interrupted = useJobsStore((s) =>
    owner ? null : interruptedJob(s.jobs, projectPath, scenarioId),
  )
  const mine = useCallback(
    (j: TrackedJob) =>
      j.projectPath === projectPath &&
      j.scenarioId === scenarioId &&
      SCENARIO_OWNER_KINDS.includes(j.kind),
    [projectPath, scenarioId],
  )
  useJobSettled(mine, onDone)

  const job = useMemo<ScenarioJob | null>(
    () =>
      owner && {
        jobId: owner.id,
        kind: owner.kind,
        status: owner.status,
        progress: owner.progress,
        message: owner.message,
        items: owner.items,
      },
    [owner],
  )

  /** Register a job the caller just started (before its first progress event arrives). */
  const track = useCallback(
    (jobId: string, kind: JobKind) => trackJob(jobId, { kind, projectPath, scenarioId }),
    [projectPath, scenarioId],
  )

  return { job, interrupted, track }
}
