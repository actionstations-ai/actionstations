// The simulated clinical downtime in the Live tab (issue #1130). When the scenario has downtime
// case data, the facilitator sees what the players' decisions did to the simulated case: the
// model's figures before and after, each consequence rule that fired with its reason (and
// whether it was overridden), back-entry by unit, and the seeded discrepancies. In a session
// with devices a discrepancy that falls due is sent to the players on its own; without devices
// the facilitator reads it out. Without downtime case data, nothing is shown.
import type { ClinicalDowntimeView } from '@shared/ipc/toolkits'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { Scenario } from '@shared/schemas/scenario'
import { Badge } from '../../../components/ui'
import { useIpcQuery } from '../../../lib/query'
import { allDecisions } from './decision-model'
import { CD } from './clinical-downtime-strings'
import { useLiveDecisions } from './use-live-decisions'

export function ClinicalDowntimeCard(props: { view: ClinicalDowntimeView; live: boolean }) {
  const { view, live } = props
  return (
    <section className="fac-surveys" aria-labelledby="fac-downtime-title">
      <h2 id="fac-downtime-title" className="live-heading">
        {CD.heading}
      </h2>
      <p className="muted">
        {view.label}. {CD.intro}
      </p>
      <table className="table">
        <caption>{CD.figuresCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{CD.measure}</th>
            <th scope="col">{CD.before}</th>
            <th scope="col">{CD.now}</th>
          </tr>
        </thead>
        <tbody>
          {view.figures.map((f) => (
            <tr key={f.label}>
              <th scope="row">{f.label}</th>
              <td>{f.before}</td>
              <td>{f.now}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="fac-panel__subtitle">{CD.rulesHeading}</h3>
      {view.fired.length === 0 ? (
        <p className="muted">{CD.noRules}</p>
      ) : (
        <ul className="fac-surveys__list">
          {view.fired.map((r) => (
            <li key={r.ruleId} className="fac-surveys__row">
              <div className="fac-surveys__main">
                <span className="fac-surveys__title">{r.label}</span>
                <span className="muted">{r.explanation}</span>
                <Badge tone={r.overridden ? 'neutral' : 'warn'}>
                  {r.overridden ? CD.overridden : CD.applied}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">{CD.overrideHint}</p>
      <h3 className="fac-panel__subtitle">{CD.backEntryHeading(view.percent)}</h3>
      <ul>
        {view.units.map((u) => (
          <li key={u.unit}>
            {u.unit}: {u.done} done, {u.remaining} remaining
            {u.reported ? '' : ` (${CD.simulatedCount})`}
          </li>
        ))}
      </ul>
      <h3 className="fac-panel__subtitle">{CD.discrepanciesHeading}</h3>
      {view.closed && <p className="muted">{CD.closed}</p>}
      <ul className="fac-surveys__list">
        {view.discrepancies.map((d) => (
          <li key={d.id} className="fac-surveys__row">
            <div className="fac-surveys__main">
              <span>{d.text}</span>
              <Badge tone={d.due ? 'info' : 'neutral'}>
                {d.due ? (live ? CD.dueSent : CD.dueReadOut) : CD.notYet(d.threshold)}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ClinicalDowntimeSection(props: {
  projectPath: string
  scenario: Scenario
  state: FacilitatorState
}) {
  const live = useLiveDecisions(props.projectPath, props.scenario.id)
  const decisions = allDecisions(live.decisions, props.state.decisionRecords).reverse()
  const view = useIpcQuery('toolkits:clinical-downtime', {
    projectPath: props.projectPath,
    scenarioId: props.scenario.id,
    decisions: decisions.slice(-1000),
  })
  if (!view.data) return null
  return <ClinicalDowntimeCard view={view.data} live={live.active} />
}
