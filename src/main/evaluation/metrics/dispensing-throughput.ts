// Dispensing throughput (spec 0457 FR-12): people served per hour against the plan, and the time
// from the decision to open a site until it served its first person. Each site is read from the
// counts the controller recorded (people served at a time); throughput is people served divided
// by the hours between opening and the last count, and the peak is the best 60 minutes.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { minutesText, ms, NOT_AVAILABLE, ratioText, type Metric, type MetricOutput } from './types'

export const DispensingThroughputConfig = z.object({
  /** Planned people served per hour for one site. */
  planPerHour: z.number().positive().default(300),
  /** Target minutes from the decision to open until the first person is served. */
  openTargetMin: z.number().positive().default(120),
})
export type DispensingThroughputConfig = z.infer<typeof DispensingThroughputConfig>

export interface DispensingSite {
  id: string
  /** When the decision to open was made, ISO. */
  decidedAt: string
  /** When the first person was served, ISO; absent if the site never opened. */
  openedAt?: string | null
  /** People served, counted at a time. */
  served: { time: string; count: number }[]
}

export interface DispensingThroughputInputs {
  sites: DispensingSite[]
}

const HOUR_MIN = 60

/** The most people served in any 60 minutes, by sliding a window over the recorded counts. */
export function peakHourServed(served: readonly { time: string; count: number }[]): number {
  const pts = [...served].sort((a, b) => ms(a.time) - ms(b.time))
  let best = 0
  let lo = 0
  let sum = 0
  for (let hi = 0; hi < pts.length; hi++) {
    sum += pts[hi]!.count
    while ((ms(pts[hi]!.time) - ms(pts[lo]!.time)) / 60_000 >= HOUR_MIN) sum -= pts[lo++]!.count
    best = Math.max(best, sum)
  }
  return best
}

export function computeDispensingThroughput(
  inputs: DispensingThroughputInputs,
  config: DispensingThroughputConfig,
): MetricOutput {
  const rows = inputs.sites.map((s) => {
    const opened = s.openedAt ? ms(s.openedAt) : null
    const toOpen = opened === null ? null : (opened - ms(s.decidedAt)) / 60_000
    const total = s.served.reduce((n, p) => n + p.count, 0)
    const last = s.served.length ? Math.max(...s.served.map((p) => ms(p.time))) : null
    const hours =
      opened !== null && last !== null && last > opened ? (last - opened) / 3_600_000 : null
    const perHour = hours === null ? null : total / hours
    return { s, toOpen, total, hours, perHour, peak: peakHourServed(s.served) }
  })
  const measured = rows.flatMap((r) => (r.perHour === null ? [] : [r.perHour]))
  const overall = measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : null
  const metTarget = rows.filter((r) => r.toOpen !== null && r.toOpen <= config.openTargetMin).length
  return {
    metricId: 'dispensing_throughput',
    title: 'Dispensing throughput',
    config,
    inputs: [
      { label: 'Sites', value: String(inputs.sites.length) },
      { label: 'Plan', value: `${config.planPerHour} people per hour per site` },
      { label: 'Time-to-open target', value: `${config.openTargetMin} min from the decision` },
    ],
    summary: [
      { label: 'People served', value: String(rows.reduce((n, r) => n + r.total, 0)) },
      {
        label: 'Mean throughput per site (people per hour)',
        value: overall === null ? NOT_AVAILABLE : overall.toFixed(1),
      },
      {
        label: 'Share of plan',
        value: ratioText(overall === null ? null : overall / config.planPerHour),
      },
      { label: 'Sites open within target', value: `${metTarget} of ${rows.length}` },
    ],
    tables: [
      {
        title: 'Sites',
        columns: [
          'Site',
          'Minutes to open',
          'Served',
          'People per hour',
          'Best 60 minutes',
          'Share of plan',
        ],
        rows: rows.map((r) => [
          r.s.id,
          minutesText(r.toOpen),
          String(r.total),
          r.perHour === null ? NOT_AVAILABLE : r.perHour.toFixed(1),
          String(r.peak),
          r.perHour === null ? NOT_AVAILABLE : ratioText(r.perHour / config.planPerHour),
        ]),
      },
    ],
    caveats: [
      'Throughput uses the counts the controller recorded; a site with no count after opening has no rate.',
      "The plan and the time-to-open target are the designer's, not national standards.",
      ...(rows.length === 0 ? ['No sites were recorded.'] : []),
    ],
    data: {
      sites: Object.fromEntries(
        rows.map((r) => [
          r.s.id,
          { toOpenMin: r.toOpen, served: r.total, perHour: r.perHour, peakHour: r.peak },
        ]),
      ),
      meanPerHour: overall,
      shareOfPlan: overall === null ? null : overall / config.planPerHour,
    },
  }
}

export const dispensingThroughput: Metric<DispensingThroughputConfig, DispensingThroughputInputs> =
  {
    id: 'dispensing_throughput',
    title: 'Dispensing throughput',
    configSchema: DispensingThroughputConfig,
    compute: computeDispensingThroughput,
  }

/**
 * Sites from the scenario's `mcm_activation` events (the moment dispensing was called for, with
 * `attrs.site` naming the site), the team's `open_dispensing_site` decisions with action "open"
 * (the first one is when the site opened) and its `record_dispensing_count` decisions (people
 * served, at the decision's time).
 */
export function sitesFromBag(
  events: readonly GroundTruthEvent[],
  decisions: readonly MetricDecision[],
): DispensingSite[] {
  const sorted = [...decisions].sort((a, b) => ms(a.time) - ms(b.time))
  const same = (d: MetricDecision, site: string) => String(d.fields.site ?? '').trim() === site
  return events
    .filter((e) => e.kind === 'mcm_activation')
    .map((e) => {
      const id = typeof e.attrs.site === 'string' ? e.attrs.site : e.id
      const opened = sorted.find(
        (d) => d.kind === 'open_dispensing_site' && same(d, id) && d.fields.action === 'open',
      )
      return {
        id,
        decidedAt: e.time,
        openedAt: opened?.time ?? null,
        served: sorted
          .filter((d) => d.kind === 'record_dispensing_count' && same(d, id))
          .map((d) => ({ time: d.time, count: Number(d.fields.served) }))
          .filter((p) => Number.isFinite(p.count) && p.count >= 0),
      }
    })
}
