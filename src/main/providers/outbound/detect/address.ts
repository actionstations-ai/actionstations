// Street addresses: house number + street name + a street suffix from USPS Publication 28
// (lists/street-suffixes.txt), an optional unit, and an optional "City, ST 12345"; PO boxes.
// Common suffixes ("Street", "Ave", "Road") match on their own. Suffixes that are also ordinary
// nouns ("Station", "Center", "Park") match only with a unit, a ZIP or a city and state, so
// "4 Fire Station" or "2 Operations Center" stay as written.
import suffixList from './lists/street-suffixes.txt?raw'
import { escapeRegExp, span, type DetectedSpan } from './types'

const SUFFIXES = suffixList
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean)

/** Suffixes that are almost always part of an address. */
const STRONG = new Set([
  'alley',
  'aly',
  'avenue',
  'ave',
  'boulevard',
  'blvd',
  'circle',
  'cir',
  'court',
  'ct',
  'crescent',
  'cres',
  'drive',
  'dr',
  'expressway',
  'expy',
  'freeway',
  'fwy',
  'highway',
  'hwy',
  'lane',
  'ln',
  'loop',
  'parkway',
  'pkwy',
  'pike',
  'place',
  'pl',
  'plaza',
  'plz',
  'road',
  'rd',
  'route',
  'rte',
  'square',
  'sq',
  'street',
  'st',
  'terrace',
  'ter',
  'trail',
  'trl',
  'turnpike',
  'tpke',
  'way',
  'causeway',
  'cswy',
  'bypass',
  'byp',
])

/** Abbreviations that may carry a period ("St."); after a full word a period ends the sentence. */
const ABBREVIATIONS = new Set(
  'st ave rd blvd dr ln ct pl pkwy hwy ter trl cir sq plz expy fwy cres rte tpke aly byp cswy'.split(
    ' ',
  ),
)

const STATES =
  'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|PR|GU|VI'

const WORD = String.raw`(?:[A-Z][A-Za-z'’.-]*|\d{1,3}(?:st|nd|rd|th))`
const DIRECTION = String.raw`(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\.?`
const SUFFIX = `(${[...SUFFIXES]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|')})`
const UNIT = String.raw`(,?\s*(?:Suite|Ste\.?|Apt\.?|Apartment|Unit|Room|Rm\.?|Floor|Fl\.?|Building|Bldg\.?|#)\s*[A-Za-z0-9-]{1,8})?`
const CITY = String.raw`[A-Z][A-Za-z.'’-]*(?:\s+[A-Z][A-Za-z.'’-]*){0,2}`
const ZIP = String.raw`\d{5}(?:-\d{4})?`
const PLACE = `(,\\s*${CITY},?\\s+(?:${STATES})(?:\\s+${ZIP})?(?![A-Za-z])|,\\s*${CITY}\\s+${ZIP}|\\s+${ZIP})?`

const STREET = new RegExp(
  String.raw`(?<![\w.,-])\d{1,6}[A-Z]?(?:-\d{1,4})?\s+` +
    `(?:${DIRECTION}\\s+)?` +
    `(?:${WORD}\\s+){0,3}?` +
    WORD +
    String.raw`\s+` +
    SUFFIX +
    String.raw`\b\.?` +
    `(?:\\s+${DIRECTION}(?![A-Za-z]))?` +
    UNIT +
    PLACE,
  'g',
)

const PO_BOX = /\b(?:P\.?\s?O\.?|Post\s+Office)\s*Box\s+\d{1,6}\b/gi

export function detectAddresses(text: string): DetectedSpan[] {
  const out: DetectedSpan[] = []
  for (const m of text.matchAll(STREET)) {
    const suffix = (m[1] ?? '').toLowerCase()
    const anchored = !!m[2] || !!m[3]
    if (!STRONG.has(suffix) && !anchored) continue
    let end = m.index + m[0].length
    while (end > m.index && /[\s,]/.test(text[end - 1]!)) end--
    if (!anchored && text[end - 1] === '.' && !ABBREVIATIONS.has(suffix)) end--
    out.push(span(text, m.index, end, 'address'))
  }
  for (const m of text.matchAll(PO_BOX))
    out.push(span(text, m.index, m.index + m[0].length, 'address'))
  return out
}

/** Every suffix word, lower case (the person detector treats them as non-names). */
export const STREET_SUFFIX_WORDS: ReadonlySet<string> = new Set(
  SUFFIXES.map((s) => s.toLowerCase()),
)
