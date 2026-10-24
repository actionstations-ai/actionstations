// Compose a full, self-contained HTML document for one inject from its template and data.
// Handlebars escaping stays ON (unlike prompts): field values are untrusted model output.
import Handlebars from 'handlebars'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Brand } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { safeJoin } from '../lib/fs'
import { loadTemplate, sharedDir, type LoadedTemplate } from './templates'
import { paginate, rowGroups, type RowGroup } from './paginate'

export interface ComposeInput {
  type: string
  fields: Record<string, unknown>
  brand?: Brand
  variant?: string
  /** slot → absolute file path or data: URL (AI images for composites). */
  assets?: Record<string, string>
  /** The project logo (absolute path or data: URL); templates read it as `brand.logo`. */
  logo?: string
  /** Project root: its templates layer applies (ADR-0018 layers, #261). */
  projectRoot?: string
}

/** "Karen Smith" → "KS"; skips words that start with punctuation ("Kyle (Summer Intern – Ops)" → "KS"). */
export function initials(s: unknown): string {
  return String(s ?? '')
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

const hb = Handlebars.create()

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

hb.registerHelper({
  eq: (a: unknown, b: unknown) => a === b,
  ne: (a: unknown, b: unknown) => a !== b,
  and: (...args: unknown[]) => args.slice(0, -1).every(Boolean),
  or: (...args: unknown[]) => args.slice(0, -1).some(Boolean),
  not: (a: unknown) => !a,
  gt: (a: number, b: number) => Number(a) > Number(b),
  inc: (n: number) => Number(n) + 1,
  default: (v: unknown, fallback: unknown) =>
    v === undefined || v === null || v === '' ? fallback : v,
  upper: (s: unknown) => String(s ?? '').toUpperCase(),
  lower: (s: unknown) => String(s ?? '').toLowerCase(),
  /** 12400 → "12.4K" (social metrics). Strings pass through unchanged. */
  compact: (n: unknown) => (typeof n === 'number' ? compactNumber.format(n) : String(n ?? '')),
  initials,
  /** Seconds → "m:ss" (83 → "1:23"); text passes through unchanged. */
  clock: (n: unknown) => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return String(n ?? '')
    const s = Math.max(0, Math.round(n))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  },
  /** Escape, then turn newlines into <br>. Safe for untrusted text. */
  nl2br: (s: unknown) =>
    new hb.SafeString(hb.escapeExpression(String(s ?? '')).replace(/\r?\n/g, '<br>')),
  /** Highlight #hashtags and @mentions (escaped first). */
  social: (s: unknown) =>
    new hb.SafeString(
      hb
        .escapeExpression(String(s ?? ''))
        .replace(/(^|\s)([#@][\w]+)/g, '$1<span class="link">$2</span>')
        .replace(/\r?\n/g, '<br>'),
    ),
  join: (list: unknown, sep: unknown) =>
    Array.isArray(list) ? list.join(typeof sep === 'string' ? sep : ', ') : '',
  json: (v: unknown) => JSON.stringify(v),
  /**
   * Row groups for `paginate`: (rows list key="items" heading=60 min=24 line=15 pad=9
   * wrap="description:62") — estimated row heights from text length (see paginate.ts).
   */
  rows: (list: unknown, options: Handlebars.HelperOptions) =>
    rowGroups(list, (options.hash ?? {}) as Record<string, never>),
  /** Pages of row groups: (paginate (rows …) (rows …) first=730 rest=860). See paginate.ts. */
  paginate: (...args: unknown[]) => {
    const options = args.pop() as Handlebars.HelperOptions
    const groups = args.flatMap((a) => (Array.isArray(a) ? (a as RowGroup[]) : []))
    const hash = (options.hash ?? {}) as Record<string, unknown>
    const first = Number(hash.first ?? 860)
    return paginate(groups, first, Number(hash.rest ?? first))
  },
  /** Repeat a block n times: {{#times 5}}…{{/times}} (index as @index). */
  times(n: number, options: Handlebars.HelperOptions) {
    let out = ''
    for (let i = 0; i < Number(n); i++) {
      // Keep @root and parent data inside the block; only add @index.
      const data = Handlebars.createFrame(options.data ?? {})
      data.index = i
      out += options.fn(this, { data })
    }
    return out
  },
})

const compiled = new Map<string, Handlebars.TemplateDelegate>()

function compile(t: LoadedTemplate): Handlebars.TemplateDelegate {
  // The same type can come from several layers (project copy, user, pack, built-in).
  const key = `${t.dir}\n${t.html}`
  let fn = compiled.get(key)
  if (!fn) {
    try {
      fn = hb.compile(t.html, { strict: false, knownHelpersOnly: false })
    } catch (e) {
      throw new AppError('VALIDATION', `Template ${t.meta.type}: ${(e as Error).message}`)
    }
    compiled.set(key, fn)
  }
  return fn
}

const fileUrl = (p: string): string => (p.startsWith('data:') ? p : pathToFileURL(p).toString())

function resolveAssets(
  t: LoadedTemplate,
  input: ComposeInput,
  usePreviewAssets: boolean,
): Record<string, string> {
  const out: Record<string, string> = {}
  if (usePreviewAssets) {
    for (const [slot, rel] of Object.entries(t.preview.assets))
      out[slot] = fileUrl(safeJoin(t.dir, rel))
  }
  for (const [slot, p] of Object.entries(input.assets ?? {})) out[slot] = fileUrl(p)
  return out
}

export interface ComposedDocument {
  html: string
  meta: LoadedTemplate['meta']
  /** Folder the document must be loaded from (relative font/asset URLs resolve here). */
  baseDir: string
  /**
   * Folders and files the render window may read (#301): the template folder,
   * templates/_shared (fonts) and the exact media files bound in (slot images, logo).
   */
  readRoots: string[]
}

/**
 * The render document's CSP: no script, no frames, no forms, no <base> from the template
 * (the window's own <base> comes first); images and fonts from files or data: only.
 * The render window enforces which files (render/sandbox.ts).
 */
export const RENDER_CSP =
  "default-src 'none'; img-src file: data:; font-src file: data:; style-src 'unsafe-inline'; " +
  "script-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; " +
  "form-action 'none'; base-uri 'none'"

/** Absolute files bound into a document (data: URLs need no read access). */
const boundFiles = (paths: (string | undefined)[]): string[] =>
  paths.filter((p): p is string => !!p && !p.startsWith('data:'))

export function composeDocument(
  input: ComposeInput,
  opts: { previewAssets?: boolean } = {},
): ComposedDocument {
  const t = loadTemplate(input.type, input.projectRoot)
  const variant = input.variant ?? t.meta.variants[0] ?? 'default'
  const body = compile(t)({
    fields: input.fields,
    brand: {
      ...(input.brand ?? { aliases: {} }),
      ...(input.logo ? { logo: fileUrl(input.logo) } : {}),
    },
    variant,
    assets: resolveAssets(t, input, opts.previewAssets ?? false),
  })
  const shared = sharedDir()
  const fontsCss = readFileSync(join(shared, 'fonts.css'), 'utf8').replaceAll(
    "url('fonts/",
    `url('${pathToFileURL(join(shared, 'fonts')).toString()}/`,
  )
  const baseCss = readFileSync(join(shared, 'base.css'), 'utf8')
  const height = t.meta.height ? `height:${t.meta.height}px;` : ''
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${RENDER_CSP}">
<style>${fontsCss}\n${baseCss}\nhtml,body{background:${t.meta.background}}\n${t.css}</style></head>
<body class="variant-${variant}"><main class="inject-root inject-${t.meta.type}" style="width:${t.meta.width}px;${height}">${body}</main></body></html>`
  const readRoots = [
    t.dir,
    shared,
    ...boundFiles([...Object.values(input.assets ?? {}), input.logo]),
  ]
  return { html, meta: t.meta, baseDir: t.dir, readRoots }
}
