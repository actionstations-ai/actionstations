// Small helpers shared by the benchmark scorers (#434). Every score is 0–100.

export const clamp100 = (n) => Math.max(0, Math.min(100, n))
export const round1 = (n) => Math.round(n * 10) / 10
export const share = (part, whole) => (whole > 0 ? part / whole : 0)

/** Rows that carry the story rather than steer the clock. */
export const CONTROL_TAGS = new Set(['STARTEX', 'ENDEX', 'TIME_JUMP'])
export const contentRows = (msel) => msel.filter((r) => !CONTROL_TAGS.has(r.purposeTag))

/** Weighted mean of `parts` (0–100 each) by `weights`; parts without a weight are ignored. */
export function weighted(parts, weights) {
  let sum = 0
  let total = 0
  for (const [key, w] of Object.entries(weights)) {
    if (!(key in parts) || !w) continue
    sum += parts[key] * w
    total += w
  }
  return total > 0 ? clamp100(sum / total) : 0
}

export const median = (values) => {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export const mean = (values) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0

/** Citation keys named in a CITATION_DROPPED warning ("… cited a, b, which was not …"). */
export function droppedKeys(message) {
  const m = /cited (.+?), which was not among/.exec(message ?? '')
  return m
    ? m[1]
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    : []
}
