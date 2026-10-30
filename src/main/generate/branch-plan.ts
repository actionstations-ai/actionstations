// "Generate branches" for a decision (spec 0430 FR-11): one model call drafts the rows that play
// after each option. The rows are checked on a scratch copy of the scenario with the same
// structural repairs the MSEL gets (branch windows included) and the branch lints, then
// returned as a proposal: nothing here changes the saved scenario. A person applies the rows in
// the editor, where they save and undo like any other edit.
import { buildGraph, type BranchNode } from '@shared/branching/graph'
import { lintBranches } from '@shared/branching/lint'
import type { BranchPlanBranch, BranchPlanResult } from '@shared/branching/proposal'
import {
  exerciseMinutes,
  type BranchPlanOutput,
  type Decision,
  type MselRow,
  type Scenario,
} from '@shared/schemas'
import type { JobContext } from '../jobs/manager'
import { AppError } from '../lib/errors'
import { openInjectEnv } from './injects/text-job'
import { goalSummary, normalizeExerciseTime, resolveToRoles, stripKeysDeep } from './mappers'
import { phaseBeats } from './mappers'
import { repairStructure } from './mappers-structure'
import { resolveCitations, type RetrievedChunk } from './retrieval'
import { runStage } from './stage'
import { baseVars, rowVars } from './vars'

export interface BranchPlanRequest {
  decisionRowId: string
  instructions?: string
}

interface Lane {
  option: Decision['options'][number]
  node: BranchNode
  letter: string
}

const CONTROL = new Set(['STARTEX', 'ENDEX', 'TIME_JUMP'])

/** Base of a row id: the model's "I-12" (digits kept), else the decision row's id. */
const baseId = (raw: string, fallback: string): string => /^I-\d+/.exec(raw.trim())?.[0] ?? fallback

function freeId(base: string, taken: Set<string>): string {
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  taken.add(id)
  return id
}

/** The model's branch for an option: by label, else the next one not yet matched, in order. */
function matchOutput(
  out: BranchPlanOutput['branches'],
  lanes: Lane[],
): Map<Lane, BranchPlanOutput['branches'][number]> {
  const used = new Set<number>()
  const found = new Map<Lane, BranchPlanOutput['branches'][number]>()
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  for (const lane of lanes) {
    const i = out.findIndex((o, k) => !used.has(k) && same(o.optionLabel, lane.option.label))
    if (i >= 0) {
      used.add(i)
      found.set(lane, out[i]!)
    }
  }
  for (const lane of lanes) {
    if (found.has(lane)) continue
    const i = out.findIndex((_, k) => !used.has(k))
    if (i < 0) break
    used.add(i)
    found.set(lane, out[i]!)
  }
  return found
}

interface DraftInput {
  scenario: Scenario
  decisionRow: MselRow
  lanes: Lane[]
  output: BranchPlanOutput
  retrieved: RetrievedChunk[]
}

/** A later row on the decision row's own path (trunk, or the branch it sits in); else undefined. */
function validRejoin(
  s: Scenario,
  decisionRow: MselRow,
  id: string | undefined,
): string | undefined {
  const row = s.msel.find((r) => r.id === id)
  if (!row || row.id === decisionRow.id) return undefined
  const samePath = (row.branchId ?? '') === (decisionRow.branchId ?? '')
  const later = exerciseMinutes(row.time) >= exerciseMinutes(decisionRow.time)
  return samePath && later ? row.id : undefined
}

function toRow(
  out: BranchPlanOutput['branches'][number]['rows'][number],
  input: DraftInput,
  lane: Lane,
  id: string,
  after: string,
): MselRow {
  const { scenario, decisionRow, retrieved } = input
  const to = resolveToRoles(out.to, scenario.roles)
  const time = normalizeExerciseTime(out.time, after)
  return {
    id,
    phaseId: decisionRow.phaseId,
    time: exerciseMinutes(time) < exerciseMinutes(decisionRow.time) ? decisionRow.time : time,
    from: out.from,
    toRoleIds: to.ids,
    toLabel: to.label,
    event: out.event,
    expectedAction: out.expectedAction,
    purposeTag: CONTROL.has(out.purposeTag) ? 'CORE_NARRATIVE' : out.purposeTag,
    format: out.format,
    citations: resolveCitations(out.citations, retrieved).citations,
    locked: false,
    branchId: lane.node.branch.id,
  }
}

/**
 * The drafted branches for `lanes` from the model's output, checked on a scratch copy: rows get
 * the branch letter in their ids, a rejoin that is not a later trunk row falls back to the
 * branch's own, and the structural repairs re-time rows into the branch window.
 */
export function draftBranches(input: DraftInput): BranchPlanResult {
  const { scenario, decisionRow, lanes, output } = input
  const notes: string[] = []
  const scratch = structuredClone(scenario)
  const taken = new Set(scratch.msel.map((r) => r.id))
  const matched = matchOutput(output.branches, lanes)
  const drafted = new Map<Lane, MselRow[]>()
  for (const lane of lanes) {
    const out = matched.get(lane)
    const branch = scratch.branches?.find((b) => b.id === lane.node.branch.id)
    if (!out || !branch) {
      notes.push(`The model wrote nothing for "${lane.option.label}".`)
      continue
    }
    scratch.msel = scratch.msel.filter((r) => r.branchId !== branch.id || r.locked)
    for (const r of scenario.msel) if (r.branchId === branch.id && !r.locked) taken.delete(r.id)
    const rejoin = validRejoin(scenario, decisionRow, out.rejoinRowId)
    if (out.rejoinRowId && !rejoin)
      notes.push(
        `Branch ${branch.id.toUpperCase()}: "${out.rejoinRowId}" is not a later row on the decision path, so the rejoin was kept as it was.`,
      )
    if (rejoin) branch.rejoinRowId = rejoin
    branch.label = out.label.slice(0, 80) || branch.label
    branch.rationale = out.rationale
    let after = decisionRow.time
    const rows = stripKeysDeep(out).rows.map((o) => {
      const id = freeId(`${baseId(o.id, decisionRow.id)}${lane.letter}`, taken)
      const row = toRow(o, input, lane, id, after)
      after = row.time
      return row
    })
    scratch.msel.push(...rows)
    drafted.set(lane, rows)
  }
  const fix = repairStructure(scratch)
  for (const d of fix.duplicates) notes.push(`Row ${d.rowId} dropped: it repeats row ${d.of}.`)
  for (const t of fix.retimed)
    notes.push(`Row ${t.rowId} moved from ${t.from} to ${t.to} to fit its branch window.`)
  return finish(scratch, lanes, drafted, notes, decisionRow.id)
}

function finish(
  scratch: Scenario,
  lanes: Lane[],
  drafted: Map<Lane, MselRow[]>,
  notes: string[],
  decisionRowId: string,
): BranchPlanResult {
  const kept = new Map(scratch.msel.map((r) => [r.id, r]))
  const branches: BranchPlanBranch[] = []
  for (const lane of lanes) {
    const rows = drafted.get(lane)
    const branch = scratch.branches?.find((b) => b.id === lane.node.branch.id)
    if (!rows || !branch) continue
    branches.push({
      branchId: branch.id,
      label: branch.label,
      rationale: branch.rationale,
      ...(branch.rejoinRowId ? { rejoinRowId: branch.rejoinRowId } : {}),
      rows: rows.map((r) => kept.get(r.id)).filter((r): r is MselRow => !!r),
    })
  }
  const ids = new Set(branches.map((b) => b.branchId))
  const warnings = lintBranches(scratch)
    .filter((w) => w.rowId && ids.has(kept.get(w.rowId)?.branchId ?? ''))
    .map((w) => w.message)
  return { decisionRowId, branches, notes, warnings }
}

function lanesOf(scenario: Scenario, decisionRowId: string) {
  const graph = buildGraph(scenario)
  const entry = [...graph.decisions.values()].find((d) => d.row.id === decisionRowId)
  if (!entry) throw new AppError('NOT_FOUND', `Row ${decisionRowId} has no decision to branch`)
  const lanes: Lane[] = []
  entry.decision.options.forEach((option, i) => {
    const node = option.branchId ? graph.branches.get(option.branchId) : undefined
    if (node) lanes.push({ option, node, letter: String.fromCharCode(97 + i) })
  })
  if (!lanes.length)
    throw new AppError('VALIDATION', 'Add a branch to an option of this decision first')
  return { entry, lanes }
}

export async function runBranchPlan(
  root: string,
  scenarioId: string,
  req: BranchPlanRequest,
  ctx: JobContext,
): Promise<BranchPlanResult> {
  const env = await openInjectEnv(root, ctx, scenarioId)
  const scenario = await env.deps.store.getScenario(root, scenarioId)
  const { entry, lanes } = lanesOf(scenario, req.decisionRowId)
  const phase = scenario.phases.find((p) => p.id === entry.row.phaseId)
  const start = exerciseMinutes(entry.row.time)
  const vars = {
    ...baseVars({
      project: env.project,
      scenario,
      domain: env.domain,
      ...(req.instructions ? { instructions: req.instructions } : {}),
    }),
    decision: { question: entry.decision.question },
    decisionRow: rowVars(entry.row, scenario.roles),
    options: lanes.map((l) => ({ label: l.option.label, description: l.option.description ?? '' })),
    phase: {
      title: phase?.title ?? '',
      goal: phase ? goalSummary(phase.goal) : '',
      beats: phase ? phaseBeats(phase) : [],
    },
    trunkAfter: scenario.msel
      .filter((r) => !r.branchId && exerciseMinutes(r.time) > start)
      .slice(0, 8)
      .map((r) => rowVars(r, scenario.roles)),
  }
  const result = await runStage<BranchPlanOutput>({
    stage: 'branch_plan',
    itemId: entry.row.id,
    projectPath: env.root,
    vars,
    ctx: env.ctx,
    deps: env.deps,
    index: env.index,
  })
  return draftBranches({
    scenario,
    decisionRow: entry.row,
    lanes,
    output: result.output,
    retrieved: result.retrieved,
  })
}
