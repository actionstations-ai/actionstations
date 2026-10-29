// Text normalization for the grounding checks (#423): case, punctuation, plurals, number words
// and durations, so "within one hr" in a claim and "within 1 hour" in a plan compare equal.
// Pure and deterministic.

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

const TENS = new Set(['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'])

/** Time units to one spelling, and their length in minutes. */
const UNIT_ALIASES: [RegExp, string][] = [
  [/^(?:sec|secs|second|seconds)$/, 'second'],
  [/^(?:min|mins|minute|minutes)$/, 'minute'],
  [/^(?:h|hr|hrs|hour|hours)$/, 'hour'],
  [/^(?:day|days)$/, 'day'],
  [/^(?:wk|wks|week|weeks)$/, 'week'],
]
export const UNIT_MINUTES: Record<string, number> = {
  second: 1 / 60,
  minute: 1,
  hour: 60,
  day: 1440,
  week: 10080,
}

export function canonicalUnit(word: string): string | undefined {
  const w = word.toLowerCase()
  return UNIT_ALIASES.find(([re]) => re.test(w))?.[1]
}

/** "twenty-four" → 24, "one" → 1; undefined when the text is not a number word. */
export function numberWord(text: string): number | undefined {
  const parts = text.toLowerCase().split(/[-\s]+/)
  if (parts.length === 1) return NUMBER_WORDS[parts[0]!]
  if (parts.length === 2 && TENS.has(parts[0]!) && NUMBER_WORDS[parts[1]!] !== undefined) {
    const unit = NUMBER_WORDS[parts[1]!]!
    if (unit > 0 && unit < 10) return NUMBER_WORDS[parts[0]!]! + unit
  }
  return undefined
}

const NUMBER_WORD_RE = new RegExp(
  `\\b(?:(?:${[...TENS].join('|')})[-\\s](?:one|two|three|four|five|six|seven|eight|nine)|${Object.keys(NUMBER_WORDS).join('|')})\\b`,
  'gi',
)

/** Replace number words with digits ("within twenty-four hours" → "within 24 hours"). */
export function digitsForWords(text: string): string {
  return text.replace(NUMBER_WORD_RE, (m) => String(numberWord(m) ?? m))
}

/** Units written with a slash that stay one token ("mg/L"); other slashes separate words. */
const RATE_UNITS = new Set([
  'mg/l',
  'ug/l',
  'ng/l',
  'mg/kg',
  'ft/s',
  'm/s',
  'km/h',
  'gal/min',
  'lb/day',
])

/**
 * Lower case, typographic quotes and dashes to plain ones, number words to digits, time units
 * to one spelling, punctuation to spaces (keeping the dots, slashes and hyphens inside
 * identifiers such as "7.5", "mg/L", "I-07", "10.72.10.22"), whitespace collapsed.
 */
export function normalizeText(text: string): string {
  let s = text.normalize('NFKC').toLowerCase()
  s = s.replace(/[‘’‛′]/g, "'").replace(/[“”″]/g, '"')
  s = s.replace(/[‐-―−]/g, '-')
  s = digitsForWords(s)
  s = s.replace(/(\d)-(?=[a-z])/g, '$1 ')
  s = s.replace(/([a-z]+)\/(?=([a-z]+))/g, (m: string, a: string, b: string) =>
    RATE_UNITS.has(`${a}/${b}`) ? m : `${a} `,
  )
  s = s.replace(/[^a-z0-9§%$./\s-]/g, ' ')
  s = s.replace(/(^|\s)[./-]+|[./-]+(?=\s|$)/g, '$1')
  s = s
    .split(/\s+/)
    .map((t) => canonicalUnit(t) ?? t)
    .join(' ')
  return s.replace(/\s+/g, ' ').trim()
}

/** Singular form for comparison ("operators" → "operator", "policies" → "policy"). */
export function stem(token: string): string {
  if (token.length <= 3 || /\d/.test(token)) return token
  if (/ies$/.test(token)) return token.slice(0, -3) + 'y'
  if (/(?:ss|us|is|ous)$/.test(token)) return token
  if (/(?:ches|shes|xes|sses)$/.test(token)) return token.slice(0, -2)
  if (/s$/.test(token)) return token.slice(0, -1)
  return token
}

export const STOPWORDS = new Set(
  (
    'a an and are as at be been being but by can could did do does each for from had has have he her his ' +
    'if in into is it its may might must no nor not of on once only or other our out over own per ' +
    'shall she should so some such than that the their them then there these they this those through to ' +
    'too under until up upon very via was we were what when where which while who whom why will with ' +
    'within would you your all any both also after before again about above below during between off ' +
    'same just now more most one two three four five six seven eight nine ten its itself ' +
    'immediately promptly then begin begins start starts team teams role roles player players ' +
    // Verbs every expected action uses; they say nothing about the plan.
    'confirm confirms confirmed order orders ordered ask asks asked check checks checked send sends ' +
    'sent tell tells told receive receives received note notes noted use uses used keep keeps kept ' +
    'make makes made get gets got give gives gave take takes took need needs needed want wants ' +
    'decide decides decided discuss discusses consider considers ensure ensures directs direct ' +
    'instructs instruct request requests requested provide provides provided prepare prepares ' +
    'review reviews reviewed whether how able yet still already new current any decision point'
  ).split(/\s+/),
)

/** Normalized, singular tokens of a text. */
export function tokens(text: string): string[] {
  const n = normalizeText(text)
  return n ? n.split(' ').map(stem) : []
}

/** Tokens that carry meaning: no stopwords, at least 3 letters or containing a digit. */
export function contentWords(text: string): string[] {
  return tokens(text).filter((t) => !STOPWORDS.has(t) && (t.length >= 3 || /\d/.test(t)))
}

/** True when `needle` occurs in `haystack` on token boundaries (both already normalized). */
export function containsPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false
  const h = ` ${haystack} `
  return h.includes(` ${needle} `)
}

/** Normalized and singularized phrase, for phrase lookups against stemmed text. */
export function phraseKey(text: string): string {
  return tokens(text).join(' ')
}

/** Whitespace collapsed (FR-7 quote validation compares on this). */
export const collapseSpace = (s: string): string => s.replace(/\s+/g, ' ').trim()
