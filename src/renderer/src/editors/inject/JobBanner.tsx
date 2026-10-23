// Non-destructive notice while a generation job owns the scenario: progress, cancel, and
// (in the editor) that unsaved edits are kept and will be saved when the job finishes. A job
// an app exit interrupted shows as "Interrupted" with Resume / Dismiss instead (#194, #195);
// it does not hold the scenario, so nothing else is disabled meanwhile.
import { ProgressBar } from '../../components/ui'
import type { ScenarioJob } from './use-scenario-job'
import { LiveStatus } from '../../components/LiveStatus'
import { CancelJobButton } from '../../components/CancelJobButton'
import { InterruptedJobActions } from '../../components/InterruptedJobActions'
import { JOB_LABEL, type TrackedJob } from '../../state/jobs'

function InterruptedBanner(props: { job: TrackedJob; onResumed?: (jobId: string) => void }) {
  const label = JOB_LABEL[props.job.kind]
  return (
    <section className="job-banner job-banner--interrupted" aria-label="Generation status">
      <div className="job-banner__text">
        <strong>Interrupted: {label.toLowerCase()}</strong>
        <span className="muted">
          {' '}
          · The app closed before this job finished.{' '}
          {props.job.resumable
            ? 'Resume continues from the last checkpoint.'
            : 'Dismiss it, then start the work again.'}
        </span>
      </div>
      <InterruptedJobActions
        job={props.job}
        {...(props.onResumed ? { onResumed: props.onResumed } : {})}
      />
    </section>
  )
}

export function JobBanner(props: {
  job: ScenarioJob | null
  /** A paused job for this scenario from before a restart (shown when nothing runs). */
  interrupted?: TrackedJob | null
  onResumed?: (jobId: string) => void
  pendingSave?: boolean
  editing?: boolean
}) {
  const { job } = props
  if (!job && props.interrupted && !props.pendingSave) {
    return (
      <InterruptedBanner
        job={props.interrupted}
        {...(props.onResumed ? { onResumed: props.onResumed } : {})}
      />
    )
  }
  if (!job && !props.pendingSave) return null
  const label = job ? JOB_LABEL[job.kind] : 'Generation'
  return (
    <section className="job-banner" aria-label="Generation status">
      <LiveStatus
        text={job ? `${label}: ${job.message || job.status}` : 'Waiting for generation to finish'}
      />
      <div className="job-banner__text">
        <strong>{job ? `${label} for this scenario` : 'Waiting for generation to finish'}</strong>
        {job && <span className="muted"> · {job.message || job.status}</span>}
        {props.editing && (
          <p className="job-banner__note">
            {props.pendingSave
              ? 'Your edits are kept and will be saved automatically when the job finishes.'
              : 'You can keep editing. Saving waits until the job finishes.'}
          </p>
        )}
      </div>
      {job && (
        <div className="job-banner__progress">
          <ProgressBar value={job.progress} label={`${label} progress`} />
          <CancelJobButton jobId={job.jobId} label="Cancel job" />
        </div>
      )}
    </section>
  )
}
