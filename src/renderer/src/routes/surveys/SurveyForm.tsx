// A survey as participants see it: sections, then each question as a labelled group. Used
// read-and-try in the Preview and for typing in paper responses. Scales are radio groups with
// a visible label on every point; every control has a label; missing required answers are
// announced and linked to their question.
import type { Survey, SurveyQuestion } from '@shared/schemas/survey'
import { pointLabels, questionPrompt, scaleLabels, surveyQuestions } from '@shared/survey-layout'
import type { FormValue } from './form-value'

interface QuestionProps {
  question: SurveyQuestion
  number: number
  value: FormValue
  onChange: (next: FormValue) => void
  idPrefix: string
  error: boolean
}

const setAnswer = (v: FormValue, id: string, answer: unknown): FormValue => ({
  ...v,
  answers: { ...v.answers, [id]: answer },
})

function ScaleInput({ question: q, value, onChange, idPrefix }: QuestionProps) {
  const labels = pointLabels(q)
  const ends = scaleLabels(q)
  const name = `${idPrefix}-${q.id}`
  return (
    <div className="sv-scale">
      {[1, 2, 3, 4, 5].map((n) => {
        const label = labels?.[n - 1] ?? (n === 1 ? ends.low : n === 5 ? ends.high : '')
        return (
          <label key={n} className="sv-scale__point">
            <input
              type="radio"
              name={name}
              value={n}
              checked={value.answers[q.id] === n}
              onChange={() => onChange(setAnswer(value, q.id, n))}
            />
            <span className="sv-scale__n">{n}</span>
            {label && <span className="sv-scale__label">{label}</span>}
          </label>
        )
      })}
    </div>
  )
}

function ChoiceInput({ question, value, onChange, idPrefix }: QuestionProps) {
  if (question.type !== 'choice') return null
  const picked = Array.isArray(value.answers[question.id])
    ? (value.answers[question.id] as string[])
    : []
  const toggle = (id: string) => {
    const next = question.multiple
      ? picked.includes(id)
        ? picked.filter((p) => p !== id)
        : [...picked, id]
      : [id]
    onChange(setAnswer(value, question.id, next))
  }
  const otherId = `${idPrefix}-${question.id}-other`
  return (
    <div className="sv-options">
      {question.options.map((o) => (
        <label key={o.id} className="sv-option">
          <input
            type={question.multiple ? 'checkbox' : 'radio'}
            name={`${idPrefix}-${question.id}`}
            checked={picked.includes(o.id)}
            onChange={() => toggle(o.id)}
          />
          <span>{o.text}</span>
        </label>
      ))}
      {question.allowOther && (
        <div className="sv-option sv-option--other">
          <label htmlFor={otherId}>Other</label>
          <input
            id={otherId}
            className="input"
            maxLength={500}
            value={value.otherText[question.id] ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                otherText: { ...value.otherText, [question.id]: e.target.value },
              })
            }
          />
        </div>
      )}
    </div>
  )
}

function TextInput({ question, value, onChange, idPrefix }: QuestionProps) {
  if (question.type !== 'text') return null
  const id = `${idPrefix}-${question.id}-input`
  const text =
    typeof value.answers[question.id] === 'string' ? (value.answers[question.id] as string) : ''
  const props = {
    id,
    value: text,
    maxLength: question.maxLength,
    'aria-labelledby': `${idPrefix}-${question.id}-legend`,
    onChange: (e: { target: { value: string } }) =>
      onChange(setAnswer(value, question.id, e.target.value)),
  }
  return question.long ? (
    <textarea className="textarea" rows={4} {...props} />
  ) : (
    <input className="input" {...props} />
  )
}

function Question(props: QuestionProps) {
  const { question: q, number, idPrefix, error } = props
  const legendId = `${idPrefix}-${q.id}-legend`
  const errorId = `${idPrefix}-${q.id}-error`
  const helpId = q.help ? `${idPrefix}-${q.id}-help` : undefined
  const describedBy = [helpId, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
  return (
    <fieldset
      className="sv-question"
      aria-describedby={describedBy}
      aria-invalid={error || undefined}
      data-question-id={q.id}
    >
      <legend id={legendId} className="sv-question__text">
        <span className="sv-question__num">{number}.</span> {questionPrompt(q)}
        {q.required && <span className="sv-question__req"> (required)</span>}
      </legend>
      {q.help && (
        <p id={helpId} className="field__hint">
          {q.help}
        </p>
      )}
      {(q.type === 'rating' || q.type === 'confidence') && <ScaleInput {...props} />}
      {q.type === 'choice' && <ChoiceInput {...props} />}
      {q.type === 'text' && <TextInput {...props} />}
      {error && (
        <p id={errorId} className="field__error">
          Answer this question.
        </p>
      )}
    </fieldset>
  )
}

function RoleGroup(props: {
  survey: Survey
  value: FormValue
  onChange: (v: FormValue) => void
  idPrefix: string
}) {
  const id = `${props.idPrefix}-role-group`
  return (
    <div className="field sv-role-group">
      <label className="field__label" htmlFor={id}>
        Which team were you on? (optional)
      </label>
      <select
        id={id}
        className="select"
        value={props.value.roleGroup}
        onChange={(e) => props.onChange({ ...props.value, roleGroup: e.target.value })}
      >
        <option value="">Prefer not to say</option>
        {props.survey.roleGroups.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  )
}

export function SurveyForm(props: {
  survey: Survey
  value: FormValue
  onChange: (next: FormValue) => void
  /** Question ids flagged as missing a required answer. */
  missing?: ReadonlySet<string>
  idPrefix: string
}) {
  const { survey, value, onChange, idPrefix } = props
  const numbers = new Map(surveyQuestions(survey).map((p) => [p.question.id, p.number]))
  return (
    <div className="sv-form">
      {survey.introMd.trim() && <p className="sv-form__intro">{survey.introMd}</p>}
      {survey.askRoleGroup && survey.roleGroups.length > 0 && (
        <RoleGroup survey={survey} value={value} onChange={onChange} idPrefix={idPrefix} />
      )}
      {survey.sections.map((section) => (
        <section key={section.id} className="sv-section" aria-label={section.title || undefined}>
          {section.title && <h3>{section.title}</h3>}
          {section.introMd.trim() && <p className="sv-section__intro">{section.introMd}</p>}
          {section.questions.map((q) => (
            <Question
              key={q.id}
              question={q}
              number={numbers.get(q.id) ?? 0}
              value={value}
              onChange={onChange}
              idPrefix={idPrefix}
              error={!!props.missing?.has(q.id)}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
