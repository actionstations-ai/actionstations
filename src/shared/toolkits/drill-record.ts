// The drill record of a program exercise (spec 0466 FR-11): how the plan was tested, the problems
// found, the corrective actions and the participants, each marked present or missing, with a
// prompt to review the plan afterward. A registered entity's incident response plan must be
// drilled at least annually and reviewed after any drill, exercise or incident (42 CFR 73.14).
// Element names come from the exercise tag, so another program with a record reuses the table.
import type { ToolkitExerciseTag } from './schema'

/** The improvement plan row fields a drill record reads. */
export interface DrillRow {
  finding: string
  action: string
  owner: string
}

/** What the AAR knows that a drill record needs besides the improvement plan rows. */
export interface DrillContext {
  /** Participating organizations (Appendix B). */
  participants: readonly string[]
  /** The exercise title, as the account of how the plan was tested. */
  exerciseTitle?: string
}

export interface DrillRecordEntry {
  element: string
  entry: string
  present: boolean
}

const joined = (items: readonly string[]): string => items.filter(Boolean).join('; ')
const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

/** The entries, in the order the tag lists its elements (tested, problems, actions, participants). */
export function drillRecordEntries(
  tag: Pick<ToolkitExerciseTag, 'type' | 'label' | 'drillRecord'>,
  rows: readonly DrillRow[],
  exerciseDate: string | undefined,
  ctx: DrillContext = { participants: [] },
): DrillRecordEntry[] {
  const values = [
    joined([
      `${tag.label} (${tag.type.replace('_', '-')} exercise)`,
      ctx.exerciseTitle ?? '',
      exerciseDate ?? '',
    ]),
    joined([...new Set(rows.map((r) => r.finding))]),
    joined(rows.map((r) => `${r.action}${r.owner ? ` (${r.owner})` : ''}`)),
    joined(ctx.participants),
  ]
  return (tag.drillRecord?.elements ?? []).map((element, i) => ({
    element,
    entry: values[i] ?? '',
    present: Boolean(values[i]?.trim()),
  }))
}

/** The drill record section the AAR adds under a program exercise's improvement plan. */
export function drillRecordMarkdown(
  tag: ToolkitExerciseTag,
  rows: readonly DrillRow[],
  exerciseDate: string | undefined,
  ctx?: DrillContext,
): string {
  if (!tag.drillRecord) return ''
  const entries = drillRecordEntries(tag, rows, exerciseDate, ctx)
  const done = entries.filter((e) => e.present).length
  const missing = entries.filter((e) => !e.present).map((e) => e.element)
  const line = (cols: string[]) => `| ${cols.map(cell).join(' | ')} |`
  return [
    `#### Drill record: ${tag.label}`,
    '',
    line(['Element', 'Entry', 'Status']),
    line(['---', '---', '---']),
    ...entries.map((e) =>
      line([e.element, e.entry || 'Not recorded', e.present ? 'Present' : 'Missing']),
    ),
    '',
    `Drill record complete: ${done} of ${entries.length} elements.` +
      (missing.length ? ` Missing: ${missing.join(', ')}.` : ''),
    '',
    tag.drillRecord.reviewPrompt,
  ].join('\n')
}
