// Plan conflicts panel model (#423): which findings a filter shows, the plain text "Copy for
// plan owner" puts on the clipboard, and the counts line. Pure.
import {
  LISTED_VERDICTS,
  type PlanConflictsFile,
  type PlanFinding,
} from '@shared/schemas/plan-conflicts'
import { passageLine } from '@shared/seams'

export type ConflictFilter = 'open' | 'dismissed' | 'confirmed' | 'all'

export const FILTER_LABEL: Record<ConflictFilter, string> = {
  open: 'Open',
  dismissed: 'Not a conflict',
  confirmed: 'Confirmed',
  all: 'All, including outdated',
}

/** Consistent / unrelated verdicts stay in the file but are never listed. */
export const isListed = (f: PlanFinding): boolean => LISTED_VERDICTS.includes(f.verdict)

export function visibleFindings(
  file: PlanConflictsFile | null | undefined,
  filter: ConflictFilter,
) {
  const listed = (file?.findings ?? []).filter(isListed)
  if (filter === 'all') return listed
  return listed.filter((f) => f.status === filter)
}

export function filterCounts(
  file: PlanConflictsFile | null | undefined,
): Record<ConflictFilter, number> {
  const listed = (file?.findings ?? []).filter(isListed)
  return {
    open: listed.filter((f) => f.status === 'open').length,
    dismissed: listed.filter((f) => f.status === 'dismissed').length,
    confirmed: listed.filter((f) => f.status === 'confirmed').length,
    all: listed.length,
  }
}

export const VERDICT_TEXT: Record<PlanFinding['verdict'], string> = {
  contradicts: 'The model confirms the passages disagree.',
  complementary: 'The model reads them as covering different situations; check before changing.',
  consistent: 'The model reads them as saying the same thing.',
  unrelated: 'The model reads them as about different things.',
  unconfirmed: 'Not checked with a model. Found by matching the wording.',
}

export { passageLine }

/** "Copy for plan owner": both citations and quotes as plain text. */
export function copyText(f: PlanFinding): string {
  if (f.kind === 'dangling_reference')
    return [
      `Plan check: ${f.slotLabel}`,
      `Missing: ${f.missingTarget ?? f.subject}`,
      `Cited in: ${passageLine(f.a)}`,
      `“${f.a.span}”`,
    ].join('\n')
  const lines = [
    `Plan check: ${f.slotLabel} (${f.subject})`,
    `A: ${passageLine(f.a)}`,
    `“${f.a.span}”`,
  ]
  if (f.b) lines.push(`B: ${passageLine(f.b)}`, `“${f.b.span}”`)
  if (f.values) lines.push(`Values: “${f.values[0]}” and “${f.values[1]}”`)
  if (f.explanation) lines.push(`Note: ${f.explanation}`)
  if (f.note) lines.push(`Reviewer note: ${f.note}`)
  return lines.join('\n')
}

/** Split a span around its value so the value can be highlighted (first occurrence). */
export function highlight(span: string, value: string | undefined): [string, string, string] {
  if (!value) return [span, '', '']
  const at = span.toLowerCase().indexOf(value.toLowerCase())
  if (at < 0) return [span, '', '']
  return [span.slice(0, at), span.slice(at, at + value.length), span.slice(at + value.length)]
}
