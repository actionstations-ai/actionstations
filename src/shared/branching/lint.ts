// Lints for branches and decisions (spec 0430 FR-12). Pure: the editor, scenarios:lint and the
// tests share it. A branch is checked against its decision (is it reachable?), its lane (does
// it end?) and the clock (do its rows sit between the decision and the rejoin?).
import { exerciseMinutes } from '../schemas/common'
import type { LintWarning, MselRow, Scenario } from '../schemas/scenario'
import { branchDepth, buildGraph, type BranchGraph, type BranchNode } from './graph'

export const BRANCH_ROLE_GAP_MIN = 30
export const BRANCH_MAX_DEPTH = 3

type W = LintWarning
const warn = (
  code: string,
  severity: W['severity'],
  message: string,
  extra: Partial<W> = {},
): W => ({ code, severity, message, source: 'lint', ...extra })

type LintInput = Pick<Scenario, 'msel' | 'roles'> & { branches?: Scenario['branches'] }

const lastRow = (n: BranchNode): MselRow | undefined => n.rows[n.rows.length - 1]

/** Decisions: default present, options point at real branches, row is a decision point. */
function lintDecisions(g: BranchGraph): W[] {
  const out: W[] = []
  for (const { row, decision } of g.decisions.values()) {
    if (row.purposeTag !== 'DECISION_POINT')
      out.push(
        warn(
          'DECISION_NOT_DECISION_POINT',
          'warning',
          `Row ${row.id} has a decision but is tagged ${row.purposeTag}, not a decision point.`,
          { rowId: row.id },
        ),
      )
    if (!decision.options.some((o) => o.id === decision.defaultOptionId))
      out.push(
        warn(
          'DECISION_NO_DEFAULT',
          'error',
          `Decision ${decision.id} on ${row.id} has no default option that is one of its options.`,
          { rowId: row.id },
        ),
      )
    for (const o of decision.options) {
      if (o.branchId && !g.branches.has(o.branchId))
        out.push(
          warn(
            'DECISION_OPTION_ORPHAN',
            'error',
            `Option "${o.label}" of ${decision.id} points at branch ${o.branchId}, which does not exist.`,
            { rowId: row.id },
          ),
        )
      else if (o.branchId && g.branches.get(o.branchId)!.rows.length === 0)
        out.push(
          warn('BRANCH_EMPTY', 'info', `Branch ${o.branchId} ("${o.label}") has no rows yet.`, {
            rowId: row.id,
          }),
        )
    }
  }
  return out
}

/** A branch no option of an existing decision leads to, or one that hangs off such a branch. */
function unreachable(g: BranchGraph): Set<string> {
  const bad = new Set<string>()
  const reachable = (id: string, seen: Set<string>): boolean => {
    if (seen.has(id)) return false
    seen.add(id)
    const n = g.branches.get(id)!
    const d = g.decisions.get(n.branch.decisionId)
    if (!d || !d.decision.options.some((o) => o.id === n.branch.optionId && o.branchId === id))
      return false
    return n.parent ? reachable(n.parent, seen) : true
  }
  for (const id of g.branches.keys()) if (!reachable(id, new Set())) bad.add(id)
  return bad
}

/** Follows rejoin pointers; true when a branch is visited twice. */
function hasCycle(g: BranchGraph, start: string): boolean {
  const seen = new Set<string>()
  let cur: string | undefined = start
  while (cur) {
    if (seen.has(cur)) return true
    seen.add(cur)
    const rejoin: string | undefined = g.branches.get(cur)?.branch.rejoinRowId
    const row: MselRow | undefined = rejoin
      ? [...g.branches.values()].flatMap((n) => n.rows).find((r) => r.id === rejoin)
      : undefined
    cur = row?.branchId && g.branches.has(row.branchId) ? row.branchId : undefined
  }
  return false
}

function lintEnding(g: BranchGraph, node: BranchNode, all: Map<string, MselRow>): W[] {
  const { branch } = node
  const first = node.rows[0]
  const at = { rowId: first?.id ?? g.decisions.get(branch.decisionId)?.row.id }
  if (!branch.rejoinRowId) {
    const end = lastRow(node)
    return end?.purposeTag === 'ENDEX'
      ? []
      : [
          warn(
            'BRANCH_DEAD_END',
            'error',
            `Branch ${branch.label} neither rejoins the exercise nor ends with an end card.`,
            at,
          ),
        ]
  }
  const rejoin = all.get(branch.rejoinRowId)
  if (!rejoin)
    return [
      warn(
        'BRANCH_DEAD_END',
        'error',
        `Branch ${branch.label} rejoins ${branch.rejoinRowId}, which does not exist.`,
        at,
      ),
    ]
  const lane = rejoin.branchId
  const onAncestorOrTrunk = !lane || node.parent === lane || isAncestor(g, branch.id, lane)
  const end = lastRow(node)
  const backward = !!end && exerciseMinutes(rejoin.time) < exerciseMinutes(end.time)
  const out: W[] = []
  if (!onAncestorOrTrunk || backward)
    out.push(
      warn(
        'BRANCH_REJOIN_BACKWARD',
        'error',
        !onAncestorOrTrunk
          ? `Branch ${branch.label} rejoins ${rejoin.id}, which is not on the trunk or a parent branch.`
          : `Branch ${branch.label} rejoins ${rejoin.id} at ${rejoin.time}, before its last row at ${end!.time}.`,
        { rowId: rejoin.id },
      ),
    )
  return out
}

function isAncestor(g: BranchGraph, branchId: string, candidate: string): boolean {
  let cur = g.branches.get(branchId)?.parent
  for (let n = 0; cur && n < 20; n++) {
    if (cur === candidate) return true
    cur = g.branches.get(cur)?.parent
  }
  return false
}

function lintTimes(g: BranchGraph, node: BranchNode, all: Map<string, MselRow>): W[] {
  const decisionRow = g.decisions.get(node.branch.decisionId)?.row
  const rejoin = node.branch.rejoinRowId ? all.get(node.branch.rejoinRowId) : undefined
  const out: W[] = []
  for (const r of node.rows) {
    const t = exerciseMinutes(r.time)
    if (decisionRow && t < exerciseMinutes(decisionRow.time))
      out.push(
        warn(
          'BRANCH_TIME_ORDER',
          'warning',
          `Row ${r.id} is timed before its decision ${decisionRow.id}.`,
          { rowId: r.id },
        ),
      )
    else if (rejoin && t > exerciseMinutes(rejoin.time))
      out.push(
        warn(
          'BRANCH_TIME_ORDER',
          'warning',
          `Row ${r.id} is timed after the rejoin row ${rejoin.id}.`,
          { rowId: r.id },
        ),
      )
  }
  return out
}

const reaches = (row: MselRow, roleId: string): boolean =>
  row.toRoleIds.includes(roleId) || (row.toLabel ?? '').trim().toLowerCase() === 'all'

/** A role that gets nothing for 30 minutes of a branch. */
function lintRoleGaps(s: LintInput, g: BranchGraph, node: BranchNode): W[] {
  const decisionRow = g.decisions.get(node.branch.decisionId)?.row
  const end = lastRow(node)
  if (!decisionRow || !end || node.rows.length < 2) return []
  const from = exerciseMinutes(decisionRow.time)
  const to = exerciseMinutes(end.time)
  const out: W[] = []
  for (const role of s.roles) {
    const times = node.rows
      .filter((r) => reaches(r, role.id))
      .map((r) => exerciseMinutes(r.time))
      .sort((a, b) => a - b)
    const marks = [from, ...times, to]
    const gap = Math.max(...marks.slice(1).map((t, i) => t - marks[i]!))
    if (gap > BRANCH_ROLE_GAP_MIN)
      out.push(
        warn(
          'BRANCH_ROLE_GAP',
          'warning',
          `${role.name} receives nothing for ${gap} minutes in branch ${node.branch.label}.`,
          { rowId: node.rows[0]!.id },
        ),
      )
  }
  return out
}

export function lintBranches(s: LintInput): W[] {
  const g = buildGraph(s)
  if (!g.branches.size && !g.decisions.size) return []
  const all = new Map(s.msel.map((r) => [r.id, r]))
  const out = lintDecisions(g)
  const bad = unreachable(g)
  for (const node of g.branches.values()) {
    const { branch } = node
    const decisionRow = g.decisions.get(branch.decisionId)?.row
    if (bad.has(branch.id))
      out.push(
        warn(
          'BRANCH_UNREACHABLE',
          'error',
          `Branch ${branch.label} can never play: no option of its decision leads to it.`,
          { rowId: node.rows[0]?.id ?? decisionRow?.id },
        ),
      )
    if (hasCycle(g, branch.id))
      out.push(
        warn(
          'BRANCH_CYCLE',
          'error',
          `Branch ${branch.label} rejoins a path that leads back to it.`,
          { rowId: node.rows[0]?.id },
        ),
      )
    out.push(...lintEnding(g, node, all), ...lintTimes(g, node, all), ...lintRoleGaps(s, g, node))
    if (branchDepth(g, branch.id) >= BRANCH_MAX_DEPTH)
      out.push(
        warn(
          'BRANCH_DEPTH',
          'info',
          `Branch ${branch.label} is nested ${branchDepth(g, branch.id) + 1} levels deep.`,
          { rowId: node.rows[0]?.id },
        ),
      )
  }
  return out
}
