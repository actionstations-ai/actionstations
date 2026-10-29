// Shared shapes for the redaction detectors (#433, FR-10). Every detector is a pure function of
// (text, context): the same input always yields the same spans.
import type { RedactionCategory } from '@shared/schemas'

export interface DetectedSpan {
  start: number
  end: number
  category: RedactionCategory
  /** The matched text (text.slice(start, end)). */
  value: string
}

/** Project facts that steer detection. Build with `detectContext`. */
export interface DetectContext {
  /** Phone numbers listed in facility-facts.md under the phones category. */
  knownPhones: readonly string[]
  /** Lower-case words that are never part of a person's name (roles, agencies, brands, Never list). */
  notNames: ReadonlySet<string>
  /** Always-redact terms (redacted as `person`). */
  alwaysRedact: readonly string[]
  /** Never-redact terms: any span overlapping one is dropped, last. */
  neverRedact: readonly string[]
}

export const emptyContext = (): DetectContext => ({
  knownPhones: [],
  notNames: new Set(),
  alwaysRedact: [],
  neverRedact: [],
})

export const span = (
  text: string,
  start: number,
  end: number,
  category: RedactionCategory,
): DetectedSpan => ({ start, end, category, value: text.slice(start, end) })

/** Escape a literal for use inside a RegExp. */
export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A literal term as a case-insensitive whole-word pattern, spaces matching any whitespace. */
export function termPattern(term: string): RegExp {
  const body = escapeRegExp(term.trim()).replace(/\s+/g, '\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, 'giu')
}
