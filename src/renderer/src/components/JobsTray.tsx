// Jobs tray in the app shell (#197): every running background job, wherever it was started,
// with progress, Cancel and a link to its screen; jobs an app exit interrupted get Resume /
// Dismiss. It also holds the job store's connection to main for the window's life.
import { Link } from 'react-router'
import { JOB_LABEL, useJobsStore, type TrackedJob } from '../state/jobs'
import { useJobsConnection } from '../state/use-jobs'
import { CancelJobButton } from './CancelJobButton'
import { InterruptedJobActions } from './InterruptedJobActions'
import { jobScreen, trayJobs } from './jobs-tray-model'
import { ProgressBar } from './ui'
import './jobs-tray.css'

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
      {!paused && <span className="jobs-tray__message">{job.message}</span>}
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
