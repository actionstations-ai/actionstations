// Curve accuracy (spec 0457 FR-12): whether the epidemic curve a team drew matches the line list.
// The line list is the truth: the expected bins are its onset times counted per bin. The drawn
// counts are compared bin by bin; a drawn curve that equals the report-date histogram and not
// the onset histogram is named as drawn by report date.
import { z } from 'zod'
import { histogram } from '../../toolkits/epidemiology/lint'
import { ms, ratio, ratioText, type Metric, type MetricOutput } from './types'

export const CurveAccuracyConfig = z.object({
  /** Bin width in hours the team was asked to use. */
  binHours: z.number().int().min(1).max(168).default(24),
})
export type CurveAccuracyConfig = z.infer<typeof CurveAccuracyConfig>

export interface CurveAccuracyInputs {
  /** The line list: when each case began and when it was reported (ISO). */
  lineList: { onset: string; reported?: string }[]
  /** What a team drew: the start of its first bin and its counts per bin. */
  drawn: { label: string; start: string; counts: number[] }[]
}

export function computeCurveAccuracy(
  inputs: CurveAccuracyInputs,
  config: CurveAccuracyConfig,
): MetricOutput {
  const binMs = config.binHours * 3_600_000
  const cases = inputs.lineList.map((c) => ({
    onsetMs: ms(c.onset),
    reportedMs: c.reported ? ms(c.reported) : ms(c.onset),
  }))
  const hasReport = inputs.lineList.some((c) => c.reported)
  const rows = inputs.drawn.map((d) => {
    const start = ms(d.start)
    const bins = d.counts.length
    const truth = histogram(cases, 'onsetMs', start, binMs, bins)
    const byReport = histogram(cases, 'reportedMs', start, binMs, bins)
    const exact = d.counts.filter((v, i) => v === truth[i]).length
    const absError = d.counts.reduce((s, v, i) => s + Math.abs(v - truth[i]!), 0)
    const drawnTotal = d.counts.reduce((a, b) => a + b, 0)
    const truthTotal = truth.reduce((a, b) => a + b, 0)
    const matches = d.counts.every((v, i) => v === truth[i])
    const byReportDate = !matches && hasReport && d.counts.every((v, i) => v === byReport[i])
    return { d, bins, exact, absError, drawnTotal, truthTotal, matches, byReportDate }
  })
  return {
    metricId: 'curve_accuracy',
    title: 'Epidemic curve accuracy',
    config,
    inputs: [
      { label: 'Cases in the line list', value: String(inputs.lineList.length) },
      { label: 'Curves compared', value: String(inputs.drawn.length) },
      { label: 'Bin width', value: `${config.binHours} h` },
    ],
    summary: [
      {
        label: 'Curves that match the line list',
        value: `${rows.filter((r) => r.matches).length} of ${rows.length}`,
      },
      {
        label: 'Curves drawn by report date',
        value: String(rows.filter((r) => r.byReportDate).length),
      },
    ],
    tables: [
      {
        title: 'Curves',
        columns: [
          'Curve',
          'Bins',
          'Bins correct',
          'Share correct',
          'Cases drawn',
          'Cases in line list',
          'Total absolute error',
          'Result',
        ],
        rows: rows.map((r) => [
          r.d.label,
          String(r.bins),
          String(r.exact),
          ratioText(ratio(r.exact, r.bins)),
          String(r.drawnTotal),
          String(r.truthTotal),
          String(r.absError),
          r.matches ? 'Matches' : r.byReportDate ? 'Drawn by report date' : 'Does not match',
        ]),
      },
    ],
    caveats: [
      'Cases that begin outside the drawn bins are not counted in the comparison, so a curve that is too short shows fewer cases than the line list.',
      ...(hasReport
        ? []
        : [
            'The line list has no report dates, so a curve drawn by report date cannot be recognized.',
          ]),
      ...(rows.length === 0 ? ['No curve was drawn.'] : []),
    ],
    data: {
      byCurve: Object.fromEntries(
        rows.map((r) => [
          r.d.label,
          {
            matches: r.matches,
            byReportDate: r.byReportDate,
            absError: r.absError,
            binsCorrect: r.exact,
            bins: r.bins,
          },
        ]),
      ),
    },
  }
}

export const curveAccuracy: Metric<CurveAccuracyConfig, CurveAccuracyInputs> = {
  id: 'curve_accuracy',
  title: 'Epidemic curve accuracy',
  configSchema: CurveAccuracyConfig,
  compute: computeCurveAccuracy,
}
