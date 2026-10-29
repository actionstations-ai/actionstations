import { useRef, useState, type FormEvent } from 'react'
import type { PlayerSession } from '../../app/session'
import { STRINGS } from '../../app/strings'
import {
  missingAnswers,
  scalePoints,
  type Answers,
  type PlayerSurvey,
  type SurveyQuestion,
} from './surveys'

const T = STRINGS.surveys

interface QuestionProps {
  q: SurveyQuestion
  value: Answers[string] | undefined
  disabled: boolean
  invalid: boolean
  onChange: (value: Answers[string]) => void
}

const marker = (q: SurveyQuestion) => (q.required ? T.required : T.optional)

function Legend({ q }: { q: SurveyQuestion }) {
  return (
    <legend className="survey-q__legend">
      {q.text} <span className="survey-q__marker">({marker(q)})</span>
    </legend>
  )
}

function Scale({ q, value, disabled, invalid, onChange }: QuestionProps) {
  const points = scalePoints(q)
  return (
    <fieldset className="survey-q" disabled={disabled} aria-invalid={invalid || undefined}>
      <Legend q={q} />
      <p className="field__hint" id={`${q.id}-hint`}>
        {T.scaleHint}
      </p>
      <div className="survey-scale" aria-describedby={`${q.id}-hint`}>
        {points.map((n) => (
          <label key={n} className={`survey-scale__point${value === n ? ' is-chosen' : ''}`}>
            <input
              type="radio"
              name={`q-${q.id}`}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              aria-label={T.scalePoint(n, points.length)}
            />
            <span aria-hidden="true">{n}</span>
          </label>
        ))}
      </div>
      {invalid ? <p className="survey-q__error">{T.needsAnswer}</p> : null}
    </fieldset>
  )
}

function Choice({ q, value, disabled, invalid, onChange }: QuestionProps) {
  const multi = q.kind === 'multi'
  const picked = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const toggle = (id: string) => {
    if (!multi) return onChange(id)
    onChange(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id])
  }
  return (
    <fieldset className="survey-q" disabled={disabled} aria-invalid={invalid || undefined}>
      <Legend q={q} />
      {multi ? <p className="field__hint">{T.multiHint}</p> : null}
      <div className="vote-options">
        {(q.options ?? []).map((o) => (
          <label key={o.id} className={`vote-option${picked.includes(o.id) ? ' is-chosen' : ''}`}>
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={`q-${q.id}`}
              value={o.id}
              checked={picked.includes(o.id)}
              onChange={() => toggle(o.id)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {invalid ? <p className="survey-q__error">{T.needsAnswer}</p> : null}
    </fieldset>
  )
}

function FreeText({ q, value, disabled, invalid, onChange }: QuestionProps) {
  const id = `q-${q.id}`
  return (
    <div className="field survey-q">
      <label className="field__label" htmlFor={id}>
        {q.text} <span className="survey-q__marker">({marker(q)})</span>
      </label>
      <textarea
        id={id}
        className="field__input"
        rows={4}
        maxLength={2000}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
      {invalid ? <p className="survey-q__error">{T.needsAnswer}</p> : null}
    </div>
  )
}

const KINDS = { scale: Scale, single: Choice, multi: Choice, text: FreeText } as const

/**
 * One survey: each question as a labelled group (scales are radio groups of numbers, choices
 * radios or checkboxes, text a labelled box). Required questions are checked on send and named
 * in an alert; the first missing one takes focus. Answers can change until the survey closes.
 */
export function SurveyForm({ session, survey }: { session: PlayerSession; survey: PlayerSurvey }) {
  const [answers, setAnswers] = useState<Answers>(survey.mine ?? {})
  const [missing, setMissing] = useState<string[]>([])
  const form = useRef<HTMLFormElement>(null)
  const open = survey.status === 'open'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const lacking = missingAnswers(survey, answers).map((q) => q.id)
    setMissing(lacking)
    if (lacking.length) {
      const first = form.current?.querySelector<HTMLElement>(
        `[name="q-${lacking[0]}"], #q-${lacking[0]}`,
      )
      first?.focus()
      return
    }
    void session.submitSurvey(survey.surveyId, answers)
  }

  return (
    <form ref={form} className="vote-form survey-form" onSubmit={submit} noValidate>
      {missing.length ? (
        <p role="alert" className="survey-q__error">
          {T.missing(missing.length)}
        </p>
      ) : null}
      {survey.questions.map((q) => {
        const Question = KINDS[q.kind]
        return (
          <Question
            key={q.id}
            q={q}
            value={answers[q.id]}
            disabled={!open}
            invalid={missing.includes(q.id)}
            onChange={(v) => {
              setAnswers((a) => ({ ...a, [q.id]: v }))
              setMissing((m) => m.filter((id) => id !== q.id))
            }}
          />
        )
      })}
      {open ? (
        <button type="submit" className="btn btn--primary btn--block">
          {survey.mine ? T.change : T.send}
        </button>
      ) : null}
      {survey.mine ? (
        <p role="status" className="vote-status">
          {survey.sent ? T.sent : T.queued}
        </p>
      ) : null}
      {open ? (
        <p className="muted">{`${T.canChange} ${T.anonymous}`}</p>
      ) : (
        <p className="muted">{T.closedNote}</p>
      )}
    </form>
  )
}
