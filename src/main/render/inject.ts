// Render an inject's template into media files inside the project (render:inject, #30).
//
// Output: scenarios/<scenarioId>/media/<injectId>/<assetId>.png (2×) and, for paper
// templates, <assetId>.pdf. Each becomes a MediaAsset with role 'rendered', or 'composite'
// when an AI image filled one of the template's image slots. A re-render replaces the
// previous template outputs (roles 'rendered' and 'composite', files included) and keeps
// AI ('generated') and 'source' assets.
//
// Slot convention for AI images: a generated image declares the template slot it fills
// through its asset id, `<slot>-<ULID>` (e.g. `photo-01J9Z…`). If a template has exactly
// one image slot, an image without a slot prefix fills it.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { isAbsolute, relative, sep } from 'node:path'
import { Inject, type Brand, type MediaAsset } from '@shared/schemas'
import { AppError } from '../lib/errors'
import {
  ensureDir,
  exists,
  readJson,
  safeJoin,
  safeJoinReal,
  toRel,
  writeFileAtomic,
} from '../lib/fs'
import { newId, nowIso } from '../lib/ids'
import { brandLogoFile } from '../project/logo'
import { loadProject, projectPaths } from '../project/store'
import { scenarioLayout } from '../scenario/layout'
import { saveInject } from '../scenario/store'
import { composeDocument } from './compose'
import { loadTemplate, validateFields, type TemplateMeta } from './templates'
import { renderPdf, renderPng } from './window'

/** Roles produced by the template renderer; replaced on every render. */
const TEMPLATE_ROLES = new Set<MediaAsset['role']>(['rendered', 'composite'])
const SLOT_ID = /^([a-z][a-z0-9_]*)-([0-9A-HJKMNP-TV-Z]{26})$/

/** The slot a generated image asset declares through its id, if any. */
export function slotOfAsset(asset: Pick<MediaAsset, 'id'>): string | undefined {
  return SLOT_ID.exec(asset.id)?.[1]
}

/** Id for a new AI image that fills `slot` (what image stages should use). */
export const slotAssetId = (slot: string): string => `${slot}-${newId()}`

/** slot → generated image asset, following the slot convention above. */
export function slotAssets(
  assets: readonly MediaAsset[],
  meta: Pick<TemplateMeta, 'imageSlots'>,
): Map<string, MediaAsset> {
  const images = assets.filter((a) => a.role === 'generated' && a.kind === 'image')
  const out = new Map<string, MediaAsset>()
  for (const a of images) {
    const slot = slotOfAsset(a)
    if (slot && meta.imageSlots.includes(slot)) out.set(slot, a)
  }
  const [only] = meta.imageSlots
  if (meta.imageSlots.length === 1 && only && !out.has(only)) {
    const unslotted = images.filter((a) => !slotOfAsset(a))
    if (unslotted.length) out.set(only, unslotted[unslotted.length - 1]!)
  }
  return out
}

export interface RenderInjectOptions {
  brand?: Brand
  /** PNG zoom; 2 by default. */
  scale?: number
}

export interface RenderedInject {
  /** The inject with its template outputs replaced (not yet saved). */
  inject: Inject
  /** Only the assets written by this render. */
  assets: MediaAsset[]
}

const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')

function isInside(dir: string, abs: string): boolean {
  const rel = relative(dir, abs)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/**
 * Real path of a project file, or undefined when it is missing or a symlink that points outside
 * the project folder (a shared .ttxproj must not put outside files into a render).
 */
function realInside(root: string, rel: string): string | undefined {
  try {
    return safeJoinReal(root, rel)
  } catch {
    return undefined
  }
}

async function resolveSlotFiles(
  root: string,
  slots: Map<string, MediaAsset>,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const [slot, asset] of slots) {
    const abs = realInside(root, asset.path)
    if (abs) files[slot] = abs
  }
  return files
}

/** The inject's saved variant when its template still has it; else the template default. */
export function variantFor(
  meta: Pick<TemplateMeta, 'variants'>,
  variant: string | undefined,
): string | undefined {
  return variant && meta.variants.includes(variant) ? variant : undefined
}

/**
 * slot → absolute file of the AI images an inject already has, for a template type (which
 * may differ from the stored inject's while the editor changes it). Used by render:preview
 * so the editor preview shows the inject's own images instead of the template samples.
 */
export async function injectSlotFiles(
  root: string,
  scenarioId: string,
  injectId: string,
  type: string,
): Promise<Record<string, string>> {
  const file = scenarioLayout(root, scenarioId).inject(injectId)
  if (!(await exists(file))) return {}
  const inject = await readJson(file, Inject)
  return resolveSlotFiles(root, slotAssets(inject.assets, loadTemplate(type).meta))
}

function assertValidFields(inject: Inject): void {
  const issues = validateFields(inject.type, inject.fields)
  if (!issues.length) return
  const list = issues.map((i) => `${i.path} ${i.message}`).join('; ')
  throw new AppError(
    'VALIDATION',
    `Inject ${inject.id} fields do not match the ${inject.type} template: ${list}`,
    issues,
  )
}

async function removeOldOutputs(root: string, mediaDir: string, old: MediaAsset[]): Promise<void> {
  for (const a of old) {
    for (const p of [a.path, a.posterPath]) {
      if (!p) continue
      const abs = safeJoin(root, p)
      if (isInside(mediaDir, abs)) await fs.rm(abs, { force: true })
    }
  }
}

/**
 * Validate, compose (project brand + AI images in their slots), render PNG (+ PDF for
 * paper templates) into the inject's media folder and return the inject with its template
 * outputs replaced. Does not save the inject; the inject pipeline (#34) and render:inject
 * call this and then saveInject().
 */
export async function renderInjectAssets(
  root: string,
  scenarioId: string,
  inject: Inject,
  opts: RenderInjectOptions = {},
): Promise<RenderedInject> {
  const template = loadTemplate(inject.type)
  assertValidFields(inject)
  const slotFiles = await resolveSlotFiles(root, slotAssets(inject.assets, template.meta))
  const variant = variantFor(template.meta, inject.variant)
  const logo = await brandLogoFile(root, opts.brand)
  const doc = composeDocument({
    type: inject.type,
    fields: inject.fields,
    ...(opts.brand ? { brand: opts.brand } : {}),
    ...(logo ? { logo } : {}),
    ...(variant ? { variant } : {}),
    assets: slotFiles,
  })
  const mediaDir = safeJoin(projectPaths(root).scenarioMedia(scenarioId), inject.id)
  await ensureDir(mediaDir)
  const role: MediaAsset['role'] = Object.keys(slotFiles).length ? 'composite' : 'rendered'
  const provenance = {
    provider: 'template',
    templateId: template.meta.type,
    templateVersion: template.meta.version,
    createdAt: nowIso(),
  }
  const write = async (ext: string, data: Buffer): Promise<{ id: string; path: string }> => {
    const id = newId()
    const abs = safeJoin(mediaDir, `${id}.${ext}`)
    await writeFileAtomic(abs, data)
    return { id, path: toRel(root, abs) }
  }

  const png = await renderPng(doc, opts.scale ?? 2)
  const pngFile = await write('png', png.png)
  const assets: MediaAsset[] = [
    {
      ...pngFile,
      kind: 'image',
      role,
      width: Math.ceil(png.width * png.scale),
      height: Math.ceil(png.height * png.scale),
      sha256: sha256(png.png),
      provenance,
    },
  ]
  if (template.meta.paper) {
    const pdf = await renderPdf(doc)
    assets.push({
      ...(await write('pdf', pdf)),
      kind: 'pdf',
      role,
      sha256: sha256(pdf),
      provenance,
    })
  }

  const old = inject.assets.filter((a) => TEMPLATE_ROLES.has(a.role))
  const kept = inject.assets.filter((a) => !TEMPLATE_ROLES.has(a.role))
  await removeOldOutputs(root, mediaDir, old)
  return { inject: { ...inject, assets: [...kept, ...assets] }, assets }
}

const injectLocks = new Map<string, Promise<unknown>>()

/** One render at a time per inject, so two clicks never interleave file writes. */
async function withInjectLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = injectLocks.get(key) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(fn)
  injectLocks.set(key, run)
  try {
    return await run
  } finally {
    if (injectLocks.get(key) === run) injectLocks.delete(key)
  }
}

/** render:inject — load, render, save. Returns the inject's full asset list after saving. */
export async function renderAndSaveInject(
  root: string,
  scenarioId: string,
  injectId: string,
): Promise<MediaAsset[]> {
  const layout = scenarioLayout(root, scenarioId)
  return withInjectLock(`${root}::${scenarioId}::${injectId}`, async () => {
    const file = layout.inject(injectId)
    if (!(await exists(file)))
      throw new AppError('NOT_FOUND', `No inject ${injectId} in scenario ${scenarioId}`)
    const inject = await readJson(file, Inject)
    const project = await loadProject(root)
    const rendered = await renderInjectAssets(root, scenarioId, inject, { brand: project.brand })
    const saved = await saveInject(root, scenarioId, rendered.inject, {
      by: 'user',
      snapshot: false,
    })
    return saved.assets
  })
}
