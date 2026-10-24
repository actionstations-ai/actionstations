// Regex rule for template schemas that are not built in (#302). Ajv compiles `pattern` with
// V8's backtracking engine in the main process, and model output reaches it through
// validateFields, so a pack, user or project schema.json could stall the app with a pattern
// like ^(\w+\s?)*$. A non-built-in schema may therefore use:
//   - `pattern` only in a simple shape that matches in linear time: anchored with ^, a plain
//     sequence of single-character atoms (literal, escape such as \d \w \s, class [..], .),
//     at most one of them with a variable repeat (? * + {n,} {n,m}), others fixed ({n}), no
//     groups, alternation, back-references or look-arounds. Every built-in pattern has this
//     shape, so a copy of a built-in template keeps working;
//   - no `patternProperties` and no `format` at all (no built-in schema uses them).
import type { PackProblem } from '@shared/schemas/pack'

export const MAX_PATTERN_LENGTH = 200
const MAX_REPEAT = 1000

/** Keywords whose value is a name → schema map (keys are names, not keywords). */
const NAME_MAPS = new Set(['properties', '$defs', 'definitions', 'dependentSchemas'])
/** Keywords whose value is instance data or text, never a schema. */
const DATA_KEYWORDS = new Set([
  'enum',
  'const',
  'default',
  'examples',
  'title',
  'description',
  '$comment',
  'required',
  'dependentRequired',
])

/** Length of the class starting at p[i] === '[', or -1 when it never closes. */
function classLength(p: string, i: number): number {
  for (let j = i + 1; j < p.length; j++) {
    if (p[j] === '\\') j++
    else if (p[j] === ']') return j - i + 1
  }
  return -1
}

/** Length of the single-character atom at p[i], or a reason it is not one. */
function atomLength(p: string, i: number): number | string {
  const c = p[i]!
  if (c === '[') {
    const n = classLength(p, i)
    return n < 0 ? 'an unclosed character class' : n
  }
  if (c === '\\') {
    const e = p[i + 1]
    if (e === undefined) return 'a trailing backslash'
    if (/[dDwWsS]/.test(e) || /[^A-Za-z0-9]/.test(e)) return 2
    return `the escape \\${e}`
  }
  if (c === '(' || c === ')') return 'groups'
  if (c === '|') return 'alternation'
  if ('^$*+?{}'.includes(c)) return `"${c}" in this position`
  return 1
}

/** Repeat after an atom: its length and whether it is variable, or a reason it is refused. */
function repeatAt(p: string, i: number): { length: number; variable: boolean } | string {
  const c = p[i]
  let length: number
  let variable: boolean
  if (c === '?' || c === '*' || c === '+') {
    length = 1
    variable = true
  } else if (c === '{') {
    const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i))
    if (!m) return 'a malformed {n,m} repeat'
    const lo = Number(m[1])
    const hi = m[3] ? Number(m[3]) : lo
    if (lo > MAX_REPEAT || hi > MAX_REPEAT) return `a repeat count above ${MAX_REPEAT}`
    if (hi < lo) return 'a {n,m} repeat with m < n'
    length = m[0].length
    variable = m[2] !== undefined
  } else return { length: 0, variable: false }
  if (p[i + length] === '?') length++ // lazy: same cost
  return { length, variable }
}

/** Why `p` is not a simple, linear-time pattern; undefined when it is one. */
export function patternRefusal(p: string): string | undefined {
  if (p.length > MAX_PATTERN_LENGTH) return `longer than ${MAX_PATTERN_LENGTH} characters`
  if (!p.startsWith('^')) return 'not anchored with ^'
  let variable = 0
  for (let i = 1; i < p.length;) {
    if (p[i] === '$' && i === p.length - 1) break
    const atom = atomLength(p, i)
    if (typeof atom === 'string') return `uses ${atom}`
    i += atom
    const rep = repeatAt(p, i)
    if (typeof rep === 'string') return `uses ${rep}`
    i += rep.length
    if (rep.variable && ++variable > 1) return 'has more than one repeat of variable length'
  }
  return undefined
}

const pointer = (path: readonly string[]): string =>
  '/' + path.map((s) => s.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')

function walk(node: unknown, path: string[], out: PackProblem[]): void {
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, [...path, String(i)], out))
    return
  }
  if (!node || typeof node !== 'object') return
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const at = [...path, k]
    if (DATA_KEYWORDS.has(k)) continue
    if (k === 'patternProperties')
      out.push({ message: `${pointer(at)}: patternProperties is not allowed outside built-ins` })
    else if (k === 'format' && typeof v === 'string')
      out.push({ message: `${pointer(at)}: format "${v}" is not allowed outside built-ins` })
    else if (k === 'pattern' && typeof v === 'string') {
      const why = patternRefusal(v)
      if (why)
        out.push({
          message: `${pointer(at)}: pattern ${JSON.stringify(v)} ${why}; outside built-ins a pattern must be ^, single-character atoms with at most one variable repeat, and optional $`,
        })
    } else if (NAME_MAPS.has(k) && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [name, sub] of Object.entries(v)) walk(sub, [...at, name], out)
    } else walk(v, at, out)
  }
}

/** Problems with the regexes of a non-built-in schema.json (messages carry a JSON pointer). */
export function schemaRegexProblems(schema: unknown): PackProblem[] {
  const out: PackProblem[] = []
  walk(schema, [], out)
  return out
}
