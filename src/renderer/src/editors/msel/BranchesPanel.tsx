// Branches panel (spec 0430 FR-13): the decisions in the MSEL, their options, rules and rejoin
// points, and the actions that make and unmake branches. Every change is a Draft -> Draft
// function from branch-ops.ts, so it saves and undoes like any other MSEL edit.
import { useId, useState } from 'react'
import { GitBranch } from 'lucide-react'
import type { Branch, Decision } from '@shared/schemas/scenario'
import { Badge, Button } from '../../components/ui'
import {
  addDecision,
  addOption,
  decisionRows,
  deleteBranchWithRows,
  flattenBranch,
  MAX_OPTIONS,
  moveRowsToBranch,
  renameOption,
  setBranchLabel,
  setRejoin,
  updateDecision,
  type PathFilter,
} from './branch-ops'
import { GenerateBranches, type GenerateBranchesProps } from './GenerateBranches'
import type { Draft } from './model'

const RULES: { kind: Decision['rule']['kind']; label: string }[] = [
  { kind: 'plurality', label: 'Most votes (ties use the default)' },
  { kind: 'majority', label: 'Majority (more than half)' },
  { kind: 'threshold', label: 'Threshold for one option' },
  { kind: 'unanimous', label: 'Unanimous' },
  { kind: 'controller', label: 'Controller decides' },
]

function ruleFor(kind: Decision['rule']['kind'], decision: Decision): Decision['rule'] {
  if (kind === 'threshold') return { kind, optionId: decision.options[0]!.id, minShare: 0.6 }
  return { kind } as Decision['rule']
}

interface PanelProps {
  draft: Draft
  edit: (next: Draft) => void
  /** Keys of the rows selected in the grid. */
  selected: ReadonlySet<string>
  filter: PathFilter
  onFilter: (f: PathFilter) => void
  onJump: (rowId: string) => void
  /** Where the model drafts branch rows; without it the panel has no generate button. */
  generate?: Pick<GenerateBranchesProps, 'projectPath' | 'scenarioId' | 'dirty'>
}

function PathFilterSelect(props: Pick<PanelProps, 'draft' | 'filter' | 'onFilter'>) {
  const id = useId()
  return (
    <label className="branches__filter" htmlFor={id}>
      Show path
      <select
        id={id}
        className="select"
        value={props.filter}
        onChange={(e) => props.onFilter(e.target.value as PathFilter)}
      >
        <option value="all">All rows</option>
        <option value="trunk">Trunk only</option>
        <option value="default">Default path</option>
        {(props.draft.branches ?? []).map((b) => (
          <option key={b.id} value={`branch:${b.id}`}>
            Branch {b.id.toUpperCase()}: {b.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function BranchLine(props: {
  draft: Draft
  edit: (next: Draft) => void
  branch: Branch
  rowCount: number
}) {
  const { draft, edit, branch } = props
  const [confirm, setConfirm] = useState(false)
  const id = useId()
  const others = draft.rows.filter((r) => r.row.branchId !== branch.id)
  return (
    <li className="branches__branch">
      <span className="branches__chip">{branch.id.toUpperCase()}</span>
      <label htmlFor={`${id}-label`} className="sr-only">
        Label of branch {branch.id.toUpperCase()}
      </label>
      <input
        id={`${id}-label`}
        className="input"
        value={branch.label}
        onChange={(e) => edit(setBranchLabel(draft, branch.id, e.target.value))}
      />
      <span className="muted">
        {props.rowCount} {props.rowCount === 1 ? 'row' : 'rows'}
      </span>
      <label htmlFor={`${id}-rejoin`}>Rejoins at</label>
      <select
        id={`${id}-rejoin`}
        className="select"
        value={branch.rejoinRowId ?? ''}
        onChange={(e) => edit(setRejoin(draft, branch.id, e.target.value || undefined))}
      >
        <option value="">Nowhere: ends the exercise</option>
        {others.map((r) => (
          <option key={r.key} value={r.row.id}>
            {r.row.id} ({r.row.time})
          </option>
        ))}
      </select>
      <Button size="sm" onClick={() => edit(flattenBranch(draft, branch.id))}>
        Convert to trunk
      </Button>
      {confirm ? (
        <>
          <Button
            size="sm"
            variant="danger"
            onClick={() => edit(deleteBranchWithRows(draft, branch.id))}
          >
            Delete branch and its rows
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
            Keep
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          Delete branch…
        </Button>
      )}
    </li>
  )
}

function DecisionCard(props: {
  draft: Draft
  edit: (next: Draft) => void
  rowId: string
  decision: Decision
  onJump: (rowId: string) => void
  generate: PanelProps['generate']
}) {
  const { draft, edit, decision: d } = props
  const id = useId()
  const branches = (draft.branches ?? []).filter((b) => b.decisionId === d.id)
  return (
    <li className="branches__decision">
      <div className="row">
        <Button size="sm" variant="ghost" onClick={() => props.onJump(props.rowId)}>
          {props.rowId}
        </Button>
        <label htmlFor={`${id}-q`} className="sr-only">
          Question
        </label>
        <input
          id={`${id}-q`}
          className="input"
          value={d.question}
          onChange={(e) => edit(updateDecision(draft, d.id, { question: e.target.value }))}
        />
      </div>
      <div className="branches__controls">
        <label htmlFor={`${id}-rule`}>Rule</label>
        <select
          id={`${id}-rule`}
          className="select"
          value={d.rule.kind}
          onChange={(e) =>
            edit(updateDecision(draft, d.id, { rule: ruleFor(e.target.value as never, d) }))
          }
        >
          {RULES.map((r) => (
            <option key={r.kind} value={r.kind}>
              {r.label}
            </option>
          ))}
        </select>
        {d.rule.kind === 'threshold' && <ThresholdControls draft={draft} edit={edit} d={d} />}
        <label htmlFor={`${id}-default`}>Default</label>
        <select
          id={`${id}-default`}
          className="select"
          value={d.defaultOptionId}
          onChange={(e) => edit(updateDecision(draft, d.id, { defaultOptionId: e.target.value }))}
        >
          {d.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-timeout`}>Timeout (min)</label>
        <input
          id={`${id}-timeout`}
          className="input branches__num"
          type="number"
          min={1}
          value={d.timeoutMin ?? ''}
          onChange={(e) =>
            edit(
              updateDecision(draft, d.id, {
                timeoutMin: e.target.value
                  ? Math.max(1, Math.round(Number(e.target.value)))
                  : undefined,
              }),
            )
          }
        />
      </div>
      <ul className="branches__options" aria-label={`Options of ${props.rowId}`}>
        {d.options.map((o) => (
          <li key={o.id} className="row">
            <label htmlFor={`${id}-${o.id}`} className="sr-only">
              Option label
            </label>
            <input
              id={`${id}-${o.id}`}
              className="input"
              value={o.label}
              onChange={(e) => edit(renameOption(draft, d.id, o.id, e.target.value))}
            />
            <span className="muted">
              {o.branchId ? `Branch ${o.branchId.toUpperCase()}` : 'Continues on this path'}
            </span>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        disabled={d.options.length >= MAX_OPTIONS}
        onClick={() => edit(addOption(draft, d.id))}
      >
        Add option
      </Button>
      {props.generate && branches.length > 0 && (
        <GenerateBranches
          {...props.generate}
          draft={draft}
          edit={edit}
          decisionRowId={props.rowId}
        />
      )}
      <ul className="branches__lanes" aria-label={`Branches of ${props.rowId}`}>
        {branches.map((b) => (
          <BranchLine
            key={b.id}
            draft={draft}
            edit={edit}
            branch={b}
            rowCount={draft.rows.filter((r) => r.row.branchId === b.id).length}
          />
        ))}
      </ul>
    </li>
  )
}

function ThresholdControls(props: { draft: Draft; edit: (next: Draft) => void; d: Decision }) {
  const { draft, edit, d } = props
  const id = useId()
  const rule = d.rule as Extract<Decision['rule'], { kind: 'threshold' }>
  return (
    <>
      <label htmlFor={`${id}-opt`}>Option</label>
      <select
        id={`${id}-opt`}
        className="select"
        value={rule.optionId}
        onChange={(e) =>
          edit(updateDecision(draft, d.id, { rule: { ...rule, optionId: e.target.value } }))
        }
      >
        {d.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-share`}>Needs share (%)</label>
      <input
        id={`${id}-share`}
        className="input branches__num"
        type="number"
        min={0}
        max={100}
        value={Math.round(rule.minShare * 100)}
        onChange={(e) =>
          edit(
            updateDecision(draft, d.id, {
              rule: { ...rule, minShare: Math.min(100, Math.max(0, Number(e.target.value))) / 100 },
            }),
          )
        }
      />
    </>
  )
}

function MoveRows(props: Pick<PanelProps, 'draft' | 'edit' | 'selected'>) {
  const { draft, edit, selected } = props
  const [target, setTarget] = useState('')
  const id = useId()
  if (!selected.size) return null
  return (
    <div className="branches__move">
      <label htmlFor={id}>
        Move {selected.size} selected {selected.size === 1 ? 'row' : 'rows'} to
      </label>
      <select id={id} className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">Trunk</option>
        {(draft.branches ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            Branch {b.id.toUpperCase()}: {b.label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        onClick={() => edit(moveRowsToBranch(draft, new Set(selected), target || undefined))}
      >
        Move rows
      </Button>
    </div>
  )
}

export function BranchesPanel(props: PanelProps) {
  const { draft, edit } = props
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const decisions = decisionRows(draft)
  const candidates = draft.rows.filter(
    (r) => r.row.purposeTag === 'DECISION_POINT' && !r.row.decision,
  )
  const count = draft.branches?.length ?? 0
  return (
    <section className="branches" aria-label="Branches">
      <div className="row">
        <Button
          size="sm"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          <GitBranch size={14} aria-hidden /> Branches
          <Badge tone="info">{count}</Badge>
        </Button>
        <PathFilterSelect draft={draft} filter={props.filter} onFilter={props.onFilter} />
      </div>
      {open && (
        <div id={bodyId} className="branches__body">
          <p className="muted">
            A branch plays only when the room chooses its option. The rule, not a model, picks the
            option from the vote.
          </p>
          <MoveRows draft={draft} edit={edit} selected={props.selected} />
          {candidates.length > 0 && (
            <ul className="branches__candidates" aria-label="Decision points without branches">
              {candidates.map((r) => (
                <li key={r.key} className="row">
                  <span>
                    {r.row.id}: {r.row.event || 'Decision point'}
                  </span>
                  <Button size="sm" onClick={() => edit(addDecision(draft, r.key))}>
                    Branch this decision…
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {decisions.length === 0 && candidates.length === 0 && (
            <p className="muted">
              No decisions yet. Tag a row as a decision point, then branch it here.
            </p>
          )}
          <ul className="branches__decisions">
            {decisions.map((x) => (
              <DecisionCard
                key={x.decision.id}
                draft={draft}
                edit={edit}
                rowId={x.row.id}
                decision={x.decision}
                onJump={props.onJump}
                generate={props.generate}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
