// Branching in Facilitate (spec 0430): which rows can be delivered, how a decision is closed or
// overridden, and the log entries that go with each step. Pure; the panel and the delivery
// actions call these.
import { activePath, type ActivePath } from '@shared/branching/active-path'
import { countVotes, decide, votesCast, type DecisionOutcome } from '@shared/branching/decide'
import type { DecisionTallyInput } from '@shared/branching/input'
import { buildGraph, hasBranches, subtree } from '@shared/branching/graph'
import type { BranchingLogInput, DecisionRecord, FacilitatorState } from '@shared/ipc/facilitator'
import type { Decision, MselRow, Scenario } from '@shared/schemas/scenario'

type BranchScenario = Pick<Scenario, 'msel' | 'branches'>

export type RowAvailability = 'on_path' | 'not_taken' | 'waiting'

export const decisionsOf = (s: FacilitatorState): DecisionRecord[] => s.branching?.decisions ?? []

/** The path of rows that can be delivered, or undefined for a scenario without branches. */
export function pathFor(scenario: BranchScenario, state: FacilitatorState): ActivePath | undefined {
  return hasBranches(scenario) ? activePath(scenario, decisionsOf(state)) : undefined
}

export function availability(path: ActivePath | undefined, rowId: string): RowAvailability {
  if (!path) return 'on_path'
  if (path.skipped.has(rowId)) return 'not_taken'
  return path.rows.some((r) => r.id === rowId) ? 'on_path' : 'waiting'
}

export function tallyRecord(decision: Decision, tally: Record<string, number>) {
  const counts = countVotes(decision, tally)
  return {
    tally: Object.fromEntries(counts.map((c) => [c.optionId, c.count])),
    cast: votesCast(decision, tally),
  }
}

export interface CloseArgs {
  decision: Decision
  by: DecisionRecord['by']
  input: DecisionTallyInput
  /** The controller's pick, for `controller` and `override`. */
  choice?: string
  now: Date
  exerciseTime: string
  note?: string
  supersedes?: string
}

/** The record for closing (or overriding) a decision; the option comes from `decide`, not a model. */
export function buildRecord(a: CloseArgs): DecisionRecord {
  const outcome: DecisionOutcome = decide(a.decision, a.input, a.choice)
  const by: DecisionRecord['by'] =
    a.by === 'override' || a.by === 'timeout'
      ? a.by
      : outcome.by === 'controller'
        ? 'controller'
        : 'vote'
  return {
    decisionId: a.decision.id,
    optionId: outcome.optionId,
    by,
    rule: a.decision.rule,
    ...(a.input.voteId ? { voteId: a.input.voteId } : {}),
    input: {
      ...tallyRecord(a.decision, a.input.tally),
      ...(a.input.eligible !== undefined ? { eligible: a.input.eligible } : {}),
    },
    at: a.now.toISOString(),
    exerciseTime: a.exerciseTime,
    note: a.note ?? '',
    ...(a.supersedes ? { supersedes: a.supersedes } : {}),
  }
}

/** Adds a record to the facilitator state, creating the seed on the first one. */
export function withRecord(
  s: FacilitatorState,
  record: DecisionRecord,
  seed: string,
): FacilitatorState {
  const b = s.branching
  return {
    ...s,
    branching: {
      ...(b?.seed || seed ? { seed: b?.seed ?? seed } : {}),
      decisions: [...(b?.decisions ?? []), record],
      proposals: b?.proposals ?? [],
    },
  }
}

export const closeEntry = (record: DecisionRecord): BranchingLogInput => ({
  kind: record.by === 'override' ? 'decision.override' : 'decision.close',
  ex: record.exerciseTime,
  data: record,
})

export const releaseEntry = (row: MselRow, exerciseTime: string): BranchingLogInput => ({
  kind: 'inject.release',
  ex: exerciseTime,
  rowId: row.id,
  data: {},
})

export const openEntry = (
  row: MselRow,
  decisionId: string,
  exerciseTime: string,
): BranchingLogInput => ({
  kind: 'decision.open',
  ex: exerciseTime,
  rowId: row.id,
  data: { decisionId, rowId: row.id },
})

/** Rows of the branch a decision chose (and its sub-branches) that have been delivered. */
export function branchRowDelivered(
  scenario: BranchScenario,
  decision: Decision,
  optionId: string,
  delivered: FacilitatorState['delivered'],
): boolean {
  const branchId = decision.options.find((o) => o.id === optionId)?.branchId
  if (!branchId) return false
  const lanes = subtree(buildGraph(scenario), branchId)
  return scenario.msel.some((r) => r.branchId && lanes.has(r.branchId) && !!delivered[r.id])
}

/** Minutes left before a decision times out, or undefined without a timeout. */
export function minutesLeft(
  decision: Decision,
  deliveredExerciseTime: string | undefined,
  nowMinutes: number,
): number | undefined {
  if (!decision.timeoutMin || !deliveredExerciseTime) return undefined
  const [h, m] = deliveredExerciseTime.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0) + decision.timeoutMin - nowMinutes
}

/** Branches that are on the path being played: the ones a proposal can extend. */
export function playableBranches(scenario: BranchScenario, path: ActivePath | undefined) {
  const onPath = new Set(path?.rows.map((r) => r.id))
  return (scenario.branches ?? []).filter((b) =>
    scenario.msel.some((r) => r.branchId === b.id && onPath.has(r.id)),
  )
}
