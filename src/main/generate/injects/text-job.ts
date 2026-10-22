// generate:injects — inject_text then inject_media_brief for every MSEL row (or the rows
// asked for), in MSEL order so later injects see the facts earlier ones established. Each
// inject is saved as soon as it is written (versions pushed, row linked, StageRuns and
// warnings recorded on the scenario); one row failing does not stop the others.
import type { Inject, MselRow, Scenario, StageRun } from '@shared/schemas'
import type { JobContext } from '../../jobs/manager'
import { AppError, toAppError } from '../../lib/errors'
import { nowIso } from '../../lib/ids'
import { StageFailure } from '../stage'
import { injectDeps, type InjectDeps } from './deps'
import { runMediaBrief } from './media-brief-stage'
import { recordInjectRun, replaceInjectWarnings } from './store'
import {
  CITATION_DROPPED,
  INJECT_FIELDS_INVALID,
  INJECT_TEMPLATE_MISSING,
  INJECT_TYPE_FALLBACK,
  runInjectText,
  type InjectEnv,
} from './text-stage'

export const TEXT_WARNING_CODES = [
  INJECT_FIELDS_INVALID,
  INJECT_TYPE_FALLBACK,
  INJECT_TEMPLATE_MISSING,
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
}

export async function openInjectEnv(root: string, ctx: JobContext): Promise<InjectEnv> {
  const deps: InjectDeps = await injectDeps()
  const [project, index] = await Promise.all([deps.loadProject(root), deps.openIndex(root)])
  return { root, deps, index, project, ctx }
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

function failedRun(
  stage: StageRun['stage'],
  itemId: string,
  startedAt: string,
  err: unknown,
): StageRun {
  const e = toAppError(err)
  return {
    stage,
    itemId,
    startedAt,
    finishedAt: nowIso(),
    status: 'error',
    error: e.code === 'CANCELLED' ? 'Cancelled' : e.message,
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

/** Text + media brief for one row; saved and recorded before returning. */
async function generateRow(w: RowWork): Promise<{ inject: Inject; scenario: Scenario }> {
  const { env, row } = w
  const text = await runInjectText({
    env,
    scenario: w.scenario,
    row,
    ...(w.existing ? { existing: w.existing } : {}),
    priorInjects: w.priorInjects,
    ...(w.instructions ? { instructions: w.instructions } : {}),
  })
  const brief = await runMediaBrief({
    env,
    scenario: w.scenario,
    row,
    inject: text.inject,
    priorInjects: w.priorInjects,
  })
  const inject = { ...text.inject, mediaBrief: brief.brief }
  const saved = await env.deps.injects.saveInject(env.root, w.scenario.id, inject, {
    by: 'ai',
    note: w.existing ? `regenerated${w.instructions ? ' with instructions' : ''}` : 'generated',
  })
  text.run.finishedAt = text.run.finishedAt ?? nowIso()
  const scenario = await env.deps.injects.updateScenario(
    env.root,
    w.scenario.id,
    (s) => {
      const r = s.msel.find((x) => x.id === row.id)
      if (r) r.injectId = saved.id
      recordInjectRun(s, text.run)
      recordInjectRun(s, brief.run)
      replaceInjectWarnings(s, saved.id, text.warnings, TEXT_WARNING_CODES)
    },
    { by: 'ai', snapshot: false, note: `inject ${row.id}` },
  )
  return { inject: saved, scenario }
}

async function recordFailure(w: RowWork, startedAt: string, err: unknown): Promise<Scenario> {
  const itemId = w.existing?.id ?? w.row.id
  const run =
    err instanceof StageFailure ? err.run : failedRun('inject_text', itemId, startedAt, err)
  return w.env.deps.injects
    .updateScenario(w.env.root, w.scenario.id, (s) => recordInjectRun(s, run), {
      by: 'ai',
      snapshot: false,
      note: `inject ${w.row.id} failed`,
    })
    .catch(() => w.scenario)
}

function logSummary(ctx: JobContext, summary: InjectsJobSummary): void {
  const { generated, skipped, failed } = summary
  const parts = [`${generated.length} inject(s) written`]
  if (skipped.length)
    parts.push(`${skipped.length} skipped (${skipped.map((s) => s.rowId).join(', ')})`)
  if (failed.length)
    parts.push(`${failed.length} failed (${failed.map((f) => f.rowId).join(', ')})`)
  ctx.log(`generate:injects: ${parts.join('; ')}`, failed.length ? 'warn' : 'info')
  for (const f of failed)
    ctx.log(`  ${f.rowId}: ${f.error}`, 'warn', { stage: 'inject_text', itemId: f.rowId })
}

/** The job body. Returns the summary (also the job's result). */
export async function runInjectsJob(
  root: string,
  scenarioId: string,
  opts: InjectsJobOptions,
  ctx: JobContext,
): Promise<InjectsJobSummary> {
  const env = await openInjectEnv(root, ctx)
  let scenario = await env.deps.store.getScenario(root, scenarioId)
  const injects = await env.deps.injects.listInjects(root, scenarioId)
  const byRow = new Map(injects.map((i) => [i.mselRowId, i]))
  const rows = selectRows(scenario, byRow, opts.rowIds)
  const summary: InjectsJobSummary = { generated: [], skipped: [], failed: [] }
  for (const [i, row] of rows.entries()) {
    ctx.throwIfCancelled()
    const existing = byRow.get(row.id)
    const extra = { stage: 'inject_text' as const, itemId: existing?.id ?? row.id }
    ctx.progress(i / rows.length, `inject ${row.id} (${i + 1}/${rows.length})`, extra)
    if (row.locked || existing?.locked) {
      summary.skipped.push({ rowId: row.id, reason: 'locked' })
      ctx.log(`inject_text ${row.id}: locked, skipped`, 'info', extra)
      continue
    }
    const work: RowWork = {
      env,
      scenario,
      row,
      ...(existing ? { existing } : {}),
      priorInjects: [...byRow.values()],
      ...(opts.instructions ? { instructions: opts.instructions } : {}),
    }
    const startedAt = nowIso()
    try {
      const done = await generateRow(work)
      scenario = done.scenario
      byRow.set(row.id, done.inject)
      summary.generated.push(row.id)
    } catch (err) {
      if (toAppError(err).code === 'CANCELLED') throw err
      scenario = await recordFailure(work, startedAt, err)
      summary.failed.push({ rowId: row.id, error: toAppError(err).message })
      ctx.log(`inject_text ${row.id} failed: ${toAppError(err).message}`, 'error', extra)
    }
  }
  logSummary(ctx, summary)
  ctx.progress(1, `${summary.generated.length} inject(s) ready`)
  if (summary.failed.length && !summary.generated.length) {
    throw new AppError('PROVIDER', `Every inject failed: ${summary.failed[0]?.error}`)
  }
  return summary
}
