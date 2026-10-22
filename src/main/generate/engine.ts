// The pipeline engine (#25): a fixed stage order with msel_phase expanded per phase, one
// StageRun per step kept in scenario.provenance, a checkpoint (scenario.json) after every
// step, resume from the first step without an ok run, and re-run of a single step that marks
// everything downstream stale (never auto-rerun).
import {
  exerciseMinutes,
  type BriefingOutput,
  type CritiqueOutput,
  type HandbookOutput,
  type HotwashOutput,
  type LintWarning,
  type MselPhaseOutput,
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
import {
  hotwashSection,
  renderBriefingMarkdown,
  renderHandbookMarkdown,
  renderHotwashMarkdown,
  renderMselMarkdown,
  rubricSection,
  upsertSection,
} from './docs'
import { findIdea } from './ideas'
import { decisionPhaseIndex, lintScenario, phaseMixGaps } from './lint'
import { BEATS_MARKER, type MselMapResult } from './mappers'
import type { RetrievedChunk } from './retrieval'
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
  'player_briefing',
  'hotwash',
  'critique',
]

export const CITATION_DROPPED = 'CITATION_DROPPED'
export const ROLE_KEY_UNKNOWN = 'ROLE_KEY_UNKNOWN'
export const LOCATION_UNGROUNDED = 'LOCATION_UNGROUNDED'
/** Warnings the mappers record while generating; kept when the lints are recomputed. */
const PIPELINE_WARNINGS = new Set([CITATION_DROPPED, ROLE_KEY_UNKNOWN, LOCATION_UNGROUNDED])
/** rowId the overview's dropped citations are recorded under. */
const OVERVIEW_ROW = 'overview'

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

interface Env {
  root: string
  deps: PipelineDeps
  index: SearchIndex
  project: Project
  idea?: ScenarioIdea
  ctx: JobContext
}

interface StepInput {
  env: Env
  scenario: Scenario
  step: StepKey
  instructions?: string
}

const save = (env: Env, s: Scenario, note: string): Promise<Scenario> =>
  env.deps.store.saveScenario(env.root, s, { by: 'ai', snapshot: false, note })

/** Write a document; the store records its path in scenario.json, so mirror that in memory. */
async function writeDoc(
  env: Env,
  s: Scenario,
  kind: 'overview' | 'handbook' | 'briefing' | 'hotwash',
  md: string,
  note: string,
): Promise<void> {
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
async function call<T>(input: StepInput, vars: Record<string, unknown>): Promise<StageResult<T>> {
  const { env, step } = input
  const result = await runStage<T>({
    stage: step.stage,
    ...(step.itemId ? { itemId: step.itemId } : {}),
    projectPath: env.root,
    vars,
    ctx: env.ctx,
    deps: env.deps,
    index: env.index,
  })
  return { ...result, output: stripKeysDeep(result.output) }
}

const vars = (input: StepInput, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...baseVars({
    project: input.env.project,
    scenario: input.scenario,
    ...(input.env.idea ? { idea: input.env.idea } : {}),
    ...(input.instructions ? { instructions: input.instructions } : {}),
  }),
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
  await writeDoc(
    input.env,
    input.scenario,
    'overview',
    renderMselMarkdown(input.scenario),
    'objectives_roles',
  )
  return r.run
}

async function stepPhasePlan(input: StepInput): Promise<StageRun> {
  const r = await call<PhasePlanOutput>(input, vars(input))
  const withBeats: PhasePlanOutput = {
    phases: r.output.phases.map((p) => ({
      ...p,
      goal: p.beats.length ? `${p.goal.trim()}\n\n${BEATS_MARKER} ${p.beats.join('; ')}.` : p.goal,
    })),
  }
  applyPhasePlan(input.scenario, withBeats)
  return r.run
}

/**
 * Variables for one msel_phase call. `withCurrent` (mix and revision passes) counts the
 * phase's own rows when numbering; a fresh pass counts earlier phases and locked rows only.
 */
function mselVars(input: StepInput, phase: Phase, withCurrent = false): Record<string, unknown> {
  const s = input.scenario
  const prior = s.msel.filter((r) => {
    const p = s.phases.find((x) => x.id === r.phaseId)
    return p && p.index < phase.index
  })
  const current = s.msel.filter((r) => r.phaseId === phase.id)
  const locked = current.filter((r) => r.locked)
  const counted = [...prior, ...(withCurrent ? current : locked)]
  const numbers = counted.map((r) => Number(/^I-(\d+)/.exec(r.id)?.[1] ?? 0))
  const minutes = exerciseMinutes(phase.endTime) - exerciseMinutes(phase.startTime)
  const dp = decisionPhaseIndex(s.phases.length)
  return vars(input, {
    phase: {
      number: phase.index + 1,
      title: phase.title,
      goal: phase.goal,
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
    targetRowCount: Math.max(4, Math.round(minutes / 12)),
    maxRowCount: Math.max(4, Math.round(minutes / 12)) + 3,
  })
}

/** Log and record what the mapper changed; `owned` rows' earlier pipeline warnings are replaced. */
function reportMapping(
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

const sumTokens = (into: StageRun, run: StageRun): void => {
  into.inputTokens = (into.inputTokens ?? 0) + (run.inputTokens ?? 0)
  into.outputTokens = (into.outputTokens ?? 0) + (run.outputTokens ?? 0)
  into.costUsd = (into.costUsd ?? 0) + (run.costUsd ?? 0)
}

/**
 * One extra call that asks only for the rows the phase still lacks (docs/04 inject mix and
 * role coverage). Returns the rows to merge, or [] when the phase is complete.
 */
async function completeMix(
  input: StepInput,
  phase: Phase,
  first: StageResult<MselPhaseOutput>,
): Promise<MselPhaseOutput['rows']> {
  const { scenario: s, env } = input
  const gaps = phaseMixGaps(s, phase)
  if (!gaps.length) return []
  env.ctx.log(
    `msel_phase ${phase.index + 1}: completing the mix — ${gaps.map((g) => g.code).join(', ')}`,
    'info',
    { stage: 'msel_phase', itemId: phase.id },
  )
  const current = s.msel.filter((r) => r.phaseId === phase.id)
  const base = mselVars(input, phase, true)
  const fix = await call<MselPhaseOutput>(input, {
    ...base,
    priorRows: [...(base.priorRows as unknown[]), ...current.map((r) => rowVars(r, s.roles))],
    targetRowCount: gaps.length,
    maxRowCount: gaps.length + 1,
    mixPass: true,
    mixGaps: gaps.map((g) => g.need),
  })
  sumTokens(first.run, fix.run)
  return rekeyCitations(fix.output.rows, fix.retrieved, first.retrieved)
}

async function stepMselPhase(input: StepInput): Promise<StageRun> {
  const { scenario: s, step, env } = input
  const phase = s.phases.find((p) => p.id === step.itemId)
  if (!phase) throw new AppError('NOT_FOUND', `No phase ${step.itemId} in scenario ${s.id}`)
  const owned = new Set(s.msel.filter((x) => x.phaseId === phase.id).map((x) => x.id))
  const r = await call<MselPhaseOutput>(input, mselVars(input, phase))
  let mapped = applyMselPhase(s, phase, r.output, r.retrieved)
  const added = await completeMix(input, phase, r)
  if (added.length) {
    mapped = applyMselPhase(s, phase, { rows: [...r.output.rows, ...added] }, r.retrieved)
    env.ctx.log(
      `msel_phase ${phase.index + 1}: ${added.length} row(s) added by the mix pass`,
      'info',
      {
        stage: 'msel_phase',
        itemId: phase.id,
      },
    )
  }
  for (const row of mapped.rows) owned.add(row.id)
  reportMapping(s, phase, mapped, env.ctx, owned)
  await writeDoc(env, s, 'overview', renderMselMarkdown(s), `msel_phase ${phase.index + 1}`)
  return r.run
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
  if (!s.documents.handbook) return
  const md = await env.deps.store.readScenarioDoc(env.root, s.id, 'handbook')
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
  const byId = new Map(current.map((r) => [r.id.toUpperCase(), r]))
  const replacements = fix.output.rows.flatMap((r) => {
    const original = byId.get(r.id.trim().toUpperCase())
    if (!original || original.locked || !flagged.has(original.id.toUpperCase())) return []
    return [{ ...r, id: original.id, time: original.time }]
  })
  if (!replacements.length) return new Set()
  const rewritten = new Set(replacements.map((r) => r.id))
  const keepIds = new Set(current.map((r) => r.id).filter((id) => !rewritten.has(id)))
  const mapped = applyMselPhase(s, phase, { rows: replacements }, fix.retrieved, { keepIds })
  reportMapping(s, phase, mapped, env.ctx, rewritten)
  return rewritten
}

/**
 * Bounded self-correction: each phase with error-severity row issues gets one revision call.
 * A revision that fails (invalid output after the repair round, a provider error) is skipped
 * and logged: the original rows stay and the critique still finishes. Cancellation propagates.
 */
async function reviseFromCritique(
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
  if (rewritten.size) await writeDoc(env, s, 'overview', renderMselMarkdown(s), 'critique revision')
  return rewritten
}

/** Lints are recomputed here; critique issues replace the previous critique's. */
const REVISION_NOTE = ' (row rewritten once from this note)'

async function stepCritique(input: StepInput): Promise<StageRun> {
  const { scenario: s } = input
  const r = await call<CritiqueOutput>(input, vars(input, { lints: lintScenario(s) }))
  const rewritten = await reviseFromCritique(input, r.output.issues, r.run)
  const critique: LintWarning[] = r.output.issues.map((i) => ({
    code: 'CRITIQUE',
    severity: i.severity,
    message: i.message + (i.rowId && rewritten.has(i.rowId) ? REVISION_NOTE : ''),
    suggestion: i.suggestion,
    source: 'critique',
    ...(i.rowId ? { rowId: i.rowId } : {}),
  }))
  // Pipeline warnings about rows that no longer exist go; the lints are recomputed.
  const rowIds = new Set(s.msel.map((x) => x.id))
  const live = (w: LintWarning): boolean =>
    !w.rowId || w.rowId === OVERVIEW_ROW || rowIds.has(w.rowId)
  s.warnings = [
    ...s.warnings.filter((w) => PIPELINE_WARNINGS.has(w.code) && live(w)),
    ...lintScenario(s),
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
  try {
    const run = await exec({ ...input, scenario: work })
    recordRun(work, run)
    opts.onSuccess?.(work)
    work.updatedAt = nowIso()
    return await save(env, work, `${label} ok`)
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

export function stepLabel(s: Scenario, step: StepKey): string {
  if (step.stage !== 'msel_phase' || !step.itemId) return step.stage
  const p = s.phases.find((x) => x.id === step.itemId)
  return p ? `msel_phase ${p.index + 1}/${s.phases.length} "${p.title}"` : 'msel_phase'
}

async function openEnv(root: string, scenario: Scenario, ctx: JobContext): Promise<Env> {
  const deps = await pipelineDeps()
  const [project, index, idea] = await Promise.all([
    deps.loadProject(root),
    deps.openIndex(root),
    findIdea(root, scenario.id, scenario.brief.ideaId),
  ])
  return { root, deps, index, project, ...(idea ? { idea } : {}), ctx }
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
        stale = markStale(s, step)
        if (s.status === 'ready') s.status = 'draft'
      },
    },
  )
  if (stale.length) ctx.log(`Marked stale: ${stale.map(stepKey).join(', ')}`, 'info')
  ctx.progress(1, 'Done')
  return result
}
