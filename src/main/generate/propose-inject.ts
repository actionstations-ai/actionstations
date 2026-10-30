// "Propose next inject" for a branch (spec 0430 FR-10): one model call that returns a draft
// MSEL row. The row is a proposal: nothing here writes it into the scenario or into session
// state; the renderer shows it in a review card and a person accepts or rejects it.
import { exerciseMinutes } from '@shared/schemas/common'
import { buildGraph } from '@shared/branching/graph'
import { proposalHash, type ProposalResult } from '@shared/branching/proposal'
import type { MselPhaseOutput, MselRow, Scenario } from '@shared/schemas'
import type { JobContext } from '../jobs/manager'
import { AppError } from '../lib/errors'
import { openInjectEnv } from './injects/text-job'
import { normalizeExerciseTime, resolveToRoles, stripKeysDeep } from './mappers'
import { groundingKey, type GroundingResult } from '@shared/schemas/grounding'
import { contextFor } from '../grounding/project'
import { groundItems, scenarioItems } from '../grounding/scenario'
import { resolveCitations } from './retrieval'
import { runStage } from './stage'
import { baseVars, rowVars } from './vars'

export interface ProposeRequest {
  branchId: string
  /** Place the row after this one (a row of the branch); default: after the last. */
  afterRowId?: string
  instructions?: string
}

const CONTROL = new Set(['STARTEX', 'ENDEX', 'TIME_JUMP'])

function freeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

/** The source check (#423) of a proposed row; undefined when it cannot be computed. */
async function groundProposal(
  env: Awaited<ReturnType<typeof openInjectEnv>>,
  scenario: Scenario,
  row: MselRow,
): Promise<GroundingResult | undefined> {
  try {
    const scratch: Scenario = { ...scenario, msel: [...scenario.msel, row] }
    const ctx = await contextFor(env.root, scratch, {
      index: env.index,
      facility: env.facility,
      project: env.project,
    })
    const key = groundingKey.row(row.id)
    const items = scenarioItems(scratch, []).filter((i) => i.key === key)
    return (await groundItems(items, {}, ctx))[key]
  } catch {
    return undefined
  }
}

export async function runProposeInject(
  root: string,
  scenarioId: string,
  req: ProposeRequest,
  ctx: JobContext,
): Promise<ProposalResult> {
  const env = await openInjectEnv(root, ctx, scenarioId)
  const scenario = await env.deps.store.getScenario(root, scenarioId)
  const graph = buildGraph(scenario)
  const node = graph.branches.get(req.branchId)
  const decision = node && graph.decisions.get(node.branch.decisionId)
  if (!node || !decision) throw new AppError('NOT_FOUND', `No branch ${req.branchId} to extend`)
  const after =
    node.rows.find((r) => r.id === req.afterRowId) ??
    node.rows[node.rows.length - 1] ??
    decision.row
  const option = decision.decision.options.find((o) => o.id === node.branch.optionId)
  const vars = {
    ...baseVars({
      project: env.project,
      scenario,
      domain: env.domain,
      ...(req.instructions ? { instructions: req.instructions } : {}),
    }),
    decision: { question: decision.decision.question },
    decisionRow: rowVars(decision.row, scenario.roles),
    branch: {
      label: node.branch.label,
      rationale: node.branch.rationale,
      optionLabel: option?.label ?? node.branch.label,
    },
    branchRows: node.rows.map((r) => rowVars(r, scenario.roles)),
    afterRow: rowVars(after, scenario.roles),
  }
  const result = await runStage<MselPhaseOutput>({
    stage: 'msel_phase',
    promptName: 'branch_inject',
    itemId: node.branch.id,
    projectPath: env.root,
    vars,
    ctx: env.ctx,
    deps: env.deps,
    index: env.index,
  })
  const out = stripKeysDeep(result.output).rows[0]
  if (!out) throw new AppError('VALIDATION', 'The model proposed no row')
  const to = resolveToRoles(out.to, scenario.roles)
  const earliest = exerciseMinutes(decision.row.time)
  const time = normalizeExerciseTime(out.time, after.time)
  const row: MselRow = {
    id: freeId(
      `${decision.row.id}-${node.branch.id.toUpperCase()}-${node.rows.length + 1}`,
      new Set(scenario.msel.map((r) => r.id)),
    ),
    phaseId: decision.row.phaseId,
    time: exerciseMinutes(time) < earliest ? decision.row.time : time,
    from: out.from,
    toRoleIds: to.ids,
    toLabel: to.label,
    event: out.event,
    expectedAction: out.expectedAction,
    purposeTag: CONTROL.has(out.purposeTag) ? 'CORE_NARRATIVE' : out.purposeTag,
    format: out.format,
    citations: resolveCitations(out.citations, result.retrieved).citations,
    locked: false,
    branchId: node.branch.id,
  }
  const grounding = await groundProposal(env, scenario, row)
  return { row, hash: proposalHash(row), ...(grounding ? { grounding } : {}) }
}
