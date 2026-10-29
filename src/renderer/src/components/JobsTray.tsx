// Jobs tray in the app shell (#197): every running background job, wherever it was started,
// with progress, Cancel and a link to its screen; jobs an app exit interrupted get Resume /
// Dismiss. It also holds the job store's connection to main for the window's life.
import { Link } from 'react-router'
import { JOB_LABEL, useJobsStore, type TrackedJob } from '../state/jobs'
import { useJobsConnection } from '../state/use-jobs'
import { CancelJobButton } from './CancelJobButton'
import { InterruptedJobActions } from './InterruptedJobActions'
import { jobScreen, trayJobs } from './jobs-tray-model'
import { refreshPending, useApprovals } from './privacy/approvals-store'
import { Button, ProgressBar } from './ui'
import './jobs-tray.css'

/** Open the approval dialog for the request a job waits on (#433). */
function ReviewButton({ job, label }: { job: TrackedJob; label: string }) {
  const open = useApprovals((s) => s.open)
  const review = async () => {
    const requestId = job.awaiting?.requestId
    const list = await refreshPending().catch(() => useApprovals.getState().pending)
    const match =
      list.find((p) => p.requestId === requestId) ?? list.find((p) => p.jobId === job.id)
    if (match) open(match.requestId)
  }
  return (
    <Button
      size="sm"
      variant="primary"
      aria-label={`Review: ${label}`}
      onClick={() => void review()}
    >
      Review
    </Button>
  )
}

function TrayItem({ job }: { job: TrackedJob }) {
  const label = JOB_LABEL[job.kind]
  const to = jobScreen(job)
  const paused = job.status === 'paused'
  return (
    <li className="jobs-tray__item">
      <span className="jobs-tray__label">
        {to ? <Link to={to}>{label}</Link> : label}
        {paused && <span className="jobs-tray__state"> · interrupted</span>}
      </span>
      {!paused && (
        <span className="jobs-tray__message">
          {job.awaiting ? 'Waiting for your approval' : job.message}
        </span>
      )}
      {!paused && job.awaiting && <ReviewButton job={job} label={label} />}
      {paused ? (
        <InterruptedJobActions job={job} context={label} />
      ) : (
        <>
          <ProgressBar value={job.progress} label={`${label} progress`} />
          <CancelJobButton jobId={job.id} ariaLabel={`Cancel: ${label}`} />
        </>
      )}
    </li>
  )
}

export function JobsTray() {
  useJobsConnection()
  const jobs = useJobsStore((s) => s.jobs)
  const list = trayJobs(jobs)
  if (!list.length) return null
  return (
    <section className="jobs-tray" aria-labelledby="jobs-tray-heading">
      <p id="jobs-tray-heading" className="jobs-tray__heading">
        Background jobs ({list.length})
      </p>
      <ul className="jobs-tray__list">
        {list.map((job) => (
          <TrayItem key={job.id} job={job} />
        ))}
      </ul>
    </section>
  )
}
