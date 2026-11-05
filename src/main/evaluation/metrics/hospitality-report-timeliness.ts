// Authority reports on time (spec 0470 FR-11): the ship's reports to the CDC against the report
// points of 42 CFR 71.21 and the VSP standards. The 24-hour report is due between 36 and 24 hours
// before arrival and the 4-hour update by 4 hours before; a special report is due when passengers
// or crew first reach 2 percent and again at 3 percent. The scenario's ground truth carries each
// point as an event; the team's reports are `hosp_report_to_authority` decisions.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { choiceKey, decisionsOfKind, eventsOfKind, fieldText } from './media-inputs'
import { ms, NOT_AVAILABLE, type Metric, type MetricOutput } from './types'

export const HospitalityReportTimelinessConfig = z.object({
  reportKind: z.string().default('hosp_report_to_authority'),
  /**
   * Minutes after a 2 or 3 percent crossing within which the special report counts as prompt.
   * The standards state no interval, so this is the designer's choice.
   */
  specialGraceMin: z.number().min(0).max(1440).default(60),
})
export type HospitalityReportTimelinessConfig = z.infer<typeof HospitalityReportTimelinessConfig>

export interface HospitalityReportTimelinessInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

interface Point {
  label: string
  report: string
  /** Earliest time a report counts (the 24-hour window opens 36 hours before arrival). */
  opens: number | null
  due: number
}

type Status = 'on_time' | 'late' | 'too_early' | 'not_filed'
const STATUS_TEXT: Record<Status, string> = {
  on_time: 'On time',
  late: 'Late',
  too_early: 'Filed before the window opened',
  not_filed: 'Not filed',
}

function points(events: GroundTruthEvent[], graceMin: number): Point[] {
  const out: Point[] = []
  const p24 = eventsOfKind(events, 'report_point_24h')[0]
  if (p24) {
    const opens = typeof p24.attrs.opensAt === 'string' ? ms(p24.attrs.opensAt) : null
    out.push({ label: '24-hour report', report: '24-hour report', opens, due: ms(p24.time) })
  }
  const p4 = eventsOfKind(events, 'report_point_4h')[0]
  if (p4)
    out.push({
      label: '4-hour update',
      report: '4-hour update report',
      opens: null,
      due: ms(p4.time),
    })
  for (const level of [2, 3] as const) {
    const first = eventsOfKind(events, `threshold_${level}pct`)[0]
    if (first)
      out.push({
        label: `Special report at ${level} percent`,
        report: `Special report, ${level} percent`,
        opens: ms(first.time),
        due: ms(first.time) + graceMin * 60_000,
      })
  }
  return out.sort((a, b) => a.due - b.due)
}

const toCdc = (d: MetricDecision): boolean => /cdc/.test(choiceKey(fieldText(d, 'authority')))

export function computeHospitalityReportTimeliness(
  inputs: HospitalityReportTimelinessInputs,
  config: HospitalityReportTimelinessConfig,
): MetricOutput {
  const filed = decisionsOfKind(inputs.decisions, config.reportKind).filter(toCdc)
  const rows = points(inputs.events, config.specialGraceMin).map((pt) => {
    const mine = filed.filter((d) => choiceKey(fieldText(d, 'report')) === choiceKey(pt.report))
    const inWindow = mine.find(
      (d) => (pt.opens === null || ms(d.time) >= pt.opens) && ms(d.time) <= pt.due,
    )
    const first = mine[0]
    const status: Status = inWindow
      ? 'on_time'
      : !first
        ? 'not_filed'
        : pt.opens !== null && ms(first.time) < pt.opens
          ? 'too_early'
          : 'late'
    return { pt, status, at: (inWindow ?? first)?.time }
  })
  const onTime = rows.filter((r) => r.status === 'on_time').length
  return {
    metricId: 'hospitality_report_timeliness',
    title: 'Authority reports filed on time',
    config,
    inputs: [
      { label: 'Report points in the scenario', value: String(rows.length) },
      { label: 'Reports to the CDC recorded', value: String(filed.length) },
      { label: 'Special report grace', value: `${config.specialGraceMin} min` },
    ],
    summary: [
      { label: 'Reports on time', value: `${onTime} of ${rows.length}` },
      { label: 'Not filed', value: String(rows.filter((r) => r.status === 'not_filed').length) },
      { label: 'Late', value: String(rows.filter((r) => r.status === 'late').length) },
    ],
    tables: [
      {
        title: 'Report points',
        columns: ['Report', 'Window opens', 'Due', 'Filed', 'Result'],
        rows: rows.map((r) => [
          r.pt.label,
          r.pt.opens === null ? NOT_AVAILABLE : new Date(r.pt.opens).toISOString(),
          new Date(r.pt.due).toISOString(),
          r.at ?? NOT_AVAILABLE,
          STATUS_TEXT[r.status],
        ]),
      },
    ],
    caveats: [
      "Only reports whose authority is a CDC office count. The 24-hour report window runs from 36 to 24 hours before arrival; the standards state no interval for special reports, so the grace above is the designer's.",
      ...(rows.length === 0 ? ['The scenario has no report point events.'] : []),
    ],
    data: { onTime, points: rows.length },
  }
}

export const hospitalityReportTimeliness: Metric<
  HospitalityReportTimelinessConfig,
  HospitalityReportTimelinessInputs
> = {
  id: 'hospitality_report_timeliness',
  title: 'Authority reports filed on time',
  configSchema: HospitalityReportTimelinessConfig,
  compute: computeHospitalityReportTimeliness,
}
