// Threshold timing (spec 0448 FR-12): an action taken against the time a modeled quantity
// crossed a threshold, per zone. The deadline is the crossing minus the clearance time the
// action needs (evacuation start before tropical-storm-force winds arrive, less the hours it
// takes to clear the zone). The margin is deadline minus action time: zero or more is on time.
import { z } from 'zod'
import type { MetricDecision, ModeledSeries } from '@shared/schemas/metrics'
import { mean, minutesText, ms, NOT_AVAILABLE, type Metric, type MetricOutput } from './types'

export const ThresholdTimingConfig = z.object({
  /** The decision kind that is the action (an evacuation order). */
  actionKind: z.string().min(1),
  /** The quantity's value at which the crossing counts. */
  threshold: z.number(),
  /** Minutes the action needs to finish before the crossing; per zone overrides below. */
  clearanceMin: z.number().min(0).default(0),
  clearanceMinByZone: z.record(z.string(), z.number().min(0)).default({}),
})
export type ThresholdTimingConfig = z.infer<typeof ThresholdTimingConfig>

export interface ThresholdTimingInputs {
  series: ModeledSeries[]
  decisions: MetricDecision[]
}

/** First time the series reaches the threshold, interpolated between samples; null if never. */
export function crossingTime(series: ModeledSeries, threshold: number): number | null {
  const pts = [...series.points].sort((a, b) => ms(a.time) - ms(b.time))
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    if (p.value < threshold) continue
    const q = pts[i - 1]
    if (!q) return ms(p.time)
    const frac = (threshold - q.value) / (p.value - q.value)
    return Math.round(ms(q.time) + frac * (ms(p.time) - ms(q.time)))
  }
  return null
}

type Status = 'on_time' | 'late' | 'no_action' | 'no_crossing'
const STATUS_TEXT: Record<Status, string> = {
  on_time: 'On time',
  late: 'Late',
  no_action: 'No action taken',
  no_crossing: 'Threshold never crossed',
}

interface ZoneRow {
  zone: string
  crossing: number | null
  deadline: number | null
  action: number | null
  marginMin: number | null
  status: Status
}

function statusOf(crossing: number | null, action: number | null, margin: number | null): Status {
  if (crossing === null) return 'no_crossing'
  if (action === null || margin === null) return 'no_action'
  return margin >= 0 ? 'on_time' : 'late'
}

function zoneRow(s: ModeledSeries, decisions: MetricDecision[], c: ThresholdTimingConfig): ZoneRow {
  const crossing = crossingTime(s, c.threshold)
  const clearance = c.clearanceMinByZone[s.zone] ?? c.clearanceMin
  const deadline = crossing === null ? null : crossing - clearance * 60_000
  // A decision without an area applies to every zone.
  const first = decisions
    .filter(
      (d) =>
        d.kind === c.actionKind &&
        (d.area === undefined || d.area.trim().toLowerCase() === s.zone.trim().toLowerCase()),
    )
    .map((d) => ms(d.time))
    .sort((a, b) => a - b)[0]
  const action = first ?? null
  const marginMin = deadline !== null && action !== null ? (deadline - action) / 60_000 : null
  return {
    zone: s.zone,
    crossing,
    deadline,
    action,
    marginMin,
    status: statusOf(crossing, action, marginMin),
  }
}

const iso = (t: number | null): string => (t === null ? '' : new Date(t).toISOString())

export function computeThresholdTiming(
  inputs: ThresholdTimingInputs,
  config: ThresholdTimingConfig,
): MetricOutput {
  const rows = inputs.series.map((s) => zoneRow(s, inputs.decisions, config))
  const count = (st: Status) => rows.filter((r) => r.status === st).length
  const margins = rows.flatMap((r) => (r.marginMin === null ? [] : [r.marginMin]))
  const quantities = [...new Set(inputs.series.map((s) => s.quantity))].join(', ')
  return {
    metricId: 'threshold_timing',
    title: 'Threshold timing',
    config,
    inputs: [
      { label: 'Zones', value: String(rows.length) },
      { label: 'Quantity', value: quantities || NOT_AVAILABLE },
      { label: 'Threshold', value: String(config.threshold) },
      { label: 'Action', value: config.actionKind },
      { label: 'Default clearance time', value: `${config.clearanceMin} min` },
    ],
    summary: [
      { label: 'Zones on time', value: String(count('on_time')) },
      { label: 'Zones late', value: String(count('late')) },
      { label: 'Zones with no action', value: String(count('no_action')) },
      { label: 'Mean margin', value: minutesText(mean(margins)) },
    ],
    tables: [
      {
        title: 'Zones',
        columns: [
          'Zone',
          'Threshold crossed',
          'Action needed by',
          'Action taken',
          'Margin',
          'Result',
        ],
        rows: rows.map((r) => [
          r.zone,
          iso(r.crossing),
          iso(r.deadline),
          iso(r.action),
          minutesText(r.marginMin),
          STATUS_TEXT[r.status],
        ]),
      },
    ],
    caveats: [
      'The crossing time comes from the modeled series, interpolated between samples; it is only as good as the model or the observed record behind it.',
      ...(rows.length === 0 ? ['No zones had a modeled series, so nothing was scored.'] : []),
    ],
    data: {
      zones: Object.fromEntries(
        rows.map((r) => [
          r.zone,
          {
            status: r.status,
            marginMin: r.marginMin,
            crossing: iso(r.crossing) || null,
            action: iso(r.action) || null,
          },
        ]),
      ),
      meanMarginMin: mean(margins),
    },
  }
}

export const thresholdTiming: Metric<ThresholdTimingConfig, ThresholdTimingInputs> = {
  id: 'threshold_timing',
  title: 'Threshold timing',
  configSchema: ThresholdTimingConfig,
  compute: computeThresholdTiming,
}
