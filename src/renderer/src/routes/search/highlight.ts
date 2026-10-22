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

const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

/** "| a | b |" → "a · b"; rule rows ("|---|---|") disappear. */
function tableRowToText(line: string): string {
  if (TABLE_RULE.test(line)) return ''
  if (!/^\s*\|/.test(line)) return line
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean)
    .join(' · ')
}

function stripLinePrefix(line: string): string {
  return tableRowToText(line)
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s{0,3}>\s?/, '')
    .replace(/^(\s*)[-*+]\s+/, '$1• ')
}

/** Markdown chunk text → readable plain text for snippets (emphasis, code, links, tables). */
export function stripMarkdown(text: string): string {
  return text
    .split('\n')
    .map(stripLinePrefix)
    .join('\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, '$1')
}
