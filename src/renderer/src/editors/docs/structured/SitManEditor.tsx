// Situation Manual modules (#420): per phase the narrative players read at the module's start,
// the key issues and the discussion questions (addressed to roles, tied to an objective, citing
// plan sections), plus the exercise assumptions and artificialities. Written by the `sitman`
// stage; every field is editable here.
import { Plus } from 'lucide-react'
import { SitMan, type Phase, type Scenario, type SitManModule } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { CitationChips } from '../../../routes/scenarios/CitationChips'
import { ObjectiveSelect } from './HotwashEditor'
import { Empty, ItemActions, StringList, TextField } from './inputs'
import { moveItem, replaceAt } from './list-utils'
import { PartFrame, type PartEditorProps } from './PartFrame'
import { useScenarioPart, type PartSpec } from './use-scenario-part'
import { withModule } from './sitman-module'

type Question = SitManModule['discussionQuestions'][number]

const SITMAN_PART: PartSpec<SitMan> = {
  pick: (s) => s.sitman ?? SitMan.parse({}),
  apply: (s, sitman) => ({ ...s, sitman }),
  id: 'sitman',
  label: 'SitMan modules',
  note: 'Edited SitMan modules',
}

const emptyModule = (phaseId: string): SitManModule => ({
  phaseId,
  narrativeMd: '',
  keyIssues: [],
  discussionQuestions: [],
})

function RoleChecks(props: {
  n: string
  q: Question
  scenario: Scenario
  onChange: (q: Question) => void
}) {
  const { q } = props
  const toggle = (id: string, on: boolean) =>
    props.onChange({
      ...q,
      roleIds: on ? [...q.roleIds, id] : q.roleIds.filter((r) => r !== id),
    })
  return (
    <fieldset className="sitman__question-roles">
      <legend className="field__label">{`Question ${props.n} addressed to`}</legend>
      {props.scenario.roles.map((r) => (
        <label key={r.id} className="conduct__check">
          <input
            type="checkbox"
            checked={q.roleIds.includes(r.id)}
            onChange={(e) => toggle(r.id, e.target.checked)}
          />
          <span>{r.abbreviation || r.name}</span>
        </label>
      ))}
    </fieldset>
  )
}

function QuestionItem(props: {
  n: string
  q: Question
  index: number
  count: number
  scenario: Scenario
  onChange: (q: Question) => void
  onMove: (a: number, b: number) => void
  onRemove: (i: number) => void
}) {
  const { q, n } = props
  return (
    <li className="card part__item">
      <TextField
        label={`Question ${n}`}
        multiline
        value={q.text}
        onChange={(text) => props.onChange({ ...q, text })}
      />
      <RoleChecks {...props} />
      <ObjectiveSelect
        label={`Question ${n} objective`}
        value={q.objectiveRef}
        scenario={props.scenario}
        onChange={(objectiveRef) => {
          const { objectiveRef: _drop, ...rest } = q
          props.onChange(objectiveRef ? { ...rest, objectiveRef } : rest)
        }}
      />
      <CitationChips citations={q.citations} />
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

function ModuleEditor(props: {
  phase: Phase
  m: SitManModule
  scenario: Scenario
  onChange: (m: SitManModule) => void
}) {
  const { m, phase } = props
  const no = phase.index + 1
  const setQs = (fn: (qs: Question[]) => Question[]) =>
    props.onChange({ ...m, discussionQuestions: fn(m.discussionQuestions) })
  return (
    <section className="card part__item" aria-label={`Module ${no}: ${phase.title}`}>
      <h4 className="section-title">{`Module ${no}: ${phase.title} (${phase.startTime}–${phase.endTime})`}</h4>
      <TextField
        label={`Module ${no} narrative (Markdown)`}
        multiline
        rows={5}
        value={m.narrativeMd}
        hint="What players know at the start of the module. Blank: the phase goal is printed."
        onChange={(narrativeMd) => props.onChange({ ...m, narrativeMd })}
      />
      <StringList
        label={`Module ${no} key issues`}
        itemLabel="Key issue"
        items={m.keyIssues}
        onChange={(keyIssues) => props.onChange({ ...m, keyIssues })}
      />
      {!m.discussionQuestions.length && <Empty>No discussion questions yet.</Empty>}
      <ol className="stack part__list" aria-label={`Module ${no} discussion questions`}>
        {m.discussionQuestions.map((q, i) => (
          <QuestionItem
            key={i}
            n={`${no}.${i + 1}`}
            q={q}
            index={i}
            count={m.discussionQuestions.length}
            scenario={props.scenario}
            onChange={(next) => setQs((qs) => replaceAt(qs, i, next))}
            onMove={(a, b) => setQs((qs) => moveItem(qs, a, b))}
            onRemove={(j) => setQs((qs) => qs.filter((_, k) => k !== j))}
          />
        ))}
      </ol>
      <div className="row">
        <Button
          size="sm"
          onClick={() => setQs((qs) => [...qs, { text: '', roleIds: [], citations: [] }])}
        >
          <Plus size={14} aria-hidden /> Add question to module {no}
        </Button>
      </div>
    </section>
  )
}

export function SitManEditor(props: PartEditorProps) {
  const part = useScenarioPart(props.projectPath, props.scenario, SITMAN_PART)
  const sm = part.value
  const phases = [...props.scenario.phases].sort((a, b) => a.index - b.index)
  return (
    <PartFrame
      {...props}
      title="SitMan modules"
      part="sitman"
      noun="SitMan modules"
      hasContent={sm.modules.length > 0}
      editor={part}
      hint="One module per phase for the Situation Manual. Players read the narrative at the start of the module, then discuss its questions."
    >
      {!phases.length && <Empty>The scenario has no phases yet.</Empty>}
      {phases.map((p) => (
        <ModuleEditor
          key={p.id}
          phase={p}
          m={sm.modules.find((m) => m.phaseId === p.id) ?? emptyModule(p.id)}
          scenario={props.scenario}
          onChange={(m) => part.update((prev) => withModule(prev, phases, m))}
        />
      ))}
      <StringList
        label="Exercise assumptions"
        itemLabel="Assumption"
        items={sm.assumptions}
        onChange={(assumptions) => part.update((p) => ({ ...p, assumptions }))}
      />
      <StringList
        label="Exercise artificialities"
        itemLabel="Artificiality"
        items={sm.artificialities}
        onChange={(artificialities) => part.update((p) => ({ ...p, artificialities }))}
      />
    </PartFrame>
  )
}
