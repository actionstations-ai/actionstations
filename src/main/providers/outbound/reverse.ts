// Map placeholders in a reply back to the real values (FR-13). Tolerant of the forms models
// produce: [[PERSON_7F3K]], [PERSON_7F3K], PERSON_7F3K, any case. A whole token must match an
// issued placeholder. A bracketed token the project never issued is one the model invented by
// copying the format (#1145): it becomes a neutral fictional value of its kind, so no placeholder
// reaches a scenario, and it is reported for review. A bare unknown token is not a placeholder
// the model wrote ("PHONE_CALL", an inject type id) and is left alone.
import type { RedactionRegistry } from './redact'

const TOKEN =
  /(?:\[{1,2}\s?|(?<![\p{L}\p{N}_[]))((?:PERSON|PHONE|EMAIL|ADDRESS)_[A-Z2-7]{4,52})(?:\s?\]{1,2})?(?![\p{L}\p{N}_])/giu

/** Two digits from a token's suffix, so one invented token always gets the same number. */
const digitsOf = (suffix: string): string =>
  String([...suffix].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 100, 7)).padStart(2, '0')

/** The neutral fictional value an invented placeholder becomes, by its kind. */
export function standIn(token: string): string {
  const [kind, suffix = ''] = token.toUpperCase().split('_')
  if (kind === 'PERSON') return 'a staff member'
  if (kind === 'PHONE') return `555-01${digitsOf(suffix)}`
  if (kind === 'EMAIL') return `contact-${suffix.toLowerCase()}@example.org`
  return 'the address on file'
}

export interface Reversed<T> {
  value: T
  /** Placeholders the model invented, replaced by stand-ins (in order of first appearance). */
  unknown: string[]
}

export function reverseText(text: string, registry: RedactionRegistry): Reversed<string> {
  const unknown: string[] = []
  const value = text.replace(TOKEN, (whole, token: string) => {
    const entry = registry.lookup(token)
    if (entry) return entry.value
    if (!whole.startsWith('[')) return whole
    const upper = token.toUpperCase()
    if (!unknown.includes(upper)) unknown.push(upper)
    return standIn(upper)
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
