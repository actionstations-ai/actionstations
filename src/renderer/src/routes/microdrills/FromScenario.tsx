// "Make drills from this scenario" (#437, FR-7): one draft drill for each plan section the chosen
// scenario says it tests, using the settings chosen in the build form. Every drill stays a draft
// until it is reviewed.
import { useState } from 'react'
import type { MicroDrillSettings } from '@shared/schemas'
import { Button, Field, ProgressBar } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { useJobSettled, useTrackedJob } from '../../state/use-jobs'

interface Result {
  drillIds?: string[]
  skipped?: string[]
}

export function FromScenario(props: { projectPath: string; settings: MicroDrillSettings }) {
  const { projectPath, settings } = props
  const scenarios = useIpcQuery('scenarios:list', { projectPath })
  const [scenarioId, setScenarioId] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useTrackedJob(jobId)
  useJobSettled(
    (j) => j.id === jobId,
    (e, j) => {
      if (e.status === 'error') return toast.error('Could not build the drills', job?.error ?? '')
      if (e.status !== 'done') return
      const r = (j.result ?? {}) as Result
      const skipped = r.skipped?.length ? ` ${r.skipped.length} section(s) were too large.` : ''
      toast.success(
        `${r.drillIds?.length ?? 0} draft drill(s) built`,
        `Read every question and hint before you mark one Ready.${skipped}`,
      )
    },
  )
  const running = !!job && (job.status === 'running' || job.status === 'queued')
  const start = async () => {
    try {
      const r = await call('microdrills:from-scenario', { projectPath, scenarioId, settings })
      setJobId(r.jobId)
    } catch (e) {
      toast.error('Could not start', errorText(e))
    }
  }
  return (
    <div className="stack" role="group" aria-labelledby="micro-from-scenario">
      <h3 id="micro-from-scenario">Or make drills from a scenario</h3>
      <p className="muted">
        One draft drill for each plan section the scenario says it tests (up to five), using the
        settings above and the scenario&apos;s situation in shortened form.
      </p>
      <Field label="Scenario">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
          >
            <option value="">Choose a scenario</option>
            {(scenarios.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="row">
        <Button disabled={!scenarioId || running} onClick={() => void start()}>
          Make drills from this scenario
        </Button>
        {running && (
          <div className="micro-progress">
            <ProgressBar value={job.progress ?? 0} label="Building the drills" />
            <span className="muted" role="status">
              {job.message}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
