// Replay of a recorded session against a scenario (spec 0430 FR-9). The session state is a
// pure fold over the log: decisions come from `decision.close` / `decision.override` entries,
// never from a model, so the same log and scenario always give the same state and hash.
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { DecisionRecord } from '../ipc/facilitator'
import { activePath, effectiveDecisions } from './active-path'
import type { BranchScenario } from './graph'

/** The part of a session log entry replay reads (a SessionLogEntry fits). */
export interface ReplayEntry {
  i?: number
  kind: string
  ref?: { rowId?: string | undefined } | undefined
  data: Record<string, unknown>
}

export interface SessionState {
  /** Row ids delivered, in order, minus those retracted. */
  delivered: string[]
  /** The decision in force for each decision id, sorted by decision id. */
  decisions: DecisionRecord[]
  /** Row ids of proposals the controller accepted. */
  accepted: string[]
  /** Row ids of the active path. */
  path: string[]
  skipped: string[]
  openDecisionId: string | null
}

/** JSON with object keys sorted, so equal values always serialise to equal text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    const keys = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

const sha = (text: string): string => bytesToHex(sha256(utf8ToBytes(text)))

export const stateHash = (state: SessionState): string => sha(canonicalJson(state))

/** sha256 of the scenario without the fields a run does not depend on. */
export function scenarioHash(scenario: object): string {
  const rest: Record<string, unknown> = { ...scenario }
  delete rest.updatedAt
  delete rest.warnings
  delete rest.provenance
  return sha(canonicalJson(rest))
}

const rowIdOf = (e: ReplayEntry): string | undefined =>
  e.ref?.rowId ?? (typeof e.data.rowId === 'string' ? e.data.rowId : undefined)

function ordered(entries: readonly ReplayEntry[]): ReplayEntry[] {
  return entries
    .map((e, n) => ({ e, n }))
    .sort((a, b) => (a.e.i ?? a.n) - (b.e.i ?? b.n) || a.n - b.n)
    .map((x) => x.e)
}

interface Fold {
  delivered: string[]
  records: DecisionRecord[]
  accepted: string[]
}

function foldEntry(acc: Fold, e: ReplayEntry): void {
  if (e.kind === 'decision.close' || e.kind === 'decision.override') {
    const r = DecisionRecord.safeParse(e.data)
    if (r.success) acc.records.push(r.data)
  } else if (e.kind === 'inject.release') {
    const id = rowIdOf(e)
    if (id && !acc.delivered.includes(id)) acc.delivered.push(id)
  } else if (e.kind === 'inject.retract') {
    const id = rowIdOf(e)
    if (id) acc.delivered = acc.delivered.filter((d) => d !== id)
  } else if (e.kind === 'proposal.accept') {
    const id = rowIdOf(e)
    if (id && !acc.accepted.includes(id)) acc.accepted.push(id)
  }
}

function stateOf(scenario: BranchScenario, acc: Fold): SessionState {
  const path = activePath(scenario, acc.records)
  return {
    delivered: acc.delivered,
    decisions: [...effectiveDecisions(acc.records).values()].sort((a, b) =>
      a.decisionId < b.decisionId ? -1 : a.decisionId > b.decisionId ? 1 : 0,
    ),
    accepted: acc.accepted,
    path: path.rows.map((r) => r.id),
    skipped: [...path.skipped].sort(),
    openDecisionId: path.openDecision?.id ?? null,
  }
}

/** Folds a session log into the session state. Pure. */
export function replay(scenario: BranchScenario, entries: readonly ReplayEntry[]): SessionState {
  const acc: Fold = { delivered: [], records: [], accepted: [] }
  for (const e of ordered(entries)) foldEntry(acc, e)
  return stateOf(scenario, acc)
}

export type ReplayCheck =
  | { status: 'matches'; hash: string }
  | { status: 'mismatch'; hash: string; expected: string; firstDivergence?: ReplayDivergence }
  | { status: 'no_decisions'; hash: string }

export interface ReplayDivergence {
  /** Log index of the entry. */
  i: number | undefined
  reason: string
}

/** The first release of a row that was not deliverable when the log says it was released. */
export function firstDivergence(
  scenario: BranchScenario,
  entries: readonly ReplayEntry[],
): ReplayDivergence | undefined {
  const acc: Fold = { delivered: [], records: [], accepted: [] }
  for (const e of ordered(entries)) {
    if (e.kind === 'inject.release') {
      const id = rowIdOf(e)
      const known = scenario.msel.some((r) => r.id === id)
      const path = activePath(scenario, acc.records)
      if (id && known && !path.rows.some((r) => r.id === id))
        return {
          i: e.i,
          reason: `Row ${id} was released but is not on the path the decisions lead to.`,
        }
    }
    foldEntry(acc, e)
  }
  return undefined
}

/** Compares a replay with the hash written when the session ended (spec 0430 FR-9). */
export function replayCheck(
  scenario: BranchScenario,
  entries: readonly ReplayEntry[],
  expectedHash?: string,
): ReplayCheck {
  const state = replay(scenario, entries)
  const hash = stateHash(state)
  if (!state.decisions.length) return { status: 'no_decisions', hash }
  if (expectedHash && expectedHash !== hash) {
    const div = firstDivergence(scenario, entries)
    return {
      status: 'mismatch',
      hash,
      expected: expectedHash,
      ...(div ? { firstDivergence: div } : {}),
    }
  }
  return { status: 'matches', hash }
}
