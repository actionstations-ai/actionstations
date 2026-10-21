// Turns free text into a safe FTS5 MATCH expression. Every term is double-quoted, so FTS5
// operators and syntax characters typed by the user (AND, NEAR, *, :, ^, parentheses, quotes)
// are never interpreted. Quoted phrases from the user stay phrases; terms are OR-ed and BM25
// ranks chunks that match more of them higher.

const STOPWORDS = new Set(
  'a an and are as at be by for from has have how in is it its of on or that the this to was were what when where which who will with'.split(
    ' ',
  ),
)

/** A run of letters/digits that may contain inner . § - / ' (e.g. "13.6", "§1542", "fail-safe"). */
const TERM = /[\p{L}\p{N}§]+(?:[.\-/'’][\p{L}\p{N}]+)*/gu
const PHRASE = /"([^"]*)"/g

function termsOf(text: string): string[] {
  return (text.match(TERM) ?? []).map((t) => t.replace(/^§+/, '').toLowerCase()).filter(Boolean)
}

function quote(term: string): string {
  return `"${term.replace(/"/g, '""')}"`
}

function phrasesAndRest(query: string): { phrases: string[]; rest: string } {
  const phrases: string[] = []
  const rest = query.replace(PHRASE, (_m, inner: string) => {
    const words = termsOf(inner)
    if (words.length) phrases.push(words.join(' '))
    return ' '
  })
  return { phrases, rest: rest.replace(/"/g, ' ') }
}

/**
 * FTS5 expression for `query`, or undefined when it holds no searchable term.
 * Stopwords are dropped unless the query is nothing but stopwords.
 */
export function toFtsQuery(query: string): string | undefined {
  const { phrases, rest } = phrasesAndRest(query)
  const words = termsOf(rest)
  const content = words.filter((w) => !STOPWORDS.has(w))
  const chosen = content.length || phrases.length ? content : words
  const parts = [...new Set([...phrases, ...chosen])]
  if (!parts.length) return undefined
  return parts.map(quote).join(' OR ')
}
