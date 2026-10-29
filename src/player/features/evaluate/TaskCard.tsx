import { useId, useState } from 'react'
import { parseExerciseTime } from '../../app/clock'
import { latestReleasedRow, type AssignedTask, type ReleasedRow } from './assignment'
import {
  RATING_ORDER,
  type LocalObservation,
  type ObservationInput,
  type Rating,
} from './observations'
import { EVAL, RATING_TEXT } from './strings'

export interface TaskCardProps {
  task: AssignedTask
  /** Role names by id, to show who is expected to do the task. */
  roleName: (roleId: string) => string
  observation: LocalObservation | undefined
  released: readonly ReleasedRow[]
  /** Exercise time now, used when a rating is first set. */
  exerciseNow: () => string
  readOnly: boolean
  onSave: (input: ObservationInput) => void
}

function citationText(task: AssignedTask): string {
  const { documentTitle, headingPath, page } = task.citation
  const path = headingPath.includes(documentTitle)
    ? headingPath
    : `${documentTitle} › ${headingPath}`
  return page ? `${path}, p. ${page}` : path
}

/** One critical task: its text and plan citation, a four-way rating, a note, a time and a linked inject. */
export function TaskCard(props: TaskCardProps) {
  const { task, observation: o, readOnly } = props
  const id = useId()
  const [note, setNote] = useState(o?.notes ?? '')
  const [time, setTime] = useState(o?.exerciseTime ?? '')
  const [timeError, setTimeError] = useState(false)
  /** The rating just chosen, shown until the saved observation catches up. */
  const [pick, setPick] = useState<{ rating: Rating; revision: number | undefined }>()
  const picked = pick && pick.revision === o?.revision ? pick.rating : undefined
  const rowChoice = o?.mselRowId ?? latestReleasedRow(task, props.released) ?? ''

  const save = (patch: { rating?: Rating; notes?: string; time?: string; row?: string }) => {
    const rating = patch.rating ?? o?.rating
    if (!rating) return
    const exerciseTime = patch.time ?? (time || props.exerciseNow())
    const row = patch.row ?? rowChoice
    props.onSave({
      kind: 'task',
      taskId: task.id,
      ...(task.criterionId ? { criterionId: task.criterionId } : {}),
      rating,
      notes: patch.notes ?? note,
      exerciseTime,
      ...(row ? { mselRowId: row } : {}),
    })
    if (!time) setTime(exerciseTime)
  }

  const onTimeBlur = () => {
    if (!o || time === o.exerciseTime) return
    if (parseExerciseTime(time) === undefined) return setTimeError(true)
    setTimeError(false)
    save({ time })
  }

  const status = !o ? '' : o.sentRevision >= o.revision ? EVAL.sent : EVAL.waitingToSend
  return (
    <article className="evalcard" aria-labelledby={`${id}-task`} data-task={task.id}>
      <h3 id={`${id}-task`} className="evalcard__task">
        <span className="mono">{task.criterionId ? task.rowIds[0] : task.id}</span> {task.task}
      </h3>
      <p className="evalcard__meta">
        {task.expectedBy ? <span>{EVAL.expectedBy(props.roleName(task.expectedBy))}</span> : null}
        {task.timing ? <span>{task.timing}</span> : null}
        {task.rowIds.length ? <span>{EVAL.rows(task.rowIds.join(', '))}</span> : null}
      </p>
      <p className="evalcard__cite">{citationText(task)}</p>
      <fieldset className="evalcard__rating" disabled={readOnly}>
        <legend className="sr-only">{EVAL.rating(task.task)}</legend>
        {RATING_ORDER.map((r) => (
          <label key={r} className="evalcard__option" data-rating={r}>
            <input
              type="radio"
              name={`${id}-rating`}
              value={r}
              checked={(picked ?? o?.rating) === r}
              onChange={() => {
                setPick({ rating: r, revision: o?.revision })
                save({ rating: r })
              }}
            />
            <span aria-hidden="true" className="evalcard__icon">
              {RATING_TEXT[r].icon}
            </span>
            <span>{RATING_TEXT[r].word}</span>
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-note`}>
          {EVAL.note}
        </label>
        <textarea
          id={`${id}-note`}
          className="field__input evalcard__note"
          rows={2}
          maxLength={4000}
          disabled={readOnly || !o}
          value={note}
          placeholder={o ? EVAL.notePlaceholder : EVAL.rateFirst}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => o && note !== o.notes && save({ notes: note })}
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
            disabled={readOnly || !o}
            value={time}
            aria-invalid={timeError || undefined}
            aria-describedby={timeError ? `${id}-time-err` : undefined}
            onChange={(e) => setTime(e.target.value)}
            onBlur={onTimeBlur}
          />
          {timeError ? (
            <span id={`${id}-time-err`} className="field__hint" role="alert">
              {EVAL.timeInvalid}
            </span>
          ) : null}
        </div>
        {task.rowIds.length ? (
          <div className="field">
            <label className="field__label" htmlFor={`${id}-row`}>
              {EVAL.inject}
            </label>
            <select
              id={`${id}-row`}
              className="field__input"
              disabled={readOnly || !o}
              value={rowChoice}
              onChange={(e) => save({ row: e.target.value })}
            >
              <option value="">{EVAL.noInject}</option>
              {task.rowIds.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <p className="evalcard__status field__hint" role="status">
        {status}
      </p>
    </article>
  )
}
