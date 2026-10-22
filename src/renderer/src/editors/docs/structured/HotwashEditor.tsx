// Hot wash: debrief method and the discussion questions, each tied to an objective.
import { Plus } from 'lucide-react'
import { useId } from 'react'
import { HotWash, type Scenario } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { Empty, ItemActions, TextField } from './inputs'
import { moveItem, replaceAt } from './list-utils'
import { PartFrame, type PartEditorProps } from './PartFrame'
import { useScenarioPart, type PartSpec } from './use-scenario-part'

type Question = HotWash['questions'][number]

const HOTWASH_PART: PartSpec<HotWash> = {
  pick: (s) => s.hotwash ?? HotWash.parse({}),
  apply: (s, hotwash) => ({ ...s, hotwash }),
  id: 'hotwash',
  label: 'Hot wash',
  note: 'Edited hot wash',
}

function ObjectiveSelect(props: {
  label: string
  value: string | undefined
  scenario: Scenario
  onChange: (v: string | undefined) => void
}) {
  const id = useId()
  const names = props.scenario.objectives.map((o) => o.name || o.text.slice(0, 40))
  const options = props.value && !names.includes(props.value) ? [...names, props.value] : names
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {props.label}
      </label>
      <select
        id={id}
        className="select"
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value || undefined)}
      >
        <option value="">No objective</option>
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  )
}

function QuestionItem(props: {
  q: Question
  index: number
  count: number
  scenario: Scenario
  onChange: (q: Question) => void
  onMove: (a: number, b: number) => void
  onRemove: (i: number) => void
}) {
  const { q } = props
  const n = props.index + 1
  return (
    <li className="card part__item">
      <div className="part__item-grid">
        <TextField
          label={`Question ${n} topic`}
          value={q.topic}
          onChange={(topic) => props.onChange({ ...q, topic })}
        />
        <ObjectiveSelect
          label={`Question ${n} objective`}
          value={q.objectiveRef}
          scenario={props.scenario}
          onChange={(objectiveRef) => {
            const { objectiveRef: _drop, ...rest } = q
            props.onChange(objectiveRef ? { ...rest, objectiveRef } : rest)
          }}
        />
      </div>
      <TextField
        label={`Question ${n}`}
        multiline
        rows={3}
        value={q.text}
        onChange={(text) => props.onChange({ ...q, text })}
      />
      <ItemActions
        name={`question ${n}`}
        index={props.index}
        count={props.count}
        onMove={props.onMove}
        onRemove={props.onRemove}
      />
    </li>
  )
}

export function HotwashEditor(props: PartEditorProps) {
  const part = useScenarioPart(props.projectPath, props.scenario, HOTWASH_PART)
  const hw = part.value
  const setQuestions = (fn: (qs: Question[]) => Question[]) =>
    part.update((prev) => ({ ...prev, questions: fn(prev.questions) }))
  return (
    <PartFrame
      {...props}
      title="Hot wash questions"
      part="hotwash"
      noun="hot wash"
      hasContent={hw.questions.length > 0}
      editor={part}
      hint="These questions are stored with the scenario; the hot wash guide document is edited separately."
    >
      <div className="part__item-grid">
        <TextField
          label="Method"
          value={hw.method}
          onChange={(method) => part.update((p) => ({ ...p, method }))}
        />
        <TextField
          label="How to run it"
          multiline
          value={hw.methodDescription}
          onChange={(methodDescription) => part.update((p) => ({ ...p, methodDescription }))}
        />
      </div>
      {!hw.questions.length && <Empty>No discussion questions yet.</Empty>}
      <ol className="stack part__list" aria-label="Discussion questions">
        {hw.questions.map((q, i) => (
          <QuestionItem
            key={i}
            q={q}
            index={i}
            count={hw.questions.length}
            scenario={props.scenario}
            onChange={(next) => setQuestions((qs) => replaceAt(qs, i, next))}
            onMove={(a, b) => setQuestions((qs) => moveItem(qs, a, b))}
            onRemove={(j) => setQuestions((qs) => qs.filter((_, k) => k !== j))}
          />
        ))}
      </ol>
      <div className="row">
        <Button size="sm" onClick={() => setQuestions((qs) => [...qs, { topic: '', text: '' }])}>
          <Plus size={14} aria-hidden /> Add question
        </Button>
      </div>
    </PartFrame>
  )
}
