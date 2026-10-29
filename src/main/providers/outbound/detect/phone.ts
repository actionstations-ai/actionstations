// Phone numbers: NANP (separators required unless written +1XXXXXXXXXX) and E.164 (+ country
// code, 8-15 digits), each with an optional extension, plus the numbers the project lists under
// phones in facility-facts.md. Times, dates, section numbers ("13.6.2"), ICS form numbers and IP
// addresses do not match: NANP groups are 3-3-4 digits and a number may not touch other digits,
// letters, or a dot / dash / slash / colon followed by a digit.
import { escapeRegExp, span, type DetectedSpan } from './types'

const EXT = String.raw`(?:\s*(?:x|ext\.?|extension)\s*\d{1,6})?`
const BEFORE = String.raw`(?<![\w.\-/+:])`
const AFTER = String.raw`(?![\w]|[.\-/:]\d)`

/** (509) 555-0142, 509-555-0142, 509.555.0142, 509 555 0142, +1 509 555 0142, +15095550142. */
const NANP = new RegExp(
  BEFORE +
    '(?:' +
    String.raw`(?:\+1[\s.-]?)?\(\s*[2-9]\d{2}\s*\)\s?[2-9]\d{2}[\s.-]\d{4}` +
    String.raw`|(?:\+?1[\s.-])?[2-9]\d{2}([\s.-])[2-9]\d{2}\1\d{4}` +
    String.raw`|\+1[2-9]\d{2}[2-9]\d{6}` +
    ')' +
    EXT +
    AFTER,
  'gi',
)

/** +44 20 7946 0958, +49-30-901820, +33 1 23 45 67 89 (8-15 digits in all). */
const E164 = new RegExp(
  BEFORE + String.raw`\+[1-9]\d{0,3}(?:[\s.-]?\(?\d{1,5}\)?){1,6}` + EXT + AFTER,
  'gi',
)

const digits = (s: string): string => s.replace(/\D/g, '')

function knownPhonePatterns(known: readonly string[]): RegExp[] {
  const unique = [...new Set(known.map(digits))].filter((d) => d.length >= 7 && d.length <= 15)
  return unique.map((d) => {
    const body = [...d].map(escapeRegExp).join(String.raw`[\s().-]{0,2}`)
    return new RegExp(BEFORE + String.raw`\(?` + body + EXT + AFTER, 'gi')
  })
}

export function detectPhones(text: string, knownPhones: readonly string[] = []): DetectedSpan[] {
  const out: DetectedSpan[] = []
  for (const m of text.matchAll(NANP)) out.push(span(text, m.index, m.index + m[0].length, 'phone'))
  for (const m of text.matchAll(E164)) {
    const main = m[0].replace(/\s*(?:x|ext\.?|extension)\s*\d+$/i, '')
    const n = digits(main).length
    if (n >= 8 && n <= 15) out.push(span(text, m.index, m.index + m[0].length, 'phone'))
  }
  for (const re of knownPhonePatterns(knownPhones))
    for (const m of text.matchAll(re)) out.push(span(text, m.index, m.index + m[0].length, 'phone'))
  return out
}

/** Phones compare by digits, so "(509) 555-0142" and "509.555.0142" share a placeholder. */
export function normalizePhone(value: string): string {
  const d = digits(value)
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
}
