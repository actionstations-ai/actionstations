// Deterministic field repair before template validation (#175, #177): the schema violations
// a model makes on otherwise good content, fixed in code instead of costing a repair call or
// leaving the inject unrendered. Three repairs, applied in place:
//   - an enum value outside the allowed set → a case-insensitive match, else the schema
//     default, else the first enum value;
//   - a string over maxLength, or one a simple character-class pattern rejects (a 19-char
//     tweet handle, a leading "@") → sanitized to the class and truncated to fit;
//   - keys an `additionalProperties: false` object does not declare → dropped.
// Each repair is returned so the caller can log it and put a warning on the inject.

type Json = Record<string, unknown>

export interface FieldRepair {
  /** JSON pointer-style path below the fields ("/handle", "/original/attachments"). */
  path: string
  message: string
}

const MAX_DEPTH = 8

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)

/** `$ref: "#/$defs/x"` resolved against the root schema (the only form templates use). */
function resolveRef(schema: Json, root: Json): Json {
  const ref = schema.$ref
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return schema
  let node: unknown = root
  for (const part of ref.slice(2).split('/')) node = isObject(node) ? node[part] : undefined
  return isObject(node) ? { ...node, ...schema, $ref: undefined } : schema
}

const short = (v: unknown): string => {
  const s = JSON.stringify(v) ?? String(v)
  return s.length > 60 ? `${s.slice(0, 57)}…` : s
}

function repairEnum(schema: Json, value: unknown): { value: unknown } | undefined {
  const options = schema.enum
  if (!Array.isArray(options) || !options.length || options.includes(value)) return undefined
  if (typeof value === 'string') {
    const wanted = value.trim().toLowerCase()
    const match = options.find((o) => typeof o === 'string' && o.toLowerCase() === wanted)
    if (match !== undefined) return { value: match }
  }
  if (schema.default !== undefined && options.includes(schema.default))
    return { value: schema.default }
  return { value: options[0] }
}

/** `^[CLASS]{min,max}$`, `^[CLASS]+$` or `^[CLASS]*$`: the class and the length bounds. */
function simplePattern(pattern: string): { cls: RegExp; min: number; max?: number } | undefined {
  const m = /^\^(\[[^\]]+\])(?:\{(\d+)(?:,(\d*))?\}|(\+)|(\*))\$$/.exec(pattern)
  if (!m) return undefined
  let cls: RegExp
  try {
    cls = new RegExp(`^${m[1]}$`, 'u')
  } catch {
    return undefined
  }
  if (m[4]) return { cls, min: 1 }
  if (m[5]) return { cls, min: 0 }
  const min = Number(m[2])
  const max = m[3] === undefined ? min : m[3] === '' ? undefined : Number(m[3])
  return { cls, min, ...(max !== undefined ? { max } : {}) }
}

function compiled(pattern: string): RegExp | undefined {
  try {
    return new RegExp(pattern, 'u')
  } catch {
    return undefined
  }
}

/** The string sanitized to a simple pattern's class and cut to its length; undefined if not possible. */
function fitPattern(pattern: string, value: string): string | undefined {
  const simple = simplePattern(pattern)
  if (!simple) return undefined
  const chars = [...value.trim()].filter((c) => simple.cls.test(c))
  const fitted = (simple.max !== undefined ? chars.slice(0, simple.max) : chars).join('')
  return fitted.length >= simple.min ? fitted : undefined
}

function repairString(schema: Json, value: string): { value: string; why: string } | undefined {
  let next = value
  const why: string[] = []
  const pattern = typeof schema.pattern === 'string' ? schema.pattern : undefined
  const re = pattern ? compiled(pattern) : undefined
  if (pattern && re && !re.test(next)) {
    const fitted = fitPattern(pattern, next)
    if (fitted !== undefined && re.test(fitted)) {
      next = fitted
      why.push(`fitted to pattern ${pattern}`)
    }
  }
  const max = typeof schema.maxLength === 'number' ? schema.maxLength : undefined
  if (max !== undefined && [...next].length > max) {
    next = [...next].slice(0, max).join('').trimEnd()
    why.push(`truncated to ${max} characters`)
  }
  return next === value ? undefined : { value: next, why: why.join(', ') }
}

function repairObject(schema: Json, value: Json, path: string, ctx: Walk): void {
  const props = isObject(schema.properties) ? (schema.properties as Record<string, Json>) : {}
  if (schema.additionalProperties === false && Object.keys(props).length) {
    for (const key of Object.keys(value)) {
      if (key in props) continue
      delete value[key]
      ctx.out.push({ path: `${path}/${key}`, message: `dropped "${key}" (not in the template)` })
    }
  }
  for (const [key, sub] of Object.entries(props)) {
    if (!(key in value)) continue
    const fixed = repairValue(sub, value[key], `${path}/${key}`, ctx)
    if (fixed) value[key] = fixed.value
  }
}

/** 'keys' only drops undeclared keys (no content lost); 'all' also fixes values. */
export type RepairMode = 'keys' | 'all'

interface Walk {
  root: Json
  out: FieldRepair[]
  depth: number
  mode: RepairMode
}

/** Repairs `value` in place where it can; returns a replacement for scalars. */
function repairValue(
  raw: Json,
  value: unknown,
  path: string,
  ctx: Walk,
): { value: unknown } | undefined {
  if (ctx.depth > MAX_DEPTH || !isObject(raw)) return undefined
  const schema = resolveRef(raw, ctx.root)
  const enumFix = ctx.mode === 'all' ? repairEnum(schema, value) : undefined
  if (enumFix) {
    ctx.out.push({
      path,
      message: `${short(value)} is not one of ${(schema.enum as unknown[]).map(short).join(' | ')}; set to ${short(enumFix.value)}`,
    })
    return enumFix
  }
  if (typeof value === 'string') {
    if (ctx.mode !== 'all') return undefined
    const fixed = repairString(schema, value)
    if (!fixed) return undefined
    ctx.out.push({ path, message: `${short(value)} ${fixed.why}: ${short(fixed.value)}` })
    return { value: fixed.value }
  }
  const inner = { ...ctx, depth: ctx.depth + 1 }
  if (Array.isArray(value) && isObject(schema.items)) {
    value.forEach((item, i) => {
      const fixed = repairValue(schema.items as Json, item, `${path}/${i}`, inner)
      if (fixed) value[i] = fixed.value
    })
  } else if (isObject(value)) repairObject(schema, value, path, inner)
  return undefined
}

/**
 * Apply the deterministic repairs to `fields` (mutated) against a template's JSON Schema.
 * Values the repairs cannot make valid are left for validation to report. The inject stage
 * drops undeclared keys on every draft ('keys') and fixes values only when the model's own
 * repair round has not ('all'): the model maps "Urgent" to "Critical" better than code.
 */
export function repairFields(
  schema: unknown,
  fields: Json,
  mode: RepairMode = 'all',
): FieldRepair[] {
  if (!isObject(schema)) return []
  const ctx: Walk = { root: schema, out: [], depth: 0, mode }
  repairObject(schema, fields, '', ctx)
  return ctx.out
}

export const formatRepairs = (repairs: FieldRepair[]): string =>
  repairs.map((r) => `fields${r.path}: ${r.message}`).join('; ')
