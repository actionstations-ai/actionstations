// Facility facts (#84, #143): the identifiers the project's documents actually state, one list
// per category (facility-categories.ts: runways, gates … for airports; locations, assets,
// systems, networks, agencies, phones for every organization). Prompts receive them as the
// only allowed identifiers (small models follow a short list better than a retrieved chunk),
// and lintFacilityIds flags identifiers in generated text that neither the facts nor the
// row's own "fake data" framing cover. The facts the generator uses come from the project's
// editable facility-facts.md (facility-file.ts); this module is pure.
import type { LintWarning, MselRow, Scenario } from '@shared/schemas'
import {
  categoryDefinition,
  DEFAULT_FACT_CATEGORIES,
  type FactCategory,
  type FactCategoryEntries,
} from './facility-categories'

import { nearestEntry } from './facility-near-miss'

export { compressIds, gateList } from './facility-categories'

export const FACILITY_UNKNOWN_ID = 'FACILITY_UNKNOWN_ID'

export interface FacilityFacts {
  /** One entry list per category, in sheet order. */
  categories: FactCategoryEntries[]
  documentCount: number
  /**
   * The category definitions these facts were extracted with (a domain profile's); the
   * airport + generic defaults when absent. Lint and sheet formatting look them up here.
   */
  definitions?: FactCategory[]
}

export const EMPTY_FACTS: FacilityFacts = { categories: [], documentCount: 0 }

/** The text itself says the identifier is bogus (attacker data, a data-integrity tell). */
const FAKE_FRAMING =
  /\b(?:no such|does not exist|doesn't exist|non-?existent|not a real|not exist|invalid|fake|bogus|impossible|phantom|fictitious|made-up|spoofed)\b/i

/** Sentences that do not call an identifier fake (a plan may note "Gate Z99 does not exist"). */
const realSentences = (text: string): string =>
  text
    .split(/(?<=[.!?])\s+|\n/)
    .filter((sentence) => !FAKE_FRAMING.test(sentence))
    .join('\n')

/**
 * Extract the facility facts from document texts (pure). `categories` defaults to the
 * airport + generic set; a domain profile passes its own list.
 */
export function extractFacilityFacts(
  texts: string[],
  categories: FactCategory[] = DEFAULT_FACT_CATEGORIES,
): FacilityFacts {
  const found = new Map(categories.map((c) => [c.id, new Set<string>()]))
  for (const all of texts) {
    const text = { all, real: realSentences(all) }
    for (const c of categories)
      for (const entry of c.extract(text)) if (entry.trim()) found.get(c.id)!.add(entry.trim())
  }
  return {
    categories: categories.map((c) => {
      const entries = [...found.get(c.id)!]
      return { id: c.id, label: c.label, entries: c.finalize ? c.finalize(entries) : entries }
    }),
    documentCount: texts.length,
    definitions: categories,
  }
}

/** The definition of a category in these facts (the facts' own list, then the defaults). */
const definitionOf = (f: FacilityFacts, id: string): FactCategory | undefined =>
  categoryDefinition(id, f.definitions ?? DEFAULT_FACT_CATEGORIES)

/** A category's entries as stored (empty when the facts have no such category). */
export function factEntries(f: FacilityFacts, id: string): string[] {
  return f.categories.find((c) => c.id === id)?.entries ?? []
}

/** A copy of the facts with one category's entries replaced (added when missing). */
export function withEntries(f: FacilityFacts, id: string, entries: string[]): FacilityFacts {
  const has = f.categories.some((c) => c.id === id)
  const label = definitionOf(f, id)?.label ?? id
  return {
    ...f,
    categories: has
      ? f.categories.map((c) => (c.id === id ? { ...c, entries } : c))
      : [...f.categories, { id, label, entries }],
  }
}

/** Every identifier a category's entries stand for (ranges and pairs expanded). */
export function factIds(f: FacilityFacts, id: string): string[] {
  const entries = factEntries(f, id)
  const def = definitionOf(f, id)
  return def?.expand ? def.expand(entries) : entries
}

const DEFAULT_CAP = 25

function formatEntries(f: FacilityFacts, category: FactCategoryEntries): string {
  const def = definitionOf(f, category.id)
  if (def?.format) return def.format(category.entries)
  const shown = category.entries.slice(0, DEFAULT_CAP).join(', ')
  return category.entries.length > DEFAULT_CAP ? `${shown}, …` : shown
}

/** One line per category, for the prompts ("Gates: A1–A8, B1–B10"). Empty when nothing is known. */
export function facilitySheet(f: FacilityFacts): string[] {
  return f.categories
    .filter((c) => c.entries.length)
    .map((c) => `${definitionOf(f, c.id)?.sheetLabel ?? c.label}: ${formatEntries(f, c)}`)
}

// ---- lint -------------------------------------------------------------------------------

export interface UnknownId {
  /** The category's singular noun ("runway", "gate"). */
  kind: string
  id: string
  /** What the documents list instead. */
  known: string
  /**
   * The documented entry this one most likely means (#165): "Confluence Park Station" when the
   * documents have "Confluence Station". Only for named identifiers, never for bare numbers.
   */
  didYouMean?: string
}

const PRIVATE_IP = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/

/**
 * Identifiers in `text` that a lintable category (one with `mentions`) does not cover
 * (PRD FR-6); empty for a category the facts list nothing for. Categories without `mentions`
 * (locations, hosts, user-added sections) are shown to the model but not linted: a parking
 * deck's "Level 3" is not a terminal level.
 */
export function unknownFacilityIds(text: string, f: FacilityFacts): UnknownId[] {
  const out: UnknownId[] = []
  const seen = new Set<string>()
  for (const category of f.categories) {
    const def = definitionOf(f, category.id)
    if (!def?.mentions || !def.noun || !category.entries.length) continue
    const known = new Set(factIds(f, category.id))
    for (const id of def.mentions(text)) {
      const key = `${def.noun}:${id}`
      if (seen.has(key) || known.has(id)) continue
      seen.add(key)
      const didYouMean = nearestEntry(id, entriesById(category, def))
      out.push({
        kind: def.noun,
        id,
        known: formatEntries(f, category),
        ...(didYouMean ? { didYouMean } : {}),
      })
    }
  }
  return out
}

/** Each identifier a category's entries stand for → the entry as the documents write it. */
function entriesById(category: FactCategoryEntries, def: FactCategory): Map<string, string> {
  const byId = new Map<string, string>()
  for (const entry of category.entries)
    for (const id of def.expand ? def.expand([entry]) : [entry])
      if (!byId.has(id)) byId.set(id, entry)
  return byId
}

/** First three octets of every documented network ("10.66.0"). */
export function ipPrefixes(f: FacilityFacts): string[] {
  return factEntries(f, 'networks').flatMap((e) => {
    const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3})(?:\.(?:x|\d{1,3}|\*|0\/24))?$/i.exec(e.trim())
    return m ? [m[1]!] : []
  })
}

/** Private addresses outside every documented /16 (the documents' IP schema), informational. */
export function foreignPrivateIps(text: string, f: FacilityFacts): string[] {
  const prefixes = ipPrefixes(f)
  if (!prefixes.length) return []
  const sixteens = new Set(prefixes.map((p) => p.split('.').slice(0, 2).join('.')))
  const out = new Set<string>()
  for (const m of text.matchAll(/\b(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/g)) {
    if (PRIVATE_IP.test(m[0]) && !sixteens.has(m[1]!)) out.add(m[0])
  }
  return [...out]
}

/** "Gate C12 (the documents list …)", or "Station X (did you mean Y?)" for a near miss. */
export const describeUnknownId = (u: UnknownId): string =>
  `${u.kind[0]!.toUpperCase()}${u.kind.slice(1)} ${u.id} (${
    u.didYouMean ? `did you mean ${u.didYouMean}?` : `the documents list ${u.known}`
  })`

/** Rows that name facility identifiers (runways, gates …) the facts do not have. */
export function lintFacilityIds(s: Scenario, f: FacilityFacts): LintWarning[] {
  return s.msel.flatMap((row): LintWarning[] => lintRowFacility(row, f))
}

export function lintRowFacility(row: MselRow, f: FacilityFacts): LintWarning[] {
  const text = `${row.event}\n${row.expectedAction}`
  if (FAKE_FRAMING.test(text)) return []
  const unknown = unknownFacilityIds(text, f)
  if (!unknown.length) return []
  const nearMisses = unknown.filter((u) => u.didYouMean)
  return [
    {
      code: FACILITY_UNKNOWN_ID,
      severity: 'warning',
      message: `Row ${row.id} names ${unknown.map(describeUnknownId).join('; ')}, which the documents do not have`,
      suggestion: nearMisses.length
        ? `Did you mean ${nearMisses.map((u) => u.didYouMean).join(', ')}? Use the documented name, or frame it as the attacker’s fake data`
        : 'Use an identifier from the facility facts (facility-facts.md), or frame it as the attacker’s fake data',
      source: 'lint',
      rowId: row.id,
    },
  ]
}
