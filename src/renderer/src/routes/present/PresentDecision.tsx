// A branch decision on the projector (spec 0430): the question and its options while the room
// decides; once taken, the chosen option and how it was chosen ("Chosen by majority: 7 of 11").
// White on black in both themes. The choice is announced to screen readers as it appears.
import { useEffect } from 'react'
import { useParams } from 'react-router'
import type { DecisionRecord } from '@shared/ipc/facilitator'
import type { Decision } from '@shared/schemas/scenario'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { chosenLine } from './decision-text'
import './present.css'
import './present-decision.css'

export function DecisionCard(props: { decision: Decision; record?: DecisionRecord | undefined }) {
  const { decision, record } = props
  const chosen = record && decision.options.find((o) => o.id === record.optionId)
  return (
    <article className="present-decision__card" aria-label="Decision">
      <header className="present-decision__head">Decision</header>
      <h1 className="present-decision__question">{decision.question}</h1>
      <ul className="present-decision__options" aria-label="Options">
        {decision.options.map((o) => {
          const taken = chosen?.id === o.id
          return (
            <li
              key={o.id}
              className={`present-decision__option${taken ? ' present-decision__option--chosen' : ''}`}
              {...(taken ? { 'aria-current': 'true' as const } : {})}
            >
              {o.label}
              {taken && <span className="present-decision__mark"> (chosen)</span>}
            </li>
          )
        })}
      </ul>
      <p className="present-decision__status" role="status" data-testid="present-decision-status">
        {record && chosen ? `${chosenLine(record)}. ${chosen.label}.` : 'The room is deciding.'}
      </p>
    </article>
  )
}

export default function PresentDecision() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const req = { projectPath, scenarioId: params.scenarioId ?? '' }
  const scenario = useIpcQuery('scenarios:get', req, { retry: false })
  const state = useIpcQuery('facilitator:state-get', req, { refetchInterval: 2000, retry: false })
  const decision = scenario.data?.msel.find((r) => r.decision?.id === params.decisionId)?.decision
  const records = (state.data?.branching?.decisions ?? []).filter(
    (r) => r.decisionId === params.decisionId,
  )

  useEffect(() => {
    document.title = 'Presentation'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void call('facilitator:close-present')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="present present-decision" data-testid="present-decision">
      {decision ? (
        <DecisionCard decision={decision} record={records.at(-1)} />
      ) : (
        <p className="present__empty">
          {scenario.isError ? 'This decision is not available.' : ''}
        </p>
      )}
    </div>
  )
}
