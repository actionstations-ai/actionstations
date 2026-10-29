// Glossary terms (spec 0435 FR-8): fixed English → translation pairs. A translation that
// leaves out the fixed form of a term the English has is flagged for the reviewer.
import { DEFAULT_GLOSSARY, type GlossaryEntry, type SupportedLanguage } from '@shared/schemas'

/** Defaults plus the project's entries; a project entry replaces a default with the same term. */
export function effectiveGlossary(
  lang: SupportedLanguage,
  project: Partial<Record<SupportedLanguage, GlossaryEntry[]>> | undefined,
): GlossaryEntry[] {
  const own = project?.[lang] ?? []
  const taken = new Set(own.map((e) => e.term.toLowerCase()))
  return [...DEFAULT_GLOSSARY[lang].filter((e) => !taken.has(e.term.toLowerCase())), ...own]
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hasTerm = (text: string, term: string): boolean =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, 'iu').test(text)

/** Terms the source uses whose fixed translation is missing from the translated text. */
export function glossaryFlags(
  source: string,
  translated: string,
  entries: readonly GlossaryEntry[],
): GlossaryEntry[] {
  return entries.filter(
    (e) =>
      hasTerm(source, e.term) && !translated.toLowerCase().includes(e.translation.toLowerCase()),
  )
}

export const flagText = (e: GlossaryEntry): string => `Expected "${e.translation}" for "${e.term}"`
