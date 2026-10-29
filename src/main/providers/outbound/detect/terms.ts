// The user's Always-redact and Never-redact lists (FR-9). Always terms are redacted as `person`
// (a staff nickname, a private business); Never terms remove any span that overlaps them.
import { span, termPattern, type DetectedSpan } from './types'

export function detectAlways(text: string, terms: readonly string[]): DetectedSpan[] {
  const out: DetectedSpan[] = []
  for (const term of terms)
    for (const m of text.matchAll(termPattern(term)))
      out.push(span(text, m.index, m.index + m[0].length, 'person'))
  return out
}

/** Ranges of every Never-redact term in the text. */
export function neverRanges(text: string, terms: readonly string[]): [number, number][] {
  const out: [number, number][] = []
  for (const term of terms)
    for (const m of text.matchAll(termPattern(term))) out.push([m.index, m.index + m[0].length])
  return out
}
