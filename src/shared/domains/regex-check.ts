// Checks for the regex sources of a domain profile: the noun, generic noun and context a
// project may type into a fact category (#180), and every regex a pack's profile ships
// (#351): those three, a category's custom pattern, the role patterns and the agency pattern. They are compiled with V8's backtracking engine in the main process and
// run over every document and every generated row, so a pattern that backtracks without end
// would stall the app. The rules keep what the bundled profiles use (alternation, `?`,
// `(?:…)`, classes, `\b`, `\d`, a few short repeats) and refuse the rest:
//   - longer than the field's limit, or not a valid JavaScript regex;
//   - capturing or named groups (they shift the identifier group the extractor reads),
//     look-arounds and back-references;
//   - a group repeated with * + {n,} or {n,m} whose body repeats or alternates (nested
//     quantifiers: "(?:a+)+", "(?:a|aa)*");
//   - more than two open-ended repeats (* + {n,}) in one source, or a count above 100;
//   - a source that matches empty text (a noun that matches nothing would flag every number).
// A category's custom `pattern` puts the identifier in group 1, so it must have a capturing
// group and may use look-arounds (the bundled profiles skip "The"/"Each" before a name with
// (?!…)); every other rule applies to it too, inside the groups and look-arounds as well.
// Pure: no Node imports, so the facts editor shows the same message main enforces.
import type { DomainProfile, FactCategory } from './schema'

export const REGEX_LIMITS = {
  noun: 200,
  context: 400,
  pattern: 400,
  maxRepeat: 100,
  openRepeats: 2,
} as const

/** noun: a noun or generic noun; context: a word list; pattern: a custom identifier pattern. */
export type RegexKind = 'noun' | 'context' | 'pattern'

interface Group {
  repeats: boolean
  alternates: boolean
}

/** The repeat at src[i] (`*`, `+`, `?`, `{n}`, `{n,}`, `{n,m}`, optionally lazy), or undefined. */
function repeatAt(
  src: string,
  i: number,
): { length: number; open: boolean; many: boolean; max: number } | undefined {
  const c = src[i]
  let length: number
  let open: boolean
  let many: boolean
  let max: number
  if (c === '*' || c === '+') [length, open, many, max] = [1, true, true, 0]
  else if (c === '?') [length, open, many, max] = [1, false, false, 1]
  else if (c === '{') {
    const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i))
    if (!m) return undefined
    const lo = Number(m[1])
    const hi = m[2] === undefined ? lo : m[3] ? Number(m[3]) : Infinity
    ;[length, open, many, max] = [
      m[0].length,
      hi === Infinity,
      hi > 1,
      Math.max(lo, hi === Infinity ? lo : hi),
    ]
  } else return undefined
  if (src[i + length] === '?') length++
  return { length, open, many, max }
}

/** Length of the character class starting at src[i] === '['. */
function classLength(src: string, i: number): number {
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++
    else if (src[j] === ']' && j > i + 1) return j - i + 1
  }
  return src.length - i
}

/** How long the group opener at src[i] is and whether it captures, or why it is refused. */
function groupOpener(
  src: string,
  i: number,
  pattern: boolean,
): { length: number; captures: boolean } | string {
  if (src.startsWith('(?:', i)) return { length: 3, captures: false }
  const look = /^\(\?<?[=!]/.exec(src.slice(i))
  if (look)
    return pattern
      ? { length: look[0].length, captures: false }
      : 'look-arounds such as (?=…) are not supported'
  if (src.startsWith('(?<', i)) return 'named groups are not supported; use (?:…)'
  if (src.startsWith('(?', i)) return 'group modifiers such as (?i:…) are not supported'
  return pattern
    ? { length: 1, captures: true }
    : 'use (?:…) instead of (…): a capturing group shifts the identifier the lint reads'
}

/** Walk the source once; the first rule it breaks, or undefined. */
function structureProblem(src: string, pattern: boolean): string | undefined {
  const stack: Group[] = [{ repeats: false, alternates: false }]
  let open = 0
  let captures = 0
  for (let i = 0; i < src.length;) {
    const c = src[i]!
    const top = stack[stack.length - 1]!
    let atom = 1
    let closed: Group | undefined
    if (c === '\\') {
      if (/[1-9k]/.test(src[i + 1] ?? '')) return 'back-references are not supported'
      atom = 2
    } else if (c === '[') atom = classLength(src, i)
    else if (c === '(') {
      const opener = groupOpener(src, i, pattern)
      if (typeof opener === 'string') return opener
      if (opener.captures) captures++
      stack.push({ repeats: false, alternates: false })
      i += opener.length
      continue
    } else if (c === ')') {
      closed = stack.pop()
      if (!closed || !stack.length) return 'it has an unmatched )'
    } else if (c === '|') {
      top.alternates = true
      i++
      continue
    }
    i += atom
    const rep = repeatAt(src, i)
    const parent = stack[stack.length - 1]!
    if (closed && (closed.repeats || closed.alternates) && rep?.many)
      return 'it repeats a group that itself repeats or alternates (nested quantifiers can freeze the app)'
    if (closed?.repeats) parent.repeats = true
    if (!rep) continue
    if (rep.max > REGEX_LIMITS.maxRepeat) return `a repeat count above ${REGEX_LIMITS.maxRepeat}`
    if (rep.open && ++open > REGEX_LIMITS.openRepeats)
      return `more than ${REGEX_LIMITS.openRepeats} open-ended repeats (* + {n,})`
    parent.repeats = true
    i += rep.length
  }
  if (pattern && !captures) return 'it has no capturing group: group 1 must hold the identifier'
  return undefined
}

/**
 * Why a regex source is refused, or undefined when it may be used. `kind` sets the length
 * limit (a context lists more words than a noun) and whether capturing groups and
 * look-arounds are allowed (only in a custom pattern).
 */
export function regexSourceProblem(src: string, kind: RegexKind): string | undefined {
  const limit = REGEX_LIMITS[kind]
  if (!src.trim()) return 'it is empty'
  if (src.length > limit) return `it is longer than ${limit} characters`
  let re: RegExp
  try {
    new RegExp(src, 'i')
    re = new RegExp(`^(?:${src})$`, 'i')
  } catch (err) {
    return `it is not a valid pattern (${(err as Error).message.replace(/^Invalid regular expression: /, '')})`
  }
  const why = structureProblem(src, kind === 'pattern')
  if (why) return why
  if (re.test('')) return 'it matches empty text, so every number would count'
  return undefined
}

export type FactCategoryField = 'noun' | 'genericNoun' | 'context' | 'pattern'

export interface FactCategoryProblem {
  field: FactCategoryField
  message: string
}

/** Every problem with one category definition, field by field (empty when it compiles safely). */
export function factCategoryProblems(c: FactCategory): FactCategoryProblem[] {
  const out: FactCategoryProblem[] = []
  const check = (field: FactCategoryField, src: string | undefined, kind: RegexKind) => {
    if (src === undefined) return
    const why = regexSourceProblem(src, kind)
    if (why) out.push({ field, message: `The ${label(field)} cannot be used: ${why}.` })
  }
  if (!c.pattern && !c.noun?.trim())
    out.push({ field: 'noun', message: 'Give a noun, such as "Gates?" or "Bus Routes?".' })
  else check('noun', c.noun, 'noun')
  check('genericNoun', c.genericNoun, 'noun')
  if (c.genericNoun?.trim() && !c.context?.trim())
    out.push({
      field: 'context',
      message: 'A generic noun needs a context: the words that say a text is about this kind.',
    })
  else check('context', c.context, 'context')
  check('pattern', c.pattern, 'pattern')
  return out
}

export interface DomainRegexProblem {
  /** Where in the profile JSON, e.g. "factCategories.2.pattern" or "rolePatterns.security". */
  path: string
  message: string
}

/**
 * Every regex problem in a domain profile (#351): each fact category (noun, generic noun,
 * context, pattern), each role pattern and the agency pattern. A pack's profile is refused
 * when this is not empty, since the app compiles all of them in the main process.
 */
export function domainProfileRegexProblems(profile: DomainProfile): DomainRegexProblem[] {
  const out: DomainRegexProblem[] = []
  profile.factCategories.forEach((c, i) => {
    for (const p of factCategoryProblems(c))
      out.push({ path: `factCategories.${i}.${p.field}`, message: `${c.id}: ${p.message}` })
  })
  for (const [role, src] of Object.entries(profile.rolePatterns ?? {})) {
    const why = src === undefined ? undefined : regexSourceProblem(src, 'context')
    if (why)
      out.push({
        path: `rolePatterns.${role}`,
        message: `The ${role} role pattern cannot be used: ${why}.`,
      })
  }
  const agency = profile.agencyPattern
  const why = agency === undefined ? undefined : regexSourceProblem(agency, 'context')
  if (why)
    out.push({ path: 'agencyPattern', message: `The agency pattern cannot be used: ${why}.` })
  return out
}

const label = (field: FactCategoryField): string =>
  ({ noun: 'noun', genericNoun: 'generic noun', context: 'context', pattern: 'pattern' })[field]
