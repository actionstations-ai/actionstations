// Evaluation (#421): each objective's FEMA Core Capabilities, one Exercise Evaluation Guide per
// capability with its critical tasks (text, plan section, expected role, timing, linked rows,
// lock), and the read-only criteria every MSEL row gets from them. The model drafts, the person
// who knows the organization decides; a task the designer writes by hand cites one of the plan
// sections the scenario already cites, so it stays grounded like the generated ones.
import { Lock, Plus } from 'lucide-react'
import { useEffect, useId, useMemo } from 'react'
import {
  capabilitiesByArea,
  capabilityName,
  coreCapability,
  MISSION_AREA_LABELS,
  orderedCapabilities,
  type CoreCapabilityId,
} from '@shared/core-capabilities'
import type { Citation } from '@shared/schemas/common'
import type { CriticalTask, Eeg, Evaluation, ObjectiveCapability } from '@shared/schemas/evaluation'
import type { Objective, Scenario } from '@shared/schemas/scenario'
import { Badge, Button } from '../../../components/ui'
import { useIpcQuery, queryClient } from '../../../lib/query'
import { CitationChips } from '../../../routes/scenarios/CitationChips'
import { citationKey, citationOption, knownCitations, nextTaskId } from './evaluation-rules'
import { Empty, InjectChips, ItemActions, TextField } from './inputs'
import { moveItem, replaceAt } from './list-utils'
import { PartFrame, type PartEditorProps } from './PartFrame'
import { useScenarioPart, type PartSpec } from './use-scenario-part'

const EVALUATION_PART: PartSpec<Evaluation> = {
  pick: (s) => s.evaluation ?? { objectiveCapabilities: [], eegs: [] },
  apply: (s, evaluation) => ({ ...s, evaluation }),
  id: 'evaluation',
  label: 'Evaluation',
  note: 'Edited evaluation guides',
}

const objectiveLabel = (o: Objective): string => o.name || o.text.slice(0, 40)

function CapabilitySelect(props: {
  label: string
  value: string
  onChange: (id: CoreCapabilityId) => void
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
        onChange={(e) => props.onChange(e.target.value as CoreCapabilityId)}
      >
        {capabilitiesByArea().map((g) => (
          <optgroup key={g.area} label={MISSION_AREA_LABELS[g.area]}>
            {g.capabilities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

function ObjectiveMappings(props: {
  objective: Objective
  index: number
  pairs: ObjectiveCapability[]
  onChange: (pairs: ObjectiveCapability[]) => void
}) {
  const { objective: o, pairs } = props
  const n = props.index + 1
  const mine = pairs.filter((p) => p.objectiveId === o.id)
  const others = pairs.filter((p) => p.objectiveId !== o.id)
  const setMine = (next: ObjectiveCapability[]) => props.onChange([...others, ...next])
  const unused = orderedCapabilities().find((c) => !mine.some((p) => p.capability === c.id))
  return (
    <li className="card part__item">
      <h4 className="eval-editor__objective">
        {o.name && <strong>{o.name}: </strong>}
        {o.text}
      </h4>
      {!mine.length && <Empty>No Core Capability yet.</Empty>}
      <ul className="stack part__list">
        {mine.map((p, i) => (
          <li key={`${p.capability}-${i}`} className="eval-editor__mapping">
            <CapabilitySelect
              label={`Objective ${n} capability ${i + 1}`}
              value={p.capability}
              onChange={(capability) => setMine(replaceAt(mine, i, { ...p, capability }))}
            />
            <TextField
              label={`Objective ${n} capability ${i + 1} reason`}
              value={p.why}
              onChange={(why) => setMine(replaceAt(mine, i, { ...p, why }))}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove capability ${i + 1} from objective ${n}`}
              onClick={() => setMine(mine.filter((_, k) => k !== i))}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div className="row">
        <Button
          size="sm"
          disabled={!unused}
          onClick={() =>
            unused && setMine([...mine, { objectiveId: o.id, capability: unused.id, why: '' }])
          }
        >
          <Plus size={14} aria-hidden /> Add capability
        </Button>
      </div>
    </li>
  )
}

function SourceSelect(props: {
  label: string
  value: Citation
  options: Citation[]
  onChange: (c: Citation) => void
}) {
  const id = useId()
  const current = citationKey(props.value)
  const options = props.options.some((c) => citationKey(c) === current)
    ? props.options
    : [props.value, ...props.options]
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {props.label}
      </label>
      <select
        id={id}
        className="select"
        value={current}
        onChange={(e) => {
          const next = options.find((c) => citationKey(c) === e.target.value)
          if (next) props.onChange(next)
        }}
      >
        {options.map((c) => (
          <option key={citationKey(c)} value={citationKey(c)}>
            {citationOption(c)}
          </option>
        ))}
      </select>
    </div>
  )
}

function TaskItem(props: {
  task: CriticalTask
  index: number
  count: number
  scenario: Scenario
  sources: Citation[]
  onChange: (t: CriticalTask) => void
  onMove: (a: number, b: number) => void
  onRemove: (i: number) => void
}) {
  const { task: t, scenario } = props
  const set = (patch: Partial<CriticalTask>) => props.onChange({ ...t, ...patch })
  const roleId = useId()
  return (
    <li className="card part__item eval-editor__task">
      <div className="eval-editor__task-head">
        <span className="mono">{t.id}</span>
        {t.locked && (
          <Badge tone="info">
            <Lock size={12} aria-hidden /> Kept on regenerate
          </Badge>
        )}
      </div>
      <TextField
        label={`Task ${t.id}`}
        multiline
        rows={2}
        value={t.task}
        onChange={(task) => set({ task })}
      />
      <div className="part__item-grid">
        <SourceSelect
          label={`Task ${t.id} source`}
          value={t.citation}
          options={props.sources}
          onChange={(citation) => set({ citation })}
        />
        <div className="field">
          <label className="field__label" htmlFor={roleId}>
            Task {t.id} expected by
          </label>
          <select
            id={roleId}
            className="select"
            value={t.expectedBy ?? ''}
            onChange={(e) => {
              const { expectedBy: _drop, ...rest } = t
              props.onChange(e.target.value ? { ...rest, expectedBy: e.target.value } : rest)
            }}
          >
            <option value="">Any role</option>
            {scenario.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.abbreviation ? ` (${r.abbreviation})` : ''}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label={`Task ${t.id} timing`}
          value={t.timing ?? ''}
          onChange={(timing) => {
            const { timing: _drop, ...rest } = t
            props.onChange(timing.trim() ? { ...rest, timing } : rest)
          }}
        />
      </div>
      <CitationChips citations={[t.citation]} />
      <InjectChips
        label={`Task ${t.id} linked rows`}
        ids={t.rowIds}
        rows={scenario.msel}
        onChange={(rowIds) => set({ rowIds })}
      />
      <div className="row eval-editor__task-foot">
        <label className="check">
          <input
            type="checkbox"
            checked={t.locked}
            onChange={(e) => set({ locked: e.target.checked })}
          />
          Keep task {t.id} when regenerating
        </label>
        <ItemActions
          name={`task ${t.id}`}
          index={props.index}
          count={props.count}
          onMove={props.onMove}
          onRemove={props.onRemove}
        />
      </div>
    </li>
  )
}

function EegCard(props: {
  eeg: Eeg
  index: number
  scenario: Scenario
  evaluation: Evaluation
  sources: Citation[]
  onChange: (e: Eeg) => void
  onRemove: () => void
}) {
  const { eeg: e, scenario } = props
  const name = capabilityName(e.capability)
  const info = coreCapability(e.capability)
  const setTasks = (fn: (ts: CriticalTask[]) => CriticalTask[]) =>
    props.onChange({ ...e, criticalTasks: fn(e.criticalTasks) })
  const objectives = e.objectiveRefs
    .map((id) => scenario.objectives.find((o) => o.id === id))
    .filter((o): o is Objective => !!o)
  const addTask = () => {
    const citation = props.sources[0]
    if (!citation) return
    setTasks((ts) => [
      ...ts,
      {
        id: nextTaskId(props.evaluation.eegs),
        capability: e.capability,
        task: '',
        citation,
        rowIds: [],
        objectiveRefs: e.objectiveRefs,
        locked: true,
      },
    ])
  }
  return (
    <section className="card eval-editor__eeg" aria-label={`Evaluation guide: ${name}`}>
      <header className="eval-editor__eeg-head">
        <div>
          <h4 className="section-title">{name}</h4>
          {info && (
            <p className="muted eval-editor__areas">
              {info.areas.map((a) => MISSION_AREA_LABELS[a]).join(', ')}
              {objectives.length > 0 &&
                ` · Objectives: ${objectives.map(objectiveLabel).join(', ')}`}
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={props.onRemove}>
          Remove guide
        </Button>
      </header>
      <TextField
        label={`Capability target for ${name}`}
        multiline
        rows={2}
        value={e.target}
        onChange={(target) => props.onChange({ ...e, target })}
      />
      {!e.criticalTasks.length && <Empty>No critical tasks yet.</Empty>}
      <ol className="stack part__list" aria-label={`Critical tasks for ${name}`}>
        {e.criticalTasks.map((t, i) => (
          <TaskItem
            key={t.id}
            task={t}
            index={i}
            count={e.criticalTasks.length}
            scenario={scenario}
            sources={props.sources}
            onChange={(next) => setTasks((ts) => replaceAt(ts, i, next))}
            onMove={(a, b) => setTasks((ts) => moveItem(ts, a, b))}
            onRemove={(j) => setTasks((ts) => ts.filter((_, k) => k !== j))}
          />
        ))}
      </ol>
      <div className="row">
        <Button
          size="sm"
          disabled={!props.sources.length}
          title={props.sources.length ? undefined : 'Cite a plan section in the MSEL first'}
          onClick={addTask}
        >
          <Plus size={14} aria-hidden /> Add task
        </Button>
        {!props.sources.length && (
          <span className="muted">
            A task must cite a plan section; none is cited in this scenario yet.
          </span>
        )}
      </div>
    </section>
  )
}

function AddGuide(props: {
  evaluation: Evaluation
  onAdd: (capability: CoreCapabilityId) => void
}) {
  const id = useId()
  const have = new Set(props.evaluation.eegs.map((e) => e.capability))
  const mapped = props.evaluation.objectiveCapabilities.map((p) => p.capability)
  const candidates = orderedCapabilities(mapped).filter((c) => !have.has(c.id))
  const first = candidates[0]
  if (!first) return null
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault()
        const select = e.currentTarget.elements.namedItem(id) as HTMLSelectElement | null
        props.onAdd((select?.value as CoreCapabilityId) || first.id)
      }}
    >
      <label className="field__label" htmlFor={id}>
        Add a guide for
      </label>
      <select id={id} name={id} className="select" defaultValue={first.id}>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button size="sm" type="submit">
        <Plus size={14} aria-hidden /> Add guide
      </Button>
    </form>
  )
}

/** Every MSEL row's criteria as main derives them from the saved guides (FR-4). */
function CriteriaByRow(props: { projectPath: string; scenario: Scenario }) {
  const req = { projectPath: props.projectPath, scenarioId: props.scenario.id }
  const criteria = useIpcQuery('evaluation:criteria', req)
  // The saved scenario changed (a save from this editor, a regenerate): refetch.
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['evaluation:criteria', req] })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the saved scenario's time
  }, [props.scenario.updatedAt])
  return (
    <details className="eval-editor__criteria">
      <summary>Criteria by MSEL row (what evaluators rate on each inject)</summary>
      {criteria.isError && <p className="field__error">Could not derive the criteria.</p>}
      {criteria.data && (
        <div className="table-scroll">
          <table className="table" aria-label="Criteria by MSEL row">
            <thead>
              <tr>
                <th scope="col">Row</th>
                <th scope="col">Criterion</th>
                <th scope="col">Capability</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {criteria.data.map((c) => (
                <tr key={`${c.rowId}-${c.id}`}>
                  <td className="mono">{c.rowId}</td>
                  <td>
                    {c.taskId && <span className="mono">{c.taskId} </span>}
                    {c.text}
                  </td>
                  <td>{c.capability ? capabilityName(c.capability) : 'Expected action'}</td>
                  <td>{c.citation ? <CitationChips citations={[c.citation]} /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}

export function EvaluationEditor(props: PartEditorProps) {
  const part = useScenarioPart(props.projectPath, props.scenario, EVALUATION_PART)
  const evaluation = part.value
  const sources = useMemo(
    () => knownCitations(props.scenario, evaluation),
    [props.scenario, evaluation],
  )
  const setEegs = (fn: (eegs: Eeg[]) => Eeg[]) => part.update((p) => ({ ...p, eegs: fn(p.eegs) }))
  const hasContent = evaluation.eegs.length > 0 || evaluation.objectiveCapabilities.length > 0
  return (
    <PartFrame
      {...props}
      title="Evaluation guides"
      part="evaluation"
      noun="evaluation guides"
      hasContent={hasContent}
      editor={part}
      hint="Each objective maps to FEMA Core Capabilities; each capability gets an Exercise Evaluation Guide whose critical tasks come from your plans. Evaluators rate tasks met, partial, not met or not observed; ratings are about procedures, never about people."
    >
      <section aria-label="Core Capabilities per objective" className="stack">
        <h4 className="section-title">Core Capabilities per objective</h4>
        {!props.scenario.objectives.length && <Empty>No objectives yet.</Empty>}
        <ol className="stack part__list">
          {props.scenario.objectives.map((o, i) => (
            <ObjectiveMappings
              key={o.id}
              objective={o}
              index={i}
              pairs={evaluation.objectiveCapabilities}
              onChange={(objectiveCapabilities) =>
                part.update((p) => ({ ...p, objectiveCapabilities }))
              }
            />
          ))}
        </ol>
      </section>
      <section aria-label="Exercise Evaluation Guides" className="stack">
        <h4 className="section-title">Exercise Evaluation Guides</h4>
        {!evaluation.eegs.length && (
          <Empty>
            No evaluation guides yet. Regenerate below to draft them from the plans, or add a guide
            by hand.
          </Empty>
        )}
        {evaluation.eegs.map((e, i) => (
          <EegCard
            key={e.capability}
            eeg={e}
            index={i}
            scenario={props.scenario}
            evaluation={evaluation}
            sources={sources}
            onChange={(next) => setEegs((eegs) => replaceAt(eegs, i, next))}
            onRemove={() => setEegs((eegs) => eegs.filter((_, k) => k !== i))}
          />
        ))}
        <AddGuide
          evaluation={evaluation}
          onAdd={(capability) =>
            setEegs((eegs) => [
              ...eegs,
              {
                capability,
                target: '',
                objectiveRefs: evaluation.objectiveCapabilities
                  .filter((p) => p.capability === capability)
                  .map((p) => p.objectiveId),
                criticalTasks: [],
              },
            ])
          }
        />
      </section>
      <CriteriaByRow projectPath={props.projectPath} scenario={props.scenario} />
    </PartFrame>
  )
}
