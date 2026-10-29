// An inject's translatable fields as a flat list of text boxes: the editor shows one row per
// string and writes edits back at the same path (spec 0435 FR-8).

export type PathPart = string | number

export interface FieldRow {
  path: PathPart[]
  /** "Contact › note" or "Bubbles 2 › text". */
  label: string
  value: string
}

const humanize = (key: string): string =>
  key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

/** Every string in `value`, in reading order, with its path. Nulls and non-strings are skipped. */
export function fieldRows(value: unknown, path: PathPart[] = [], label: string[] = []): FieldRow[] {
  if (typeof value === 'string') return [{ path, label: label.join(' › '), value }]
  if (Array.isArray(value))
    return value.flatMap((v, i) =>
      fieldRows(v, [...path, i], [...label.slice(0, -1), `${label.at(-1) ?? 'Item'} ${i + 1}`]),
    )
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) =>
      fieldRows(v, [...path, k], [...label, humanize(k)]),
    )
  return []
}

/** A copy of `value` with the string at `path` replaced. */
export function setAtPath(value: unknown, path: PathPart[], text: string): unknown {
  const [head, ...rest] = path
  if (head === undefined) return text
  if (Array.isArray(value)) return value.map((v, i) => (i === head ? setAtPath(v, rest, text) : v))
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return { ...obj, [head]: setAtPath(obj[head as string], rest, text) }
}

/** The value at `path`, or undefined. */
export function getAtPath(value: unknown, path: PathPart[]): unknown {
  return path.reduce<unknown>(
    (v, key) =>
      v && typeof v === 'object' ? (v as Record<string | number, unknown>)[key] : undefined,
    value,
  )
}
