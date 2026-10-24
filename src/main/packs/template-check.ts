// Template checker (ADR-0018, docs/packs-format.md "Template HTML and CSS"). Inject templates
// from packs, the user layer and project folders are shared files; a template that could run
// script or reach the network is refused, not cleaned up, so the author's file and what the
// site validator accepted stay identical. The checker works on structure (#301): the
// Handlebars AST and a real HTML parse of template.html (template-html.ts), tokenized CSS
// (template-css.ts). The render and PDF windows lock down navigation and file access on their
// own (render/sandbox.ts), so either layer alone stops a template from reading local files.
//
//   checkTemplateFiles(files)  files: Map of template-folder-relative path → content, or the
//                              absolute path of a template folder. Returns problems (empty = ok).
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PACK_EXTENSIONS, type PackProblem } from '@shared/schemas/pack'
import { checkCss } from './template-css'
import { checkTemplateHtml } from './template-html'
import { templateUrlProblem } from './template-url'

export { checkCss } from './template-css'
export { checkTemplateHtml } from './template-html'
export { templateUrlProblem } from './template-url'

export type TemplateFiles = ReadonlyMap<string, string | Buffer>

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
