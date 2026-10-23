// What the jobs tray lists and where each job's screen is (pure; see JobsTray.tsx).
import { projectKey } from '../state/project'
import { isRunning, type JobMap, type TrackedJob } from '../state/jobs'

/** Jobs the tray lists: running and interrupted ones, oldest first. */
export function trayJobs(jobs: JobMap): TrackedJob[] {
  return Object.values(jobs)
    .filter((j) => isRunning(j) || j.status === 'paused')
    .sort((a, b) => a.seq - b.seq)
}

/** The screen that shows a job's work, when it has one. */
export function jobScreen(job: TrackedJob): string | null {
  if (!job.projectPath) return null
  const p = `/p/${projectKey(job.projectPath)}`
  if (job.kind === 'ingest' || job.kind === 'reindex') return `${p}/documents`
  if (job.kind === 'ideate') return `${p}/generate`
  if (!job.scenarioId) return null
  if (job.kind === 'export') return `${p}/scenarios/${job.scenarioId}/export`
  return `${p}/scenarios/${job.scenarioId}`
}
