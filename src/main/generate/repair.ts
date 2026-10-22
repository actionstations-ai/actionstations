// generate:repair — fix a finished scenario in place instead of regenerating it. In order:
//   1. the MSEL repairs (repair-msel.ts): code repairs, the mix call for missing tags, the
//      revision pass for the rows still flagged; then the lints recomputed;
//   2. injects of rows the repair removed are deleted; every other inject is re-checked with
//      the current field and content checks, and warnings an older generator left that no
//      longer apply are dropped (the inject file is not touched);
//   3. generate:injects for the rows whose text changed, rows with no inject and injects whose
//      content still fails the checks;
//   4. generate:media (template, plus voice for rewritten injects) for those injects and for
//      injects whose card is missing, failed or was rendered from invalid fields;
//   5. up to `aiStills` AI stills for injects whose brief plans one and that have none; a brief
//      written before #177 gets its setting anchor moved behind the scene first.
// Untouched rows and injects stay byte-identical; the summary names everything that changed.
import type { Inject, MselRow, Scenario } from '@shared/schemas'
import type { RenderPath } from '@shared/taxonomy'
import type { JobContext } from '../jobs/manager'
import {
  deleteInject,
  runInjectsJob,
  runMediaJob,
  type InjectsJobSummary,
  type MediaJobSummary,
} from './injects'
import { INJECT_MEDIA_FAILED } from './injects/media-job'
import { reanchorPrompt } from './injects/media-plan'
import { replaceInjectWarnings } from './injects/store'
import { openInjectEnv } from './injects/text-job'
import {
  INJECT_CONTENT_ISSUE,
  INJECT_FIELDS_INVALID,
  INJECT_RENDER_INVALID,
  recheckInject,
  type InjectEnv,
} from './injects/text-stage'
import { repairMsel, type MselRepairSummary } from './repair-msel'

export interface RepairOptions {
  /** Most AI stills to render for injects that plan one and have none (default: all). */
  aiStills?: number
}

export interface InjectRecheckSummary {
  /** Injects whose stale field / content warnings were dropped (file untouched). */
  cleared: string[]
  /** Injects whose content still fails: regenerated. */
  regenerate: string[]
  /** Injects whose fields still break the template: re-rendered (the media job repairs them). */
  rerender: string[]
}

export interface RepairSummary {
  msel: MselRepairSummary
  deletedInjects: string[]
  recheck: InjectRecheckSummary
  /** Rows whose inject was (re)written. */
  injectRows: string[]
  /** Injects re-rendered (template, voice for rewritten ones). */
  mediaInjects: string[]
  /** Injects that got an AI still. */
  stillInjects: string[]
  injects?: InjectsJobSummary
  media?: MediaJobSummary[]
}

const RECHECK_CODES = [INJECT_FIELDS_INVALID, INJECT_CONTENT_ISSUE]
const STALE_MEDIA_CODES = new Set([
  INJECT_MEDIA_FAILED,
  INJECT_RENDER_INVALID,
  INJECT_FIELDS_INVALID,
])

const hasCard = (i: Inject): boolean =>
  i.assets.some((a) => (a.role === 'rendered' || a.role === 'composite') && a.kind === 'image')
const hasStill = (i: Inject): boolean =>
  i.assets.some((a) => a.role === 'generated' && a.kind === 'image')
const plansStill = (i: Inject): boolean => !!i.mediaBrief?.paths.includes('ai_image')

/** Injects of rows the repair removed: their files and media go. */
async function deleteOrphans(root: string, s: Scenario, injects: Inject[]): Promise<string[]> {
  const rows = new Set(s.msel.map((r) => r.id))
  const orphans = injects.filter((i) => !rows.has(i.mselRowId))
  for (const i of orphans) await deleteInject(root, s.id, i.id)
  return orphans.map((i) => i.id)
}

/** Re-run the current field and content checks on every stored inject (step 2). */
async function recheckAll(
  env: InjectEnv,
  scenario: Scenario,
  injects: Inject[],
  skipRows: Set<string>,
): Promise<InjectRecheckSummary> {
  const out: InjectRecheckSummary = { cleared: [], regenerate: [], rerender: [] }
  const results = new Map<string, ReturnType<typeof recheckInject>>()
  for (const inject of injects) {
    const row = scenario.msel.find((r) => r.id === inject.mselRowId)
    if (!row || skipRows.has(row.id) || inject.locked) continue
    const others = injects.filter((i) => i.id !== inject.id)
    const r = recheckInject({ env, scenario, row, priorInjects: others }, inject)
    results.set(inject.id, r)
    const had = scenario.warnings.some(
      (w) => w.injectId === inject.id && RECHECK_CODES.includes(w.code),
    )
    if (r.content.length) out.regenerate.push(inject.id)
    else if (r.issues.length) out.rerender.push(inject.id)
    else if (had) out.cleared.push(inject.id)
  }
  if (!results.size) return out
  await env.deps.injects.updateScenario(
    env.root,
    scenario.id,
    (s) => {
      for (const [id, r] of results) replaceInjectWarnings(s, id, r.warnings, RECHECK_CODES)
    },
    { by: 'ai', snapshot: false, note: 'repair: inject checks' },
  )
  return out
}

/** Rows to (re)write: text changed, no inject, or content that still fails (step 3). */
function rowsToWrite(
  s: Scenario,
  injects: Inject[],
  msel: MselRepairSummary,
  recheck: InjectRecheckSummary,
): string[] {
  const byId = new Map(injects.map((i) => [i.id, i]))
  const wanted = new Set([
    ...msel.textChanged,
    ...recheck.regenerate.map((id) => byId.get(id)?.mselRowId).filter((x): x is string => !!x),
  ])
  const hasInject = new Set(injects.map((i) => i.mselRowId))
  return s.msel
    .filter((r: MselRow) => !r.locked && (wanted.has(r.id) || !hasInject.has(r.id)))
    .map((r) => r.id)
}

/** Injects a media or field warning names (read before the recheck drops stale ones). */
const flaggedCards = (s: Scenario): Set<string> =>
  new Set(
    s.warnings.filter((w) => w.injectId && STALE_MEDIA_CODES.has(w.code)).map((w) => w.injectId!),
  )

/** Injects whose card is missing, failed, or was drawn from fields that broke the template. */
function staleCards(
  injects: Inject[],
  flagged: Set<string>,
  recheck: InjectRecheckSummary,
): string[] {
  return injects
    .filter(
      (i) =>
        !i.locked &&
        (flagged.has(i.id) || recheck.rerender.includes(i.id) || !hasCard(i)) &&
        i.mediaBrief?.paths.includes('template') !== false,
    )
    .map((i) => i.id)
}

/** Move a pre-#177 setting anchor behind the scene in the briefs of the still targets. */
async function reanchorBriefs(env: InjectEnv, scenarioId: string, targets: Inject[]) {
  const scene = { orgType: env.project.orgType, anchors: env.domain.profile.sceneAnchors }
  for (const inject of targets) {
    const brief = inject.mediaBrief
    if (!brief?.imagePrompt) continue
    const prompt = reanchorPrompt(brief.imagePrompt, brief.imageStyle ?? 'phone', scene)
    if (prompt === brief.imagePrompt) continue
    env.ctx.log(`repair: ${inject.mselRowId} image prompt re-anchored (setting after the scene)`)
    await env.deps.injects.saveInject(
      env.root,
      scenarioId,
      { ...inject, mediaBrief: { ...brief, imagePrompt: prompt } },
      { by: 'ai', snapshot: false, note: 'repair: image prompt re-anchored' },
    )
  }
}

async function media(
  root: string,
  scenarioId: string,
  injectIds: string[],
  paths: RenderPath[],
  ctx: JobContext,
  out: MediaJobSummary[],
): Promise<void> {
  if (!injectIds.length) return
  out.push(await runMediaJob(root, scenarioId, { injectIds, paths }, ctx))
}

/** The job body (generate:repair). Returns the summary (also the job's result). */
export async function runRepairJob(
  root: string,
  scenarioId: string,
  opts: RepairOptions,
  ctx: JobContext,
): Promise<RepairSummary> {
  const { scenario: repaired, summary: msel } = await repairMsel(root, scenarioId, ctx)
  const env = await openInjectEnv(root, ctx, scenarioId)
  let injects = await env.deps.injects.listInjects(root, scenarioId)
  const deletedInjects = await deleteOrphans(root, repaired, injects)
  injects = injects.filter((i) => !deletedInjects.includes(i.id))
  let scenario = await env.deps.store.getScenario(root, scenarioId)
  const flagged = flaggedCards(scenario)
  ctx.progress(0.4, 'Re-checking the injects')
  const recheck = await recheckAll(env, scenario, injects, new Set(msel.textChanged))
  scenario = await env.deps.store.getScenario(root, scenarioId)
  const injectRows = rowsToWrite(scenario, injects, msel, recheck)
  const summary: RepairSummary = {
    msel,
    deletedInjects,
    recheck,
    injectRows,
    mediaInjects: [],
    stillInjects: [],
    media: [],
  }
  if (injectRows.length) {
    ctx.progress(0.45, `Writing ${injectRows.length} inject(s)`)
    summary.injects = await runInjectsJob(root, scenarioId, { rowIds: injectRows }, ctx)
  }
  injects = await env.deps.injects.listInjects(root, scenarioId)
  const rewritten = new Set(summary.injects?.generated ?? [])
  const fresh = injects.filter((i) => rewritten.has(i.mselRowId)).map((i) => i.id)
  const cards = staleCards(injects, flagged, recheck).filter((id) => !fresh.includes(id))
  summary.mediaInjects = [...fresh, ...cards]
  ctx.progress(0.7, `Rendering ${summary.mediaInjects.length} inject(s)`)
  await media(root, scenarioId, fresh, ['template', 'tts'], ctx, summary.media!)
  await media(root, scenarioId, cards, ['template'], ctx, summary.media!)
  injects = await env.deps.injects.listInjects(root, scenarioId)
  const order = new Map(scenario.msel.map((r, i) => [r.id, i]))
  const stills = injects
    .sort((a, b) => (order.get(a.mselRowId) ?? 0) - (order.get(b.mselRowId) ?? 0))
    .filter((i) => !i.locked && plansStill(i) && !hasStill(i))
    .slice(0, opts.aiStills ?? Number.POSITIVE_INFINITY)
  await reanchorBriefs(env, scenarioId, stills)
  summary.stillInjects = stills.map((i) => i.id)
  ctx.progress(0.85, `Rendering ${stills.length} AI still(s)`)
  await media(root, scenarioId, summary.stillInjects, ['ai_image', 'template'], ctx, summary.media!)
  ctx.progress(1, 'Scenario repaired')
  return summary
}
