// Immutable helpers for editing a fields object without leaving empty optional keys behind
// (an empty optional string would still fail a pattern check in the template schema).

export type Fields = Record<string, unknown>

const isEmpty = (v: unknown): boolean => v === undefined || v === ''

/** Set `key` to `value`; optional keys are removed when the value is empty. */
export function setKey(obj: Fields, key: string, value: unknown, required: boolean): Fields {
  const next = { ...obj }
  if (isEmpty(value) && !required) delete next[key]
  else next[key] = value
  return next
}

export function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((v, i) => (i === index ? value : v))
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

/** Move item `index` by `delta` (−1 up, +1 down); out-of-range moves are no-ops. */
export function moveItem<T>(list: readonly T[], index: number, delta: number): T[] {
  const to = index + delta
  if (to < 0 || to >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(to, 0, item as T)
  return next
}

/** "12400" → 12400; anything else stays text (fields typed integer-or-string). */
export function numberOrText(raw: string): number | string {
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw
}

/** Singular noun for a list's items: "Rows" → "row", "Messages" → "message". */
export function itemNoun(label: string): string {
  const last = label.toLowerCase().split(/\s+/).at(-1) ?? 'item'
  if (last.endsWith('ies')) return `${last.slice(0, -3)}y`
  if (last.endsWith('sses')) return last.slice(0, -2)
  return last.endsWith('s') && last.length > 3 ? last.slice(0, -1) : last
}

/** Parse a number input; '' or garbage → undefined. */
export function parseNumber(raw: string, integer: boolean): number | undefined {
  if (raw.trim() === '') return undefined
  const n = integer ? Number.parseInt(raw, 10) : Number(raw)
  return Number.isFinite(n) ? n : undefined
}
