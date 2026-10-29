// The rows a facilitator can deliver, given the decisions taken so far (spec 0430 FR-7).
import type { DecisionRecord } from '../ipc/facilitator'
import type { Decision, MselRow } from '../schemas/scenario'
import { walkPath, type BranchScenario } from './graph'

/** Latest record per decision id; a later record (an override) replaces the one before. */
export function effectiveDecisions(
  records: readonly DecisionRecord[],
): Map<string, DecisionRecord> {
  const out = new Map<string, DecisionRecord>()
  for (const r of records) out.set(r.decisionId, r)
  return out
}

export interface ActivePath {
  rows: MselRow[]
  /** The decision the path is cut at, when its option has not been chosen yet. */
  openDecision?: Decision
  skipped: Set<string>
}

export function activePath(
  scenario: BranchScenario,
  records: readonly DecisionRecord[],
): ActivePath {
  const chosen = effectiveDecisions(records)
  const walk = walkPath(scenario, (d) => chosen.get(d.id)?.optionId)
  return {
    rows: walk.rows,
    skipped: walk.skipped,
    ...(walk.open ? { openDecision: walk.open } : {}),
  }
}
