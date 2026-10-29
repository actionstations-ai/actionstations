// Branch edits on the MSEL draft (spec 0430 FR-13): pure Draft -> Draft functions, so the
// panel stays thin and every rule is unit-tested. The MSEL stays one ordered array; a branch
// is a `branchId` on rows plus an entry in `draft.branches`.
import { exerciseMinutes, formatExerciseTime } from '@shared/schemas/common'
import type { BranchPlanResult } from '@shared/branching/proposal'
import type { Branch, Decision, MselRow } from '@shared/schemas/scenario'
import { defaultDecisions } from '@shared/branching/default-path'
import { ancestors, buildGraph, pathOrder, subtree } from '@shared/branching/graph'
import { newRowKey, sortRows, type Draft, type DraftRow } from './model'

export const MAX_OPTIONS = 6

const branchesOf = (d: Draft): Branch[] => d.branches ?? []
const rowsOf = (d: Draft): MselRow[] => d.rows.map((r) => r.row)

function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`
}

const decisionIds = (d: Draft): string[] =>
  d.rows.flatMap((r) => (r.row.decision ? [r.row.decision.id] : []))

/** Decision rows in MSEL order with their decision. */
export function decisionRows(d: Draft): { key: string; row: MselRow; decision: Decision }[] {
  return d.rows.flatMap((r) =>
    r.row.decision ? [{ key: r.key, row: r.row, decision: r.row.decision }] : [],
  )
}

function withRows(d: Draft, rows: DraftRow[], branches: Branch[] = branchesOf(d)): Draft {
  const sorted = sortRows(d.phases, rows)
  const { branches: _drop, ...rest } = d
  return { ...rest, rows: sorted, ...(branches.length ? { branches } : {}) }
}

function patchRow(d: Draft, key: string, f: (r: MselRow) => MselRow): DraftRow[] {
  return d.rows.map((r) => (r.key === key ? { ...r, row: f(r.row) } : r))
}

function takeId(d: Draft, base: string): string {
  const taken = new Set(rowsOf(d).map((r) => r.id))
  if (!taken.has(base)) return base
  return nextId(`${base}-`, taken)
}

/** The first trunk row after `row` in time, where a new branch can rejoin. */
function rejoinCandidate(d: Draft, row: MselRow): string | undefined {
  const t = exerciseMinutes(row.time)
  return rowsOf(d)
    .filter((r) => r.branchId === row.branchId && r.id !== row.id && exerciseMinutes(r.time) > t)
    .sort((a, b) => exerciseMinutes(a.time) - exerciseMinutes(b.time))[0]?.id
}

/** Minutes after the decision for a starter row: inside the gap to the next row, at most ten. */
function seedOffset(d: Draft, anchor: MselRow): number {
  const next = rowsOf(d).find((r) => r.id === rejoinCandidate(d, anchor))
  if (!next) return 10
  const gap = exerciseMinutes(next.time) - exerciseMinutes(anchor.time)
  return Math.max(1, Math.min(10, Math.floor(gap / 2)))
}

function seedRow(
  d: Draft,
  anchor: MselRow,
  branchId: string,
  suffix: string,
  label: string,
): DraftRow {
  const time = formatExerciseTime(exerciseMinutes(anchor.time) + seedOffset(d, anchor))
  const row: MselRow = {
    id: takeId(d, `${anchor.id}${suffix}`),
    phaseId: anchor.phaseId,
    time,
    from: '',
    toRoleIds: [],
    event: `What happens if the room chooses "${label}".`,
    expectedAction: '',
    purposeTag: 'CORE_NARRATIVE',
    citations: [],
    locked: false,
    branchId,
  }
  return { key: newRowKey(), row }
}

/**
 * Turns a row into a decision with two options, each with a branch and one starter row. The
 * row becomes a DECISION_POINT. Does nothing when the row already holds a decision.
 */
export function addDecision(d: Draft, rowKey: string): Draft {
  const anchor = d.rows.find((r) => r.key === rowKey)?.row
  if (!anchor || anchor.decision) return d
  const decisionId = nextId('d', decisionIds(d))
  const taken = branchesOf(d).map((b) => b.id)
  const first = nextId('b', taken)
  const ids = [first, nextId('b', [...taken, first])]
  const labels = ['Option A', 'Option B']
  const rejoin = rejoinCandidate(d, anchor)
  const branches: Branch[] = ids.map((id, i) => ({
    id,
    label: labels[i]!,
    decisionId,
    optionId: `option-${'ab'[i]}`,
    ...(rejoin ? { rejoinRowId: rejoin } : {}),
    rationale: '',
  }))
  const decision: Decision = {
    id: decisionId,
    question: anchor.event || 'What does the room decide?',
    options: branches.map((b, i) => ({
      id: b.optionId,
      label: labels[i]!,
      description: '',
      branchId: b.id,
    })),
    mode: 'anonymous',
    rule: { kind: 'plurality' },
    defaultOptionId: 'option-a',
    votingRoleIds: [],
  }
  const rows = patchRow(d, rowKey, (r) => ({ ...r, purposeTag: 'DECISION_POINT', decision }))
  const seeds = branches.map((b, i) => seedRow({ ...d, rows }, anchor, b.id, 'ab'[i]!, labels[i]!))
  return withRows(d, [...rows, ...seeds], [...branchesOf(d), ...branches])
}

function patchDecision(d: Draft, decisionId: string, f: (x: Decision) => Decision): Draft {
  const rows = d.rows.map((r) =>
    r.row.decision?.id === decisionId
      ? { ...r, row: { ...r.row, decision: f(r.row.decision) } }
      : r,
  )
  return { ...d, rows }
}

export function updateDecision(
  d: Draft,
  decisionId: string,
  patch: Partial<Pick<Decision, 'question' | 'rule' | 'defaultOptionId' | 'timeoutMin' | 'mode'>>,
): Draft {
  return patchDecision(d, decisionId, (x) => {
    const next = { ...x, ...patch }
    if ('timeoutMin' in patch && patch.timeoutMin === undefined) delete next.timeoutMin
    return next
  })
}

/** Renames an option; its branch label follows when the branch still carries the old label. */
export function renameOption(d: Draft, decisionId: string, optionId: string, label: string): Draft {
  const old = decisionRows(d)
    .find((x) => x.decision.id === decisionId)
    ?.decision.options.find((o) => o.id === optionId)
  const next = patchDecision(d, decisionId, (x) => ({
    ...x,
    options: x.options.map((o) => (o.id === optionId ? { ...o, label } : o)),
  }))
  if (!old?.branchId || !label.trim()) return next
  return setBranchLabel(next, old.branchId, label)
}

export function setBranchLabel(d: Draft, branchId: string, label: string): Draft {
  return { ...d, branches: branchesOf(d).map((b) => (b.id === branchId ? { ...b, label } : b)) }
}

/** Adds an option with its own branch (at most MAX_OPTIONS). */
export function addOption(d: Draft, decisionId: string): Draft {
  const found = decisionRows(d).find((x) => x.decision.id === decisionId)
  if (!found || found.decision.options.length >= MAX_OPTIONS) return d
  const n = found.decision.options.length + 1
  const optionId = nextId(
    'option-',
    found.decision.options.map((o) => o.id).map((id) => id.replace('option-', '')),
  )
  const branchId = nextId(
    'b',
    branchesOf(d).map((b) => b.id),
  )
  const label = `Option ${n}`
  const branch: Branch = { id: branchId, label, decisionId, optionId, rationale: '' }
  const withOption = patchDecision(d, decisionId, (x) => ({
    ...x,
    options: [...x.options, { id: optionId, label, description: '', branchId }],
  }))
  const seed = seedRow(withOption, found.row, branchId, String.fromCharCode(96 + n), label)
  return withRows(withOption, [...withOption.rows, seed], [...branchesOf(d), branch])
}

export function setRejoin(d: Draft, branchId: string, rowId: string | undefined): Draft {
  return {
    ...d,
    branches: branchesOf(d).map((b) => {
      if (b.id !== branchId) return b
      const { rejoinRowId: _old, ...rest } = b
      return rowId ? { ...rest, rejoinRowId: rowId } : rest
    }),
  }
}

/** Moves rows into a branch, or back to the trunk when `branchId` is undefined. */
export function moveRowsToBranch(d: Draft, keys: Set<string>, branchId: string | undefined): Draft {
  const rows = d.rows.map((r) => {
    if (!keys.has(r.key)) return r
    const { branchId: _old, ...rest } = r.row
    return { ...r, row: branchId ? { ...rest, branchId } : rest }
  })
  return withRows(d, rows)
}

function dropBranches(d: Draft, ids: Set<string>): Branch[] {
  return branchesOf(d).filter((b) => !ids.has(b.id))
}

function clearOptionLinks(d: Draft, ids: Set<string>): Draft {
  const rows = d.rows.map((r) => {
    const dec = r.row.decision
    if (!dec || !dec.options.some((o) => o.branchId && ids.has(o.branchId))) return r
    const options = dec.options.map((o) => {
      if (!o.branchId || !ids.has(o.branchId)) return o
      const { branchId: _gone, ...rest } = o
      return rest
    })
    return { ...r, row: { ...r.row, decision: { ...dec, options } } }
  })
  return { ...d, rows }
}

/** Branch rows become trunk rows and the branch goes away (its option continues on the trunk). */
export function flattenBranch(d: Draft, branchId: string): Draft {
  const cleared = clearOptionLinks(d, new Set([branchId]))
  const rows = cleared.rows.map((r) => {
    if (r.row.branchId !== branchId) return r
    const { branchId: _old, ...rest } = r.row
    return { ...r, row: rest }
  })
  return withRows(cleared, rows, dropBranches(d, new Set([branchId])))
}

/** Deletes a branch and every branch below it; their rows are deleted too. */
export function deleteBranchWithRows(d: Draft, branchId: string): Draft {
  const gone = subtree(buildGraph({ msel: rowsOf(d), branches: branchesOf(d) }), branchId)
  const rows = d.rows.filter((r) => !(r.row.branchId && gone.has(r.row.branchId)))
  return withRows(clearOptionLinks({ ...d, rows }, gone), rows, dropBranches(d, gone))
}

/** Follows renamed row ids into the branches' rejoin rows (savedIds: row key -> id as saved). */
export function remapRejoins(d: Draft, savedIds: Record<string, string>): Branch[] | undefined {
  const renames = new Map<string, string>()
  for (const r of d.rows) {
    const old = savedIds[r.key]
    if (old && old !== r.row.id) renames.set(old, r.row.id)
  }
  if (!renames.size || !d.branches) return d.branches
  return d.branches.map((b) =>
    b.rejoinRowId && renames.has(b.rejoinRowId)
      ? { ...b, rejoinRowId: renames.get(b.rejoinRowId)! }
      : b,
  )
}

/** Short label for a branch chip: "B1". */
export const branchChip = (branchId: string): string => branchId.toUpperCase()

/** Which rows the path filter keeps in full colour: all, the trunk, one branch or the default path. */
export type PathFilter = 'all' | 'trunk' | 'default' | `branch:${string}`

/** Row ids that are not on the filtered path (they are dimmed, never hidden or locked). */
export function offPathRowIds(d: Draft, filter: PathFilter): Set<string> {
  if (filter === 'all' || !d.branches?.length) return new Set()
  const scenario = { msel: rowsOf(d), branches: branchesOf(d) }
  const graph = buildGraph(scenario)
  const on = new Set<string>()
  if (filter === 'trunk') for (const r of graph.trunk) on.add(r.id)
  else if (filter === 'default')
    for (const r of pathOrder(scenario, defaultDecisions(scenario))) on.add(r.id)
  else {
    const id = filter.slice('branch:'.length)
    const lane = new Set([id, ...ancestors(graph, id)])
    for (const r of rowsOf(d)) if (!r.branchId || lane.has(r.branchId)) on.add(r.id)
  }
  return new Set(
    rowsOf(d)
      .filter((r) => !on.has(r.id))
      .map((r) => r.id),
  )
}

export interface BranchMark {
  chip: string
  label: string
}

/** Row id -> the branch lane label shown beside it. */
export function branchMarks(d: Draft): ReadonlyMap<string, BranchMark> {
  const byId = new Map(branchesOf(d).map((b) => [b.id, b]))
  const out = new Map<string, BranchMark>()
  for (const r of rowsOf(d)) {
    const b = r.branchId ? byId.get(r.branchId) : undefined
    if (b) out.set(r.id, { chip: branchChip(b.id), label: b.label })
  }
  return out
}

const RULE_TEXT: Record<Decision['rule']['kind'], string> = {
  plurality: 'most votes',
  majority: 'majority',
  threshold: 'threshold',
  controller: 'controller decides',
  unanimous: 'unanimous',
}
export const ruleText = (rule: Decision['rule']): string => RULE_TEXT[rule.kind]

/** "Pay → B1 · Rebuild → B2 · rule: majority · default Rebuild" */
export function decisionSummary(decision: Decision): string {
  const options = decision.options
    .map((o) => `${o.label} → ${o.branchId ? branchChip(o.branchId) : 'continue'}`)
    .join(' · ')
  const dflt = decision.options.find((o) => o.id === decision.defaultOptionId)?.label ?? '?'
  return `${options} · rule: ${ruleText(decision.rule)} · default ${dflt}`
}

/**
 * Applies a drafted branch plan (#430): the unlocked rows of each planned branch are replaced by
 * the drafted rows, and the branch takes the drafted label, rationale and rejoin row.
 */
export function applyBranchPlan(d: Draft, plan: BranchPlanResult): Draft {
  const planned = new Map(plan.branches.map((b) => [b.branchId, b]))
  const kept = d.rows.filter((r) => !(planned.has(r.row.branchId ?? '') && !r.row.locked))
  const added: DraftRow[] = []
  for (const b of plan.branches) {
    for (const row of b.rows) {
      const id = takeId({ ...d, rows: [...kept, ...added] }, row.id)
      added.push({ key: newRowKey(), row: { ...row, id } })
    }
  }
  const branches = branchesOf(d).map((x) => {
    const b = planned.get(x.id)
    if (!b) return x
    const { rejoinRowId: _old, ...rest } = x
    const rejoin = b.rejoinRowId ?? x.rejoinRowId
    return {
      ...rest,
      label: b.label,
      rationale: b.rationale,
      ...(rejoin ? { rejoinRowId: rejoin } : {}),
    }
  })
  return withRows(d, [...kept, ...added], branches)
}
