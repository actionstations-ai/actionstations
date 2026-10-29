// Document templates in templates/export/: Handlebars with HTML escaping ON (every value is
// untrusted model or user text). Pre-rendered HTML (markdown bodies, embedded forms) is passed
// in as SafeString from code only — templates never use triple-stash.
import Handlebars from 'handlebars'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '../lib/errors'
import { resourcePath } from '../lib/paths'
import { exportStrings, type DocLang } from './lang'

export const exportTemplatesDir = (): string => resourcePath('templates', 'export')

export type ExportTemplateName =
  | 'layout'
  | 'msel'
  | 'path'
  | 'deck'
  | 'handbook'
  | 'briefing'
  | 'cover'
  | 'survey'
  | 'survey-results'
  | 'eeg'
  | 'hseep'
  | 'aar'
  | 'player-injects'

const hb = Handlebars.create()

/** {{t 'English text'}}: the chrome string in the document language (spec 0435 FR-13). */
hb.registerHelper('t', (...args: unknown[]) => {
  const options = args.pop() as Handlebars.HelperOptions
  const english = String(args[0] ?? '')
  const strings = (options.data?.strings ?? {}) as Record<string, string>
  return strings[english] ?? english
})
let partialsLoaded = false

function readTemplateFile(...parts: string[]): string {
  try {
    return readFileSync(join(exportTemplatesDir(), ...parts), 'utf8')
  } catch {
    throw new AppError('NOT_FOUND', `Missing export template ${parts.join('/')}`)
  }
}

function loadPartials(): void {
  if (partialsLoaded) return
  const dir = join(exportTemplatesDir(), 'partials')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    hb.registerPartial(file.replace(/\.html$/, ''), readTemplateFile('partials', file))
  }
  partialsLoaded = true
}

/** Render one export template with `context` (strings escaped; SafeString passes through). */
export function renderExportTemplate(
  name: ExportTemplateName,
  context: object,
  lang: DocLang = 'en',
): string {
  loadPartials()
  const fn = hb.compile(readTemplateFile(`${name}.html`), { strict: false })
  return fn(context, { data: { strings: exportStrings(lang) } })
}

/** Mark HTML produced by trusted code (sanitized markdown, template forms) as safe. */
export const trusted = (html: string): Handlebars.SafeString => new hb.SafeString(html)

export const printCss = (): string => readTemplateFile('print.css')

/** Styles for survey forms and results (#422), added after print.css. */
export const surveyCss = (): string => readTemplateFile('survey.css')
