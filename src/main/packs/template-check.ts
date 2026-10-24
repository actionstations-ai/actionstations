// Template checker (ADR-0018, docs/packs-format.md "Template HTML and CSS"). Inject templates
// from packs, the user layer and project folders are shared files; a template that could run
// script or reach the network is refused, not cleaned up, so the author's file and what the
// site validator accepted stay identical. The render window's CSP and network block remain
// the second layer (ADR-0008).
//
//   checkTemplateFiles(files)  files: Map of template-folder-relative path → content, or the
//                              absolute path of a template folder. Returns problems (empty = ok).
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PACK_EXTENSIONS, type PackProblem } from '@shared/schemas/pack'

export type TemplateFiles = ReadonlyMap<string, string | Buffer>

const BANNED_TAGS = new Set([
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'base',
  'form',
  'link',
  'portal',
])
/** Attributes whose value is a URL the renderer would load or navigate to. */
const URL_ATTRS = new Set([
  'src',
  'href',
  'xlink:href',
  'srcset',
  'poster',
  'action',
  'formaction',
  'data',
  'background',
  'lowsrc',
  'ping',
])
const TAG = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const ATTR = /([^\s"'=<>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi
const MUSTACHE = /\{\{[\s\S]*?\}\}/g
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const DATA_OK = /^data:(?:image|font)\//i

const unquote = (v: string): string =>
  (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))
    ? v.slice(1, -1)
    : v

/** Why a URL is not allowed in a template, or undefined when it is local. */
export function templateUrlProblem(raw: string): string | undefined {
  // Values filled in by Handlebars come from the app (fields, assets): only the literal
  // parts of the value are the template's own.
  const url = raw.replace(MUSTACHE, '').trim()
  if (url === '' || url.startsWith('#')) return undefined
  if (DATA_OK.test(url)) return undefined
  if (SCHEME.test(url) || url.startsWith('//') || url.startsWith('\\'))
    return `"${raw}" is not allowed (only files of the template folder and data:image or data:font URLs)`
  if (url.startsWith('/'))
    return `"${raw}" is an absolute path; use a path inside the template folder`
  const path = url.split(/[?#]/)[0]!
  if (path.split(/[/\\]/).some((s) => s === '..'))
    return `"${raw}" points outside the template folder`
  return undefined
}

function checkHandlebars(text: string, file: string, out: PackProblem[]): void {
  if (text.includes('{{{'))
    out.push({
      path: file,
      message: 'Handlebars triple-stash {{{ }}} (unescaped output) is not allowed',
    })
  if (/\{\{~?\s*#?>/.test(text) || /\{\{~?\s*#\*inline/.test(text))
    out.push({ path: file, message: 'Handlebars partials ({{> }}) are not allowed' })
}

/** CSS rules: no @import, no expression(), no legacy script bindings, local url() only. */
export function checkCss(css: string, file: string, out: PackProblem[]): void {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  if (/@import\b/i.test(text)) out.push({ path: file, message: 'CSS @import is not allowed' })
  if (/expression\s*\(/i.test(text))
    out.push({ path: file, message: 'CSS expression() is not allowed' })
  if (/-moz-binding|behavior\s*:/i.test(text))
    out.push({ path: file, message: 'CSS -moz-binding / behavior is not allowed' })
  for (const m of text.matchAll(/url\(\s*("[^"]*"|'[^']*'|[^)]*?)\s*\)/gi)) {
    const problem = templateUrlProblem(unquote(m[1]!.trim()))
    if (problem) out.push({ path: file, message: `CSS url(): ${problem}` })
  }
  for (const m of text.matchAll(/image-set\(([^)]*)\)/gi)) {
    for (const s of m[1]!.matchAll(/"([^"]*)"|'([^']*)'/g)) {
      const problem = templateUrlProblem(s[1] ?? s[2] ?? '')
      if (problem) out.push({ path: file, message: `CSS image-set(): ${problem}` })
    }
  }
}

function checkAttr(
  tag: string,
  name: string,
  value: string,
  file: string,
  out: PackProblem[],
): void {
  const lower = name.toLowerCase()
  if (lower.startsWith('on'))
    out.push({
      path: file,
      message: `<${tag} ${name}=…>: event handler attributes are not allowed`,
    })
  else if (lower === 'style') checkCss(value, file, out)
  else if (lower === 'srcset' || lower === 'imagesrcset') {
    for (const candidate of value.split(','))
      checkUrl(tag, name, candidate.trim().split(/\s+/)[0] ?? '', file, out)
  } else if (URL_ATTRS.has(lower)) checkUrl(tag, name, value, file, out)
  else if (lower === 'http-equiv' && tag === 'meta')
    out.push({ path: file, message: '<meta http-equiv> is not allowed' })
  else if (lower === 'attributename' && /href/i.test(value) && /^(animate|set)$/i.test(tag))
    out.push({ path: file, message: `<${tag} attributeName="${value}"> is not allowed` })
}

function checkUrl(
  tag: string,
  name: string,
  value: string,
  file: string,
  out: PackProblem[],
): void {
  const problem = templateUrlProblem(value)
  if (problem) out.push({ path: file, message: `<${tag} ${name}>: ${problem}` })
}

/** HTML rules for template.html (Handlebars source, checked as written). */
export function checkTemplateHtml(html: string, file: string, out: PackProblem[]): void {
  checkHandlebars(html, file, out)
  const text = html.replace(/<!--[\s\S]*?-->/g, '')
  for (const m of text.matchAll(TAG)) {
    const tag = m[1]!.toLowerCase()
    if (BANNED_TAGS.has(tag)) out.push({ path: file, message: `<${tag}> is not allowed` })
    for (const a of (m[2] ?? '').matchAll(ATTR)) {
      if (a[1]!.startsWith('{{') || a[1]!.endsWith('}}')) continue
      checkAttr(tag, a[1]!, unquote(a[2] ?? ''), file, out)
    }
  }
  for (const m of text.matchAll(STYLE_BLOCK)) checkCss(m[1]!, file, out)
}

function checkPreviewAssets(json: string, out: PackProblem[]): void {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return // the schema check reports invalid JSON
  }
  const assets = (data as { assets?: unknown })?.assets
  if (!assets || typeof assets !== 'object') return
  for (const [slot, value] of Object.entries(assets)) {
    if (typeof value !== 'string') continue
    const problem = templateUrlProblem(value)
    if (problem) out.push({ path: 'preview.json', message: `assets.${slot}: ${problem}` })
  }
}

const textOf = (v: string | Buffer): string => (typeof v === 'string' ? v : v.toString('utf8'))
const extOf = (p: string): string => {
  const name = p.slice(p.lastIndexOf('/') + 1)
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i).toLowerCase()
}

function checkFileName(path: string, out: PackProblem[]): void {
  const ext = extOf(path)
  if (!PACK_EXTENSIONS.templates.includes(ext))
    out.push({ path, message: `${ext || 'files without an extension'} not allowed in a template` })
  else if (ext === '.html' && path !== 'template.html')
    out.push({ path, message: 'the only HTML file in a template is template.html' })
}

/** Read a template folder: regular files only (a link is a problem, not followed). */
function readTemplateDir(dir: string, out: PackProblem[]): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  const walk = (rel: string) => {
    for (const name of readdirSync(join(dir, rel))) {
      const r = rel ? `${rel}/${name}` : name
      const st = lstatSync(join(dir, r))
      if (st.isSymbolicLink()) out.push({ path: r, message: 'links are not allowed in a template' })
      else if (st.isDirectory()) walk(r)
      else if (st.isFile()) files.set(r, readFileSync(join(dir, r)))
      else out.push({ path: r, message: 'not a regular file' })
    }
  }
  walk('')
  return files
}

/** Check one template folder's files. Paths in problems are relative to the template folder. */
export function checkTemplateFiles(files: TemplateFiles | string): PackProblem[] {
  const out: PackProblem[] = []
  const map = typeof files === 'string' ? readTemplateDir(files, out) : files
  if (!map.has('template.html')) out.push({ path: 'template.html', message: 'missing' })
  for (const [path, content] of map) {
    checkFileName(path, out)
    const ext = extOf(path)
    if (path === 'template.html') checkTemplateHtml(textOf(content), path, out)
    else if (ext === '.css') checkCss(textOf(content), path, out)
    else if (path === 'preview.json') checkPreviewAssets(textOf(content), out)
  }
  return out
}
