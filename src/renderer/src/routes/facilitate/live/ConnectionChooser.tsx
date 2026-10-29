// The three connection options as one radio group (spec 0410 FR-3, NFR-3): each card says in a
// sentence what it is, what it needs, and, linked to its radio by aria-describedby, exactly what it
// sends and where. The selected card's fields follow below the group.
import { useId } from 'react'
import { CONNECTION } from './strings'

export type ConnectionKind = 'lan' | 'relay' | 'self-hosted'

interface CardText {
  title: string
  summary: string
  needs: string
  statement: string
}

const OPTIONS: { kind: ConnectionKind; text: CardText }[] = [
  { kind: 'lan', text: CONNECTION.lan },
  { kind: 'relay', text: CONNECTION.relay },
  { kind: 'self-hosted', text: CONNECTION.selfHosted },
]

export function ConnectionChooser(props: {
  value: ConnectionKind
  onChange: (kind: ConnectionKind) => void
  disabled?: boolean
}) {
  const base = useId()
  return (
    <fieldset className="live-fieldset live-choices" role="radiogroup">
      <legend className="field__label">{CONNECTION.legend}</legend>
      {OPTIONS.map(({ kind, text }) => {
        const statementId = `${base}-${kind}-statement`
        const titleId = `${base}-${kind}-title`
        return (
          <label key={kind} className={`live-card${props.value === kind ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={`${base}-connection`}
              value={kind}
              checked={props.value === kind}
              disabled={props.disabled}
              aria-labelledby={titleId}
              aria-describedby={statementId}
              onChange={() => props.onChange(kind)}
            />
            <span className="live-card__body">
              <strong id={titleId}>{text.title}</strong>
              <span>{text.summary}</span>
              <span className="muted">{text.needs}</span>
              <span id={statementId} className="live-card__statement">
                <span className="field__label">What this sends and where</span>
                {text.statement}
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
