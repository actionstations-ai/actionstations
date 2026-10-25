// Upper bounds from the facility facts (#347 item 7): a "## Limits" section in
// facility-facts.md whose entries read "<what>: <number> <unit>" ("Chlorine, largest container:
// 1 ton", "Pressure District 7 MAOP: 2 psig"). A row that names every key word of an entry and,
// in the same sentence, a quantity of the same kind (mass, volume or pressure) above the bound
// gets QUANTITY_OVER_LIMIT. Rates ("40 lb a minute") are not quantities. Pure.
import type { LintWarning, MselRow, Scenario } from '@shared/schemas'
import type { FacilityFacts } from './facility'

export const QUANTITY_OVER_LIMIT = 'QUANTITY_OVER_LIMIT'

type Kind = 'mass' | 'volume' | 'pressure'
/** Unit → its kind and the factor to the kind's base unit (lb, gal, psi). */
const UNITS: [RegExp, Kind, number][] = [
  [/^(?:lb|lbs|pounds?)$/, 'mass', 1],
  [/^(?:short )?tons?$/, 'mass', 2000],
  [/^(?:tonnes?|metric tons?)$/, 'mass', 2204.62],
  [/^(?:kg|kilograms?)$/, 'mass', 2.20462],
  [/^(?:gal|gallons?)$/, 'volume', 1],
  [/^(?:l|liters?|litres?)$/, 'volume', 0.264172],
  [/^(?:bbl|barrels?)$/, 'volume', 42],
  [/^(?:m3|m³|cubic meters?)$/, 'volume', 264.172],
  [/^(?:psi|psig)$/, 'pressure', 1],
  [/^bar$/, 'pressure', 14.5038],
  [/^kpa$/, 'pressure', 0.145038],
  [/^(?:in\.? ?w\.? ?c\.?|inches w\.? ?c\.?|inches of water(?: column)?)$/, 'pressure', 0.0361],
]
const UNIT_WORDS =
  'metric tons?|short tons?|tonnes?|tons?|lbs?|pounds?|kg|kilograms?|gallons?|gal|liters?|litres?|l|barrels?|bbl|m3|m³|cubic meters?|psig|psi|bar|kpa|inches of water(?: column)?|inches w\\.? ?c\\.?|in\\.? ?w\\.? ?c\\.?'
const QUANTITY = new RegExp(
  String.raw`(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)[ -]?(${UNIT_WORDS})(?![\w])(?!\s*(?:/|per\b|an? (?:hour|minute|second|day)\b|each\b))`,
  'gi',
)

interface Quantity {
  kind: Kind
  base: number
  text: string
}

function unitOf(word: string): [Kind, number] | undefined {
  const w = word.toLowerCase().replace(/\s+/g, ' ')
  const hit = UNITS.find(([re]) => re.test(w))
  return hit ? [hit[1], hit[2]] : undefined
}

export function quantities(text: string): Quantity[] {
  const out: Quantity[] = []
  for (const m of text.matchAll(QUANTITY)) {
    const unit = unitOf(m[2]!)
    if (!unit) continue
    out.push({ kind: unit[0], base: Number(m[1]!.replace(/,/g, '')) * unit[1], text: m[0] })
  }
  return out
}

/** Words of an entry's subject that say how it is measured, not what it is. */
const MEASURE_WORDS = new Set(
  'largest biggest single any total maximum max limit limits capacity container containers vessel rated allowable operating maop mawp design inventory site the a an of in at per on for and or'.split(
    ' ',
  ),
)

export interface Limit {
  entry: string
  keywords: string[]
  max: Quantity
}

/** "Chlorine, largest container: 1 ton" → key words ["chlorine"] and 2000 lb. */
export function parseLimit(entry: string): Limit | undefined {
  const at = entry.lastIndexOf(':')
  if (at < 0) return undefined
  const [max] = quantities(entry.slice(at + 1))
  if (!max) return undefined
  const keywords = entry
    .slice(0, at)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !MEASURE_WORDS.has(w))
  return keywords.length ? { entry, keywords, max } : undefined
}

/** Entries of the facts' limits section (id "limits", or a heading naming limits). */
export function factLimits(f: FacilityFacts): Limit[] {
  return f.categories
    .filter((c) => c.id === 'limits' || /\blimits?\b|\bmaximum|\bcapacit/i.test(c.label))
    .flatMap((c) => c.entries)
    .map(parseLimit)
    .filter((l): l is Limit => !!l)
}

const hasWord = (sentence: string, word: string): boolean =>
  new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, 'iu').test(sentence)

/** The first quantity in `text` above one of the limits, with that limit. */
export function overLimit(
  text: string,
  limits: Limit[],
): { q: Quantity; limit: Limit } | undefined {
  // A new sentence starts with a capital, so "30 in. w.c. at RS-22" stays whole.
  for (const sentence of text.split(/(?<=[.!?;])\s+(?=[A-Z"'“])|\n/)) {
    const qs = quantities(sentence)
    if (!qs.length) continue
    for (const limit of limits) {
      if (!limit.keywords.every((w) => hasWord(sentence, w))) continue
      const q = qs.find((x) => x.kind === limit.max.kind && x.base > limit.max.base * 1.001)
      if (q) return { q, limit }
    }
  }
  return undefined
}

export function lintRowLimits(row: MselRow, limits: Limit[]): LintWarning[] {
  const hit = overLimit(`${row.event}\n${row.expectedAction}`, limits)
  if (!hit) return []
  return [
    {
      code: QUANTITY_OVER_LIMIT,
      severity: 'warning',
      message: `Row ${row.id} names ${hit.q.text}, more than the facility facts allow ("${hit.limit.entry}")`,
      suggestion: `Keep the quantity within ${hit.limit.max.text}, or correct the limit in facility-facts.md if it is wrong`,
      source: 'lint',
      rowId: row.id,
    },
  ]
}

/** Rows whose quantities exceed a limit in the facility facts. */
export function lintQuantityLimits(s: Scenario, f: FacilityFacts): LintWarning[] {
  const limits = factLimits(f)
  if (!limits.length) return []
  return s.msel.flatMap((row) => lintRowLimits(row, limits))
}
