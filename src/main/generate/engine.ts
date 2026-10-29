// The pipeline engine (#25): a fixed stage order with msel_phase expanded per phase, one
// StageRun per step kept in scenario.provenance, a checkpoint (scenario.json) after every
// step, resume from the first step without an ok run, and re-run of a single step that marks
// everything downstream stale (never auto-rerun). The exported step helpers are shared with
// repair-msel.ts (generate:repair), which runs the same repairs on a finished scenario.
import { orderedCapabilities } from '@shared/core-capabilities'
import {
  exerciseMinutes,
  type BriefingOutput,
  type CritiqueOutput,
  type EegOutput,
  type HandbookOutput,
  type HotwashOutput,
  type LintWarning,
  type MselPhaseOutput,
  type MselRow,
  type ObjectivesRolesOutput,
  type OverviewOutput,
  type Phase,
  type PhasePlanOutput,
  type Project,
  type RubricOutput,
  type Scenario,
  type ScenarioIdea,
  type Stage,
  type StageRun,
} from '@shared/schemas'
import type { JobContext } from '../jobs/manager'
import { AppError, toAppError } from '../lib/errors'
import { nowIso } from '../lib/ids'
import { pipelineDeps, type PipelineDeps, type SearchIndex } from './deps'
import { domainContext, roleHeuristics, type DomainContext } from './domain'
import {
  hotwashSection,
  renderBriefingMarkdown,
  renderHandbookMarkdown,
  renderHotwashMarkdown,
  renderMselMarkdown,
  rubricSection,
  upsertSection,
} from './docs'
import {
  FACILITY_UNKNOWN_ID,
  facilitySheet,
  lintFacilityIds,
  lintRowFacility,
  type FacilityFacts,
} from './facility'
import { CRITIQUE, withBasis } from './critique-notes'
import { COMPACT_SECTIONS, compactCritiqueVars, critiqueContextError } from './critique-compact'
import { findIdea } from './ideas'
import { describeStaleInjects, markInjectsStale } from './inject-stale'
import {
  DECISION_POINT_RETAGGED,
  decisionPhaseIndex,
  lintScenario,
  overfillRows,
  phaseRowCap,
  phaseRowCounts,
  pickDecisionRow,
  planMixCompletion,
  roleNamedBy,
  structuralLints,
  type MixPlan,
} from './lint'
import { INJECT_PLAYER_VOICE } from './lint-structure'
import { goalSummary, phaseBeats, type MselMapResult } from './mappers'
import { applyEeg, EEG_ROW } from './mappers-eeg'
import {
  capRoles,
  convertToFacilitatorPrompt,
  repairStructure,
  type StructureRepair,
} from './mappers-structure'
import type { RetrievedChunk } from './retrieval'
import { repairRubricLinks, sourceFor } from './sources'
import {
  applyHandbook,
  applyHotwash,
  applyMselPhase,
  applyObjectivesRoles,
  applyOverview,
  applyPhasePlan,
  applyRubric,
  stripKeysDeep,
} from './mappers'
import { runStage, StageFailure, type StageResult } from './stage'
import { baseVars, dataSafe, rowVars } from './vars'

export interface StepKey {
  stage: Stage
  itemId?: string
}

/** Stages the scenario pipeline runs, in order. msel_phase expands to one step per phase. */
export const PIPELINE_STAGES: Stage[] = [
  'scenario_overview',
  'objectives_roles',
  'phase_plan',
  'msel_phase',
  'controller_handbook',
  'rubric',
  'eeg',
  'player_briefing',
  'hotwash',
  'critique',
]

/**
 * Stages nothing downstream reads (#421): a re-run of one of them marks nothing stale and
 * keeps a ready scenario ready, so "Generate evaluation guides" on a finished scenario adds
 * the EEGs without touching the other documents (FR-12).
 */
export const INDEPENDENT_STAGES: ReadonlySet<Stage> = new Set<Stage>(['eeg'])

/** Why the eeg stage refuses to run against an empty retrieval. */
export const EEG_NO_SECTIONS =
  'no plan sections found for the objectives; import the plans or widen the brief'

export const CITATION_DROPPED = 'CITATION_DROPPED'
export const ROLE_KEY_UNKNOWN = 'ROLE_KEY_UNKNOWN'
export const LOCATION_UNGROUNDED = 'LOCATION_UNGROUNDED'
/** Warnings the mappers record while generating; kept when the lints are recomputed. */
export const PIPELINE_WARNINGS = new Set([
  CITATION_DROPPED,
  ROLE_KEY_UNKNOWN,
  LOCATION_UNGROUNDED,
  FACILITY_UNKNOWN_ID,
  DECISION_POINT_RETAGGED,
])
/** rowId the overview's dropped citations are recorded under. */
export const OVERVIEW_ROW = 'overview'

/** Drop the pipeline warnings a step is about to record again, so re-runs never pile them up. */
function clearPipelineWarnings(s: Scenario, owned: (w: LintWarning) => boolean): void {
  s.warnings = s.warnings.filter((w) => !(PIPELINE_WARNINGS.has(w.code) && owned(w)))
}

const zeroPad = (n: number): string => String(n).padStart(2, '0')

export const stepKey = (s: StepKey): string => (s.itemId ? `${s.stage}:${s.itemId}` : s.stage)
export const sameStep = (a: StepKey, b: StepKey): boolean => stepKey(a) === stepKey(b)

/** Steps for the scenario as it stands; before phase_plan ran, msel_phase is one placeholder. */
export function planSteps(s: Scenario): StepKey[] {
  return PIPELINE_STAGES.flatMap((stage): StepKey[] => {
    if (stage !== 'msel_phase') return [{ stage }]
    if (!s.phases.length) return [{ stage }]
    return s.phases.map((p) => ({ stage, itemId: p.id }))
  })
}

export function runFor(s: Scenario, step: StepKey): StageRun | undefined {
  return s.provenance.find((r) => sameStep(r, step))
}

export function nextStep(s: Scenario): StepKey | undefined {
  return planSteps(s).find((step) => runFor(s, step)?.status !== 'ok')
}

function recordRun(s: Scenario, run: StageRun): void {
  const i = s.provenance.findIndex((r) => sameStep(r, run))
  if (i >= 0) s.provenance[i] = run
  else s.provenance.push(run)
}

/** Everything after `step` in plan order whose run is ok becomes stale. */
export function markStale(s: Scenario, step: StepKey): StepKey[] {
  const plan = planSteps(s)
  const at = plan.findIndex((p) => sameStep(p, step))
  if (at < 0) return []
  const stale: StepKey[] = []
  for (const later of plan.slice(at + 1)) {
    const run = runFor(s, later)
    if (run && run.status === 'ok') {
      run.status = 'stale'
      stale.push(later)
    }
  }
  return stale
}

export interface Env {
  root: string
  deps: PipelineDeps
  index: SearchIndex
  project: Project
  facility: FacilityFacts
  /** The project's domain profile and the scenario's threat family (ADR-0014). */
  domain: DomainContext
  idea?: ScenarioIdea
  ctx: JobContext
  /**
   * Documents a running step wrote, held until its checkpoint (#209): a failed or cancelled
   * step leaves the documents on disk as they were. Absent outside executeStep (the MSEL
   * repair job), where writeDoc writes through.
   */
  docs?: DocBuffer
}

type DocKind = 'overview' | 'handbook' | 'briefing' | 'hotwash'
export type DocBuffer = Map<DocKind, { md: string; note: string }>

export interface StepInput {
  env: Env
  scenario: Scenario
  step: StepKey
  instructions?: string
}

export const save = (env: Env, s: Scenario, note: string): Promise<Scenario> =>
  env.deps.store.saveScenario(env.root, s, { by: 'ai', snapshot: false, note })

/**
 * Write a document; the store records its path in scenario.json, so mirror that in memory.
 * Inside a step the write is buffered until the step's checkpoint (flushDocs).
 */
export async function writeDoc(
  env: Env,
  s: Scenario,
  kind: DocKind,
  md: string,
  note: string,
): Promise<void> {
  if (env.docs) {
    env.docs.set(kind, { md, note })
    return
  }
  await env.deps.store.writeScenarioDoc(env.root, s.id, kind, md, {
    by: 'ai',
    snapshot: false,
    note,
  })
  s.documents = (await env.deps.store.getScenario(env.root, s.id)).documents
}

function noteDropped(
  s: Scenario,
  stage: Stage,
  dropped: { rowId?: string; keys: string[] }[],
  ctx: JobContext,
): void {
  for (const d of dropped) {
    const where = d.rowId ? ` (${d.rowId})` : ''
    const w: LintWarning = {
      code: CITATION_DROPPED,
      severity: 'warning',
      message: `${stage}${where} cited ${d.keys.join(', ')}, which was not among the retrieved sections; dropped`,
      source: 'lint',
      ...(d.rowId ? { rowId: d.rowId } : {}),
    }
    s.warnings.push(w)
    ctx.log(w.message, 'warn', { stage, ...(d.rowId ? { itemId: d.rowId } : {}) })
  }
}

/** Run the step's prompt; citation keys written into prose are stripped from the output. */
export async function call<T>(
  input: StepInput,
  vars: Record<string, unknown>,
  maxRetrieved?: number,
  requireRetrieval?: string,
): Promise<StageResult<T>> {
  const { env, step } = input
  const result = await runStage<T>({
    stage: step.stage,
    ...(step.itemId ? { itemId: step.itemId } : {}),
    projectPath: env.root,
    vars,
    ctx: env.ctx,
    deps: env.deps,
    index: env.index,
    ...(maxRetrieved !== undefined ? { maxRetrieved } : {}),
    ...(requireRetrieval ? { requireRetrieval } : {}),
  })
  return { ...result, output: stripKeysDeep(result.output) }
}

const vars = (input: StepInput, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...baseVars({
    project: input.env.project,
    scenario: input.scenario,
    domain: input.env.domain,
    ...(input.env.idea ? { idea: input.env.idea } : {}),
    ...(input.instructions ? { instructions: input.instructions } : {}),
  }),
  facility: facilitySheet(input.env.facility),
  ...extra,
})

async function stepOverview(input: StepInput): Promise<StageRun> {
  const { scenario: s, env } = input
  const r = await call<OverviewOutput>(input, vars(input))
  const org = {
    orgName: env.project.orgName || env.project.name,
    ...(env.project.brand.city ? { city: env.project.brand.city } : {}),
    ...(env.project.brand.region ? { region: env.project.brand.region } : {}),
  }
  const applied = applyOverview(s, r.output, r.retrieved, org)
  clearPipelineWarnings(s, (w) => w.rowId === OVERVIEW_ROW || w.code === LOCATION_UNGROUNDED)
  noteDropped(s, 'scenario_overview', applied.dropped, env.ctx)
  if (applied.ungroundedLocation) {
    const w: LintWarning = {
      code: LOCATION_UNGROUNDED,
      severity: 'warning',
      message: `The overview placed the facility in ${applied.ungroundedLocation}, which the documents never mention; location reset to "${s.overview?.location}"`,
      source: 'lint',
    }
    s.warnings.push(w)
    env.ctx.log(w.message, 'warn', { stage: 'scenario_overview' })
  }
  await writeDoc(env, s, 'overview', renderMselMarkdown(s), 'scenario_overview')
  return r.run
}

async function stepObjectivesRoles(input: StepInput): Promise<StageRun> {
  const r = await call<ObjectivesRolesOutput>(input, vars(input))
  applyObjectivesRoles(input.scenario, r.output)
  capToAudience(input)
  await writeDoc(
    input.env,
    input.scenario,
    'overview',
    renderMselMarkdown(input.scenario),
    'objectives_roles',
  )
  return r.run
}

/** No more player roles than the brief's audience list has entries (#174). */
function capToAudience(input: StepInput): void {
  const { scenario: s, env } = input
  const cap = s.brief.audience.length
  const before = s.roles.length
  const dropped = capRoles(s, cap, roleHeuristics(env.domain.profile), env.domain.profile)
  if (!dropped.length) return
  env.ctx.log(
    `objectives_roles: ${before} roles for a ${cap}-entry audience; dropped ${dropped.map((r) => `"${r.name}"`).join(', ')}`,
    'warn',
    { stage: 'objectives_roles' },
  )
}

async function stepPhasePlan(input: StepInput): Promise<StageRun> {
  const r = await call<PhasePlanOutput>(input, vars(input))
  applyPhasePlan(input.scenario, r.output)
  return r.run
}

const phaseMinutes = (p: Phase): number => exerciseMinutes(p.endTime) - exerciseMinutes(p.startTime)

/**
 * Variables for one msel_phase call. `withCurrent` (mix and revision passes) counts the
 * phase's own rows when numbering; a fresh pass counts earlier phases and locked rows only.
 */
export function mselVars(
  input: StepInput,
  phase: Phase,
  withCurrent = false,
): Record<string, unknown> {
  const s = input.scenario
  const prior = s.msel.filter((r) => {
    const p = s.phases.find((x) => x.id === r.phaseId)
    return p && p.index < phase.index
  })
  const current = s.msel.filter((r) => r.phaseId === phase.id)
  const locked = current.filter((r) => r.locked)
  const counted = [...prior, ...(withCurrent ? current : locked)]
  const numbers = counted.map((r) => Number(/^I-(\d+)/.exec(r.id)?.[1] ?? 0))
  const minutes = phaseMinutes(phase)
  const dp = decisionPhaseIndex(s.phases.length)
  return vars(input, {
    phase: {
      number: phase.index + 1,
      title: phase.title,
      goal: goalSummary(phase.goal),
      beats: dataSafe(phaseBeats(phase)),
      startTime: phase.startTime,
      endTime: phase.endTime,
      isFirst: phase.index === 0,
      isLast: phase.index === s.phases.length - 1,
      isDecisionPhase: phase.index === dp,
      minutes,
    },
    dpPhase: dp + 1,
    hasDecisionPoint: s.msel.some((r) => r.purposeTag === 'DECISION_POINT'),
    priorRows: prior.map((r) => rowVars(r, s.roles)),
    lockedRows: withCurrent ? [] : locked.map((r) => rowVars(r, s.roles)),
    nextInjectNumber: zeroPad(Math.max(0, ...numbers) + 1),
    ...phaseRowCounts(minutes),
  })
}

/** Log and record what the mapper changed; `owned` rows' earlier pipeline warnings are replaced. */
export function reportMapping(
  s: Scenario,
  phase: Phase,
  mapped: MselMapResult,
  ctx: JobContext,
  owned: Set<string>,
): void {
  clearPipelineWarnings(s, (w) => !!w.rowId && owned.has(w.rowId))
  noteDropped(s, 'msel_phase', mapped.dropped, ctx)
  const extra = { stage: 'msel_phase' as const, itemId: phase.id }
  for (const r of mapped.resourced)
    ctx.log(
      r.converted
        ? `Row ${r.rowId} was a decision by "${r.from}"; turned into a facilitator prompt`
        : `Row ${r.rowId} came from player role "${r.from}"; re-sourced to "${r.to}"`,
      'warn',
      extra,
    )
  for (const re of mapped.renamed)
    ctx.log(`Row ${re.from} renamed to ${re.to} (duplicate id)`, 'warn', extra)
  for (const id of mapped.duplicates)
    ctx.log(`Row ${id} dropped: same event text as an earlier row`, 'warn', extra)
  for (const id of mapped.stray)
    ctx.log(`Row ${id} dropped: START/END rows belong only to the first/last phase`, 'warn', extra)
  for (const id of mapped.synthesized)
    ctx.log(
      `Row ${id} added: the model omitted the ${id === 'START' ? 'STARTEX' : 'ENDEX'} row`,
      'warn',
      extra,
    )
  for (const u of mapped.unresolvedTo) {
    const w: LintWarning = {
      code: ROLE_KEY_UNKNOWN,
      severity: 'warning',
      message: `Row ${u.rowId} is addressed to "${u.keys.join('", "')}", which is not a role key`,
      source: 'lint',
      rowId: u.rowId,
    }
    s.warnings.push(w)
    ctx.log(w.message, 'warn', extra)
  }
}

/** Citation keys of rows produced against `from` chunks, re-keyed against `to` by chunk id. */
function rekeyCitations(
  rows: MselPhaseOutput['rows'],
  from: RetrievedChunk[],
  to: RetrievedChunk[],
): MselPhaseOutput['rows'] {
  const chunkOf = new Map(from.map((c) => [c.key, c.hit.chunkId]))
  const keyOf = new Map(to.map((c) => [c.hit.chunkId, c.key]))
  return rows.map((r) => ({
    ...r,
    citations: r.citations.flatMap((k) => {
      const id = chunkOf.get(k.trim().toUpperCase())
      const key = id === undefined ? undefined : keyOf.get(id)
      return key ? [key] : []
    }),
  }))
}

export const sumTokens = (into: StageRun, run: StageRun): void => {
  into.inputTokens = (into.inputTokens ?? 0) + (run.inputTokens ?? 0)
  into.outputTokens = (into.outputTokens ?? 0) + (run.outputTokens ?? 0)
  into.costUsd = (into.costUsd ?? 0) + (run.costUsd ?? 0)
}

interface MixResult {
  /** The first call's rows with the rewritten spares substituted, plus the new rows. */
  rows: OutRow[]
  added: number
  rewritten: number
}

const upper = (id: string): string => id.trim().toUpperCase()

/**
 * Merge the mix pass's rows: a row with a spare's id replaces it (same id and time); new rows
 * are kept up to the plan's count, plus one for each spare the model did not return, never
 * past the phase's room (#167). Control rows and repeats of existing ids are ignored.
 */
function mergeMixRows(
  firstRows: OutRow[],
  mixRows: OutRow[],
  plan: MixPlan,
  current: MselRow[],
): MixResult {
  const spares = new Map(plan.replace.map((r) => [upper(r.id), r]))
  const existing = new Set(current.map((r) => upper(r.id)))
  const rewrites = new Map<string, OutRow>()
  const fresh: OutRow[] = []
  for (const r of mixRows) {
    const spare = spares.get(upper(r.id))
    if (spare) {
      if (!rewrites.has(upper(r.id)))
        rewrites.set(upper(r.id), { ...r, id: spare.id, time: spare.time })
    } else if (!CONTROL_TAGS.has(r.purposeTag) && !existing.has(upper(r.id))) fresh.push(r)
  }
  const missing = plan.replace.length - rewrites.size
  const added = fresh.slice(0, Math.min(plan.room, plan.add + missing))
  const rows = firstRows.map((r) => rewrites.get(upper(r.id)) ?? r)
  return { rows: [...rows, ...added], added: added.length, rewritten: rewrites.size }
}

/**
 * One extra call for what the phase still lacks (docs/04 inject mix and role coverage),
 * within the phase's max row count: spare NOISE / PRESSURE rows are rewritten first, new rows
 * are added only while there is room. Undefined when the phase is complete or full.
 */
async function completeMix(
  input: StepInput,
  phase: Phase,
  first: StageResult<MselPhaseOutput>,
): Promise<MixResult | undefined> {
  const { scenario: s, env } = input
  const base = mselVars(input, phase, true)
  const maxRows = phaseRowCap(phaseMinutes(phase))
  const ids = first.output.rows.map((r) => upper(r.id))
  const once = (r: MselRow): boolean => ids.filter((x) => x === upper(r.id)).length === 1
  const plan = planMixCompletion(s, phase, maxRows, env.domain, once)
  const extra = { stage: 'msel_phase' as const, itemId: phase.id }
  if (plan.skipped.length)
    env.ctx.log(
      `msel_phase ${phase.index + 1}: the phase is at its ${maxRows}-row limit; not asked for ${plan.skipped.length} more row(s)`,
      'warn',
      extra,
    )
  if (!plan.needs.length) return undefined
  env.ctx.log(
    `msel_phase ${phase.index + 1}: completing the mix — ${plan.replace.length} spare row(s) to rewrite, up to ${plan.add} to add`,
    'info',
    extra,
  )
  const current = s.msel.filter((r) => r.phaseId === phase.id)
  const fix = await call<MselPhaseOutput>(input, {
    ...base,
    priorRows: [...(base.priorRows as unknown[]), ...current.map((r) => rowVars(r, s.roles))],
    targetRowCount: plan.needs.length,
    maxRowCount: plan.needs.length,
    mixPass: true,
    mixGaps: plan.needs,
    mixReplaceRows: plan.replace.map((r) => rowVars(r, s.roles)),
    mixAddCount: plan.add,
  })
  sumTokens(first.run, fix.run)
  const rows = rekeyCitations(fix.output.rows, fix.retrieved, first.retrieved)
  return mergeMixRows(first.output.rows, rows, plan, current)
}

async function stepMselPhase(input: StepInput): Promise<StageRun> {
  const { scenario: s, step, env } = input
  const phase = s.phases.find((p) => p.id === step.itemId)
  if (!phase) throw new AppError('NOT_FOUND', `No phase ${step.itemId} in scenario ${s.id}`)
  const owned = new Set(s.msel.filter((x) => x.phaseId === phase.id).map((x) => x.id))
  const r = await call<MselPhaseOutput>(input, mselVars(input, phase))
  let mapped = applyMselPhase(s, phase, r.output, r.retrieved)
  const mix = await completeMix(input, phase, r)
  const extra = { stage: 'msel_phase' as const, itemId: phase.id }
  if (mix) {
    mapped = applyMselPhase(s, phase, { rows: mix.rows }, r.retrieved)
    env.ctx.log(
      `msel_phase ${phase.index + 1}: mix pass rewrote ${mix.rewritten} and added ${mix.added} row(s)`,
      'info',
      extra,
    )
  }
  for (const row of mapped.rows) owned.add(row.id)
  reportMapping(s, phase, mapped, env.ctx, owned)
  ensureDecisionPoint(s, phase, env)
  reportStructure(repairStructure(s), env.ctx, extra)
  trimOverfill(input, phase)
  const live = new Set(s.msel.map((x) => x.id))
  noteFacility(
    s,
    mapped.rows.filter((x) => live.has(x.id)),
    env,
  )
  await writeDoc(env, s, 'overview', renderMselMarkdown(s), `msel_phase ${phase.index + 1}`)
  return r.run
}

/** A phase the first call overfilled is trimmed to its max row count, coverage kept (#167). */
function trimOverfill(input: StepInput, phase: Phase): void {
  const { scenario: s, env } = input
  const maxRows = phaseRowCap(phaseMinutes(phase))
  const drop = new Set(overfillRows(s, phase, maxRows, env.domain))
  if (!drop.size) return
  s.msel = s.msel.filter((r) => !drop.has(r))
  env.ctx.log(
    `msel_phase ${phase.index + 1}: ${drop.size} row(s) over the ${maxRows}-row limit dropped (${[...drop].map((r) => r.id).join(', ')})`,
    'warn',
    { stage: 'msel_phase', itemId: phase.id },
  )
}

/** Log the deterministic structural repairs; true when anything changed. */
export function reportStructure(
  fix: StructureRepair,
  ctx: JobContext,
  extra: { stage: Stage; itemId?: string },
): boolean {
  for (const d of fix.duplicates)
    ctx.log(`Row ${d.rowId} dropped: it repeats row ${d.of}`, 'warn', extra)
  for (const id of fix.extraEndex)
    ctx.log(`Row ${id} dropped: one ENDEX row closes the exercise`, 'warn', extra)
  for (const t of fix.retimed)
    ctx.log(
      `Row ${t.rowId} moved from ${t.from} to ${t.to}: it lay outside its phase or after ENDEX`,
      'warn',
      extra,
    )
  return !!(fix.duplicates.length || fix.extraEndex.length || fix.retimed.length)
}

/**
 * The decision phase must leave with its DECISION_POINT. When the model and the mix pass both
 * failed to tag one, the row that reads like the decision is re-tagged and the change recorded,
 * so the facilitator sees the call and the critique can judge its scope.
 */
function ensureDecisionPoint(s: Scenario, phase: Phase, env: Env): void {
  const row = pickDecisionRow(s, phase, env.domain)
  if (!row) return
  row.purposeTag = 'DECISION_POINT'
  const w: LintWarning = {
    code: DECISION_POINT_RETAGGED,
    severity: 'info',
    message: `Row ${row.id} was re-tagged DECISION_POINT: the model tagged no decision point in phase ${phase.index + 1}; check that it is the one high-consequence call`,
    source: 'lint',
    rowId: row.id,
  }
  s.warnings = s.warnings.filter((x) => !(x.code === DECISION_POINT_RETAGGED && x.rowId === row.id))
  s.warnings.push(w)
  env.ctx.log(w.message, 'warn', { stage: 'msel_phase', itemId: phase.id })
}

/** Record FACILITY_UNKNOWN_ID for the rows just written (#84); earlier ones for them are gone. */
function noteFacility(s: Scenario, rows: MselRow[], env: Env): void {
  const ids = new Set(rows.map((r) => r.id))
  s.warnings = s.warnings.filter((w) => !(w.code === FACILITY_UNKNOWN_ID && ids.has(w.rowId ?? '')))
  for (const row of rows) {
    for (const w of lintRowFacility(row, env.facility)) {
      s.warnings.push(w)
      env.ctx.log(w.message, 'warn', { stage: 'msel_phase', itemId: row.phaseId })
    }
  }
}

async function stepHandbook(input: StepInput): Promise<StageRun> {
  const { scenario: s, env } = input
  const r = await call<HandbookOutput>(input, vars(input))
  applyHandbook(s, r.output)
  await writeDoc(env, s, 'handbook', renderHandbookMarkdown(s, r.output), 'controller_handbook')
  return r.run
}

async function refreshHandbookSection(
  env: Env,
  s: Scenario,
  section: 'rubric' | 'hotwash',
): Promise<void> {
  const pending = env.docs?.get('handbook')
  if (!pending && !s.documents.handbook) return
  const md = pending?.md ?? (await env.deps.store.readScenarioDoc(env.root, s.id, 'handbook'))
  const body = section === 'rubric' ? rubricSection(s) : hotwashSection(s)
  await writeDoc(env, s, 'handbook', upsertSection(md, section, body), `handbook ${section}`)
}

async function stepRubric(input: StepInput): Promise<StageRun> {
  const { scenario: s, env } = input
  const r = await call<RubricOutput>(input, vars(input))
  for (const fix of applyRubric(s, r.output))
    env.ctx.log(
      `rubric: "${fix.metric}" linked unknown inject ${fix.from}; ${fix.to ? `relinked to ${fix.to}` : 'dropped'}`,
      'warn',
      { stage: 'rubric' },
    )
  await refreshHandbookSection(env, s, 'rubric')
  return r.run
}

/**
 * Objectives → Core Capabilities and one EEG per capability (#421). Every critical task must
 * cite a retrieved plan section, so the stage refuses to run against an empty retrieval
 * instead of relaxing the requirement: an EEG without plan citations is a generic one.
 */
async function stepEeg(input: StepInput): Promise<StageRun> {
  const { scenario: s, env } = input
  const capabilities = orderedCapabilities(env.domain.profile.coreCapabilities)
  const r = await call<EegOutput>(
    input,
    vars(input, {
      capabilities,
      objectives: s.objectives.map((o) => ({ name: o.name, text: o.text })),
    }),
    undefined,
    EEG_NO_SECTIONS,
  )
  const applied = applyEeg(s, r.output, r.retrieved)
  clearPipelineWarnings(s, (w) => w.rowId === EEG_ROW)
  noteDropped(s, 'eeg', applied.dropped, env.ctx)
  const extra = { stage: 'eeg' as const }
  for (const name of applied.unknownObjectives)
    env.ctx.log(`eeg: "${name}" is not an objective of this scenario; skipped`, 'warn', extra)
  for (const u of applied.unknownRows)
    env.ctx.log(
      `eeg: task "${u.task}" named unknown row(s) ${u.ids.join(', ')}; dropped`,
      'warn',
      extra,
    )
  for (const u of applied.unknownRoles)
    env.ctx.log(`eeg: task "${u.task}" expected "${u.key}", which is not a role key`, 'warn', extra)
  for (const id of applied.unknownCapabilities)
    env.ctx.log(`eeg: "${id}" is not one of the 32 Core Capabilities; dropped`, 'warn', extra)
  if (applied.keptLocked)
    env.ctx.log(
      `eeg: ${applied.keptLocked} locked task(s) kept from the previous run`,
      'info',
      extra,
    )
  env.ctx.log(
    `eeg: ${s.evaluation.eegs.length} evaluation guide(s), ${s.evaluation.eegs.reduce((n, e) => n + e.criticalTasks.length, 0)} critical task(s)`,
    'info',
    extra,
  )
  return r.run
}

async function stepBriefing(input: StepInput): Promise<StageRun> {
  const { scenario: s, env } = input
  const firstRows = s.msel.slice(0, 4).map((r) => rowVars(r, s.roles))
  const r = await call<BriefingOutput>(input, vars(input, { firstRows }))
  await writeDoc(env, s, 'briefing', renderBriefingMarkdown(s, r.output), 'player_briefing')
  return r.run
}

async function stepHotwash(input: StepInput): Promise<StageRun> {
  const { scenario: s, env } = input
  const r = await call<HotwashOutput>(input, vars(input))
  applyHotwash(s, r.output)
  await writeDoc(env, s, 'hotwash', renderHotwashMarkdown(s), 'hotwash')
  await refreshHandbookSection(env, s, 'hotwash')
  return r.run
}

/** Phases that have at least one error-severity critique issue on an unlocked row. */
function phasesToRevise(s: Scenario, issues: CritiqueOutput['issues']): Map<string, string[]> {
  const byPhase = new Map<string, string[]>()
  for (const i of issues) {
    if (i.severity !== 'error' || !i.rowId) continue
    const row = s.msel.find((r) => r.id === i.rowId)
    if (!row || row.locked) continue
    byPhase.set(row.phaseId, [
      ...(byPhase.get(row.phaseId) ?? []),
      `${i.rowId}: ${i.message} Fix: ${i.suggestion}`,
    ])
  }
  return byPhase
}

/**
 * Row-level revision: the model returns only the flagged rows rewritten (same id and time);
 * they replace the originals by id. Every other row is kept verbatim (citations included), so
 * the rubric's links stay intact. Returns the ids actually rewritten.
 */
async function revisePhaseRows(
  input: StepInput,
  phase: Phase,
  notes: string[],
): Promise<Set<string>> {
  const { scenario: s, env } = input
  const flagged = new Set(notes.map((n) => n.split(':')[0]!.trim().toUpperCase()))
  const current = s.msel.filter((r) => r.phaseId === phase.id)
  const step: StepKey = { stage: 'msel_phase', itemId: phase.id }
  const mselInput: StepInput = { ...input, step }
  const base = mselVars(mselInput, phase, true)
  const fix = await call<MselPhaseOutput>(mselInput, {
    ...base,
    priorRows: [...(base.priorRows as unknown[]), ...current.map((r) => rowVars(r, s.roles))],
    targetRowCount: flagged.size,
    maxRowCount: flagged.size,
    revisePass: true,
    reviseNotes: dataSafe(notes),
  })
  const prev = runFor(s, step)
  if (prev) sumTokens(prev, fix.run)
  const rows = await requireSpecificSources(mselInput, base, fix, prev)
  const byId = new Map(current.map((r) => [r.id.toUpperCase(), r]))
  const replacements = rows.flatMap((r) => {
    const original = byId.get(r.id.trim().toUpperCase())
    if (!original || original.locked || !flagged.has(original.id.toUpperCase())) return []
    // A revision keeps the row's id, time and tag: a DECISION_POINT must survive its rewrite.
    return [{ ...r, id: original.id, time: original.time, purposeTag: original.purposeTag }]
  })
  if (!replacements.length) return new Set()
  const rewritten = new Set(replacements.map((r) => r.id))
  const keepIds = new Set(current.map((r) => r.id).filter((id) => !rewritten.has(id)))
  const mapped = applyMselPhase(s, phase, { rows: replacements }, fix.retrieved, { keepIds })
  reportMapping(s, phase, mapped, env.ctx, rewritten)
  return rewritten
}

type OutRow = MselPhaseOutput['rows'][number]
const GENERIC_SOURCE =
  /^\s*(?:the\s+)?(?:facilitator|controller|simcell|sim cell|exercise (?:director|control)|moderator)\s*$/i
const CONTROL_TAGS = new Set<OutRow['purposeTag']>(['STARTEX', 'TIME_JUMP', 'ENDEX'])

/** A revised non-control row sourced from a generic "Facilitator" (#85): flat and unplayable. */
const hasGenericSource = (r: OutRow): boolean =>
  GENERIC_SOURCE.test(r.from) &&
  !CONTROL_TAGS.has(r.purposeTag) &&
  !/^Facilitator prompt/i.test(r.event)

/**
 * The revision pass must name the outside party that delivers each row. Rows that came back
 * from a generic facilitator get one more call with that note; whatever is still generic is
 * re-sourced deterministically from its channel (sources.ts).
 */
async function requireSpecificSources(
  input: StepInput,
  base: Record<string, unknown>,
  fix: StageResult<MselPhaseOutput>,
  prev: StageRun | undefined,
): Promise<OutRow[]> {
  let rows = fix.output.rows
  const generic = rows.filter(hasGenericSource)
  if (!generic.length) return rows
  const notes = generic.map(
    (r) =>
      `${r.id}: "from" is "${r.from.trim()}". Name the specific outside party that delivers this inject (a helpdesk, a SIEM or system alert, a vendor NOC, a tenant employee, a gate agent, a dispatcher, a reporter, a social media user); keep the id, time, tag and substance.`,
  )
  input.env.ctx.log(
    `critique: ${generic.length} revised row(s) sourced from a generic facilitator; asking for a specific source`,
    'info',
    { stage: 'critique', ...(input.step.itemId ? { itemId: input.step.itemId } : {}) },
  )
  try {
    const again = await call<MselPhaseOutput>(input, {
      ...base,
      targetRowCount: generic.length,
      maxRowCount: generic.length,
      revisePass: true,
      reviseNotes: dataSafe(notes),
    })
    if (prev) sumTokens(prev, again.run)
    const byId = new Map(again.output.rows.map((r) => [r.id.trim().toUpperCase(), r]))
    rows = rows.map((r) => byId.get(r.id.trim().toUpperCase()) ?? r)
  } catch (err) {
    if (!(err instanceof StageFailure)) throw err
    if (prev) sumTokens(prev, err.run)
  }
  return rows.map((r) => (hasGenericSource(r) ? { ...r, from: sourceFor(r) } : r))
}

/**
 * Bounded self-correction: each phase with error-severity row issues gets one revision call.
 * A revision that fails (invalid output after the repair round, a provider error) is skipped
 * and logged: the original rows stay and the critique still finishes. Cancellation propagates.
 */
export async function reviseFromCritique(
  input: StepInput,
  issues: CritiqueOutput['issues'],
  critiqueRun: StageRun,
): Promise<Set<string>> {
  const { scenario: s, env } = input
  const rewritten = new Set<string>()
  for (const [phaseId, notes] of phasesToRevise(s, issues)) {
    const phase = s.phases.find((p) => p.id === phaseId)
    if (!phase) continue
    env.ctx.throwIfCancelled()
    const step: StepKey = { stage: 'msel_phase', itemId: phaseId }
    const extra = { stage: 'critique', itemId: phaseId }
    env.ctx.progress(0.95, `Revising ${stepLabel(s, step)} from the critique`, extra)
    try {
      const ids = await revisePhaseRows(input, phase, notes)
      ids.forEach((id) => rewritten.add(id))
      env.ctx.log(
        `critique: ${ids.size} of ${notes.length} flagged row(s) in phase ${phase.index + 1} rewritten`,
        'info',
        extra,
      )
    } catch (err) {
      const e = toAppError(err)
      if (e.code === 'CANCELLED' || env.ctx.signal.aborted) throw err
      if (err instanceof StageFailure) sumTokens(critiqueRun, err.run)
      env.ctx.log(
        `critique: revision of phase ${phase.index + 1} skipped, original rows kept — ${e.message}`,
        'warn',
        extra,
      )
    }
  }
  if (rewritten.size) {
    for (const phase of s.phases) ensureDecisionPoint(s, phase, env)
    await writeDoc(env, s, 'overview', renderMselMarkdown(s), 'critique revision')
  }
  return rewritten
}

/** Lints are recomputed here; critique issues replace the previous critique's. */
const REVISION_NOTE = ' (row rewritten once from this note)'

type Issue = CritiqueOutput['issues'][number]

/** A critique issue that claims a row's source is a player role. */
const SOURCE_CLAIM = /\bplayer role\b/i
const SOURCE_VERBS = /\b(?:presents?|attribut\w*|sourced|comes?|originat\w*|from)\b/i
const NARRATION = /\bnarrat\w*\b/i

/**
 * The critique over-flags rows whose source is Facilitator, Helpdesk, Social Media or an
 * automated system as "from a player role" (#85). Such a claim is checked against the row:
 * when `from` names no player role, the issue is dismissed.
 */
function dismissFalseSourceIssues(s: Scenario, issues: Issue[], ctx: JobContext): Issue[] {
  return issues.filter((i) => {
    if (!i.rowId || !SOURCE_CLAIM.test(i.message) || !SOURCE_VERBS.test(i.message)) return true
    if (NARRATION.test(i.message)) return true
    const row = s.msel.find((r) => r.id === i.rowId)
    if (!row || roleNamedBy(row.from, s.roles)) return true
    ctx.log(
      `critique: dismissed "${i.message.slice(0, 90)}…" — row ${row.id} comes from "${row.from}", not a player role`,
      'info',
      { stage: 'critique' },
    )
    return false
  })
}

/** Facility-id lint hits as error issues, so the revision pass rewrites those rows too (#84). */
function facilityIssues(s: Scenario, facility: FacilityFacts): Issue[] {
  return lintFacilityIds(s, facility).map((w) => ({
    severity: 'error' as const,
    rowId: w.rowId!,
    message: w.message,
    suggestion: w.suggestion ?? '',
  }))
}

/** Rubric links to rows a revision dropped or renamed are repaired or pruned (#86). */
export function pruneRubricLinks(s: Scenario, ctx: JobContext): void {
  if (!s.rubric) return
  for (const fix of repairRubricLinks(s.rubric.metrics, s.msel))
    ctx.log(
      `rubric: "${fix.metric}" linked ${fix.from}, which the revision removed; ${fix.to ? `relinked to ${fix.to}` : 'link dropped'}`,
      'warn',
      { stage: 'critique' },
    )
}

/**
 * Row-level structural problems as error issues for the revision pass (#164, #174): rows
 * outside their phase or after ENDEX, near-duplicates, injects in a player's voice, and
 * identifiers the facility facts do not list (the message names the known ones).
 */
export function structuralIssues(s: Scenario, env: Env): Issue[] {
  const unlocked = new Set(s.msel.filter((r) => !r.locked).map((r) => r.id))
  return [
    ...facilityIssues(s, env.facility),
    ...structuralLints(s, env.domain).map((w) => ({
      severity: 'error' as const,
      rowId: w.rowId!,
      message: w.message,
      suggestion: w.suggestion ?? '',
    })),
  ].filter((i) => !!i.rowId && unlocked.has(i.rowId))
}

/**
 * After the critique revision: repair what code can, then one more revision round for the
 * structural problems still left; rows still in a player's voice become facilitator prompts.
 */
export async function reviseStructureAgain(
  input: StepInput,
  critiqueRun: StageRun,
  rewritten: Set<string>,
  repairedBefore: boolean,
): Promise<void> {
  const { scenario: s, env } = input
  const extra = { stage: 'critique' as const }
  let changed = reportStructure(repairStructure(s), env.ctx, extra) || repairedBefore
  const again = structuralIssues(s, env)
  if (again.length) {
    env.ctx.log(
      `critique: ${again.length} structural issue(s) left after the revision; revising once more`,
      'info',
      extra,
    )
    for (const id of await reviseFromCritique(input, again, critiqueRun)) rewritten.add(id)
    changed = reportStructure(repairStructure(s), env.ctx, extra) || changed
  }
  const voiced = new Set(
    structuralLints(s, env.domain)
      .filter((w) => w.code === INJECT_PLAYER_VOICE)
      .map((w) => w.rowId!),
  )
  for (const id of convertToFacilitatorPrompt(s, voiced)) {
    env.ctx.log(
      `Row ${id} still announced a player's decision; turned into a facilitator prompt`,
      'warn',
      extra,
    )
    changed = true
  }
  if (changed) await writeDoc(env, s, 'overview', renderMselMarkdown(s), 'structural repair')
}

/**
 * The critique call. A reply without any JSON (a context window the full request overflows,
 * #347) is retried once with a compact request; when that also has none, the step fails with
 * an error that says why and what to change, instead of an empty result.
 */
async function callCritique(input: StepInput): Promise<StageResult<CritiqueOutput>> {
  const { scenario: s, env } = input
  const full = vars(input, { lints: lintScenario(s, env.domain) })
  try {
    return await call<CritiqueOutput>(input, full)
  } catch (err) {
    if (!(err instanceof StageFailure) || !err.noJson) throw err
    env.ctx.log(
      'critique: the model returned no JSON; retrying with a shorter request (rows shortened, 3 plan sections)',
      'warn',
      { stage: 'critique' },
    )
    try {
      const r = await call<CritiqueOutput>(input, compactCritiqueVars(full), COMPACT_SECTIONS)
      sumTokens(r.run, err.run)
      return r
    } catch (again) {
      if (!(again instanceof StageFailure) || !again.noJson) throw again
      sumTokens(again.run, err.run)
      again.run.error = critiqueContextError(again.run.error?.split('\n').at(-1) ?? '')
      throw new StageFailure(again.run, true)
    }
  }
}

async function stepCritique(input: StepInput): Promise<StageRun> {
  const { scenario: s, env } = input
  const repaired = reportStructure(repairStructure(s), env.ctx, { stage: 'critique' })
  const r = await callCritique(input)
  const issues = dismissFalseSourceIssues(s, r.output.issues, env.ctx)
  const rewritten = await reviseFromCritique(input, [...issues, ...structuralIssues(s, env)], r.run)
  await reviseStructureAgain(input, r.run, rewritten, repaired)
  pruneRubricLinks(s, env.ctx)
  // Each note carries what its row read after the revision, so a later edit marks it stale.
  const at = nowIso()
  const critique: LintWarning[] = issues.map((i) =>
    withBasis(
      {
        code: CRITIQUE,
        severity: i.severity,
        message: i.message + (i.rowId && rewritten.has(i.rowId) ? REVISION_NOTE : ''),
        suggestion: i.suggestion,
        source: 'critique',
        ...(i.rowId ? { rowId: i.rowId } : {}),
      },
      s,
      at,
    ),
  )
  // Pipeline warnings about rows that no longer exist go; the lints are recomputed.
  const rowIds = new Set(s.msel.map((x) => x.id))
  const live = (w: LintWarning): boolean =>
    !w.rowId || w.rowId === OVERVIEW_ROW || w.rowId === EEG_ROW || rowIds.has(w.rowId)
  s.warnings = [
    ...s.warnings.filter(
      (w) => PIPELINE_WARNINGS.has(w.code) && w.code !== FACILITY_UNKNOWN_ID && live(w),
    ),
    ...lintFacilityIds(s, env.facility),
    ...lintScenario(s, env.domain),
    ...critique,
  ]
  return r.run
}

const EXECUTORS: Record<string, (input: StepInput) => Promise<StageRun>> = {
  scenario_overview: stepOverview,
  objectives_roles: stepObjectivesRoles,
  phase_plan: stepPhasePlan,
  msel_phase: stepMselPhase,
  controller_handbook: stepHandbook,
  rubric: stepRubric,
  eeg: stepEeg,
  player_briefing: stepBriefing,
  hotwash: stepHotwash,
  critique: stepCritique,
}

function failedRun(step: StepKey, err: unknown, startedAt: string): StageRun {
  const e = toAppError(err)
  return {
    stage: step.stage,
    ...(step.itemId ? { itemId: step.itemId } : {}),
    startedAt,
    finishedAt: nowIso(),
    status: 'error',
    error: e.code === 'CANCELLED' ? 'Cancelled' : e.message,
    repairAttempts: 0,
  }
}

interface ExecuteOptions {
  /** Applied to the working copy after the step succeeded, before the checkpoint. */
  onSuccess?: (s: Scenario) => void
  /** Record a failed run on the scenario (pipeline) or leave the scenario untouched (re-run). */
  recordFailure: boolean
}

/** The failed StageRun for `step`; a nested stage's run (a revision call) never stands in for it. */
function runOfFailure(step: StepKey, err: unknown, startedAt: string): StageRun {
  if (err instanceof StageFailure && sameStep(err.run, step)) return err.run
  return failedRun(step, err, startedAt)
}

/**
 * Run one step on a copy of the scenario and checkpoint the copy only when it succeeds, so a
 * failed or cancelled step never persists half-applied rows. On failure the run is recorded
 * on the scenario as it is on disk (when `recordFailure`). Rethrows failures.
 */
async function executeStep(input: StepInput, opts: ExecuteOptions): Promise<Scenario> {
  const { env, step } = input
  const exec = EXECUTORS[step.stage]
  if (!exec)
    throw new AppError('VALIDATION', `Stage ${step.stage} cannot be run by the scenario pipeline`)
  const startedAt = nowIso()
  const label = stepLabel(input.scenario, step)
  env.ctx.log(`▶ ${label}`, 'info', {
    stage: step.stage,
    ...(step.itemId ? { itemId: step.itemId } : {}),
  })
  const work = structuredClone(input.scenario)
  const docs: DocBuffer = new Map()
  try {
    const run = await exec({ ...input, env: { ...env, docs }, scenario: work })
    recordRun(work, run)
    noteStaleInjects(input.scenario, work, env.ctx)
    opts.onSuccess?.(work)
    work.updatedAt = nowIso()
    const saved = await save(env, work, `${label} ok`)
    return await flushDocs(env, saved, docs)
  } catch (err) {
    if (opts.recordFailure) {
      const run = runOfFailure(step, err, startedAt)
      await env.deps.store
        .getScenario(env.root, input.scenario.id)
        .then((onDisk) => {
          recordRun(onDisk, run)
          return save(env, onDisk, `${label} failed`)
        })
        .catch(() => undefined)
    }
    throw err
  }
}

/** Inject runs of rows the step changed or removed become stale (#207). */
function noteStaleInjects(before: Scenario, after: Scenario, ctx: JobContext): void {
  const message = describeStaleInjects(markInjectsStale(before.msel, after))
  if (message) ctx.log(message, 'warn')
}

/** Write the documents a step buffered, after its checkpoint; returns the scenario with their paths. */
async function flushDocs(env: Env, saved: Scenario, docs: DocBuffer): Promise<Scenario> {
  if (!docs.size) return saved
  const plain: Env = { ...env }
  delete plain.docs
  for (const [kind, { md, note }] of docs) await writeDoc(plain, saved, kind, md, note)
  return saved
}

export function stepLabel(s: Scenario, step: StepKey): string {
  if (step.stage !== 'msel_phase' || !step.itemId) return step.stage
  const p = s.phases.find((x) => x.id === step.itemId)
  return p ? `msel_phase ${p.index + 1}/${s.phases.length} "${p.title}"` : 'msel_phase'
}

export async function openEnv(root: string, scenario: Scenario, ctx: JobContext): Promise<Env> {
  const deps = await pipelineDeps()
  const [project, index, idea] = await Promise.all([
    deps.loadProject(root),
    deps.openIndex(root),
    findIdea(root, scenario.id, scenario.brief.ideaId),
  ])
  const facility = await deps.loadFacilityFacts(root, project)
  const domain = domainContext(project, scenario)
  return { root, deps, index, project, facility, domain, ...(idea ? { idea } : {}), ctx }
}

/** Run every step that has no ok run yet, in order. This is both "generate" and "continue". */
export async function runPipeline(
  root: string,
  scenarioId: string,
  ctx: JobContext,
): Promise<Scenario> {
  const deps = await pipelineDeps()
  let scenario = await deps.store.getScenario(root, scenarioId)
  const env = await openEnv(root, scenario, ctx)
  for (;;) {
    ctx.throwIfCancelled()
    const step = nextStep(scenario)
    if (!step) break
    const plan = planSteps(scenario)
    const at = plan.findIndex((p) => sameStep(p, step))
    ctx.progress(at / plan.length, stepLabel(scenario, step), {
      stage: step.stage,
      ...(step.itemId ? { itemId: step.itemId } : {}),
    })
    scenario = await executeStep({ env, scenario, step }, { recordFailure: true })
  }
  if (scenario.status === 'draft') {
    scenario.status = 'ready'
    scenario = await save(env, scenario, 'pipeline complete')
  }
  ctx.progress(1, 'Scenario ready')
  return scenario
}

/**
 * Re-run exactly one step (with optional designer instructions) and mark downstream stale.
 * Nothing is written unless the step succeeds: a failed or cancelled re-run leaves the
 * scenario exactly as it was.
 */
export async function rerunStep(
  root: string,
  scenarioId: string,
  step: StepKey,
  instructions: string | undefined,
  ctx: JobContext,
): Promise<Scenario> {
  const deps = await pipelineDeps()
  const scenario = await deps.store.getScenario(root, scenarioId)
  if (!planSteps(scenario).some((p) => sameStep(p, step))) {
    throw new AppError(
      'VALIDATION',
      `Step ${stepKey(step)} is not part of this scenario's pipeline`,
    )
  }
  const env = await openEnv(root, scenario, ctx)
  ctx.progress(0.1, `Re-running ${stepLabel(scenario, step)}`, { stage: step.stage })
  let stale: StepKey[] = []
  const result = await executeStep(
    { env, scenario, step, ...(instructions ? { instructions } : {}) },
    {
      recordFailure: false,
      onSuccess: (s) => {
        if (INDEPENDENT_STAGES.has(step.stage)) return
        stale = markStale(s, step)
        if (s.status === 'ready') s.status = 'draft'
      },
    },
  )
  if (stale.length) ctx.log(`Marked stale: ${stale.map(stepKey).join(', ')}`, 'info')
  ctx.progress(1, 'Done')
  return result
}
