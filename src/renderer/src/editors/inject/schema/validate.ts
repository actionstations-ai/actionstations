// Client-side check of inject fields against a template's JSON Schema, for inline form errors.
// The renderer's CSP has no 'unsafe-eval', so ajv (which compiles to code) cannot run here.
// This covers the keywords our templates use; main's ajv check in render:inject stays the
// authority.
import { resolveRef, typesOf, type JsonSchema } from './fields'

export interface FieldIssue {
  /** JSON pointer into fields: "/rows/0/flight" ("" = the object itself). */
  path: string
  message: string
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

function typeMatches(t: string, v: unknown): boolean {
  switch (t) {
    case 'string':
      return typeof v === 'string'
    case 'integer':
      return typeof v === 'number' && Number.isInteger(v)
    case 'number':
      return typeof v === 'number' && Number.isFinite(v)
    case 'boolean':
      return typeof v === 'boolean'
    case 'array':
      return Array.isArray(v)
    case 'object':
      return isObj(v)
    case 'null':
      return v === null
    default:
      return true
  }
}

const TYPE_WORDS: Record<string, string> = {
  string: 'text',
  integer: 'a whole number',
  number: 'a number',
  boolean: 'yes/no',
  array: 'a list',
  object: 'a group of fields',
}

function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'u')
  } catch {
    return null
  }
}

function checkString(s: JsonSchema, v: string, path: string, out: FieldIssue[]) {
  if (typeof s.minLength === 'number' && v.length < s.minLength)
    out.push({
      path,
      message: s.minLength === 1 ? 'Required' : `At least ${s.minLength} characters`,
    })
  if (typeof s.maxLength === 'number' && v.length > s.maxLength)
    out.push({ path, message: `At most ${s.maxLength} characters (now ${v.length})` })
  if (typeof s.pattern === 'string') {
    const re = compilePattern(s.pattern)
    if (re && !re.test(v)) out.push({ path, message: `Does not match the expected format` })
  }
}

function checkNumber(s: JsonSchema, v: number, path: string, out: FieldIssue[]) {
  if (typeof s.minimum === 'number' && v < s.minimum)
    out.push({ path, message: `Must be ≥ ${s.minimum}` })
  if (typeof s.maximum === 'number' && v > s.maximum)
    out.push({ path, message: `Must be ≤ ${s.maximum}` })
}

function checkArray(
  s: JsonSchema,
  v: unknown[],
  path: string,
  root: JsonSchema,
  out: FieldIssue[],
) {
  if (typeof s.minItems === 'number' && v.length < s.minItems)
    out.push({ path, message: `Needs at least ${s.minItems} item${s.minItems === 1 ? '' : 's'}` })
  if (typeof s.maxItems === 'number' && v.length > s.maxItems)
    out.push({ path, message: `At most ${s.maxItems} items (now ${v.length})` })
  if (isObj(s.items))
    v.forEach((item, i) => walk(s.items as JsonSchema, item, `${path}/${i}`, root, out))
}

function checkObject(
  s: JsonSchema,
  v: Record<string, unknown>,
  path: string,
  root: JsonSchema,
  out: FieldIssue[],
) {
  const props = isObj(s.properties) ? (s.properties as Record<string, JsonSchema>) : {}
  for (const key of Array.isArray(s.required) ? s.required.map(String) : [])
    if (v[key] === undefined) out.push({ path: `${path}/${key}`, message: 'Required' })
  for (const [key, value] of Object.entries(v)) {
    if (value === undefined) continue
    const child = props[key]
    if (child) walk(child, value, `${path}/${key}`, root, out)
    else if (s.additionalProperties === false)
      out.push({ path: `${path}/${key}`, message: 'Not a field of this template' })
  }
}

function walk(raw: JsonSchema, v: unknown, path: string, root: JsonSchema, out: FieldIssue[]) {
  const s = resolveRef(raw, root)
  const types = typesOf(s)
  if (types.length && !types.some((t) => typeMatches(t, v))) {
    out.push({ path, message: `Should be ${types.map((t) => TYPE_WORDS[t] ?? t).join(' or ')}` })
    return
  }
  if (Array.isArray(s.enum) && !s.enum.includes(v)) {
    out.push({ path, message: `One of: ${s.enum.join(', ')}` })
    return
  }
  if (typeof v === 'string') checkString(s, v, path, out)
  else if (typeof v === 'number') checkNumber(s, v, path, out)
  else if (Array.isArray(v)) checkArray(s, v, path, root, out)
  else if (isObj(v)) checkObject(s, v, path, root, out)
}

/** Every problem with `fields` under `schema`; [] when the inject would render. */
export function validateFields(schema: JsonSchema, fields: unknown): FieldIssue[] {
  const out: FieldIssue[] = []
  walk(schema, fields, '', schema, out)
  return out
}

/** Issues grouped by path, for inline errors next to each control. */
export function issuesByPath(issues: FieldIssue[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const i of issues)
    map.set(i.path, map.has(i.path) ? `${map.get(i.path)}; ${i.message}` : i.message)
  return map
}
