import { useId, useState, type FormEvent } from 'react'
import { parseExerciseTime } from '../../app/clock'
import { groupName } from './assignment'
import { RATING_ORDER, type ObservationInput, type Rating } from './observations'
import { EVAL, RATING_TEXT } from './strings'

/** An observation the guides did not anticipate (FR-6): a note, a time, and optionally a capability, rating and inject. */
export function GeneralObservation({
  capabilities,
  rowIds,
  exerciseNow,
  onSave,
}: {
  capabilities: readonly string[]
  rowIds: readonly string[]
  exerciseNow: () => string
  onSave: (input: ObservationInput) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [time, setTime] = useState('')
  const [capability, setCapability] = useState('')
  const [rating, setRating] = useState('')
  const [row, setRow] = useState('')
  const [error, setError] = useState('')

  const reset = () => {
    setNote('')
    setTime('')
    setCapability('')
    setRating('')
    setRow('')
    setError('')
    setOpen(false)
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return setError(EVAL.generalEmpty)
    const exerciseTime = time.trim() || exerciseNow()
    if (parseExerciseTime(exerciseTime) === undefined) return setError(EVAL.timeInvalid)
    onSave({
      kind: 'note',
      notes: note.trim(),
      exerciseTime,
      ...(capability ? { capability } : {}),
      ...(rating ? { rating: rating as Rating } : {}),
      ...(row ? { mselRowId: row } : {}),
    })
    reset()
  }

  if (!open) {
    return (
      <button type="button" className="btn btn--block" onClick={() => setOpen(true)}>
        + {EVAL.addGeneral}
      </button>
    )
  }
  return (
    <form className="evalgeneral" onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="h3">
        {EVAL.addGeneral}
      </h3>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-note`}>
          {EVAL.generalNote}
        </label>
        <textarea
          id={`${id}-note`}
          className="field__input"
          rows={3}
          maxLength={4000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div className="evalcard__row">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-time`}>
            {EVAL.time}
          </label>
          <input
            id={`${id}-time`}
            className="field__input evalcard__time"
            inputMode="numeric"
            autoComplete="off"
            placeholder={exerciseNow()}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-cap`}>
            {EVAL.generalCapability}
          </label>
          <select
            id={`${id}-cap`}
            className="field__input"
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
          >
            <option value="">{EVAL.generalAnyCapability}</option>
            {capabilities.map((c) => (
              <option key={c} value={c}>
                {groupName(c)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="evalcard__row">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-rating`}>
            {EVAL.generalRating}
          </label>
          <select
            id={`${id}-rating`}
            className="field__input"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
          >
            <option value="">{EVAL.generalNoRating}</option>
            {RATING_ORDER.map((r) => (
              <option key={r} value={r}>
                {RATING_TEXT[r].word}
              </option>
            ))}
          </select>
        </div>
        {rowIds.length ? (
          <div className="field">
            <label className="field__label" htmlFor={`${id}-row`}>
              {EVAL.generalRow}
            </label>
            <select
              id={`${id}-row`}
              className="field__input"
              value={row}
              onChange={(e) => setRow(e.target.value)}
            >
              <option value="">{EVAL.noInject}</option>
              {rowIds.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="join__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="evalgeneral__actions">
        <button type="submit" className="btn btn--primary">
          {EVAL.generalSave}
        </button>
        <button type="button" className="btn btn--quiet" onClick={reset}>
          {EVAL.generalCancel}
        </button>
      </div>
    </form>
  )
}
