// Rubric metrics table: name, points, fail/pass/excellence, linked injects as chips.
// Points should total 100 (warning, not a block); linked ids must be MSEL rows.
import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { Rubric, Scenario } from '@shared/schemas/scenario'
import { Badge, Button } from '../../../components/ui'
import { newItemId } from '../owners'
import { InjectChips, ItemActions, TextField } from './inputs'
import { moveItem, replaceAt } from './list-utils'
import { PartFrame, type PartEditorProps } from './PartFrame'
import { parsePoints, rubricTotal, totalWarning, unknownInjectIds } from './rubric-rules'
import { useScenarioPart, type PartSpec } from './use-scenario-part'

type Metric = Rubric['metrics'][number]

const RUBRIC_PART: PartSpec<Metric[]> = {
  pick: (s) => s.rubric?.metrics ?? [],
  apply: (s, metrics) => ({ ...s, rubric: { metrics } }),
  note: 'Edited rubric',
}

function PointsInput(props: { label: string; value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(props.value))
  const [seen, setSeen] = useState(props.value)
  // Follow the stored value when it changes from outside (regenerate, restore).
  if (seen !== props.value) {
    setSeen(props.value)
    if (parsePoints(text) !== props.value) setText(String(props.value))
  }
  const invalid = parsePoints(text) === null
  return (
    <input
      className="input rubric-editor__points"
      inputMode="numeric"
      aria-label={props.label}
      aria-invalid={invalid}
      title={invalid ? 'Whole number of points' : undefined}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const n = parsePoints(e.target.value)
        if (n !== null) props.onChange(n)
      }}
    />
  )
}

function MetricRow(props: {
  metric: Metric
  index: number
  count: number
  scenario: Scenario
  onChange: (m: Metric) => void
  onMove: (a: number, b: number) => void
  onRemove: (i: number) => void
}) {
  const m = props.metric
  const n = props.index + 1
  const set = (patch: Partial<Metric>) => props.onChange({ ...m, ...patch })
  const unknown = unknownInjectIds(m.linkedInjectIds, props.scenario.msel)
  return (
    <tr>
      <td>
        <TextField
          label={`Metric ${n} name`}
          hideLabel
          multiline
          rows={3}
          value={m.name}
          onChange={(name) => set({ name })}
        />
      </td>
      <td>
        <PointsInput
          label={`Metric ${n} points`}
          value={m.points}
          onChange={(points) => set({ points })}
        />
      </td>
      {(['fail', 'pass', 'excellence'] as const).map((k) => (
        <td key={k}>
          <TextField
            label={`Metric ${n} ${k}`}
            hideLabel
            multiline
            rows={5}
            value={m[k]}
            onChange={(v) => set({ [k]: v })}
          />
        </td>
      ))}
      <td>
        <InjectChips
          label={`Metric ${n} linked injects`}
          ids={m.linkedInjectIds}
          rows={props.scenario.msel}
          onChange={(linkedInjectIds) => set({ linkedInjectIds })}
        />
        {unknown.length > 0 && (
          <span className="field__error">Not in the MSEL: {unknown.join(', ')}</span>
        )}
      </td>
      <td>
        <ItemActions
          name={`metric ${n}`}
          index={props.index}
          count={props.count}
          onMove={props.onMove}
          onRemove={props.onRemove}
        />
      </td>
    </tr>
  )
}

const blankMetric = (): Metric => ({
  id: newItemId('m'),
  name: '',
  points: 0,
  fail: '',
  pass: '',
  excellence: '',
  linkedInjectIds: [],
  objectiveRefs: [],
})

export function RubricEditor(props: PartEditorProps) {
  const part = useScenarioPart(props.projectPath, props.scenario, RUBRIC_PART)
  const metrics = part.value
  const warning = totalWarning(metrics)
  return (
    <PartFrame
      {...props}
      title="Evaluation rubric"
      part="rubric"
      noun="rubric"
      hasContent={metrics.length > 0}
      editor={part}
      hint="Regenerating the rubric also rewrites the rubric section of the controller handbook; edits here do not."
    >
      <div className="table-scroll">
        <table className="table rubric-editor" aria-label="Evaluation rubric">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Points</th>
              <th scope="col">Fail</th>
              <th scope="col">Pass</th>
              <th scope="col">Excellence</th>
              <th scope="col">Linked injects</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m, i) => (
              <MetricRow
                key={m.id}
                metric={m}
                index={i}
                count={metrics.length}
                scenario={props.scenario}
                onChange={(next) => part.update((prev) => replaceAt(prev, i, next))}
                onMove={(a, b) => part.update((prev) => moveItem(prev, a, b))}
                onRemove={(j) => part.update((prev) => prev.filter((_, k) => k !== j))}
              />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="mono" aria-live="polite">
                {rubricTotal(metrics)} / 100
              </td>
              <td colSpan={5}>{warning && <Badge tone="warn">{warning}</Badge>}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="row">
        <Button size="sm" onClick={() => part.update((prev) => [...prev, blankMetric()])}>
          <Plus size={14} aria-hidden /> Add metric
        </Button>
      </div>
    </PartFrame>
  )
}
