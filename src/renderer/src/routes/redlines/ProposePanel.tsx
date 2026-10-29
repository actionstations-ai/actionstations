// "Propose plan redlines" (#431, FR-2): the areas for improvement of a scenario's AAR/IP that
// cite plan sections, one checkbox each; the chosen ones go to the drafting provider with the
// cited section's text, and the job's progress shows here.
import { useState } from 'react'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { useJobSettled, useTrackedJob } from '../../state/use-jobs'

export function ProposePanel(props: { projectPath: string; scenarioId: string }) {
  const aar = useIpcQuery('aar:get', {
    projectPath: props.projectPath,
    scenarioId: props.scenarioId,
  })
  const [picked, setPicked] = useState<string[] | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useTrackedJob(jobId)
  useJobSettled(
    (j) => j.id === jobId,
    (e) => {
      if (e.status === 'done') toast.success('Proposals drafted', 'Review each one below.')
      else if (e.status === 'error') toast.error('Could not draft the proposals', job?.error ?? '')
    },
  )
  const findings = (aar.data?.capabilities ?? []).flatMap((c) =>
    c.areasForImprovement.map((f) => ({ f, capability: c.capability })),
  )
  const citing = findings.filter(({ f }) => f.citations.length)
  const chosen = picked ?? citing.map(({ f }) => f.id)
  const running = !!job && (job.status === 'running' || job.status === 'queued')
  const start = async () => {
    try {
      const r = await call('redlines:generate', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        findingIds: chosen,
      })
      setJobId(r.jobId)
    } catch (e) {
      toast.error('Could not start', errorText(e))
    }
  }
  if (aar.isPending) return <p className="muted">Loading the after-action report…</p>
  if (!aar.data)
    return (
      <p className="muted">
        This scenario has no after-action report yet. Draft it first, then come back to propose
        changes to the plans.
      </p>
    )
  if (!citing.length)
    return <p className="muted">No area for improvement in the report cites a plan section.</p>
  return (
    <section className="card redline-propose" aria-labelledby="propose-title">
      <h2 id="propose-title" className="section-title">
        Propose plan changes
      </h2>
      <p className="muted">
        The text of each cited plan section and the finding go to your drafting provider. Nothing is
        changed in the plans.
      </p>
      <fieldset className="redline-propose__list">
        <legend className="sr-only">Areas for improvement</legend>
        {citing.map(({ f }) => (
          <label key={f.id} className="redline-propose__row">
            <input
              type="checkbox"
              checked={chosen.includes(f.id)}
              onChange={(e) =>
                setPicked(e.target.checked ? [...chosen, f.id] : chosen.filter((x) => x !== f.id))
              }
            />
            <span>
              {f.title}{' '}
              <span className="muted">
                ({f.citations.length} {f.citations.length === 1 ? 'section' : 'sections'})
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="row">
        <Button variant="primary" disabled={running || !chosen.length} onClick={() => void start()}>
          {running ? 'Drafting…' : 'Draft proposals'}
        </Button>
        {running && (
          <span role="status" className="muted">
            {job?.message}
          </span>
        )}
      </div>
    </section>
  )
}
