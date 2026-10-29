// What is left to do once ENDEX has been delivered (spec 0422 FR-10): the hot wash, participant
// feedback and the after-action report. Each line says whether it is done in words, so it does
// not depend on colour.
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { Scenario } from '@shared/schemas/scenario'
import { Badge } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import './post-exercise.css'
import { checklistLines, endexDelivered, type ChecklistLine } from './post-exercise'

export function ChecklistView({ lines }: { lines: ChecklistLine[] }) {
  return (
    <section className="fac-post" aria-label="After the exercise">
      <h3 className="fac-post__title">After the exercise</h3>
      <ul className="fac-post__list">
        {lines.map((l) => (
          <li key={l.id}>
            <Badge tone={l.done ? 'ok' : 'neutral'}>{l.done ? 'Done' : 'To do'}</Badge>{' '}
            <strong>{l.label}</strong>
            {l.done ? null : <span className="fac-hint"> {l.hint}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PostExerciseChecklist(props: {
  projectPath: string
  scenario: Scenario
  state: FacilitatorState
}) {
  const shown = endexDelivered(props.scenario, props.state)
  const surveys = useIpcQuery(
    'surveys:list',
    { projectPath: props.projectPath, scenarioId: props.scenario.id },
    { enabled: shown },
  )
  if (!shown) return null
  return <ChecklistView lines={checklistLines(props.state, surveys.data ?? [])} />
}
