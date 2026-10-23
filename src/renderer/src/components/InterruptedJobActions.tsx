// Resume / Dismiss for a job an app exit interrupted (#195). Resume continues the work as a
// new job (jobs:resume) when main can resume it; Dismiss drops the record (jobs:cancel), which
// releases the scenario.
import { Play, X } from 'lucide-react'
import { useState } from 'react'
import { call } from '../lib/api'
import { trackJob, type TrackedJob } from '../state/jobs'
import { toast } from './toast-store'
import { Button } from './ui'

export function InterruptedJobActions(props: {
  job: Pick<TrackedJob, 'id' | 'kind' | 'resumable' | 'projectPath' | 'scenarioId'>
  /** The new job that continues the work, after Resume. */
  onResumed?: (jobId: string) => void
  /** Names the job in the buttons' accessible names ("Resume: Writing injects"), for lists. */
  context?: string
}) {
  const { job } = props
  const [busy, setBusy] = useState(false)
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error(`Could not ${what}`, e)
    } finally {
      setBusy(false)
    }
  }
  const resume = () =>
    run('resume the job', async () => {
      const { jobId } = await call('jobs:resume', { jobId: job.id })
      trackJob(jobId, {
        kind: job.kind,
        ...(job.projectPath ? { projectPath: job.projectPath } : {}),
        ...(job.scenarioId ? { scenarioId: job.scenarioId } : {}),
      })
      props.onResumed?.(jobId)
    })
  const dismiss = () => run('dismiss the job', () => call('jobs:cancel', { jobId: job.id }))
  const named = (text: string) =>
    props.context ? { 'aria-label': `${text}: ${props.context}` } : {}
  return (
    <span className="row interrupted-actions">
      {job.resumable && (
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() => void resume()}
          {...named('Resume')}
        >
          <Play size={12} aria-hidden /> Resume
        </Button>
      )}
      <Button size="sm" disabled={busy} onClick={() => void dismiss()} {...named('Dismiss')}>
        <X size={12} aria-hidden /> Dismiss
      </Button>
    </span>
  )
}
