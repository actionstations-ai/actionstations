// Checks for the regex sources a project may type into a fact category (#180): noun, generic
// noun and context. They are compiled with V8's backtracking engine in the main process and
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
// Pure: no Node imports, so the facts editor shows the same message main enforces.
import type { FactCategory } from './schema'

export const REGEX_LIMITS = { noun: 200, context: 400, maxRepeat: 100, openRepeats: 2 } as const

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

/** Why the group opening at src[i] is refused, or how long its opener is. */
function groupOpener(src: string, i: number): number | string {
  if (src.startsWith('(?:', i)) return 3
  if (/^\(\?<?[=!]/.test(src.slice(i))) return 'look-arounds such as (?=…) are not supported'
  if (src.startsWith('(?<', i)) return 'named groups are not supported; use (?:…)'
  return 'use (?:…) instead of (…): a capturing group shifts the identifier the lint reads'
}

/** Walk the source once; the first rule it breaks, or undefined. */
function structureProblem(src: string): string | undefined {
  const stack: Group[] = [{ repeats: false, alternates: false }]
  let open = 0
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
      const opener = groupOpener(src, i)
      if (typeof opener === 'string') return opener
      stack.push({ repeats: false, alternates: false })
      i += opener
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
  return undefined
}

/**
 * Why a noun / generic noun / context source is refused, or undefined when it may be used.
 * `kind` sets the length limit (a context lists more words than a noun).
 */
export function regexSourceProblem(src: string, kind: 'noun' | 'context'): string | undefined {
  const limit = kind === 'noun' ? REGEX_LIMITS.noun : REGEX_LIMITS.context
  if (!src.trim()) return 'it is empty'
  if (src.length > limit) return `it is longer than ${limit} characters`
  let re: RegExp
  try {
    new RegExp(src, 'i')
    re = new RegExp(`^(?:${src})$`, 'i')
  } catch (err) {
    return `it is not a valid pattern (${(err as Error).message.replace(/^Invalid regular expression: /, '')})`
  }
  const why = structureProblem(src)
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
  const check = (field: FactCategoryField, src: string | undefined, kind: 'noun' | 'context') => {
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
  return out
}

const label = (field: FactCategoryField): string =>
  ({ noun: 'noun', genericNoun: 'generic noun', context: 'context', pattern: 'pattern' })[field]
