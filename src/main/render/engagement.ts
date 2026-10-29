// Re-render a social inject with the counts and replies it has reached (spec 0428 FR-10, FR-11).
// The PNG goes to <project>/.cache/engagement/<injectId>/<step>.png; the inject's own assets are
// never touched. The template renders every word, as for any inject.
import { promises as fs } from 'node:fs'
import { Inject } from '@shared/schemas'
import { applyEngagement, engagementStep } from '@shared/facilitator/engagement'
import { ENGAGEMENT_FIELDS, type EngagementFieldMap } from '@shared/facilitator/engagement-fields'
import { AppError } from '../lib/errors'
import { ensureDir, exists, readJson, safeJoin, safeJoinReal, writeFileAtomic } from '../lib/fs'
import { brandLogoFile } from '../project/logo'
import { loadProject } from '../project/store'
import { scenarioLayout } from '../scenario/layout'
import { composeDocument } from './compose'
import { slotAssets, variantFor } from './inject'
import { loadTemplate, validateFields, type TemplateMeta } from './templates'
import { renderPng } from './window'

export const ENGAGEMENT_DIR = '.cache/engagement'
const STAMP = 'stamp.txt'
const CACHE_FILE = /^\.cache\/engagement\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/\d{1,6}\.png$/

/** The field map of a template: its own meta first, else the built-in one for the type. */
export function engagementMap(type: string, meta: TemplateMeta): EngagementFieldMap | undefined {
  const own = meta.engagement
  if (!own) return ENGAGEMENT_FIELDS[type]
  const r = own.replies
  return {
    metrics: own.metrics,
    ...(r
      ? {
          replies: {
            field: r.field,
            max: r.max,
            make: (x) => ({ [r.authorKey]: x.handle || x.author, [r.textKey]: x.text }),
          },
        }
      : {}),
  }
}

/**
 * A cache path from the renderer, checked: exactly `.cache/engagement/<id>/<n>.png`, inside the
 * project after symlinks are followed, and present. Returns it unchanged.
 */
export function engagementCacheFile(root: string, rel: string): string {
  if (!CACHE_FILE.test(rel)) throw new AppError('VALIDATION', 'Not an engagement render path')
  safeJoinReal(root, rel)
  return rel
}

/** Empty the inject's cache folder when the inject changed since its images were rendered. */
async function freshDir(dir: string, stamp: string): Promise<void> {
  const stampFile = safeJoin(dir, STAMP)
  const old = (await exists(stampFile)) ? await fs.readFile(stampFile, 'utf8') : undefined
  if (old !== stamp) await fs.rm(dir, { recursive: true, force: true })
  await ensureDir(dir)
  await writeFileAtomic(stampFile, stamp)
}

async function loadInject(root: string, scenarioId: string, injectId: string): Promise<Inject> {
  const file = scenarioLayout(root, scenarioId).inject(injectId)
  if (!(await exists(file)))
    throw new AppError('NOT_FOUND', `No inject ${injectId} in scenario ${scenarioId}`)
  return readJson(file, Inject)
}

function fieldsAt(inject: Inject, meta: TemplateMeta, minutes: number): Record<string, unknown> {
  const map = engagementMap(inject.type, meta)
  if (!inject.engagement || !map)
    throw new AppError('VALIDATION', `Inject ${inject.id} has no engagement plan`)
  return applyEngagement(inject.fields, inject.engagement, map, minutes)
}

function slotFiles(root: string, inject: Inject, meta: TemplateMeta): Record<string, string> {
  const files: Record<string, string> = {}
  for (const [slot, asset] of slotAssets(inject.assets, meta)) {
    try {
      files[slot] = safeJoinReal(root, asset.path)
    } catch {
      /* a missing image is left out of the render */
    }
  }
  return files
}

export interface EngagementRender {
  /** Project-relative path of the PNG. */
  path: string
  step: number
}

/** Render the inject `minutes` after delivery; the same step reuses its file. */
export async function renderEngagement(
  root: string,
  scenarioId: string,
  injectId: string,
  minutes: number,
  refreshMin = 1,
): Promise<EngagementRender> {
  const inject = await loadInject(root, scenarioId, injectId)
  const template = loadTemplate(inject.type, root)
  const fields = fieldsAt(inject, template.meta, minutes)
  const issues = validateFields(inject.type, fields, root)
  if (issues.length) {
    const list = issues.map((i) => `${i.path} ${i.message}`).join('; ')
    throw new AppError('VALIDATION', `Engagement does not fit the ${inject.type} template: ${list}`)
  }
  const step = engagementStep(minutes, refreshMin)
  const rel = `${ENGAGEMENT_DIR}/${injectId}/${step}.png`
  await freshDir(
    safeJoin(root, `${ENGAGEMENT_DIR}/${injectId}`),
    `${inject.updatedAt ?? ''}|${JSON.stringify(inject.fields)}|${JSON.stringify(inject.engagement)}`,
  )
  const file = safeJoin(root, rel)
  if (await exists(file)) return { path: rel, step }
  const brand = (await loadProject(root)).brand
  const logo = await brandLogoFile(root, brand)
  const variant = variantFor(template.meta, inject.variant)
  const doc = composeDocument({
    type: inject.type,
    projectRoot: root,
    fields,
    brand,
    ...(logo ? { logo } : {}),
    ...(variant ? { variant } : {}),
    assets: slotFiles(root, inject, template.meta),
  })
  await writeFileAtomic(file, (await renderPng(doc, 2)).png)
  return { path: rel, step }
}

/** Delete every engagement render of a project (the folder is only a cache). */
export async function clearEngagementCache(root: string): Promise<void> {
  await fs.rm(safeJoin(root, ENGAGEMENT_DIR), { recursive: true, force: true })
}
