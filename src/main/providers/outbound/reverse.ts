// Map placeholders in a reply back to the real values (FR-13). Tolerant of the forms models
// produce: [[PERSON_7F3K]], [PERSON_7F3K], PERSON_7F3K, any case. A whole token must match an
// issued placeholder; anything else (a placeholder the model invented, or a longer code) stays as
// written and is reported as unknown.
import type { RedactionRegistry } from './redact'

const TOKEN =
  /(?:\[{1,2}\s?|(?<![\p{L}\p{N}_[]))((?:PERSON|PHONE|EMAIL|ADDRESS)_[A-Z2-7]{4,52})(?:\s?\]{1,2})?(?![\p{L}\p{N}_])/giu

export interface Reversed<T> {
  value: T
  /** Placeholders found that this project never issued (in order of first appearance). */
  unknown: string[]
}

export function reverseText(text: string, registry: RedactionRegistry): Reversed<string> {
  const unknown: string[] = []
  const value = text.replace(TOKEN, (whole, token: string) => {
    const entry = registry.lookup(token)
    if (entry) return entry.value
    const upper = token.toUpperCase()
    if (!unknown.includes(upper)) unknown.push(upper)
    return whole
  })
  return { value, unknown }
}

/** Every string in a JSON value, deep (keys too). */
export function reverseDeep(value: unknown, registry: RedactionRegistry): Reversed<unknown> {
  const unknown = new Set<string>()
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = reverseText(v, registry)
      r.unknown.forEach((u) => unknown.add(u))
      return r.value
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, x]) => [walk(k) as string, walk(x)]),
      )
    return v
  }
  const out = walk(value)
  return { value: out, unknown: [...unknown] }
}
