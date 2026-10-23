// Running imports of this project, with Cancel (#197). Rebuilds show in IndexStatus instead.
// Read from the global job store, so an import started before navigating away is still here.
import { CancelJobButton } from '../../components/CancelJobButton'
import { ProgressBar } from '../../components/ui'
import { isRunning, useJobsStore, type JobMap, type TrackedJob } from '../../state/jobs'
import { ingestTargets } from './use-job-progress'
import { INDEX_TARGET } from './job-progress'

function runningImports(jobs: JobMap, projectPath: string): TrackedJob[] {
  return Object.values(jobs)
    .filter(
      (j) =>
        j.kind === 'ingest' &&
        j.projectPath === projectPath &&
        isRunning(j) &&
        !ingestTargets(j).includes(INDEX_TARGET),
    )
    .sort((a, b) => a.seq - b.seq)
}

const plural = (n: number) => `${n} document${n === 1 ? '' : 's'}`

export function IngestJobs({ projectPath }: { projectPath: string }) {
  const jobs = useJobsStore((s) => s.jobs)
  const imports = runningImports(jobs, projectPath)
  if (!imports.length) return null
  return (
    <ul className="index-status ingest-jobs" aria-label="Running imports">
      {imports.map((job) => {
        const n = ingestTargets(job).length
        const what = n ? `Importing ${plural(n)}` : 'Importing'
        return (
          <li key={job.id} className="index-status__rebuild">
            <span>
              {what}: {job.message || 'working'}
            </span>
            <ProgressBar value={job.progress} label={`${what} progress`} />
            <CancelJobButton jobId={job.id} label="Cancel import" />
          </li>
        )
      })}
    </ul>
  )
}
