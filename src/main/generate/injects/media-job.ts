// generate:media — for each inject: AI image → template render (composite when the template
// has an image slot) → TTS (+ post-FX) → video, as the inject's media brief plans. A brief
// is produced first when the inject has none (or the user asked for paths it lacks). Each
// step's failure is logged and the next step still runs (a generated still is kept even when
// the template step fails, #177); assets of a re-rendered path replace the previous ones.
// Before the template step the fields get the deterministic repair (repair.ts) and are
// validated: what still fails becomes an INJECT_RENDER_INVALID warning naming the fields
// (#175). The job ends with a summary and a media_render StageRun per inject.
import type {
  Inject,
  LintWarning,
  MediaAsset,
  MediaBrief,
  MselRow,
  Scenario,
  StageRun,
} from '@shared/schemas'
import type { RenderPath } from '@shared/taxonomy'
import type { JobContext } from '../../jobs/manager'
import { AppError, toAppError } from '../../lib/errors'
import { nowIso } from '../../lib/ids'
import {
  assetsOfPath,
  imageStep,
  removeAssetFiles,
  templateStep,
  ttsStep,
  videoStep,
  type StepContext,
} from './media-assets'
import { runMediaBrief } from './media-brief-stage'
import { planMedia } from './media-plan'
import { formatRepairs, repairFields, type FieldRepair } from './repair'
import { injectMediaDir, recordInjectRun, replaceInjectWarnings } from './store'
import { openInjectEnv } from './text-job'
import {
  INJECT_FIELDS_INVALID,
  INJECT_RENDER_INVALID,
  repairWarnings,
  type InjectEnv,
} from './text-stage'

export const INJECT_MEDIA_FAILED = 'INJECT_MEDIA_FAILED'
export { INJECT_RENDER_INVALID }

export interface MediaJobOptions {
  /** Injects to render. Without it: every inject whose brief plans something. */
  injectIds?: string[]
  /** Only these paths (and add them to the brief when the type allows). */
  paths?: RenderPath[]
}

export interface MediaFailure {
  injectId: string
  rowId: string
  path: RenderPath | 'brief'
  error: string
  /** Template fields that failed validation (template step only). */
  issues?: { path: string; message: string }[]
}

export interface MediaJobSummary {
  rendered: { injectId: string; rowId: string; assets: number }[]
  skipped: { injectId: string; rowId: string; reason: string }[]
  failed: MediaFailure[]
}

const STEP_ORDER: RenderPath[] = ['ai_image', 'template', 'tts', 'ai_video']

function selectInjects(all: Inject[], ids: string[] | undefined): Inject[] {
  if (!ids) return all
  const byId = new Map(all.map((i) => [i.id, i]))
  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length) throw new AppError('NOT_FOUND', `No inject ${missing.join(', ')}`)
  return ids.map((id) => byId.get(id)!)
}

function rowOf(scenario: Scenario, inject: Inject) {
  const row = scenario.msel.find((r) => r.id === inject.mselRowId)
  if (!row)
    throw new AppError('NOT_FOUND', `Inject ${inject.id} belongs to a row that no longer exists`)
  return row
}

/** The brief to render from: the stored one, unless it is missing or lacks a forced path. */
async function briefFor(
  env: InjectEnv,
  scenario: Scenario,
  inject: Inject,
  all: Inject[],
  force: RenderPath[],
): Promise<{ brief: MediaBrief; run?: StageRun }> {
  const stored = inject.mediaBrief
  if (stored && force.every((p) => stored.paths.includes(p))) return { brief: stored }
  const row = rowOf(scenario, inject)
  const r = await runMediaBrief({
    env,
    scenario,
    row,
    inject,
    priorInjects: all,
    forcePaths: force,
  })
  return { brief: r.brief, run: r.run }
}

interface RenderOutcome {
  /** The inject with this run's assets merged in (not yet saved). */
  inject: Inject
  written: MediaAsset[]
  rendered: RenderPath[]
  failed: MediaFailure[]
  /** Deterministic field repairs made before the template step. */
  repairs: FieldRepair[]
}

/** Swap the assets a path produced for the new ones (files of the old ones removed). */
async function replaceAssets(
  root: string,
  inject: Inject,
  path: RenderPath,
  fresh: MediaAsset[],
): Promise<Inject> {
  const old = assetsOfPath(inject.assets, path)
  await removeAssetFiles(root, old)
  return { ...inject, assets: [...inject.assets.filter((a) => !old.includes(a)), ...fresh] }
}

/**
 * The fields the template step renders: repaired in code where they break the schema, then
 * validated, so a refusal names the fields instead of failing inside the renderer.
 */
function fieldsForRender(step: StepContext, current: Inject, out: RenderOutcome): Inject {
  const { templates } = step.deps
  if (!templates.listTemplateTypes().includes(current.type)) return current
  const fields = structuredClone(current.fields)
  const repairs = templates.validateFields(current.type, fields).length
    ? repairFields(templates.loadTemplate(current.type).schema, fields)
    : []
  if (repairs.length) {
    out.repairs.push(...repairs)
    step.ctx.log(
      `media_render ${current.mselRowId} template: repaired ${formatRepairs(repairs)}`,
      'warn',
      { stage: 'media_render', itemId: current.id },
    )
  }
  const issues = templates.validateFields(current.type, fields)
  if (issues.length) {
    const list = issues.map((i) => `fields${i.path}: ${i.message}`).join('; ')
    throw new AppError(
      'VALIDATION',
      `fields do not match the ${current.type} template: ${list}`,
      issues.map((i) => ({ path: `fields${i.path}`, message: i.message })),
    )
  }
  return repairs.length ? { ...current, fields } : current
}

async function runStep(
  step: StepContext,
  path: RenderPath,
  out: RenderOutcome,
  image: MediaAsset | undefined,
) {
  const current = out.inject
  if (path === 'template') return templateStep(step, fieldsForRender(step, current, out))
  const asset =
    path === 'ai_image'
      ? await imageStep(step)
      : path === 'tts'
        ? await ttsStep(step)
        : await videoStep(step, image)
  return { inject: await replaceAssets(step.root, current, path, [asset]), assets: [asset] }
}

/** Run the planned steps in order; a failed step is reported and the rest continue. */
async function renderSteps(step: StepContext, paths: RenderPath[]): Promise<RenderOutcome> {
  const { brief } = step
  const out: RenderOutcome = {
    inject: step.inject,
    written: [],
    rendered: [],
    failed: [],
    repairs: [],
  }
  let image: MediaAsset | undefined
  const planned = STEP_ORDER.filter((p) => brief.paths.includes(p) && paths.includes(p))
  for (const path of planned) {
    step.ctx.throwIfCancelled()
    try {
      const r = await runStep(step, path, out, image)
      out.inject = r.inject
      out.written.push(...r.assets)
      out.rendered.push(path)
      if (path === 'ai_image') image = r.assets[0]
    } catch (err) {
      const e = toAppError(err)
      if (e.code === 'CANCELLED') throw err
      const issues = path === 'template' && Array.isArray(e.details) ? e.details : undefined
      out.failed.push({
        injectId: step.inject.id,
        rowId: step.inject.mselRowId,
        path,
        error: e.message,
        ...(issues ? { issues: issues as MediaFailure['issues'] } : {}),
      })
      step.ctx.log(
        `media_render ${step.inject.mselRowId} ${path} step failed: ${e.message}`,
        'error',
        {
          stage: 'media_render',
          itemId: step.inject.id,
        },
      )
    }
  }
  logOutcome(step, planned, out)
  return out
}

/** One line per inject naming what rendered and which step failed. */
function logOutcome(step: StepContext, planned: RenderPath[], out: RenderOutcome): void {
  if (!planned.length) return
  const failed = out.failed.map((f) => f.path)
  const parts = [
    out.rendered.length ? `rendered ${out.rendered.join('+')}` : 'nothing rendered',
    ...(failed.length ? [`failed step(s): ${failed.join(', ')}`] : []),
  ]
  const kept = out.written.filter((a) => a.role === 'generated' && a.kind === 'image').length
  if (failed.includes('template') && kept) parts.push('generated still kept')
  step.ctx.log(
    `media_render ${step.inject.mselRowId}: ${parts.join('; ')}`,
    failed.length ? 'warn' : 'info',
    { stage: 'media_render', itemId: step.inject.id },
  )
}

function mediaRun(
  injectId: string,
  startedAt: string,
  outcome: RenderOutcome,
  brief: MediaBrief,
): StageRun {
  const failed = outcome.failed.map((f) => `${f.path}: ${f.error}`)
  return {
    stage: 'media_render',
    itemId: injectId,
    startedAt,
    finishedAt: nowIso(),
    status: outcome.rendered.length || !failed.length ? 'ok' : 'error',
    ...(failed.length
      ? { error: `${outcome.rendered.join('+') || 'nothing'} rendered; ${failed.join('; ')}` }
      : {}),
    repairAttempts: 0,
    promptRef: brief.paths.join('+'),
  }
}

function mediaWarnings(inject: Inject, failures: MediaFailure[]): LintWarning[] {
  return failures.map((f): LintWarning => {
    const base = { source: 'lint' as const, rowId: inject.mselRowId, injectId: inject.id }
    if (f.issues?.length) {
      return {
        ...base,
        code: INJECT_RENDER_INVALID,
        severity: 'warning',
        message: `${inject.mselRowId}: the ${inject.type} card was not rendered; ${f.issues.length} field(s) do not match the template:\n${f.issues.map((i) => `- ${i.path}: ${i.message}`).join('\n')}`,
        suggestion: 'Fix the flagged fields in the inject editor, then render again',
      }
    }
    return {
      ...base,
      code: INJECT_MEDIA_FAILED,
      severity: 'warning',
      message: `${inject.mselRowId}: ${f.path} step failed — ${f.error}`,
      suggestion: 'Check the media provider in Providers → Routing and regenerate the media',
    }
  })
}

/** The media run's warnings on the scenario: step failures replaced, repairs added. */
function applyMediaWarnings(s: Scenario, inject: Inject, row: MselRow, outcome: RenderOutcome) {
  const repaired = repairWarnings(row, inject.id, outcome.repairs)
  const known = new Set(s.warnings.map((w) => `${w.injectId}|${w.code}|${w.message}`))
  const fresh = repaired.filter((w) => !known.has(`${w.injectId}|${w.code}|${w.message}`))
  const codes = [INJECT_MEDIA_FAILED, INJECT_RENDER_INVALID]
  // The template accepted the fields: an earlier "fields invalid" note no longer applies.
  if (outcome.rendered.includes('template')) codes.push(INJECT_FIELDS_INVALID)
  replaceInjectWarnings(s, inject.id, [...mediaWarnings(inject, outcome.failed), ...fresh], codes)
}

interface InjectWork {
  env: InjectEnv
  scenario: Scenario
  inject: Inject
  all: Inject[]
  opts: MediaJobOptions
  window: [number, number]
}

function imageSlotFor(env: InjectEnv, inject: Inject, scenario: Scenario): string | undefined {
  const types = env.deps.templates.listTemplateTypes()
  const template = types.includes(inject.type)
    ? env.deps.templates.loadTemplate(inject.type)
    : undefined
  return planMedia(inject, rowOf(scenario, inject), template).imageSlot
}

async function renderInject(
  w: InjectWork,
): Promise<{ outcome: RenderOutcome; scenario: Scenario }> {
  const { env, inject, opts } = w
  const startedAt = nowIso()
  const { brief, run: briefRun } = await briefFor(env, w.scenario, inject, w.all, opts.paths ?? [])
  const slot = imageSlotFor(env, inject, w.scenario)
  const step: StepContext = {
    root: env.root,
    scenarioId: w.scenario.id,
    deps: env.deps,
    ctx: env.ctx,
    inject: { ...inject, mediaBrief: brief },
    brief,
    brand: env.project.brand,
    outDir: injectMediaDir(env.root, w.scenario.id, inject.id),
    ...(slot ? { imageSlot: slot } : {}),
    window: w.window,
  }
  const outcome = await renderSteps(step, opts.paths ?? brief.paths)
  await env.deps.injects.saveInject(env.root, w.scenario.id, outcome.inject, {
    by: 'ai',
    snapshot: false,
  })
  const scenario = await env.deps.injects.updateScenario(
    env.root,
    w.scenario.id,
    (s) => {
      if (briefRun) recordInjectRun(s, briefRun)
      recordInjectRun(s, mediaRun(inject.id, startedAt, outcome, brief))
      applyMediaWarnings(s, inject, rowOf(s, inject), outcome)
    },
    { by: 'ai', snapshot: false, note: `media ${inject.mselRowId}` },
  )
  return { outcome, scenario }
}

function logSummary(ctx: JobContext, summary: MediaJobSummary): void {
  const assets = summary.rendered.reduce((n, r) => n + r.assets, 0)
  const parts = [`${assets} asset(s) for ${summary.rendered.length} inject(s)`]
  if (summary.skipped.length) parts.push(`${summary.skipped.length} skipped`)
  if (summary.failed.length) parts.push(`${summary.failed.length} step(s) failed`)
  ctx.log(`generate:media: ${parts.join('; ')}`, summary.failed.length ? 'warn' : 'info')
  for (const f of summary.failed)
    ctx.log(`  ${f.rowId} ${f.path}: ${f.error}`, 'warn', {
      stage: 'media_render',
      itemId: f.injectId,
    })
}

function note(summary: MediaJobSummary, inject: Inject, outcome: RenderOutcome): void {
  summary.failed.push(...outcome.failed)
  const entry = { injectId: inject.id, rowId: inject.mselRowId }
  if (outcome.written.length) summary.rendered.push({ ...entry, assets: outcome.written.length })
  else if (!outcome.failed.length) summary.skipped.push({ ...entry, reason: 'nothing planned' })
}

/** The job body. Returns the summary (also the job's result). */
export async function runMediaJob(
  root: string,
  scenarioId: string,
  opts: MediaJobOptions,
  ctx: JobContext,
): Promise<MediaJobSummary> {
  const env = await openInjectEnv(root, ctx, scenarioId)
  let scenario = await env.deps.store.getScenario(root, scenarioId)
  const all = await env.deps.injects.listInjects(root, scenarioId)
  const targets = selectInjects(all, opts.injectIds)
  const summary: MediaJobSummary = { rendered: [], skipped: [], failed: [] }
  for (const [i, inject] of targets.entries()) {
    ctx.throwIfCancelled()
    const window: [number, number] = [i / targets.length, (i + 1) / targets.length]
    const extra = { stage: 'media_render' as const, itemId: inject.id }
    ctx.progress(window[0], `media ${inject.mselRowId} (${i + 1}/${targets.length})`, extra)
    if (inject.locked && !opts.injectIds) {
      summary.skipped.push({ injectId: inject.id, rowId: inject.mselRowId, reason: 'locked' })
      continue
    }
    try {
      const r = await renderInject({ env, scenario, inject, all, opts, window })
      scenario = r.scenario
      note(summary, inject, r.outcome)
    } catch (err) {
      const e = toAppError(err)
      if (e.code === 'CANCELLED') throw err
      summary.failed.push({
        injectId: inject.id,
        rowId: inject.mselRowId,
        path: 'brief',
        error: e.message,
      })
      ctx.log(`media_render ${inject.mselRowId}: ${e.message}`, 'error', extra)
    }
  }
  logSummary(ctx, summary)
  ctx.progress(1, `${summary.rendered.length} inject(s) rendered`)
  if (summary.failed.length && !summary.rendered.length) {
    throw new AppError('PROVIDER', `No media could be rendered: ${summary.failed[0]?.error}`)
  }
  return summary
}
