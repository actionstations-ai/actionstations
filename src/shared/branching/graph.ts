// The branch graph, derived from the flat MSEL (spec 0430). `scenario.msel` stays an ordered
// array; a row's `branchId` says which lane it is on, and `Scenario.branches` says where each
// lane forks and rejoins. Everything here is pure so main, renderer and tests share it.
import { exerciseMinutes } from '../schemas/common'
import type { Branch, Decision, MselRow, Scenario } from '../schemas/scenario'

export type BranchScenario = Pick<Scenario, 'msel'> & { branches?: Branch[] | undefined }

export interface BranchNode {
  branch: Branch
  /** Rows of this lane in time order (ties keep MSEL order). */
  rows: MselRow[]
  /** The branch whose lane holds this branch's decision row; absent = trunk. */
  parent?: string
}

export interface BranchGraph {
  trunk: MselRow[]
  branches: Map<string, BranchNode>
  decisions: Map<string, { row: MselRow; decision: Decision }>
}

export const branchesOf = (s: { branches?: Branch[] | undefined }): Branch[] => s.branches ?? []
export const hasBranches = (s: { branches?: Branch[] | undefined }): boolean =>
  branchesOf(s).length > 0

function byTime(rows: MselRow[]): MselRow[] {
  return rows
    .map((row, i) => ({ row, i, t: exerciseMinutes(row.time) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.row)
}

export function buildGraph(scenario: BranchScenario): BranchGraph {
  const decisions = new Map<string, { row: MselRow; decision: Decision }>()
  for (const row of scenario.msel)
    if (row.decision && !decisions.has(row.decision.id))
      decisions.set(row.decision.id, { row, decision: row.decision })
  const known = new Set(branchesOf(scenario).map((b) => b.id))
  const laneOf = (r: MselRow) => (r.branchId && known.has(r.branchId) ? r.branchId : undefined)
  const lane = (id: string | undefined) => byTime(scenario.msel.filter((r) => laneOf(r) === id))
  const branches = new Map<string, BranchNode>()
  for (const branch of branchesOf(scenario)) {
    const holder = decisions.get(branch.decisionId)?.row.branchId
    const parent = holder && known.has(holder) && holder !== branch.id ? holder : undefined
    branches.set(branch.id, { branch, rows: lane(branch.id), ...(parent ? { parent } : {}) })
  }
  return { trunk: lane(undefined), branches, decisions }
}

/** The branch's parents, nearest first (cycle-safe). */
export function ancestors(graph: BranchGraph, branchId: string): string[] {
  const out: string[] = []
  let cur = graph.branches.get(branchId)?.parent
  while (cur && !out.includes(cur) && cur !== branchId) {
    out.push(cur)
    cur = graph.branches.get(cur)?.parent
  }
  return out
}

/** Nesting depth: 0 = a branch off the trunk. */
export const branchDepth = (graph: BranchGraph, branchId: string): number =>
  ancestors(graph, branchId).length

/** The branch and every branch below it. */
export function subtree(graph: BranchGraph, branchId: string): Set<string> {
  const out = new Set<string>([branchId])
  let grew = true
  while (grew) {
    grew = false
    for (const [id, n] of graph.branches)
      if (!out.has(id) && n.parent && out.has(n.parent)) {
        out.add(id)
        grew = true
      }
  }
  return out
}

export interface PathWalk {
  rows: MselRow[]
  /** The decision the walk stopped at because nothing has chosen its option yet. */
  open?: Decision
  /** Rows of branches not taken and rows a taken branch jumps over. */
  skipped: Set<string>
}

type Exit = { kind: 'end' } | { kind: 'stop' } | { kind: 'jump'; rowId: string } | undefined

/**
 * Walks the MSEL from the first trunk row. `resolve` maps a decision to the chosen option id
 * (undefined = not decided yet: the walk stops after the decision row). A branch plays inline
 * after its decision row; at its rejoin row play continues, and rows in between are skipped.
 */
export function walkPath(
  scenario: BranchScenario,
  resolve: (decision: Decision) => string | undefined,
): PathWalk {
  const graph = buildGraph(scenario)
  const out: PathWalk = { rows: [], skipped: new Set() }
  const onPath = new Set<string>()

  const skipLane = (branchId: string) => {
    for (const id of subtree(graph, branchId))
      for (const r of graph.branches.get(id)?.rows ?? []) out.skipped.add(r.id)
  }

  const takeBranch = (decision: Decision, optionId: string): Exit => {
    for (const b of branchesOf(scenario).filter((x) => x.decisionId === decision.id))
      if (b.optionId !== optionId) skipLane(b.id)
    const chosen = decision.options.find((o) => o.id === optionId)
    const node = chosen?.branchId ? graph.branches.get(chosen.branchId) : undefined
    if (!node || onPath.has(node.branch.id)) return undefined
    onPath.add(node.branch.id)
    const inner = walk(node.rows, 0)
    if (inner) return inner
    return node.branch.rejoinRowId
      ? { kind: 'jump', rowId: node.branch.rejoinRowId }
      : { kind: 'end' }
  }

  function walk(rows: MselRow[], from: number): Exit {
    let i = from
    while (i < rows.length) {
      const row = rows[i]!
      out.rows.push(row)
      i++
      if (!row.decision) continue
      const optionId = resolve(row.decision)
      if (optionId === undefined) {
        out.open = row.decision
        return { kind: 'stop' }
      }
      const exit = takeBranch(row.decision, optionId)
      if (!exit) continue
      if (exit.kind === 'stop') return exit
      if (exit.kind === 'end') {
        for (const r of rows.slice(i)) out.skipped.add(r.id)
        return exit
      }
      const j = rows.findIndex((r, idx) => idx >= i && r.id === exit.rowId)
      if (j < 0) return exit
      for (const r of rows.slice(i, j)) out.skipped.add(r.id)
      i = j
    }
    return undefined
  }

  walk(graph.trunk, 0)
  return out
}

/**
 * The rows of the path a set of choices selects, in play order. Decisions missing from
 * `chosen` take their default option, so the result is always a complete path (exports).
 */
export function pathOrder(scenario: BranchScenario, chosen: Map<string, string>): MselRow[] {
  return walkPath(scenario, (d) => chosen.get(d.id) ?? d.defaultOptionId).rows
}
