// JSON Schema rewriting for "strict" structured output (OpenAI json_schema strict, LM Studio,
// Anthropic strict tools). Strict mode needs every object closed (additionalProperties:false)
// and every property required, so optional properties become nullable-required and the
// nulls are removed again after parsing (restoreOptionals). Zod validation still runs later.

type Json = Record<string, unknown>

export interface StrictOptions {
  /** Drop keywords the target cannot enforce (Anthropic: numeric/string/array bounds). */
  dropKeywords?: readonly string[]
}

export interface StrictResult {
  schema: Json
  /** False when the schema contains open maps (z.record) that strict mode cannot express. */
  strict: boolean
}

export const ANTHROPIC_UNSUPPORTED = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'maxItems',
  'uniqueItems',
] as const

const NESTED_LIST_KEYS = ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const

export function toStrictSchema(schema: Json, opts: StrictOptions = {}): StrictResult {
  const state = { strict: true }
  const out = rewrite(schema, opts, state)
  return { schema: out, strict: state.strict }
}

function rewrite(node: unknown, opts: StrictOptions, state: { strict: boolean }): Json {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return node as Json
  const src = node as Json
  const out: Json = {}
  for (const [k, v] of Object.entries(src)) {
    if (opts.dropKeywords?.includes(k)) continue
    out[k] = v
  }
  if (typeof out.minItems === 'number' && opts.dropKeywords && out.minItems > 1) out.minItems = 1
  for (const key of NESTED_LIST_KEYS)
    if (Array.isArray(out[key]))
      out[key] = (out[key] as unknown[]).map((n) => rewrite(n, opts, state))
  if (out.items && typeof out.items === 'object') out.items = rewrite(out.items, opts, state)
  for (const defsKey of ['$defs', 'definitions'])
    if (out[defsKey] && typeof out[defsKey] === 'object')
      out[defsKey] = mapValues(out[defsKey] as Json, (n) => rewrite(n, opts, state))
  if (isObjectSchema(out)) closeObject(out, opts, state)
  return out
}

function isObjectSchema(s: Json): boolean {
  return s.type === 'object' || (s.type === undefined && typeof s.properties === 'object')
}

function closeObject(out: Json, opts: StrictOptions, state: { strict: boolean }): void {
  const props = (out.properties ?? {}) as Json
  const ap = out.additionalProperties
  const isOpenMap = Object.keys(props).length === 0 && ap !== undefined && ap !== false
  if (isOpenMap) {
    // A record/map: strict mode cannot express it. Keep it open and mark non-strict.
    state.strict = false
    if (ap && typeof ap === 'object') out.additionalProperties = rewrite(ap, opts, state)
    return
  }
  const required = new Set((out.required as string[] | undefined) ?? [])
  const nextProps: Json = {}
  for (const [name, sub] of Object.entries(props)) {
    const rewritten = rewrite(sub, opts, state)
    nextProps[name] = required.has(name) ? rewritten : nullable(rewritten)
  }
  out.properties = nextProps
  out.required = Object.keys(nextProps)
  out.additionalProperties = false
}

function nullable(s: Json): Json {
  if (Array.isArray(s.anyOf)) {
    const hasNull = (s.anyOf as Json[]).some((b) => b.type === 'null')
    return hasNull ? s : { ...s, anyOf: [...(s.anyOf as Json[]), { type: 'null' }] }
  }
  return { anyOf: [s, { type: 'null' }] }
}

function mapValues(o: Json, fn: (v: unknown) => Json): Json {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v)]))
}

/**
 * Undo the nullable-required rewrite: drop `null` values for properties that were optional
 * in the original schema, recursively, so zod `.optional()` fields validate.
 */
export function restoreOptionals(value: unknown, schema: Json, root: Json = schema): unknown {
  const s = deref(schema, root)
  if (Array.isArray(value)) {
    const items = s.items as Json | undefined
    return items ? value.map((v) => restoreOptionals(v, items, root)) : value
  }
  if (!value || typeof value !== 'object') return value
  const branch = pickBranch(s, root)
  const props = (branch.properties ?? {}) as Json
  const required = new Set((branch.required as string[] | undefined) ?? [])
  const out: Json = {}
  for (const [k, v] of Object.entries(value as Json)) {
    if (v === null && k in props && !required.has(k)) continue
    out[k] = k in props ? restoreOptionals(v, props[k] as Json, root) : v
  }
  return out
}

function deref(s: Json, root: Json): Json {
  const ref = s?.$ref
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return s ?? {}
  let cur: unknown = root
  for (const part of ref.slice(2).split('/')) cur = (cur as Json | undefined)?.[part]
  return (cur as Json) ?? {}
}

function pickBranch(s: Json, root: Json): Json {
  if (s.properties) return s
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const list = s[key]
    if (Array.isArray(list)) {
      const obj = (list as Json[]).map((b) => deref(b, root)).find((b) => b.properties)
      if (obj) return obj
    }
  }
  return s
}
