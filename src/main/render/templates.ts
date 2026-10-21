// Inject template folders (ADR-0008): templates/injects/<type>/
//   meta.json    { type, label, version, width, height?, paper, variants[], background? }
//   schema.json  JSON Schema for the inject's `fields`
//   preview.json { fields, variant?, assets? } — realistic sample data (golden tests use it)
//   template.html  Handlebars body (HTML-escaped by default)
//   style.css      template styles (bundled fonts from templates/_shared/fonts.css)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { z } from 'zod'
import type { TemplateInfo } from '@shared/ipc'
import { AppError } from '../lib/errors'
import { safeJoin } from '../lib/fs'
import { resourcePath } from '../lib/paths'

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
})
export type TemplateMeta = z.infer<typeof TemplateMeta>

export const TemplatePreview = z.object({
  fields: z.record(z.string(), z.unknown()),
  variant: z.string().optional(),
  /** slot → path relative to the template folder (sample images for previews/goldens). */
  assets: z.record(z.string(), z.string()).default({}),
})

export interface LoadedTemplate {
  dir: string
  meta: TemplateMeta
  schema: Record<string, unknown>
  preview: z.infer<typeof TemplatePreview>
  html: string
  css: string
}

export const templatesRoot = (): string => resourcePath('templates', 'injects')
export const sharedDir = (): string => resourcePath('templates', '_shared')

const cache = new Map<string, { mtime: number; t: LoadedTemplate }>()

function dirMtime(dir: string): number {
  return Math.max(...readdirSync(dir).map((f) => statSync(join(dir, f)).mtimeMs))
}

export function loadTemplate(type: string): LoadedTemplate {
  if (!/^[a-z0-9_]+$/.test(type))
    throw new AppError('VALIDATION', `Invalid template type "${type}"`)
  const dir = safeJoin(templatesRoot(), type)
  if (!existsSync(join(dir, 'template.html')))
    throw new AppError('NOT_FOUND', `No template for inject type "${type}"`)
  const mtime = dirMtime(dir)
  const hit = cache.get(type)
  if (hit && hit.mtime === mtime) return hit.t
  const read = (f: string) => readFileSync(join(dir, f), 'utf8')
  const json = (f: string): unknown => (existsSync(join(dir, f)) ? JSON.parse(read(f)) : {})
  const t: LoadedTemplate = {
    dir,
    meta: TemplateMeta.parse(json('meta.json')),
    schema: json('schema.json') as Record<string, unknown>,
    preview: TemplatePreview.parse(json('preview.json')),
    html: read('template.html'),
    css: existsSync(join(dir, 'style.css')) ? read('style.css') : '',
  }
  if (t.meta.type !== type)
    throw new AppError('VALIDATION', `meta.json type "${t.meta.type}" ≠ folder "${type}"`)
  cache.set(type, { mtime, t })
  return t
}

export function listTemplateTypes(): string[] {
  const root = templatesRoot()
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        !d.name.startsWith('_') &&
        existsSync(join(root, d.name, 'template.html')),
    )
    .map((d) => d.name)
    .sort()
}

export function templateInfo(t: LoadedTemplate): TemplateInfo {
  return {
    type: t.meta.type,
    label: t.meta.label,
    version: t.meta.version,
    schema: t.schema,
    preview: t.preview.fields,
    paper: t.meta.paper,
    variants: t.meta.variants,
    width: t.meta.width,
    ...(t.meta.height ? { height: t.meta.height } : {}),
  }
}

// --- Field validation against schema.json (used by previews, golden tests and inject stages)

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validators = new Map<string, ReturnType<typeof ajv.compile>>()

export interface FieldIssue {
  path: string
  message: string
}

/** Validate inject fields against the template's JSON Schema. */
export function validateFields(type: string, fields: unknown): FieldIssue[] {
  const t = loadTemplate(type)
  const key = `${type}@${t.meta.version}:${JSON.stringify(t.schema).length}`
  let v = validators.get(key)
  if (!v) {
    v = ajv.compile(t.schema)
    validators.set(key, v)
  }
  if (v(fields)) return []
  return (v.errors ?? []).map((e) => ({
    path: e.instancePath || '/',
    message: e.message ?? 'invalid',
  }))
}
