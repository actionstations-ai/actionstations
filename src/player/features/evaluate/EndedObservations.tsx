import { useStore } from '../../app/store'
import { groupName } from './assignment'
import type { EvaluatorFeature } from './evaluator'
import { EVAL, RATING_TEXT } from './strings'

/** After the exercise ends: the evaluator's observations, readable and no longer editable (FR-12). */
export function EndedObservations({ feature }: { feature: EvaluatorFeature }) {
  const observations = useStore(feature.state, (s) => s.observations)
  const assignment = useStore(feature.state, (s) => s.assignment)
  if (observations.length === 0) return null
  const taskText = (id: string | undefined) => assignment?.tasks.find((t) => t.id === id)?.task
  return (
    <section aria-labelledby="ended-obs-heading" className="evalended">
      <h2 id="ended-obs-heading" className="h3">
        {EVAL.endedHeading}
      </h2>
      <p className="muted">{EVAL.endedKept}</p>
      <ul>
        {observations.map((o) => (
          <li key={o.observationId} className="evalended__item">
            <p>
              <span className="mono">{o.exerciseTime}</span>{' '}
              <strong>
                {o.taskId ? (taskText(o.taskId) ?? o.taskId) : EVAL.generalTag}
                {o.capability ? ` · ${groupName(o.capability)}` : ''}
              </strong>
            </p>
            {o.rating ? (
              <p>
                <span aria-hidden="true">{RATING_TEXT[o.rating].icon} </span>
                {RATING_TEXT[o.rating].word}
              </p>
            ) : null}
            {o.notes ? <p>{o.notes}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
