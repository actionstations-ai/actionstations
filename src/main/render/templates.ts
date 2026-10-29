// Inject template folders (ADR-0008): <layer>/<type>/
//   meta.json    { type, label, version, width, height?, paper, variants[], background?,
//                  taxonomy? }  (taxonomy: how a type that is not built in joins the taxonomy)
//   schema.json  JSON Schema for the inject's `fields`
//   preview.json { fields, variant?, assets?, variants? } — realistic sample data (golden tests
//                use it); variants.<name>.fields overrides top-level fields for that variant
//   template.html  Handlebars body (HTML-escaped by default)
//   style.css      template styles (bundled fonts from templates/_shared/fonts.css)
//
// Layers (ADR-0018, #261), first match wins:
//   project   <project>/templates/injects/<type>/   (pack templates are copied here on use)
//   user      userData/templates/injects/<type>/
//   pack      enabled installed packs (two enabled packs never provide the same type)
//   builtin   the bundled packs (ADR-0020: core and domain packs included with the app,
//             enabled or not, so a project keeps rendering a disabled pack's types)
// Every layer but the built-in (bundled) one passes the template checker (packs/template-check.ts) and
// the schema regex rule (packs/schema-regex.ts) when it is loaded, and a project whose
// templates/ or templates/injects/ folder is a symlink has no project layer; a refused template is skipped (the next layer applies) and reported by
// refusedTemplates(). With no lower layer, loading the type throws VALIDATION.
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { z } from 'zod'
import type { TemplateInfo } from '@shared/ipc'
import { TemplateTaxonomy, type PackProblem } from '@shared/schemas/pack'
import type { PackCopyState, ProjectPackCopy } from '@shared/schemas/project-packs'
import { AppError } from '../lib/errors'
import { safeJoinReal } from '../lib/fs'
import { resourcePath, userDataPath } from '../lib/paths'
import { bundledItem, bundledPacks, enabledPacks, packItemPath } from '../packs/layers'
import { schemaRegexProblems } from '../packs/schema-regex'
import { checkTemplateFiles } from '../packs/template-check'

export const TemplateMeta = z.object({
  type: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string(),
  version: z.string().default('1'),
  /** CSS pixel width of the rendered inject (PNG is width × scale). */
  width: z.number().int().positive(),
  /** Fixed height; omit to size to content. */
  height: z.number().int().positive().optional(),
  /** Paper injects (memos, slips, letters) also export as PDF pages. */
  paper: z.boolean().default(false),
  variants: z.array(z.string()).default([]),
  /** Page background behind the inject (e.g. the app chrome color of a tweet screenshot). */
  background: z.string().default('#ffffff'),
  /** Names of image slots the template can show, filled from AI media (composites). */
  imageSlots: z.array(z.string()).default([]),
  /**
   * How a type that is not in the built-in taxonomy joins it (category, render paths,
   * delivery, domains). Kept on the meta so the registry can be built from whichever layer
   * provides the type, including a project copy after its pack is gone. Ignored for
   * built-in types: their taxonomy entry stays the one in src/shared/taxonomy.ts.
   */
  taxonomy: TemplateTaxonomy.optional(),
  /**
   * Where the template shows counts and comments, so Facilitate can grow them (spec 0428):
   * `metrics` maps a metric name to a field path ("metrics.likes"); `replies` names a comment
   * list field and the keys of an item. Built-in social templates are mapped in code.
   */
  engagement: z
    .object({
      metrics: z.record(z.string().max(40), z.string().max(80)),
      replies: z
        .object({
          field: z.string().max(80),
          max: z.number().int().min(1).max(20),
          authorKey: z.string().max(40).default('author'),
          textKey: z.string().max(40).default('text'),
        })
        .optional(),
    })
    .optional(),
})
export type TemplateMeta = z.infer<typeof TemplateMeta>

export const TemplatePreview = z.object({
  fields: z.record(z.string(), z.unknown()),
  variant: z.string().optional(),
  /** slot → path relative to the template folder (sample images for previews/goldens). */
  assets: z.record(z.string(), z.string()).default({}),
  /**
   * Per-variant sample data (#331): variant → top-level fields that replace those in `fields`
   * when that variant is previewed, so each golden shows content that fits its variant.
   */
  variants: z
    .record(z.string(), z.object({ fields: z.record(z.string(), z.unknown()) }))
    .default({}),
})
export type TemplatePreview = z.infer<typeof TemplatePreview>

/** The preview fields for one variant: `fields` with that variant's overrides on top. */
export function previewFields(
  preview: Pick<TemplatePreview, 'fields' | 'variants'>,
  variant?: string,
): Record<string, unknown> {
  const over = variant ? preview.variants?.[variant]?.fields : undefined
  return over ? { ...preview.fields, ...over } : preview.fields
}

export type TemplateSource = 'project' | 'user' | 'pack' | 'builtin'
export const TEMPLATE_SOURCES: readonly TemplateSource[] = ['project', 'user', 'pack', 'builtin']

export interface TemplatePackRef {
  id: string
  version: string
  name: string
  /** A pack included with the app (ADR-0020). */
  bundled?: boolean
  /** Bundled packs: whether the user has it on (off = hidden from new use). */
  enabled?: boolean
}

/** One layer's folder for a type, before it is loaded. */
export interface TemplateLayer {
  source: TemplateSource
  dir: string
  /** For the pack layer: the enabled pack providing the type. */
  pack?: TemplatePackRef
}

export interface LoadedTemplate {
  dir: string
  meta: TemplateMeta
  schema: Record<string, unknown>
  preview: z.infer<typeof TemplatePreview>
  html: string
  css: string
  /** Layer the template was loaded from. */
  source: TemplateSource
  pack?: TemplatePackRef
  /** The next lower layer that also has this type (shadowed by this one). */
  replaces?: TemplateSource
  /** That lower layer's pack, when it is a pack (installed or bundled). */
  replacesPack?: TemplatePackRef
}

export interface RefusedTemplate {
  type: string
  source: TemplateSource
  dir: string
  pack?: TemplatePackRef
  problems: PackProblem[]
}

export const sharedDir = (): string => resourcePath('templates', '_shared')
export const userTemplatesRoot = (): string => userDataPath('templates', 'injects')
/** The user layer, or undefined where there is no userData folder (unit tests without one). */
function userRoot(): string | undefined {
  try {
    return userTemplatesRoot()
  } catch {
    return undefined
  }
}
export const projectTemplatesRoot = (projectRoot: string): string =>
  join(projectRoot, 'templates', 'injects')

/**
 * The project layer's root, or undefined when <project>/templates or templates/injects is a
 * symlink: a shared project must not point its layer (or copy-on-use writes) elsewhere.
 */
function projectRootDir(projectRoot: string | undefined): string | undefined {
  if (!projectRoot) return undefined
  for (const rel of ['templates', join('templates', 'injects')]) {
    try {
      if (lstatSync(join(projectRoot, rel)).isSymbolicLink()) return undefined
    } catch {
      return undefined // missing: no project layer
    }
  }
  return projectTemplatesRoot(projectRoot)
}

const TYPE_RE = /^[a-z0-9_]+$/

// ---- layers --------------------------------------------------------------------------------

/** A type folder under a root that may be a shared folder: no symlink out, has template.html. */
function layerDir(root: string, type: string): string | undefined {
  if (!existsSync(join(root, type, 'template.html'))) return undefined
  try {
    return safeJoinReal(root, type)
  } catch {
    return undefined // a link out of the layer folder is not a template of this layer
  }
}

/** Every layer that has `type`, highest precedence first. */
export function templateLayers(type: string, projectRoot?: string): TemplateLayer[] {
  if (!TYPE_RE.test(type)) throw new AppError('VALIDATION', `Invalid template type "${type}"`)
  const out: TemplateLayer[] = []
  const projectDir = projectRootDir(projectRoot)
  const project = projectDir ? layerDir(projectDir, type) : undefined
  if (project) out.push({ source: 'project', dir: project })
  const userDir = userRoot()
  const user = userDir ? layerDir(userDir, type) : undefined
  if (user) out.push({ source: 'user', dir: user })
  for (const pack of enabledPacks()) {
    if (!pack.manifest.contents.templates.includes(type)) continue
    try {
      const dir = packItemPath(pack, 'templates', type)
      if (existsSync(join(dir, 'template.html')))
        out.push({
          source: 'pack',
          dir,
          pack: { id: pack.id, version: pack.version, name: pack.name },
        })
    } catch {
      // listed but unreadable: verifyPacks reports it; the next layer applies
    }
  }
  const bundled = bundledItem('templates', type)
  if (bundled && existsSync(join(bundled.path, 'template.html')))
    out.push({
      source: 'builtin',
      dir: bundled.path,
      pack: {
        id: bundled.pack.id,
        version: bundled.pack.version,
        name: bundled.pack.name,
        bundled: true,
        enabled: bundled.pack.enabled !== false,
      },
    })
  return out
}

/** Latest mtime of a template folder's files and sub-folders (cache key). */
function treeMtime(dir: string): number {
  let max = statSync(dir).mtimeMs
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name)
    max = Math.max(max, d.isDirectory() ? treeMtime(p) : statSync(p).mtimeMs)
  }
  return max
}

type CacheEntry =
  | { mtime: number; ok: true; t: Omit<LoadedTemplate, 'replaces'> }
  | { mtime: number; ok: false; problems: PackProblem[] }

/** Cache keyed by layer folder (a pack folder includes its version). */
const cache = new Map<string, CacheEntry>()

function readLayer(type: string, layer: TemplateLayer): CacheEntry {
  const { dir } = layer
  const mtime = treeMtime(dir)
  const hit = cache.get(dir)
  if (hit && hit.mtime === mtime) return hit
  let entry: CacheEntry
  const problems = layer.source === 'builtin' ? [] : checkTemplateFiles(dir)
  if (problems.length) entry = { mtime, ok: false, problems }
  else {
    try {
      const t = parseLayer(type, layer)
      const regex = layer.source === 'builtin' ? [] : schemaRegexProblems(t.schema)
      entry = regex.length
        ? { mtime, ok: false, problems: regex.map((p) => ({ path: 'schema.json', ...p })) }
        : { mtime, ok: true, t }
    } catch (e) {
      if (layer.source === 'builtin') throw e
      const problems =
        e instanceof z.ZodError
          ? e.issues.map((i) => ({ message: `${i.path.join('.') || '/'}: ${i.message}` }))
          : [{ message: (e as Error).message }]
      entry = { mtime, ok: false, problems }
    }
  }
  cache.set(dir, entry)
  return entry
}

function parseLayer(type: string, layer: TemplateLayer): Omit<LoadedTemplate, 'replaces'> {
  const { dir } = layer
  const read = (f: string) => readFileSync(join(dir, f), 'utf8')
  const json = (f: string): unknown => (existsSync(join(dir, f)) ? JSON.parse(read(f)) : {})
  const meta = TemplateMeta.parse(json('meta.json'))
  if (meta.type !== type)
    throw new AppError('VALIDATION', `meta.json type "${meta.type}" ≠ folder "${type}"`)
  return {
    dir,
    meta,
    schema: json('schema.json') as Record<string, unknown>,
    preview: TemplatePreview.parse(json('preview.json')),
    html: read('template.html'),
    css: existsSync(join(dir, 'style.css')) ? read('style.css') : '',
    source: layer.source,
    ...(layer.pack ? { pack: layer.pack } : {}),
  }
}

const SOURCE_LABEL: Record<TemplateSource, string> = {
  project: 'project folder',
  user: 'user templates folder',
  pack: 'pack',
  builtin: 'included pack',
}

const refusedText = (r: { source: TemplateSource; pack?: TemplatePackRef }, p: PackProblem[]) =>
  `${r.pack ? `${r.pack.name} (${r.pack.id})` : SOURCE_LABEL[r.source]}: ${p
    .slice(0, 3)
    .map((x) => (x.path ? `${x.path}: ${x.message}` : x.message))
    .join('; ')}`

/** The template for `type` as the project sees it (project > user > pack > built-in). */
export function loadTemplate(type: string, projectRoot?: string): LoadedTemplate {
  const layers = templateLayers(type, projectRoot)
  if (!layers.length) throw new AppError('NOT_FOUND', `No template for inject type "${type}"`)
  const refused: { layer: TemplateLayer; problems: PackProblem[] }[] = []
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!
    const entry = readLayer(type, layer)
    if (!entry.ok) {
      refused.push({ layer, problems: entry.problems })
      continue
    }
    const below = layers[i + 1]
    // The cache is per folder; the layer's pack (a bundled pack's enabled state) is current.
    const t = layer.pack ? { ...entry.t, pack: layer.pack } : entry.t
    return below
      ? { ...t, replaces: below.source, ...(below.pack ? { replacesPack: below.pack } : {}) }
      : t
  }
  throw new AppError(
    'VALIDATION',
    `Template "${type}" was refused (${refused.map((r) => refusedText(r.layer, r.problems)).join(' | ')})`,
    refused.flatMap((r) => r.problems),
  )
}

/** The layer loadTemplate would use, or undefined (no template, or every layer refused). */
export function resolveTemplateLayer(
  type: string,
  projectRoot?: string,
): TemplateLayer | undefined {
  if (!TYPE_RE.test(type)) return undefined
  for (const layer of templateLayers(type, projectRoot)) {
    try {
      if (readLayer(type, layer).ok) return layer
    } catch {
      return undefined
    }
  }
  return undefined
}

function typeFolders(root: string | undefined): string[] {
  if (!root || !existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter(
      (d) =>
        (d.isDirectory() || d.isSymbolicLink()) &&
        TYPE_RE.test(d.name) &&
        existsSync(join(root, d.name, 'template.html')),
    )
    .map((d) => d.name)
}

/**
 * Template types of the bundled packs (what installed pack items may shadow); with
 * `enabledOnly`, only those of enabled bundled packs (offered for new use).
 */
export const listBuiltinTemplateTypes = (opts: { enabledOnly?: boolean } = {}): string[] =>
  [
    ...new Set(
      bundledPacks()
        .filter((p) => !opts.enabledOnly || p.enabled !== false)
        .flatMap((p) => p.manifest.contents.templates),
    ),
  ].sort()

/**
 * Whether a resolved template comes from a bundled pack the user disabled: it still renders
 * for projects that use it, but the gallery and the type pickers leave it out (ADR-0020).
 */
export const isHiddenTemplate = (t: { source: TemplateSource; pack?: TemplatePackRef }): boolean =>
  t.source === 'builtin' && t.pack?.enabled === false

/** Every template type the project can render, across all layers (refused-only types left out). */
export function listTemplateTypes(projectRoot?: string): string[] {
  const builtin = listBuiltinTemplateTypes()
  const names = new Set(builtin)
  const extra = new Set<string>([
    ...typeFolders(projectRootDir(projectRoot)),
    ...typeFolders(userRoot()),
    ...enabledPacks().flatMap((p) => p.manifest.contents.templates),
  ])
  for (const type of extra) {
    if (names.has(type)) continue
    if (resolveTemplateLayer(type, projectRoot)) names.add(type)
  }
  return [...names].sort()
}

/** Templates refused by the checker (or unreadable) in the non-built-in layers. */
export function refusedTemplates(projectRoot?: string): RefusedTemplate[] {
  const types = new Set<string>([
    ...typeFolders(projectRootDir(projectRoot)),
    ...typeFolders(userRoot()),
    ...enabledPacks().flatMap((p) => p.manifest.contents.templates),
  ])
  const out: RefusedTemplate[] = []
  for (const type of [...types].sort()) {
    for (const layer of templateLayers(type, projectRoot)) {
      if (layer.source === 'builtin') continue
      const entry = readLayer(type, layer)
      if (!entry.ok)
        out.push({
          type,
          source: layer.source,
          dir: layer.dir,
          ...(layer.pack ? { pack: layer.pack } : {}),
          problems: entry.problems,
        })
    }
  }
  return out
}

/** Provenance of a project copy of a pack template (packs.json record + its state). */
export interface TemplateCopyInfo {
  copy: ProjectPackCopy
  state: PackCopyState
}

export function templateInfo(t: LoadedTemplate, copy?: TemplateCopyInfo): TemplateInfo {
  const pack = t.pack
    ? {
        packId: t.pack.id,
        packVersion: t.pack.version,
        packName: t.pack.name,
        ...(t.pack.bundled ? { bundled: true } : {}),
        ...(t.pack.enabled === false ? { hidden: true } : {}),
      }
    : copy
      ? {
          packId: copy.copy.packId,
          packVersion: copy.copy.version,
          ...(copy.copy.packName ? { packName: copy.copy.packName } : {}),
        }
      : {}
  return {
    type: t.meta.type,
    label: t.meta.label,
    version: t.meta.version,
    schema: t.schema,
    preview: t.preview.fields,
    ...(Object.keys(t.preview.variants).length
      ? {
          previewVariants: Object.fromEntries(
            Object.keys(t.preview.variants).map((v) => [v, previewFields(t.preview, v)]),
          ),
        }
      : {}),
    paper: t.meta.paper,
    variants: t.meta.variants,
    width: t.meta.width,
    ...(t.meta.height ? { height: t.meta.height } : {}),
    // A bundled template is a pack item (ADR-0020): "Included: <pack>" in the UI.
    source: t.source === 'builtin' && t.pack ? 'pack' : t.source,
    ...pack,
    ...(t.replaces ? { replaces: t.replaces } : {}),
    ...(t.replacesPack ? { replacesPackName: t.replacesPack.name } : {}),
    ...(copy ? { copy: copy.state } : {}),
  }
}

/** Tests: forget loaded templates (e.g. between TTX_USER_DATA folders). */
export function clearTemplateCache(): void {
  cache.clear()
}

// --- Field validation against schema.json (used by previews, golden tests and inject stages)

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validators = new WeakMap<object, ReturnType<typeof ajv.compile>>()

export interface FieldIssue {
  path: string
  message: string
}

/** Validate inject fields against the JSON Schema of the template the project uses. */
export function validateFields(type: string, fields: unknown, projectRoot?: string): FieldIssue[] {
  const t = loadTemplate(type, projectRoot)
  let v = validators.get(t.schema)
  if (!v) {
    v = ajv.compile(t.schema)
    validators.set(t.schema, v)
  }
  if (v(fields)) return []
  return (v.errors ?? []).map((e) => ({
    path: e.instancePath || '/',
    message: e.message ?? 'invalid',
  }))
}
