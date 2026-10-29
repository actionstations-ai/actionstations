// Document language for exports (spec 0435 FR-13). English is the source; a language file in
// templates/export/strings/<lang>.json maps each English chrome string to its translation, so
// code and templates keep the English text at the call site and a missing entry falls back to it.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupportedLanguage } from '@shared/schemas'
import { resourcePath } from '../lib/paths'

export type DocLang = 'en' | SupportedLanguage

export const LOCALE: Record<DocLang, string> = { en: 'en-US', es: 'es-US' }

const cache = new Map<DocLang, Record<string, string>>()

/** English string → translation for the language ({} for English). */
export function exportStrings(lang: DocLang): Record<string, string> {
  if (lang === 'en') return {}
  const hit = cache.get(lang)
  if (hit) return hit
  const raw = JSON.parse(
    readFileSync(join(resourcePath('templates', 'export'), 'strings', `${lang}.json`), 'utf8'),
  )
  const strings: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') strings[k] = v
  cache.set(lang, strings)
  return strings
}

/** The chrome string in the document language; the English text when there is no entry. */
export const tr = (lang: DocLang | undefined, english: string): string =>
  (lang && lang !== 'en' ? exportStrings(lang)[english] : undefined) ?? english

/** "Oct 14, 2027" / "14 oct 2027" in the document's locale. */
export function formatDocDate(iso: string, lang: DocLang = 'en'): string {
  return new Date(iso).toLocaleDateString(LOCALE[lang], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Rendition labels at line starts ("From: …") in the document language. */
export function localizeRendition(text: string, lang: DocLang | undefined): string {
  if (!lang || lang === 'en') return text
  const strings = exportStrings(lang)
  return text
    .split('\n')
    .map((line) => {
      const m = /^([A-Z][A-Za-z ]{1,24}?)(: |\s\d)/.exec(line)
      const label = m?.[1] ? strings[m[1]] : undefined
      return label && m ? `${label}${line.slice(m[1]!.length)}` : line
    })
    .join('\n')
}
