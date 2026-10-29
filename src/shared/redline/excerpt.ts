// Finding an excerpt in plan text (#431, FR-2): a model quotes with straight quotes, single
// spaces and no line breaks where the document has curly quotes, non-breaking spaces and
// wrapped lines. Comparison normalizes those; the result is the exact span of the original so
// nothing the model wrote is ever used as a position. Pure.

const QUOTES: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '‟': '"',
}

const isSpace = (ch: string): boolean => /\s/u.test(ch) || ch === ' ' || ch === '​'

export interface Normalized {
  /** Quotes straightened, every run of whitespace one space. */
  text: string
  /** `starts[i]` is the index in the original of normalized character i. */
  starts: number[]
}

export function normalizeText(original: string): Normalized {
  let text = ''
  const starts: number[] = []
  let pendingSpace = -1
  for (let i = 0; i < original.length; i++) {
    const ch = original[i]!
    if (isSpace(ch)) {
      if (pendingSpace < 0) pendingSpace = i
      continue
    }
    if (pendingSpace >= 0 && text.length) {
      text += ' '
      starts.push(pendingSpace)
    }
    pendingSpace = -1
    text += QUOTES[ch] ?? ch
    starts.push(i)
  }
  return { text, starts }
}

/** `normalizeText(s).text`: the form two excerpts are compared in. */
export const normalizedForm = (s: string): string => normalizeText(s).text

export interface Span {
  start: number
  end: number
}

/** The first span of `haystack` that reads as `excerpt`, or null; `end` is exclusive. */
export function findExcerpt(haystack: string, excerpt: string): Span | null {
  const needle = normalizedForm(excerpt)
  if (!needle) return null
  const hay = normalizeText(haystack)
  const at = hay.text.indexOf(needle)
  if (at < 0) return null
  const last = at + needle.length - 1
  return { start: hay.starts[at]!, end: hay.starts[last]! + 1 }
}

/** How many times the excerpt reads in the text (a repeated sentence is anchored to the first). */
export function countExcerpt(haystack: string, excerpt: string): number {
  const needle = normalizedForm(excerpt)
  if (!needle) return 0
  const hay = normalizeText(haystack).text
  let n = 0
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) n++
  return n
}
