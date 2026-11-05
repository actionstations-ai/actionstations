// A case study for a whole class (spec 0452 FR-11): the instructor sends one stage at a time to
// the room's devices through the running live session, watches the room's answers arrive and
// reveals the best answer and the rationale when the room is ready. Answers are anonymous and
// the keys never leave this computer; a small room sees no detail until enough devices answer.
import { useState } from 'react'
import { classSurveyId, CASE_STUDY_SCORE_NOTE } from '@shared/schemas'
import { Badge, Button, Field, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'

const pct = (v: number | null): string => (v === null ? 'n/a' : `${Math.round(v * 100)}%`)

export function ClassSession(props: { projectPath: string; caseId: string; onClose: () => void }) {
  const { projectPath, caseId } = props
  const study = useIpcQuery('casestudy:get', { projectPath, id: caseId })
  const scenarios = useIpcQuery('scenarios:list', { projectPath })
  const [scenarioId, setScenarioId] = useState('')
  const [index, setIndex] = useState(0)
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const stages = study.data?.stages ?? []
  const stage = stages[index]
  const scenario = scenarioId || scenarios.data?.[0]?.id || ''
  const surveyId = stage ? classSurveyId(caseId, stage.id) : ''
  const live = useIpcQuery(
    'surveys:live-status',
    { projectPath, scenarioId: scenario },
    { enabled: !!scenario, refetchInterval: 4000 },
  )
  const delivery = (live.data ?? []).find((d) => d.surveyId === surveyId && d.status === 'open')
  const results = useIpcQuery(
    'casestudy:class-results',
    { projectPath, scenarioId: scenario, caseId, stageId: stage?.id ?? '', reveal },
    { enabled: !!scenario && !!stage, refetchInterval: 4000 },
  )
  const profile = useIpcQuery(
    'casestudy:class-profile',
    { projectPath, scenarioId: scenario, caseId },
    { enabled: !!scenario, refetchInterval: 8000 },
  )

  const send = async () => {
    if (!stage) return
    setBusy(true)
    try {
      await call('casestudy:class-open', {
        projectPath,
        scenarioId: scenario,
        caseId,
        stageId: stage.id,
      })
      await live.refetch()
      toast.success('Sent to devices', stage.title)
    } catch (e) {
      toast.error('Could not send the stage', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const close = async () => {
    if (!delivery) return
    setBusy(true)
    try {
      await call('surveys:close-live', {
        projectPath,
        scenarioId: scenario,
        deliveryId: delivery.deliveryId,
      })
      await live.refetch()
    } catch (e) {
      toast.error('Could not close the stage', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(stages.length - 1, next)))
    setReveal(false)
  }

  return (
    <div className="page cs-page">
      <PageHeader
        eyebrow="Case study, class session"
        title={study.data?.title ?? 'Case study'}
        description="Send one stage at a time to the room’s devices and discuss the answers together. Answers are anonymous: you see the room’s totals, never a person’s answers."
      />
      <p className="cs-note" role="note">
        {CASE_STUDY_SCORE_NOTE} Start a live session for the scenario first, so devices can join.
      </p>
      <section className="card stack" aria-labelledby="cs-class-where">
        <h2 id="cs-class-where" className="section-title">
          Scenario with the live session
        </h2>
        <Field label="Scenario">
          {({ id }) => (
            <select
              id={id}
              className="input"
              value={scenario}
              onChange={(e) => setScenarioId(e.target.value)}
            >
              {(scenarios.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
        </Field>
      </section>
      {stage && (
        <section className="card stack" aria-labelledby="cs-class-stage">
          <h2 id="cs-class-stage" className="section-title">
            Stage {index + 1} of {stages.length}: {stage.title}
          </h2>
          <p>{stage.narrative}</p>
          <div className="row">
            <Button onClick={() => go(index - 1)} disabled={index === 0}>
              Previous stage
            </Button>
            <Button onClick={() => go(index + 1)} disabled={index >= stages.length - 1}>
              Next stage
            </Button>
            <Button
              variant="primary"
              disabled={busy || !scenario || !!delivery}
              onClick={() => void send()}
            >
              Send this stage to devices
            </Button>
            <Button disabled={busy || !delivery} onClick={() => void close()}>
              Close this stage
            </Button>
          </div>
          <p role="status" aria-live="polite">
            {delivery ? (
              <>
                <Badge tone="ok">Open</Badge> {delivery.responses} of {delivery.eligible} devices
                have answered.
              </>
            ) : (
              <Badge tone="neutral">Not open</Badge>
            )}
          </p>
        </section>
      )}
      {stage && results.data && (
        <section className="card stack" aria-labelledby="cs-class-results">
          <h2 id="cs-class-results" className="section-title">
            The room’s answers
          </h2>
          <p className="muted">
            {results.data.responses} {results.data.responses === 1 ? 'device has' : 'devices have'}{' '}
            answered.
            {results.data.responses < results.data.minResponses
              ? ` Detail appears once ${results.data.minResponses} have answered.`
              : ''}
          </p>
          <label>
            <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />{' '}
            Reveal the best answers and the rationale (on your screen only)
          </label>
          {results.data.prompts.map((p) => (
            <div key={p.promptId} className="cs-prompt">
              <h3 className="cs-card__title">
                <span className="cs-step">{p.stepLabel}</span> {p.text}
              </h3>
              <p>
                {p.answered} answered · mean score {pct(p.meanScore)}
              </p>
              {p.options && (
                <table className="table">
                  <caption className="sr-only">How many devices chose each option</caption>
                  <thead>
                    <tr>
                      <th scope="col">Option</th>
                      <th scope="col">Devices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.options.map((o) => (
                      <tr key={o.id}>
                        <th scope="row">{o.text}</th>
                        <td>{o.count === null ? 'held back' : o.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {p.reveal && (
                <div className="cs-feedback">
                  <p>
                    <strong>Strongest answer:</strong> {p.reveal.bestAnswer}
                  </p>
                  <p>{p.reveal.rationale}</p>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
      {profile.data && profile.data.some((s) => s.answers > 0) && (
        <section className="card stack" aria-labelledby="cs-class-profile">
          <h2 id="cs-class-profile" className="section-title">
            The room across the six steps so far
          </h2>
          <table className="table">
            <caption className="sr-only">Mean score by step of clinical judgment</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Answers</th>
                <th scope="col">Mean score</th>
              </tr>
            </thead>
            <tbody>
              {profile.data.map((s) => (
                <tr key={s.step}>
                  <th scope="row">{s.label}</th>
                  <td>{s.answers}</td>
                  <td>{s.percent === null ? 'n/a' : `${s.percent}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <div>
        <Button onClick={props.onClose}>Leave the class session</Button>
      </div>
    </div>
  )
}
