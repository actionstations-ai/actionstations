import type { DecisionField } from '../../../shared/schemas/decisions'
import { STRINGS } from '../../app/strings'

const T = STRINGS.decisions

interface Props<F extends DecisionField> {
  field: F
  value: string
  problem: string | undefined
  onChange: (value: string) => void
}

const marker = (f: DecisionField) => (f.required ? T.required : T.optional)
const errorId = (f: DecisionField) => `dec-${f.id}-error`
const hintId = (f: DecisionField) => `dec-${f.id}-hint`

function describedBy(f: DecisionField, hasHint: boolean, problem: string | undefined) {
  const ids = [hasHint || f.help ? hintId(f) : '', problem ? errorId(f) : ''].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

function Label({ f }: { f: DecisionField }) {
  return (
    <label className="field__label" htmlFor={`dec-${f.id}`}>
      {f.label} <span className="survey-q__marker">({marker(f)})</span>
    </label>
  )
}

function Notes({ f, hint, problem }: { f: DecisionField; hint?: string; problem?: string }) {
  return (
    <>
      {hint || f.help ? (
        <p className="field__hint" id={hintId(f)}>
          {[f.help, hint].filter(Boolean).join(' ')}
        </p>
      ) : null}
      {problem ? (
        <p className="survey-q__error" id={errorId(f)}>
          {problem}
        </p>
      ) : null}
    </>
  )
}

export function TextInput({
  field,
  value,
  problem,
  onChange,
}: Props<Extract<DecisionField, { type: 'text' }>>) {
  return (
    <div className="field survey-q">
      <Label f={field} />
      <textarea
        id={`dec-${field.id}`}
        className="field__input"
        rows={3}
        maxLength={field.maxLength}
        aria-invalid={problem ? true : undefined}
        aria-describedby={describedBy(field, false, problem)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Notes f={field} problem={problem} />
    </div>
  )
}

export function NumberInput({
  field,
  value,
  problem,
  onChange,
}: Props<Extract<DecisionField, { type: 'number' }>>) {
  return (
    <div className="field survey-q">
      <Label f={field} />
      <input
        id={`dec-${field.id}`}
        className="field__input"
        type="text"
        inputMode={field.integer ? 'numeric' : 'decimal'}
        aria-invalid={problem ? true : undefined}
        aria-describedby={describedBy(field, false, problem)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Notes f={field} hint={field.unit ? T.unit(field.unit) : undefined} problem={problem} />
    </div>
  )
}

export function TimeInput({
  field,
  value,
  problem,
  onChange,
}: Props<Extract<DecisionField, { type: 'time' }>>) {
  return (
    <div className="field survey-q">
      <Label f={field} />
      <input
        id={`dec-${field.id}`}
        className="field__input"
        type="text"
        inputMode="numeric"
        placeholder="0:00"
        aria-invalid={problem ? true : undefined}
        aria-describedby={describedBy(field, true, problem)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Notes f={field} hint={T.timeHint} problem={problem} />
    </div>
  )
}

export function ChoiceInput({
  field,
  value,
  problem,
  onChange,
}: Props<Extract<DecisionField, { type: 'choice' }>>) {
  return (
    <fieldset
      className="survey-q"
      aria-invalid={problem ? true : undefined}
      aria-describedby={describedBy(field, false, problem)}
    >
      <legend className="survey-q__legend">
        {field.label} <span className="survey-q__marker">({marker(field)})</span>
      </legend>
      <div className="vote-options">
        {field.options.map((o) => (
          <label key={o.id} className={`vote-option${value === o.id ? ' is-chosen' : ''}`}>
            <input
              type="radio"
              name={`dec-${field.id}`}
              value={o.id}
              checked={value === o.id}
              onChange={() => onChange(o.id)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      <Notes f={field} problem={problem} />
    </fieldset>
  )
}

/**
 * A place from the list of named areas. Drawing on a map is not offered on this page: the map
 * view here shows places and cannot be drawn on, so the list is the only way to pick.
 */
export function AreaInput({
  field,
  value,
  problem,
  onChange,
}: Props<Extract<DecisionField, { type: 'area' }>>) {
  return (
    <div className="field survey-q">
      <Label f={field} />
      <select
        id={`dec-${field.id}`}
        className="field__input"
        aria-invalid={problem ? true : undefined}
        aria-describedby={describedBy(field, true, problem)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{T.choose}</option>
        {field.areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
      <Notes f={field} hint={T.areaHint} problem={problem} />
    </div>
  )
}
