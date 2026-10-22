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

export interface ComposeInput {
  type: string
  fields: Record<string, unknown>
  brand?: Brand
  variant?: string
  /** slot → absolute file path or data: URL (AI images for composites). */
  assets?: Record<string, string>
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
  const key = `${t.meta.type}@${t.html.length}:${t.html.slice(0, 64)}`
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
}

export function composeDocument(
  input: ComposeInput,
  opts: { previewAssets?: boolean } = {},
): ComposedDocument {
  const t = loadTemplate(input.type)
  const variant = input.variant ?? t.meta.variants[0] ?? 'default'
  const body = compile(t)({
    fields: input.fields,
    brand: input.brand ?? { aliases: {} },
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; font-src file: data:; style-src 'unsafe-inline'">
<style>${fontsCss}\n${baseCss}\nhtml,body{background:${t.meta.background}}\n${t.css}</style></head>
<body class="variant-${variant}"><main class="inject-root inject-${t.meta.type}" style="width:${t.meta.width}px;${height}">${body}</main></body></html>`
  return { html, meta: t.meta, baseDir: t.dir }
}
