// Claims and anchor terms (#423, FR-3): split a claim field into sentences and pull out the terms
// a cited passage must contain for the claim to count as supported: role titles, agency names,
// facility identifiers, numbers with units, durations, section numbers and a fixed list of
// action verbs. Pure and deterministic.
import { digitsForWords, normalizeText, phraseKey, UNIT_MINUTES, canonicalUnit } from './normalize'

export type AnchorKind =
  'role' | 'agency' | 'identifier' | 'quantity' | 'duration' | 'section' | 'verb'

export interface Anchor {
  kind: AnchorKind
  /** As written in the claim. */
  text: string
  /** Normalized key: a phrase key, a section number, a verb id or a value. */
  key: string
  /** Durations: minutes. Quantities: the number. */
  value?: number
  /** Quantities: the normalized unit ("mg/l", "psi"). */
  unit?: string
}

/**
 * Split text into sentences: at . ! ? followed by a capital, a quote or a digit, and at line
 * breaks. Abbreviations and section numbers ("e.g.", "7.5", "No. 3") are not split.
 */
export function splitClaims(text: string): string[] {
  return text
    .replace(/^\s*(?:DECISION POINT|EXPECTED(?: ACTIONS?)?|NOTE|CONTROLLER NOTE)\s*[:—-]\s*/i, '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[a-z0-9)\]"'”%][.!?])\s+(?=["“(]?[A-Z0-9])/))
    .map((s) => s.replace(/^[\s•*-]+/, '').trim())
    .filter((s) => /[a-z]{3}/i.test(s))
}

/** Action verbs a plan claim hinges on (FR-3.2), each with the forms that count. */
export const ACTION_VERBS: { id: string; re: RegExp }[] = [
  { id: 'notify', re: /\bnotif(?:y|ies|ied|ying|ication|ications)\b/i },
  { id: 'activate', re: /\b(?:activat(?:e|es|ed|ing|ion)|stand(?:s|ing)? up)\b/i },
  { id: 'approve', re: /\bapprov(?:e|es|ed|ing|al)\b/i },
  { id: 'authorize', re: /\bauthori[sz](?:e|es|ed|ing|ation)\b/i },
  { id: 'isolate', re: /\bisolat(?:e|es|ed|ing|ion)\b/i },
  { id: 'evacuate', re: /\bevacuat(?:e|es|ed|ing|ion)\b/i },
  { id: 'declare', re: /\bdeclar(?:e|es|ed|ing|ation)\b/i },
  { id: 'shut down', re: /\b(?:shut(?:s|ting)?[\s-]?down|shutdown|shut off|shuts off)\b/i },
  { id: 'report', re: /\breport(?:s|ed|ing)?\b/i },
]

const ROLE_NOUNS =
  'Manager|Director|Commander|Officer|Coordinator|Superintendent|Supervisor|Chief|Liaison|Administrator|Engineer|Specialist|Lead|Controller|Dispatcher|Marshal|Chair|Mayor|Sheriff|Planner|Analyst'
const AGENCY_NOUNS =
  'Department|Agency|Office|Police|Fire|Authority|Commission|Bureau|Administration|Center|Centre|Service|Services|Division|Board|Council|Guard|Patrol|EMS|EPA'
const CAP = String.raw`[A-Z][\w&'-]*`
const CONNECT = String.raw`(?:\s+(?:of|for|&)\s+|\s+|\s*\/\s*)`

const ROLE_RE = new RegExp(
  String.raw`\b(?:${CAP}${CONNECT}){0,4}(?:${ROLE_NOUNS})\b(?:\s+(?:of|for)\s+${CAP}(?:\s+${CAP}){0,3})?`,
  'g',
)
const AGENCY_RE = new RegExp(
  String.raw`\b(?:${CAP}${CONNECT}){0,4}(?:${AGENCY_NOUNS})\b(?:\s+(?:of|for)\s+${CAP}(?:\s+${CAP}){0,3})?`,
  'g',
)
/**
 * Tag-shaped identifiers (PLC-02, NAOH-FC-203, AIT-302, ERP-2): letters joined to digits. A bare
 * acronym (SCADA, GPS, ICS) is too common to require; agencies are kept through KNOWN_AGENCIES.
 */
const IDENT_RE = /\b(?:[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+|[A-Z]{1,6}\d{1,4}[A-Z]?)\b/g
/** Agency acronyms a plan names when it means them (FR-3.2 "agency names"). */
const KNOWN_AGENCIES = new Set(
  (
    'FBI CISA EPA TSA FAA DHS FEMA NTSB CDC NRC FERC NERC PHMSA USCG NWS OSHA ATF DEA DOE DOT ' +
    'HHS ASPR NSA USSS DOJ CBP ICE FCC TSOC EOC SOC MS-ISAC WATERISAC E-ISAC'
  ).split(' '),
)
const ACRONYM_RE = /\b[A-Z][A-Z-]{1,9}\b/g
const SECTION_RE =
  /\b(?:(?:Section|Sec\.|§|Annex|Appendix|Attachment|Chapter|Part|Tab)\s*([A-Z]?\d+(?:\.\d+)*[a-z]?|[A-Z]\b)|([A-Z]{2,6})\s+§?\s*(\d+(?:\.\d+)+))/g
const DURATION_RE =
  /\b(\d+(?:\.\d+)?)[\s-]*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?)\b/gi
const QUANTITY_RE =
  /\b(\d+(?:[.,]\d+)?)\s*(mg\/l|mgd|psi|gpm|ppm|ppb|%|percent|gallons?|feet|ft|miles?|mph|degrees|°f|°c|kv|mw|people|persons|passengers|patients|beds|vehicles|units)(?![\w/])/gi

/** Generic words in a role or agency phrase that are not a name by themselves. */
const GENERIC = new Set([
  'the',
  'a',
  'an',
  'all',
  'each',
  'any',
  'every',
  'this',
  'that',
  'its',
  'their',
  'our',
])

function trimName(phrase: string): string {
  const words = phrase.trim().split(/\s+/)
  while (words.length && GENERIC.has(words[0]!.toLowerCase())) words.shift()
  return words.join(' ')
}

export interface AnchorOptions {
  /**
   * Abbreviations that name the scenario's own player roles ("IT", "WQ", "Ops"): the claim's
   * subject, not a term the plan has to state.
   */
  ignore?: Iterable<string>
}

/** Acronyms that are ordinary words in a claim, not identifiers. */
const COMMON_CAPS = new Set([
  'I',
  'A',
  'OK',
  'AM',
  'PM',
  'ID',
  'US',
  'TV',
  'FAQ',
  'ETA',
  'ASAP',
  'N/A',
  'IF',
  'NO',
])

function overlaps(spans: [number, number][], start: number, end: number): boolean {
  return spans.some(([a, b]) => start < b && end > a)
}

function collect(
  text: string,
  re: RegExp,
  taken: [number, number][],
  make: (m: RegExpMatchArray) => Anchor | undefined,
): Anchor[] {
  const out: Anchor[] = []
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    if (overlaps(taken, start, end)) continue
    const a = make(m)
    if (!a) continue
    taken.push([start, end])
    out.push(a)
  }
  return out
}

/** Anchor terms of one claim sentence (FR-3.2), most specific first, without duplicates. */
export function anchorTerms(sentence: string, opts: AnchorOptions = {}): Anchor[] {
  const text = digitsForWords(sentence)
  const ignore = new Set([...(opts.ignore ?? [])].map((s) => s.toUpperCase()))
  const taken: [number, number][] = []
  const anchors: Anchor[] = [
    ...collect(text, SECTION_RE, taken, (m) => {
      const key = (m[1] ?? m[3] ?? '').toLowerCase()
      return key ? { kind: 'section', text: m[0].trim(), key } : undefined
    }),
    ...collect(text, DURATION_RE, taken, (m) => {
      const unit = canonicalUnit(m[2]!)
      if (!unit) return undefined
      const value = Number(m[1]) * UNIT_MINUTES[unit]!
      return { kind: 'duration', text: m[0].trim(), key: `${value}min`, value }
    }),
    ...collect(text, QUANTITY_RE, taken, (m) => {
      const unit = normalizeText(m[2]!).replace(/^percent$/, '%')
      const value = Number(m[1]!.replace(',', '.'))
      return { kind: 'quantity', text: m[0].trim(), key: `${value} ${unit}`, value, unit }
    }),
    ...collect(text, ROLE_RE, taken, (m) => {
      const name = trimName(m[0])
      return name.split(/\s+/).length >= 2 || /^[A-Z]/.test(name)
        ? { kind: 'role', text: name, key: phraseKey(name) }
        : undefined
    }),
    ...collect(text, AGENCY_RE, taken, (m) => {
      const name = trimName(m[0])
      return name ? { kind: 'agency', text: name, key: phraseKey(name) } : undefined
    }),
    ...collect(text, IDENT_RE, taken, (m) => {
      const id = m[0]
      if (COMMON_CAPS.has(id) || ignore.has(id.toUpperCase())) return undefined
      return { kind: 'identifier', text: id, key: phraseKey(id) }
    }),
    ...collect(text, ACRONYM_RE, taken, (m) =>
      KNOWN_AGENCIES.has(m[0]) && !ignore.has(m[0])
        ? { kind: 'agency', text: m[0], key: phraseKey(m[0]) }
        : undefined,
    ),
  ]
  for (const v of ACTION_VERBS) {
    const m = v.re.exec(text)
    if (m) anchors.push({ kind: 'verb', text: m[0], key: v.id })
  }
  const seen = new Set<string>()
  return anchors.filter((a) => {
    const k = `${a.kind}:${a.key}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
