// The epidemiology toolkit's format rules (spec 0457 FR-4) as field lint rules: they run on the
// injects of the types below, so an inject with an exposure window outside the infectious period,
// a count that differs from its own line list or a curve described as drawn by report date goes
// back to the model with the issue named. Importing this module registers them (lint-rules.ts
// lists it). A rule with nothing structured to check reports nothing.
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import { checkCountsMatchLineList, checkExposureWindows, type LineListRow } from './lint'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Every string in `value`, depth first, skipping the `figures` field (drawn data, not prose). */
function strings(value: unknown, out: string[] = [], key = ''): string[] {
  if (key === 'figures') return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) strings(v, out)
  else if (isRecord(value)) for (const [k, v] of Object.entries(value)) strings(v, out, k)
  return out
}

const TIERS = new Set(['confirmed', 'probable', 'suspect'])

/** The line list an inject's own figures carry: a line list figure's rows or an epidemic curve's cases. */
function lineListOf(fields: Record<string, unknown>): LineListRow[] | undefined {
  const figures = fields.figures
  if (!isRecord(figures)) return undefined
  for (const fig of Object.values(figures)) {
    if (!isRecord(fig) || !isRecord(fig.data)) continue
    const rows =
      fig.kind === 'epi_line_list'
        ? fig.data.rows
        : fig.kind === 'epi_curve'
          ? fig.data.cases
          : undefined
    if (!Array.isArray(rows)) continue
    return rows.flatMap((r, i): LineListRow[] =>
      isRecord(r) && typeof r.status === 'string' && TIERS.has(r.status)
        ? [{ id: String(r.id ?? i), status: r.status as LineListRow['status'] }]
        : r && isRecord(r) && r.status === undefined
          ? [{ id: String(i), status: 'confirmed' }]
          : [],
    )
  }
  return undefined
}

const PROSE_TYPES = [
  'exposure_notice',
  'clinician_health_alert',
  'school_employer_letter',
  'sitrep',
  'press_release',
  'figure',
  'email',
  'memo',
] as const

const exposureWindow: FieldLintRule = {
  id: 'epi_exposure_window',
  injectTypes: ['exposure_notice'],
  check(fields) {
    const onset = typeof fields.caseOnset === 'string' ? Date.parse(fields.caseOnset) : NaN
    const pathogenId = typeof fields.pathogenId === 'string' ? fields.pathogenId : ''
    if (Number.isNaN(onset) || !pathogenId || !Array.isArray(fields.exposures)) return []
    const windows = fields.exposures.flatMap((e, i) => {
      if (!isRecord(e)) return []
      const startMs = typeof e.startsAt === 'string' ? Date.parse(e.startsAt) : NaN
      const endMs = typeof e.endsAt === 'string' ? Date.parse(e.endsAt) : NaN
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) return []
      return [{ label: String(e.place ?? `exposure ${i + 1}`), startMs, endMs }]
    })
    return checkExposureWindows({ pathogenId, onsetMs: onset, windows }).map(
      (p): FieldLintIssue => ({ path: 'fields.exposures', message: `${p.where}: ${p.message}` }),
    )
  },
}

const countsMatch: FieldLintRule = {
  id: 'epi_counts_match_line_list',
  injectTypes: PROSE_TYPES,
  check(fields) {
    const list = lineListOf(fields)
    if (!list) return []
    return checkCountsMatchLineList(
      list,
      strings(fields).map((text) => ({ source: 'this inject', text })),
    ).map((p): FieldLintIssue => ({ path: 'fields', message: p.message }))
  },
}

const REPORT_DATE_CURVE =
  /\b(?:curve|histogram)\b[^.]{0,80}\bby (?:the )?(?:date (?:of )?)?report(?:ed|ing)?(?: date)?\b/i

const onsetNotReport: FieldLintRule = {
  id: 'epi_onset_not_report_date',
  injectTypes: PROSE_TYPES,
  check(fields) {
    return strings(fields)
      .filter((t) => REPORT_DATE_CURVE.test(t))
      .map((): FieldLintIssue => ({
        path: 'fields',
        message:
          'An epidemic curve is drawn by onset date, not by report date; the text says otherwise.',
      }))
  },
}

for (const r of [exposureWindow, countsMatch, onsetNotReport]) registerFieldLintRule(r)
