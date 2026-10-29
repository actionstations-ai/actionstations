// Run the detectors in a fixed order, keep the longest span where two overlap (earlier detector
// on a tie), then drop spans that overlap a Never-redact term. Pure and deterministic (NFR-5).
import type { RedactionCategory } from '@shared/schemas'
import { detectAddresses } from './address'
import { detectEmails } from './email'
import { detectPersons } from './person'
import { detectPhones } from './phone'
import { detectAlways, neverRanges } from './terms'
import type { DetectContext, DetectedSpan } from './types'

export type { DetectContext, DetectedSpan } from './types'
export { emptyContext } from './types'
export { notNameWords } from './person'
export { normalizePhone } from './phone'

const ORDER: RedactionCategory[] = ['email', 'phone', 'address', 'person']

function run(category: RedactionCategory, text: string, ctx: DetectContext): DetectedSpan[] {
  switch (category) {
    case 'email':
      return detectEmails(text)
    case 'phone':
      return detectPhones(text, ctx.knownPhones)
    case 'address':
      return detectAddresses(text)
    case 'person':
      return detectPersons(text, ctx)
  }
}

const overlaps = (a: { start: number; end: number }, b: [number, number]): boolean =>
  a.start < b[1] && b[0] < a.end

/** Longest first; on equal length the earlier detector, then the earlier position. */
function resolveOverlaps(candidates: { span: DetectedSpan; rank: number }[]): DetectedSpan[] {
  const sorted = [...candidates].sort(
    (a, b) =>
      b.span.end - b.span.start - (a.span.end - a.span.start) ||
      a.rank - b.rank ||
      a.span.start - b.span.start,
  )
  const kept: DetectedSpan[] = []
  for (const { span } of sorted)
    if (!kept.some((k) => overlaps(span, [k.start, k.end]))) kept.push(span)
  return kept.sort((a, b) => a.start - b.start)
}

/** Spans to redact in `text` for the enabled categories (Always terms apply regardless). */
export function detectAll(
  text: string,
  enabled: ReadonlySet<RedactionCategory>,
  ctx: DetectContext,
  /** Values already redacted earlier in the project: always replaced again, ahead of detectors. */
  known: DetectedSpan[] = [],
): DetectedSpan[] {
  const candidates: { span: DetectedSpan; rank: number }[] = known.map((span) => ({
    span,
    rank: -1,
  }))
  ORDER.forEach((category, rank) => {
    if (!enabled.has(category)) return
    for (const span of run(category, text, ctx))
      if (span.end > span.start) candidates.push({ span, rank })
  })
  for (const span of detectAlways(text, ctx.alwaysRedact))
    candidates.push({ span, rank: ORDER.length })
  const never = neverRanges(text, ctx.neverRedact)
  return resolveOverlaps(candidates).filter((s) => !never.some((r) => overlaps(s, r)))
}
