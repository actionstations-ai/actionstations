// Query-term highlighting as plain segments. React renders them as text nodes, so chunk text
// is never interpreted as HTML.

const OPERATORS = new Set(['and', 'or', 'not', 'near'])

/** Distinct lowercase terms worth highlighting (2+ chars, FTS operators dropped). */
export function queryTerms(query: string): string[] {
  const words = query.toLowerCase().split(/[^\p{L}\p{N}]+/u)
  const terms = words.filter((w) => w.length >= 2 && !OPERATORS.has(w))
  return [...new Set(terms)].sort((a, b) => b.length - a.length)
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface Segment {
  text: string
  match: boolean
}

function termPattern(terms: string[]): RegExp | null {
  if (!terms.length) return null
  return new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'giu')
}

/** Split text into alternating plain / matched segments. */
export function highlightSegments(text: string, terms: string[]): Segment[] {
  const re = termPattern(terms)
  if (!re || !text) return text ? [{ text, match: false }] : []
  const lower = new Set(terms)
  return text
    .split(re)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, match: lower.has(part.toLowerCase()) }))
}

/**
 * Cut a window of about `max` characters around the first matching term, on word
 * boundaries, with ellipses where text was dropped.
 */
export function snippet(text: string, terms: string[], max = 360): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const re = termPattern(terms)
  const first = re ? clean.search(re) : -1
  let start = first > 0 ? Math.max(0, first - Math.floor(max / 3)) : 0
  if (start > 0) {
    const space = clean.indexOf(' ', start)
    if (space !== -1 && space < first) start = space + 1
  }
  let end = Math.min(clean.length, start + max)
  if (end < clean.length) {
    const space = clean.lastIndexOf(' ', end)
    if (space > start) end = space
  }
  return `${start > 0 ? '… ' : ''}${clean.slice(start, end)}${end < clean.length ? ' …' : ''}`
}
