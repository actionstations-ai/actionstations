// The survey builder: survey settings, sections and questions with type-specific options.
// Reordering uses Move up / Move down buttons, so it works from the keyboard.
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import {
  SURVEY_QUESTION_TYPES,
  type Survey,
  type SurveyQuestion,
  type SurveyQuestionType,
  type SurveySection,
} from '@shared/schemas/survey'
import { QUESTION_TYPE_LABELS } from '@shared/survey-layout'
import { Button } from '../../components/ui'
import {
  addOption,
  moveItem,
  newQuestion,
  newSection,
  removeOption,
  removeQuestion,
  STATUS_LABELS,
  TIMING_LABELS,
  updateQuestion,
  updateSection,
} from './survey-edit'

type Update = (fn: (s: Survey) => Survey) => void

function TextField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  long?: boolean
  hint?: string
  maxLength?: number
}) {
  const id = useId()
  const hintId = props.hint ? `${id}-hint` : undefined
  const common = {
    id,
    value: props.value,
    maxLength: props.maxLength,
    'aria-describedby': hintId,
    onChange: (e: { target: { value: string } }) => props.onChange(e.target.value),
  }
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {props.label}
      </label>
      {props.long ? (
        <textarea className="textarea" rows={3} {...common} />
      ) : (
        <input className="input" {...common} />
      )}
      {props.hint && (
        <span id={hintId} className="field__hint">
          {props.hint}
        </span>
      )}
    </div>
  )
}

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="sv-check">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.label}
    </label>
  )
}

function SelectField<T extends string>(props: {
  label: string
  value: T
  options: Record<T, string>
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {props.label}
      </label>
      <select
        id={id}
        className="select"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
      >
        {(Object.entries(props.options) as [T, string][]).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Teams, one per line. The text is kept as typed; the list saved is its non-empty lines. */
function RoleGroupsField(props: { value: string[]; onChange: (groups: string[]) => void }) {
  const [text, setText] = useState(() => props.value.join('\n'))
  return (
    <TextField
      label="Teams to choose from"
      long
      value={text}
      hint="One per line. Use teams, never single roles, so no answer can be traced to a person."
      onChange={(next) => {
        setText(next)
        props.onChange(
          next
            .split('\n')
            .map((t) => t.trim().slice(0, 60))
            .filter(Boolean)
            .slice(0, 20),
        )
      }}
    />
  )
}

function SurveySettings({ survey, update }: { survey: Survey; update: Update }) {
  const set = (patch: Partial<Survey>) => update((s) => ({ ...s, ...patch }))
  return (
    <section className="card sv-settings" aria-labelledby="sv-settings-title">
      <h2 id="sv-settings-title">Survey</h2>
      <TextField
        label="Title"
        value={survey.title}
        maxLength={200}
        onChange={(title) => set({ title })}
      />
      <TextField
        label="Introduction"
        long
        value={survey.introMd}
        maxLength={4000}
        hint="Shown at the top of the form."
        onChange={(introMd) => set({ introMd })}
      />
      <div className="sv-settings__row">
        <SelectField
          label="When"
          value={survey.timing}
          options={TIMING_LABELS}
          onChange={(timing) => set({ timing })}
        />
        <SelectField
          label="Status"
          value={survey.status}
          options={STATUS_LABELS}
          onChange={(status) => set({ status })}
        />
      </div>
      <Check
        label="Ask which team the participant was on (optional for them)"
        checked={survey.askRoleGroup}
        onChange={(askRoleGroup) => set({ askRoleGroup })}
      />
      {survey.askRoleGroup && (
        <RoleGroupsField value={survey.roleGroups} onChange={(roleGroups) => set({ roleGroups })} />
      )}
    </section>
  )
}

type Choice = Extract<SurveyQuestion, { type: 'choice' }>

function ChoiceOptions(props: {
  q: Choice
  isKnowledge: boolean
  set: (q: SurveyQuestion) => void
}) {
  const { q, set } = props
  const group = useId()
  return (
    <fieldset className="sv-choices">
      <legend className="field__label">Answer options</legend>
      {q.options.map((o, i) => (
        <div key={o.id} className="sv-choices__row">
          <input
            className="input"
            aria-label={`Option ${i + 1}`}
            value={o.text}
            maxLength={500}
            onChange={(e) =>
              set({
                ...q,
                options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)),
              })
            }
          />
          {props.isKnowledge && (
            <label className="sv-check">
              <input
                type="radio"
                name={`${group}-correct`}
                checked={q.correctOptionId === o.id}
                onChange={() => set({ ...q, correctOptionId: o.id })}
              />
              Correct answer
            </label>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon
            aria-label={`Remove option ${i + 1}`}
            disabled={q.options.length <= 2}
            onClick={() => set(removeOption(q, o.id))}
          >
            <Trash2 size={14} aria-hidden />
          </Button>
        </div>
      ))}
      <div className="row">
        <Button size="sm" disabled={q.options.length >= 12} onClick={() => set(addOption(q))}>
          <Plus size={14} aria-hidden /> Add option
        </Button>
        <Check
          label="Allow several answers"
          checked={q.multiple}
          onChange={(multiple) => set({ ...q, multiple })}
        />
        <Check
          label={'Offer "Other"'}
          checked={q.allowOther}
          onChange={(allowOther) => set({ ...q, allowOther })}
        />
      </div>
    </fieldset>
  )
}

function TypeOptions(props: {
  q: SurveyQuestion
  survey: Survey
  set: (q: SurveyQuestion) => void
}) {
  const { q, set } = props
  switch (q.type) {
    case 'rating':
      return (
        <div className="sv-settings__row">
          <TextField
            label="Label for 1"
            value={q.lowLabel}
            maxLength={80}
            onChange={(lowLabel) => set({ ...q, lowLabel })}
          />
          <TextField
            label="Label for 5"
            value={q.highLabel}
            maxLength={80}
            onChange={(highLabel) => set({ ...q, highLabel })}
          />
        </div>
      )
    case 'choice':
      return <ChoiceOptions q={q} isKnowledge={props.survey.kind === 'knowledge_check'} set={set} />
    case 'text':
      return <Check label="Long answer" checked={q.long} onChange={(long) => set({ ...q, long })} />
    case 'confidence':
      return (
        <TextField
          label="Statement participants rate"
          long
          value={q.statement}
          maxLength={1000}
          hint={'First person, one capability: "I could lead the switch to manual boarding."'}
          onChange={(statement) => set({ ...q, statement })}
        />
      )
  }
}

function QuestionEditor(props: {
  q: SurveyQuestion
  number: number
  first: boolean
  last: boolean
  survey: Survey
  update: Update
  onMove: (delta: number) => void
}) {
  const { q, update } = props
  const set = (next: SurveyQuestion) => update((s) => updateQuestion(s, q.id, () => next))
  const heading = `Question ${props.number}`
  return (
    <li className="sv-qedit" aria-label={heading}>
      <div className="sv-qedit__head">
        <h4>
          {heading} <span className="muted">· {QUESTION_TYPE_LABELS[q.type]}</span>
        </h4>
        <div className="row">
          <Button
            size="sm"
            variant="ghost"
            icon
            aria-label={`Move ${heading} up`}
            disabled={props.first}
            onClick={() => props.onMove(-1)}
          >
            <ArrowUp size={14} aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon
            aria-label={`Move ${heading} down`}
            disabled={props.last}
            onClick={() => props.onMove(1)}
          >
            <ArrowDown size={14} aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon
            aria-label={`Delete ${heading}`}
            onClick={() => update((s) => removeQuestion(s, q.id))}
          >
            <Trash2 size={14} aria-hidden />
          </Button>
        </div>
      </div>
      <TextField
        label={q.type === 'confidence' ? 'Short label' : 'Question'}
        long={q.type !== 'confidence'}
        value={q.text}
        maxLength={1000}
        onChange={(text) => set({ ...q, text })}
      />
      <TypeOptions q={q} survey={props.survey} set={set} />
      <TextField
        label="Help text (optional)"
        value={q.help}
        maxLength={1000}
        onChange={(help) => set({ ...q, help })}
      />
      <Check
        label="Required"
        checked={q.required}
        onChange={(required) => set({ ...q, required })}
      />
    </li>
  )
}

function AddQuestion({ onAdd }: { onAdd: (type: SurveyQuestionType) => void }) {
  const [type, setType] = useState<SurveyQuestionType>('rating')
  const id = useId()
  return (
    <div className="row sv-add">
      <label htmlFor={id} className="sr-only">
        Question type
      </label>
      <select
        id={id}
        className="select"
        value={type}
        onChange={(e) => setType(e.target.value as SurveyQuestionType)}
      >
        {SURVEY_QUESTION_TYPES.map((t) => (
          <option key={t} value={t}>
            {QUESTION_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <Button size="sm" onClick={() => onAdd(type)}>
        <Plus size={14} aria-hidden /> Add question
      </Button>
    </div>
  )
}

function SectionEditor(props: {
  section: SurveySection
  index: number
  count: number
  numbers: Map<string, number>
  survey: Survey
  update: Update
}) {
  const { section, update, index } = props
  const setSection = (fn: (s: SurveySection) => SurveySection) =>
    update((s) => updateSection(s, section.id, fn))
  const label = `Section ${index + 1}`
  const actions: ReactNode = (
    <div className="row">
      <Button
        size="sm"
        variant="ghost"
        icon
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => update((s) => ({ ...s, sections: moveItem(s.sections, index, -1) }))}
      >
        <ArrowUp size={14} aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon
        aria-label={`Move ${label} down`}
        disabled={index === props.count - 1}
        onClick={() => update((s) => ({ ...s, sections: moveItem(s.sections, index, 1) }))}
      >
        <ArrowDown size={14} aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon
        aria-label={`Delete ${label}`}
        onClick={() =>
          update((s) => ({ ...s, sections: s.sections.filter((x) => x.id !== section.id) }))
        }
      >
        <Trash2 size={14} aria-hidden />
      </Button>
    </div>
  )
  return (
    <section className="card sv-section-edit" aria-label={label}>
      <div className="sv-qedit__head">
        <h3>{section.title || label}</h3>
        {actions}
      </div>
      <TextField
        label="Section heading"
        value={section.title}
        maxLength={200}
        onChange={(title) => setSection((s) => ({ ...s, title }))}
      />
      <TextField
        label="Section introduction"
        long
        value={section.introMd}
        maxLength={4000}
        onChange={(introMd) => setSection((s) => ({ ...s, introMd }))}
      />
      <ol className="sv-qlist">
        {section.questions.map((q, i) => (
          <QuestionEditor
            key={q.id}
            q={q}
            number={props.numbers.get(q.id) ?? i + 1}
            first={i === 0}
            last={i === section.questions.length - 1}
            survey={props.survey}
            update={update}
            onMove={(delta) =>
              setSection((s) => ({ ...s, questions: moveItem(s.questions, i, delta) }))
            }
          />
        ))}
      </ol>
      <AddQuestion
        onAdd={(type) =>
          setSection((s) => ({
            ...s,
            questions: [...s.questions, newQuestion(type, props.survey)],
          }))
        }
      />
    </section>
  )
}

export function SurveyEditor({ survey, update }: { survey: Survey; update: Update }) {
  let n = 0
  const numbers = new Map(
    survey.sections.flatMap((s) => s.questions.map((q) => [q.id, ++n] as const)),
  )
  return (
    <div className="sv-editor">
      <SurveySettings survey={survey} update={update} />
      {survey.pairId && (
        <p className="sv-note">
          This survey has a {survey.edition === 'before' ? 'after' : 'before'} edition. Questions
          are kept the same in both, so the results can be compared; title, introduction and status
          are set per edition.
        </p>
      )}
      {survey.sections.map((section, i) => (
        <SectionEditor
          key={section.id}
          section={section}
          index={i}
          count={survey.sections.length}
          numbers={numbers}
          survey={survey}
          update={update}
        />
      ))}
      <div>
        <Button onClick={() => update((s) => ({ ...s, sections: [...s.sections, newSection()] }))}>
          <Plus size={14} aria-hidden /> Add section
        </Button>
      </div>
    </div>
  )
}
