// Type switch: carry an inject's fields over to another template's schema. A field moves when
// the target declares the same name (or a close synonym) with a compatible type; everything
// else is reported as dropped so the editor can warn before the switch is applied.
import { resolveRef, typesOf, type JsonSchema } from './fields'

export interface RemapResult {
  fields: Record<string, unknown>
  /** Source keys that did not fit the target template. */
  dropped: string[]
  /** target key ← source key, for keys that moved under a different name. */
  renamed: Record<string, string>
}

/** Groups of names that mean the same thing across templates (first match wins). */
const SYNONYMS: string[][] = [
  ['text', 'body', 'message', 'content', 'description'],
  ['subject', 'title', 'headline'],
  ['from', 'sender', 'author'],
  ['to', 'recipient'],
  ['date', 'dateLine'],
  ['time', 'timestamp', 'clock'],
]

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

function valueFits(raw: JsonSchema, value: unknown, root: JsonSchema): boolean {
  const s = resolveRef(raw, root)
  if (Array.isArray(s.enum)) return s.enum.includes(value)
  const types = typesOf(s)
  if (!types.length) return true
  return types.some((t) => {
    if (t === 'string') return typeof value === 'string'
    if (t === 'integer') return typeof value === 'number' && Number.isInteger(value)
    if (t === 'number') return typeof value === 'number'
    if (t === 'boolean') return typeof value === 'boolean'
    if (t === 'array') return Array.isArray(value)
    if (t === 'object') return isObj(value)
    return false
  })
}

function synonymsOf(name: string): string[] {
  return SYNONYMS.find((g) => g.includes(name))?.filter((n) => n !== name) ?? []
}

/** Move `fields` onto `target`'s properties; see RemapResult. */
export function remapFields(fields: Record<string, unknown>, target: JsonSchema): RemapResult {
  const props = isObj(target.properties) ? (target.properties as Record<string, JsonSchema>) : {}
  const out: Record<string, unknown> = {}
  const used = new Set<string>()
  const renamed: Record<string, string> = {}
  for (const [key, schema] of Object.entries(props)) {
    if (key in fields && valueFits(schema, fields[key], target)) {
      out[key] = fields[key]
      used.add(key)
    }
  }
  for (const [key, schema] of Object.entries(props)) {
    if (key in out) continue
    const from = synonymsOf(key).find(
      (s) => s in fields && !used.has(s) && !(s in props) && valueFits(schema, fields[s], target),
    )
    if (from) {
      out[key] = fields[from]
      used.add(from)
      renamed[key] = from
    }
  }
  const dropped = Object.keys(fields).filter((k) => !used.has(k) && fields[k] !== undefined)
  return { fields: out, dropped, renamed }
}
