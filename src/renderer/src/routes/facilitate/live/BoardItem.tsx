import type { HotWashItem } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { senderLabel, timeLabel } from './hotwash-model'

/** One contribution on the board: select box, text and what the facilitator needs to judge it. */
export function BoardItem(props: {
  item: HotWashItem
  scenario: Scenario
  selected: boolean
  onSelect: (selected: boolean) => void
  /** Show a Restore / Accept button instead of the selection box. */
  action?: { label: string; run: () => void }
  /** A past session's board: no selection box. */
  readOnly?: boolean
}) {
  const { item } = props
  const question = props.scenario.hotwash?.questions[Number(item.questionId?.slice(4)) - 1]
  const objective = props.scenario.objectives.find((o) => o.id === item.objectiveId)
  const meta = [
    senderLabel(item),
    timeLabel(item.at),
    item.mselRowId,
    question ? `Q: ${question.topic || question.text.slice(0, 40)}` : undefined,
    objective ? objective.name || objective.text : undefined,
  ].filter(Boolean)
  return (
    <li className="fac-hw__item" data-promoted={item.promoted || undefined}>
      {props.action || props.readOnly ? null : (
        <input
          type="checkbox"
          className="fac-hw__check"
          checked={props.selected}
          aria-label={`Select: ${item.text.slice(0, 80)}`}
          onChange={(e) => props.onSelect(e.target.checked)}
        />
      )}
      <div className="fac-hw__body">
        <p className="fac-hw__text">{item.text}</p>
        <p className="fac-hint">
          {meta.join(' · ')}
          {item.originalText ? ' · edited' : ''}
        </p>
      </div>
      <div className="fac-hw__side">
        {item.accepted && !item.hidden ? (
          <span className="fac-hw__plus" aria-label={`${item.plus} agree`}>
            <span aria-hidden="true">▲ </span>
            {item.plus}
          </span>
        ) : null}
        {item.promoted ? <span className="fac-hw__star">Promoted</span> : null}
        {props.action ? (
          <button type="button" className="btn btn--sm" onClick={props.action.run}>
            {props.action.label}
          </button>
        ) : null}
      </div>
    </li>
  )
}
