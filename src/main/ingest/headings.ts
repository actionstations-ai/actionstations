// Heading recognition and citation paths.
// A citation path is "<shortName> › <label> › <label> …", e.g.
//   "TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure"
//   "AEP › Part II › Appendix 6 › 6.2 Critical Systems & Impact"
// Structural headings ("SECTION 13: TECHNICAL INCIDENT – …") are shortened to their label
// ("Section 13"); numbered and free-text headings are kept verbatim.

export const HEADING_SEPARATOR = ' › '

export type HeadingKind = 'part' | 'division' | 'numbered' | 'plain'

export interface HeadingInfo {
  kind: HeadingKind
  /** Outline level implied by the pattern (1 = Part, 2 = Section/Appendix, 3+ = 13.6 …). */
  level?: number
  /** Short label used in citation paths. */
  label: string
}

const ROMAN = '[IVXLC]+'
const PART_RE = new RegExp(`^part\\s+(${ROMAN}|\\d+|[A-Z])\\b(?:\\s*[:.\\-–—]\\s*(.*)|\\s+(.*))?$`)
const DIVISION_WORDS = ['section', 'chapter', 'appendix', 'annex', 'attachment', 'exhibit']
const DIVISION_RE = new RegExp(
  `^(${DIVISION_WORDS.join('|')})\\s+(${ROMAN}|\\d+|[A-Z])\\b(?:\\s*[:.\\-–—]\\s*(.*)|\\s+(.*))?$`,
)
/** "13.6 Scenario C …", "D.1 Network Topology", "5.1–5.2 Purpose and Assumptions". */
const DOTTED_RE = /^((?:\d+|[A-Z])(?:\.\d+)+)\.?(?:\s*[–-]\s*\d+(?:\.\d+)*)?\s+(\S.*)$/
/** "1. Introduction", "4 Concept of Operations". Only trusted with a typographic cue. */
const SINGLE_NUMBER_RE = /^(\d{1,2})\.?\s+([A-Z].*)$/

const titleCase = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

/** Remove markdown emphasis / code marks and collapse whitespace. */
export function cleanHeadingText(text: string): string {
  return text
    .replace(/\\([*_`#])/g, '$1')
    .replace(/(\*\*|__|\*|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalize the identifier of a Part/Section ("ii" → "II", "13" → "13", "a" → "A"). */
function normalizeOrdinal(ord: string): string {
  return /^\d+$/.test(ord) ? ord : ord.toUpperCase()
}

/** Classify a heading line by its numbering pattern. */
export function classifyHeading(raw: string): HeadingInfo {
  const text = cleanHeadingText(raw)
  // Keyword is case-insensitive; the ordinal is not ("Section civil" is not Section CIVIL).
  const keyed = text.replace(/^[A-Za-z]+/, (w) => w.toLowerCase())
  const part = PART_RE.exec(keyed)
  if (part) return { kind: 'part', level: 1, label: `Part ${normalizeOrdinal(part[1]!)}` }
  const div = DIVISION_RE.exec(keyed)
  if (div) {
    return {
      kind: 'division',
      level: 2,
      label: `${titleCase(div[1]!)} ${normalizeOrdinal(div[2]!)}`,
    }
  }
  const dotted = DOTTED_RE.exec(text)
  if (dotted) {
    const depth = dotted[1]!.split('.').length
    return { kind: 'numbered', level: depth + 1, label: text }
  }
  return { kind: 'plain', label: text }
}

/** Single-number headings ("1. Introduction") — only used when a font/caps cue agrees. */
export function singleNumberLevel(raw: string): number | undefined {
  return SINGLE_NUMBER_RE.test(cleanHeadingText(raw)) ? 2 : undefined
}

/** Text shaped like a heading: short, no sentence ending, has letters. */
export function isHeadingShaped(text: string, maxLength = 120): boolean {
  const t = text.trim()
  if (t.length < 2 || t.length > maxLength) return false
  if (!/[A-Za-z]/.test(t)) return false
  if (/[.;,]$/.test(t) && !/^(?:\d+|[A-Z])(?:\.\d+)*\.$/.test(t)) return false
  return true
}

/** ALL CAPS line with at least two letters ("ATTACHMENTS", "ANNEX C: ACRONYMS"). */
export function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '')
  return letters.length >= 3 && letters === letters.toUpperCase()
}

const STOP_WORDS = new Set([
  'of',
  'the',
  'and',
  'for',
  'a',
  'an',
  'to',
  'in',
  'on',
  '&',
  '–',
  '—',
  '-',
])

/** "Terminal Incident Response Plan (TIRP)" → "TIRP"; falls back to filename tokens / initials. */
export function deriveShortName(title: string, filename?: string): string {
  const fromTitle = lastAcronymInParens(title)
  if (fromTitle) return fromTitle
  const fromFile = filename ? acronymInFilename(filename) : undefined
  if (fromFile) return fromFile
  const t = title.trim()
  if (t.length <= 24) return t
  const words = t.split(/\s+/).filter((w) => !STOP_WORDS.has(w.toLowerCase()))
  const initials = words
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join('')
  if (initials.length >= 2 && initials.length <= 6) return initials
  return t.slice(0, 32).trim() + '…'
}

function lastAcronymInParens(title: string): string | undefined {
  const matches = [...title.matchAll(/\(([A-Z][A-Za-z0-9&/.-]{1,11})\)/g)]
    .map((m) => m[1]!)
    .filter((s) => (s.match(/[A-Z]/g) ?? []).length >= 2)
  return matches.at(-1)
}

function acronymInFilename(filename: string): string | undefined {
  const stem = filename.replace(/\.[^.]+$/, '')
  const tokens = stem.split(/[\s_\-.()[\]]+/).filter(Boolean)
  const caps = tokens.filter((t) => /^[A-Z][A-Z0-9&]{1,9}$/.test(t))
  return caps.at(-1)
}

/** Citation path: shortName first, then each heading's label. */
export function buildHeadingPath(shortName: string, rawPath: string[]): string {
  return [shortName, ...rawPath.map((h) => classifyHeading(h).label)]
    .filter((s) => s.length > 0)
    .join(HEADING_SEPARATOR)
}
