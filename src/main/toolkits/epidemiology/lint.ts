// Format and consistency checks the epidemiology toolkit names (spec 0457 FR-4): exposure
// windows computed from onset and the infectious period, counts in messages that match the line
// list, and curves drawn by onset date. Pure functions over structured inputs; each returns
// problems a generator or an evaluator can show, never throws.
import {
  infectiousWindow,
  pathogenById,
  windowsOverlap,
  windowWithin,
  type TimeWindow,
} from '@shared/epidemiology/arithmetic'

export const EPI_LINT_RULES = [
  'epi_exposure_window',
  'epi_counts_match_line_list',
  'epi_onset_not_report_date',
] as const
export type EpiLintRule = (typeof EPI_LINT_RULES)[number]

export interface EpiLintProblem {
  rule: EpiLintRule
  message: string
  /** Which place, message or series the problem is in. */
  where: string
}

// ---- exposure windows --------------------------------------------------------------------

export interface NoticeWindow extends TimeWindow {
  /** Place or flight the window is stated for. */
  label: string
}

/**
 * A place named in an exposure notice must overlap the case's infectious period, and a window
 * that starts before or ends after it is flagged (the notice would send people to quarantine
 * for time the case was not infectious, or miss the time it was). Pathogens without a fixed
 * infectious period cannot be checked and yield no problems.
 */
export function checkExposureWindows(input: {
  pathogenId: string
  /** Symptom onset (rash onset for measles), epoch ms. */
  onsetMs: number
  windows: readonly NoticeWindow[]
}): EpiLintProblem[] {
  const p = pathogenById(input.pathogenId)
  if (!p) return []
  const infectious = infectiousWindow(input.onsetMs, p)
  if (!infectious) return []
  const out: EpiLintProblem[] = []
  for (const w of input.windows) {
    if (w.endMs <= w.startMs) {
      out.push({
        rule: 'epi_exposure_window',
        where: w.label,
        message: 'The window ends before it starts.',
      })
    } else if (!windowsOverlap(w, infectious)) {
      out.push({
        rule: 'epi_exposure_window',
        where: w.label,
        message: `The window does not overlap the infectious period of ${p.name} computed from onset.`,
      })
    } else if (!windowWithin(w, infectious)) {
      out.push({
        rule: 'epi_exposure_window',
        where: w.label,
        message: `The window extends outside the infectious period of ${p.name} computed from onset.`,
      })
    }
  }
  return out
}

// ---- counts --------------------------------------------------------------------------------

export type CaseTier = 'confirmed' | 'probable' | 'suspect'

export interface LineListRow {
  id: string
  status: CaseTier
}

export interface MessageText {
  /** health department release, school letter, hospital memo... */
  source: string
  text: string
}

const TIER_COUNT = /\b(\d{1,5})\s+(confirmed|probable|suspect(?:ed)?)\b/gi
const TOTAL_COUNT = /\b(\d{1,5})\s+(?:total\s+|reported\s+|known\s+)?(?:cases|case)\b/gi

function tally(rows: readonly LineListRow[]): Record<CaseTier | 'all' | 'counted', number> {
  const t = { confirmed: 0, probable: 0, suspect: 0, all: rows.length, counted: 0 }
  for (const r of rows) t[r.status]++
  t.counted = t.confirmed + t.probable
  return t
}

/**
 * Numbers a message states for a tier must equal the line list's. A bare "N cases" must equal
 * the full list or confirmed plus probable (the usual public count); anything else is flagged.
 */
export function checkCountsMatchLineList(
  lineList: readonly LineListRow[],
  messages: readonly MessageText[],
): EpiLintProblem[] {
  const t = tally(lineList)
  const out: EpiLintProblem[] = []
  for (const m of messages) {
    for (const hit of m.text.matchAll(TIER_COUNT)) {
      const tier = hit[2]!.toLowerCase().startsWith('suspect')
        ? 'suspect'
        : (hit[2]!.toLowerCase() as CaseTier)
      const said = Number(hit[1])
      if (said !== t[tier])
        out.push({
          rule: 'epi_counts_match_line_list',
          where: m.source,
          message: `States ${said} ${tier} but the line list has ${t[tier]}.`,
        })
    }
    for (const hit of m.text.matchAll(TOTAL_COUNT)) {
      const said = Number(hit[1])
      if (said !== t.all && said !== t.counted)
        out.push({
          rule: 'epi_counts_match_line_list',
          where: m.source,
          message: `States ${said} cases but the line list has ${t.all} (${t.counted} confirmed or probable).`,
        })
    }
  }
  return out
}

// ---- curves --------------------------------------------------------------------------------

export interface DatedCase {
  onsetMs: number
  reportedMs: number
}

/** Cases per bin of `binMs` starting at `startMs`, counting `field`. */
export function histogram(
  cases: readonly DatedCase[],
  field: 'onsetMs' | 'reportedMs',
  startMs: number,
  binMs: number,
  bins: number,
): number[] {
  const out = new Array<number>(bins).fill(0)
  for (const c of cases) {
    const i = Math.floor((c[field] - startMs) / binMs)
    if (i >= 0 && i < bins) out[i]!++
  }
  return out
}

/**
 * A curve must be the histogram of onset times. When the drawn bins match the report-date
 * histogram and not the onset histogram, the curve was built from the wrong date.
 */
export function checkCurveUsesOnset(input: {
  cases: readonly DatedCase[]
  startMs: number
  binMs: number
  drawn: readonly number[]
  where?: string
}): EpiLintProblem[] {
  const bins = input.drawn.length
  const byOnset = histogram(input.cases, 'onsetMs', input.startMs, input.binMs, bins)
  const byReport = histogram(input.cases, 'reportedMs', input.startMs, input.binMs, bins)
  const same = (a: readonly number[], b: readonly number[]): boolean =>
    a.every((v, i) => v === b[i])
  if (same(input.drawn, byOnset)) return []
  const where = input.where ?? 'epidemic curve'
  if (same(input.drawn, byReport))
    return [
      {
        rule: 'epi_onset_not_report_date',
        where,
        message: 'The curve is drawn by report date; an epidemic curve uses onset date.',
      },
    ]
  return [
    {
      rule: 'epi_onset_not_report_date',
      where,
      message: 'The curve does not match the line list drawn by onset date.',
    },
  ]
}
