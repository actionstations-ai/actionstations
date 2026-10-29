// generate:injects — inject_text then inject_media_brief for every MSEL row (or the rows
// asked for), in MSEL order so later injects see the facts earlier ones established. Each
// inject is saved as soon as it is written (versions pushed, row linked, StageRuns and
// warnings recorded on the scenario); one row failing does not stop the others. A row the
// job skips or fails leaves an inject_text run keyed by the row id (status skipped / error)
// and, for a failure, an INJECT_TEXT_FAILED warning on the row (#166); both go when the row
// later gets its inject.
import type { Inject, LintWarning, MselRow, Scenario, StageRun } from '@shared/schemas'
import { contextFor, regroundScenario, sameGrounding } from '../../grounding/project'
import type { JobContext } from '../../jobs/manager'
import { AppError, toAppError } from '../../lib/errors'
import { nowIso } from '../../lib/ids'
import { domainContext } from '../domain'
import { StageFailure } from '../stage'
import { injectDeps, type InjectDeps } from './deps'
import { runMediaBrief, type MediaBriefResult } from './media-brief-stage'
import { clearRowRecords, recordInjectRun, recordRowFailure, replaceInjectWarnings } from './store'
import {
  CITATION_DROPPED,
  INJECT_CONTENT_ISSUE,
  INJECT_FIELDS_INVALID,
  INJECT_FIELDS_REPAIRED,
  INJECT_TEMPLATE_MISSING,
  INJECT_TEXT_FALLBACK,
  INJECT_TYPE_FALLBACK,
  runInjectText,
  type InjectEnv,
} from './text-stage'

export const INJECT_TEXT_FAILED = 'INJECT_TEXT_FAILED'

export const TEXT_WARNING_CODES = [
  INJECT_FIELDS_INVALID,
  INJECT_FIELDS_REPAIRED,
  INJECT_CONTENT_ISSUE,
  INJECT_TYPE_FALLBACK,
  INJECT_TEMPLATE_MISSING,
  INJECT_TEXT_FALLBACK,
  CITATION_DROPPED,
]

export interface InjectsJobOptions {
  /** Rows to (re)generate. Without it: every row that has no finished inject yet. */
  rowIds?: string[]
  instructions?: string
}

export interface InjectsJobSummary {
  generated: string[]
  skipped: { rowId: string; reason: string }[]
  failed: { rowId: string; error: string }[]
  /** Rows whose page was built from the row after the model failed (control cards). */
  fallback: { rowId: string; error: string }[]
}

export async function openInjectEnv(
  root: string,
  ctx: JobContext,
  scenarioId?: string,
): Promise<InjectEnv> {
  const deps: InjectDeps = await injectDeps()
  const [project, index] = await Promise.all([deps.loadProject(root), deps.openIndex(root)])
  const facility = await deps.loadFacilityFacts(root, project)
  const scenario = scenarioId ? await deps.store.getScenario(root, scenarioId) : undefined
  const domain = domainContext(project, scenario)
  return { root, deps, index, project, facility, domain, ctx }
}

const runOk = (s: Scenario, stage: StageRun['stage'], itemId: string): boolean =>
  s.provenance.some((r) => r.stage === stage && r.itemId === itemId && r.status === 'ok')

/** Rows to work on, in MSEL order. Explicit ids are regenerated; otherwise gaps are filled. */
export function selectRows(
  s: Scenario,
  byRow: Map<string, Inject>,
  rowIds: string[] | undefined,
): MselRow[] {
  if (rowIds) {
    const wanted = new Set(rowIds)
    const rows = s.msel.filter((r) => wanted.has(r.id))
    const missing = rowIds.filter((id) => !s.msel.some((r) => r.id === id))
    if (missing.length) throw new AppError('NOT_FOUND', `No MSEL row ${missing.join(', ')}`)
    return rows
  }
  return s.msel.filter((r) => {
    const inject = byRow.get(r.id)
    return !inject || !runOk(s, 'inject_text', inject.id)
  })
}

function rowRun(
  itemId: string,
  startedAt: string,
  status: 'error' | 'skipped',
  error: string,
): StageRun {
  return {
    stage: 'inject_text',
    itemId,
    startedAt,
    finishedAt: nowIso(),
    status,
    error,
    repairAttempts: 0,
  }
}

interface RowWork {
  env: InjectEnv
  scenario: Scenario
  row: MselRow
  existing?: Inject
  priorInjects: Inject[]
  instructions?: string
}

/**
 * The media brief for a freshly written inject. A failed brief never costs the text: the
 * inject is kept without a brief (the media job writes one) and the failed run is recorded.
 */
async function briefFor(w: RowWork, inject: Inject): Promise<Partial<MediaBriefResult>> {
  try {
    return await runMediaBrief({
      env: w.env,
      scenario: w.scenario,
      row: w.row,
      inject,
      priorInjects: w.priorInjects,
    })
  } catch (err) {
    const e = toAppError(err)
    if (e.code === 'CANCELLED') throw err
    w.env.ctx.log(
      `inject_media_brief ${w.row.id}: ${e.message}; the inject is kept, the media job will plan it`,
      'warn',
      { stage: 'inject_media_brief', itemId: inject.id },
    )
    const run: StageRun =
      err instanceof StageFailure
        ? err.run
        : {
            stage: 'inject_media_brief',
            itemId: inject.id,
            startedAt: nowIso(),
            finishedAt: nowIso(),
            status: 'error',
            error: e.message,
            repairAttempts: 0,
          }
    return { run }
  }
}

/** Text + media brief for one row; saved and recorded before returning. */
async function generateRow(
  w: RowWork,
): Promise<{ inject: Inject; scenario: Scenario; fallback?: string }> {
  const { env, row } = w
  const text = await runInjectText({
    env,
    scenario: w.scenario,
    row,
    ...(w.existing ? { existing: w.existing } : {}),
    priorInjects: w.priorInjects,
    ...(w.instructions ? { instructions: w.instructions } : {}),
  })
  const brief = await briefFor(w, text.inject)
  const inject: Inject = { ...text.inject, ...(brief.brief ? { mediaBrief: brief.brief } : {}) }
  if (!brief.brief) delete inject.mediaBrief
  const saved = await env.deps.injects.saveInject(env.root, w.scenario.id, inject, {
    by: 'ai',
    note: text.fallback
      ? 'built from the MSEL row (model failed)'
      : w.existing
        ? `regenerated${w.instructions ? ' with instructions' : ''}`
        : 'generated',
  })
  text.run.finishedAt = text.run.finishedAt ?? nowIso()
  const scenario = await env.deps.injects.updateScenario(
    env.root,
    w.scenario.id,
    (s) => {
      const r = s.msel.find((x) => x.id === row.id)
      if (r) r.injectId = saved.id
      clearRowRecords(s, row.id, [INJECT_TEXT_FAILED])
      recordInjectRun(s, text.run)
      if (brief.run) recordInjectRun(s, brief.run)
      replaceInjectWarnings(s, saved.id, text.warnings, TEXT_WARNING_CODES)
    },
    { by: 'ai', snapshot: false, note: `inject ${row.id}` },
  )
  return {
    inject: saved,
    scenario,
    ...(text.fallback ? { fallback: text.run.error ?? 'invalid output' } : {}),
  }
}

/** The failed run, keyed by the existing inject or else by the row (never a fresh inject id). */
function failureRun(w: RowWork, startedAt: string, err: unknown): StageRun {
  const itemId = w.existing?.id ?? w.row.id
  if (err instanceof StageFailure) return { ...err.run, stage: 'inject_text', itemId }
  const e = toAppError(err)
  return rowRun(itemId, startedAt, 'error', e.code === 'CANCELLED' ? 'Cancelled' : e.message)
}

function failureWarning(row: MselRow, error: string): LintWarning {
  return {
    code: INJECT_TEXT_FAILED,
    severity: 'warning',
    message: `${row.id}: no inject was written — ${error.split('\n')[0]}`,
    source: 'lint',
    rowId: row.id,
    suggestion: 'Generate the missing injects again, or create this one in the inject deck',
  }
}

/** Write a row's failure or skip onto the scenario; retried once, never dropped silently. */
async function recordRowOutcome(
  w: RowWork,
  run: StageRun,
  warning: LintWarning | undefined,
): Promise<Scenario> {
  const write = () =>
    w.env.deps.injects.updateScenario(
      w.env.root,
      w.scenario.id,
      (s) => recordRowFailure(s, w.row.id, run, warning, [INJECT_TEXT_FAILED]),
      { by: 'ai', snapshot: false, note: `inject ${w.row.id} ${run.status}` },
    )
  try {
    return await write().catch(write)
  } catch (err) {
    w.env.ctx.log(
      `inject_text ${w.row.id}: could not record the ${run.status} run on the scenario — ${toAppError(err).message}`,
      'error',
      { stage: 'inject_text', itemId: run.itemId ?? w.row.id },
    )
    return w.scenario
  }
}

function logSummary(ctx: JobContext, summary: InjectsJobSummary): void {
  const { generated, skipped, failed, fallback } = summary
  const parts = [`${generated.length} inject(s) written`]
  if (fallback.length)
    parts.push(`${fallback.length} built from the row (${fallback.map((f) => f.rowId).join(', ')})`)
  if (skipped.length)
    parts.push(`${skipped.length} skipped (${skipped.map((s) => s.rowId).join(', ')})`)
  if (failed.length)
    parts.push(`${failed.length} failed (${failed.map((f) => f.rowId).join(', ')})`)
  ctx.log(`generate:injects: ${parts.join('; ')}`, failed.length ? 'warn' : 'info')
  for (const f of failed)
    ctx.log(`  ${f.rowId}: ${f.error}`, 'warn', { stage: 'inject_text', itemId: f.rowId })
}

async function processRow(
  w: RowWork,
  summary: InjectsJobSummary,
  byRow: Map<string, Inject>,
): Promise<Scenario> {
  const { row, existing, env } = w
  const extra = { stage: 'inject_text' as const, itemId: existing?.id ?? row.id }
  const startedAt = nowIso()
  if (row.locked || existing?.locked) {
    summary.skipped.push({ rowId: row.id, reason: 'locked' })
    env.ctx.log(`inject_text ${row.id}: locked, skipped`, 'info', extra)
    return recordRowOutcome(w, rowRun(row.id, startedAt, 'skipped', 'locked'), undefined)
  }
  try {
    const done = await generateRow(w)
    byRow.set(row.id, done.inject)
    summary.generated.push(row.id)
    if (done.fallback) summary.fallback.push({ rowId: row.id, error: done.fallback })
    return done.scenario
  } catch (err) {
    if (toAppError(err).code === 'CANCELLED') throw err
    const run = failureRun(w, startedAt, err)
    const error = toAppError(err).message
    summary.failed.push({ rowId: row.id, error })
    env.ctx.log(`inject_text ${row.id} failed: ${error}`, 'error', extra)
    return recordRowOutcome(w, run, failureWarning(row, error))
  }
}

/** Labels for the injects just written (#423); a failure only costs the labels. */
async function groundInjects(env: InjectEnv, scenarioId: string): Promise<void> {
  try {
    const injects = await env.deps.injects.listInjects(env.root, scenarioId)
    const current = await env.deps.store.getScenario(env.root, scenarioId)
    const ctx = await contextFor(env.root, current, {
      index: env.index,
      facility: env.facility,
      project: env.project,
    })
    const grounding = await regroundScenario(current, ctx, injects)
    if (sameGrounding(current.grounding, grounding)) return
    await env.deps.injects.updateScenario(
      env.root,
      scenarioId,
      (s) => {
        s.grounding = grounding
      },
      { by: 'ai', snapshot: false, note: 'source check' },
    )
  } catch (err) {
    env.ctx.log(`Source check skipped: ${toAppError(err).message}`, 'warn', {
      stage: 'inject_text',
    })
  }
}

/** The job body. Returns the summary (also the job's result). */
export async function runInjectsJob(
  root: string,
  scenarioId: string,
  opts: InjectsJobOptions,
  ctx: JobContext,
): Promise<InjectsJobSummary> {
  const env = await openInjectEnv(root, ctx, scenarioId)
  let scenario = await env.deps.store.getScenario(root, scenarioId)
  const injects = await env.deps.injects.listInjects(root, scenarioId)
  const byRow = new Map(injects.map((i) => [i.mselRowId, i]))
  const rows = selectRows(scenario, byRow, opts.rowIds)
  const summary: InjectsJobSummary = { generated: [], skipped: [], failed: [], fallback: [] }
  for (const [i, row] of rows.entries()) {
    ctx.throwIfCancelled()
    const existing = byRow.get(row.id)
    const extra = { stage: 'inject_text' as const, itemId: existing?.id ?? row.id }
    ctx.progress(i / rows.length, `inject ${row.id} (${i + 1}/${rows.length})`, extra)
    const work: RowWork = {
      env,
      scenario,
      row,
      ...(existing ? { existing } : {}),
      priorInjects: [...byRow.values()],
      ...(opts.instructions ? { instructions: opts.instructions } : {}),
    }
    scenario = await processRow(work, summary, byRow)
  }
  logSummary(ctx, summary)
  if (summary.generated.length) await groundInjects(env, scenarioId)
  ctx.progress(1, `${summary.generated.length} inject(s) ready`)
  if (summary.failed.length && !summary.generated.length) {
    throw new AppError('PROVIDER', `Every inject failed: ${summary.failed[0]?.error}`)
  }
  return summary
}
