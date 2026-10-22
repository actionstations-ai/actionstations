// Non-destructive notice while a generation job owns the scenario: progress, cancel, and
// (in the editor) that unsaved edits are kept and will be saved when the job finishes.
import type { JobKind } from '@shared/schemas/job'
import { Button, ProgressBar } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import type { ScenarioJob } from './use-scenario-job'
import { LiveStatus } from '../../components/LiveStatus'

const KIND_LABEL: Partial<Record<JobKind, string>> = {
  'generate-injects': 'Writing injects',
  'render-media': 'Rendering media',
  'generate-scenario': 'Generating the scenario',
  'rerun-stage': 'Re-running a stage',
  'repair-scenario': 'Repairing the scenario',
}

export function JobBanner(props: {
  job: ScenarioJob | null
  pendingSave?: boolean
  editing?: boolean
}) {
  const { job } = props
  if (!job && !props.pendingSave) return null
  const label = job ? (KIND_LABEL[job.kind] ?? 'Generation') : 'Generation'
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
          <Button
            size="sm"
            onClick={() =>
              void call('jobs:cancel', { jobId: job.jobId }).catch((e) =>
                toast.error('Could not cancel', e),
              )
            }
          >
            Cancel job
          </Button>
        </div>
      )}
    </section>
  )
}
