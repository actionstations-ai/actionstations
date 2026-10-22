// Field-level differences between two versions of an inject's fields (regenerate text,
// versions panel). Leaves are compared by value; paths are human-readable ("rows[2].gate").

export interface FieldChange {
  path: string
  kind: 'added' | 'removed' | 'changed'
  before?: unknown
  after?: unknown
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (isObj(value)) {
    const keys = Object.keys(value)
    if (!keys.length && prefix) out.set(prefix, value)
    for (const k of keys) flatten(value[k], prefix ? `${prefix}.${k}` : k, out)
  } else if (Array.isArray(value)) {
    if (!value.length && prefix) out.set(prefix, value)
    value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out))
  } else if (value !== undefined) {
    out.set(prefix, value)
  }
}

/** Changes from `before` to `after`, in `after`'s key order (removals last). */
export function diffFields(before: unknown, after: unknown): FieldChange[] {
  const a = new Map<string, unknown>()
  const b = new Map<string, unknown>()
  flatten(before, '', a)
  flatten(after, '', b)
  const changes: FieldChange[] = []
  for (const [path, value] of b) {
    if (!a.has(path)) changes.push({ path, kind: 'added', after: value })
    else if (JSON.stringify(a.get(path)) !== JSON.stringify(value))
      changes.push({ path, kind: 'changed', before: a.get(path), after: value })
  }
  for (const [path, value] of a)
    if (!b.has(path)) changes.push({ path, kind: 'removed', before: value })
  return changes
}

/** Short display text for a leaf value. */
export function showValue(v: unknown, max = 160): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
