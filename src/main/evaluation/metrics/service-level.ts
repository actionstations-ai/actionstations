// Service level (spec 0464 FR-11): how well a service answered the work offered to it, from a
// modeled series of offered, answered and abandoned contacts per channel (zone): answer rate,
// abandonment, mean time to answer, longest wait, the share answered in intervals whose longest
// wait stayed within a threshold, and, with a rerouting timer, how many intervals ran past it.
// Targets are configurable; the default is a published goal and its source is printed with the
// result so nobody mistakes it for a rule. Crisis lines use it for calls, texts and chats; justice
// and humanitarian configure it for other services.
import { z } from 'zod'
import type { ModeledSeries } from '@shared/schemas/metrics'
import { ms, NOT_AVAILABLE, ratio, stringList, type Metric, type MetricOutput } from './types'

export const DEFAULT_TARGET_SOURCE =
  'Federal goal for texts and chats: answer more than 90% of routed contacts by September 29, 2026 (SAMHSA, as reported in GAO-26-108114). A default the center can change.'

export const ServiceLevelConfig = z.object({
  /** Answer rate (percent of offered) the service aims for. */
  answerRateTargetPct: z.number().min(0).max(100).default(90),
  /** Where the target comes from, printed with the result. */
  targetSource: z.string().max(500).default(DEFAULT_TARGET_SOURCE),
  /** Seconds: contacts answered in intervals whose longest wait stayed within this count as prompt. */
  thresholdSec: z.number().min(1).max(86_400).default(120),
  /** Rerouting timer in seconds; intervals whose longest wait passed it are counted. Optional. */
  rerouteTimerSec: z.number().min(1).max(86_400).optional(),
  /** Zones (channels) to score; all when empty. */
  zones: stringList.default([]),
})
export type ServiceLevelConfig = z.infer<typeof ServiceLevelConfig>

export interface ServiceLevelInputs {
  series: ModeledSeries[]
}

interface ZoneRow {
  zone: string
  offered: number
  answered: number
  abandoned: number
  rerouted: number
  answerRate: number | null
  abandonRate: number | null
  meanWaitSec: number | null
  longestWaitSec: number | null
  promptShare: number | null
  overTimer: number | null
  meetsTarget: boolean | null
}

const QUANTITIES = [
  'offered',
  'answered',
  'abandoned',
  'rerouted',
  'avg_wait_sec',
  'longest_wait_sec',
] as const

/** Values by time for one zone and quantity; empty when the series is missing. */
function points(series: ModeledSeries[], zone: string, quantity: string): Map<number, number> {
  const out = new Map<number, number>()
  for (const s of series)
    if (s.zone === zone && s.quantity === quantity)
      for (const p of s.points) out.set(ms(p.time), p.value)
  return out
}

const sum = (m: Map<number, number>): number => [...m.values()].reduce((a, b) => a + b, 0)

function zoneRow(series: ModeledSeries[], zone: string, c: ServiceLevelConfig): ZoneRow {
  const [offered, answered, abandoned, rerouted, avgWait, longest] = QUANTITIES.map((q) =>
    points(series, zone, q),
  ) as [
    Map<number, number>,
    Map<number, number>,
    Map<number, number>,
    Map<number, number>,
    Map<number, number>,
    Map<number, number>,
  ]
  const totalOffered = sum(offered)
  const totalAnswered = sum(answered)
  const weightedWait = [...answered.entries()].reduce(
    (a, [t, n]) => a + n * (avgWait.get(t) ?? 0),
    0,
  )
  const promptAnswered = [...answered.entries()].reduce(
    (a, [t, n]) => a + ((longest.get(t) ?? Infinity) <= c.thresholdSec ? n : 0),
    0,
  )
  const answerRate = ratio(totalAnswered, totalOffered)
  return {
    zone,
    offered: totalOffered,
    answered: totalAnswered,
    abandoned: sum(abandoned),
    rerouted: sum(rerouted),
    answerRate,
    abandonRate: ratio(sum(abandoned), totalOffered),
    meanWaitSec: totalAnswered === 0 || avgWait.size === 0 ? null : weightedWait / totalAnswered,
    longestWaitSec: longest.size === 0 ? null : Math.max(...longest.values()),
    promptShare: longest.size === 0 ? null : ratio(promptAnswered, totalAnswered),
    overTimer:
      c.rerouteTimerSec === undefined || longest.size === 0
        ? null
        : [...longest.values()].filter((v) => v > c.rerouteTimerSec!).length,
    meetsTarget: answerRate === null ? null : answerRate * 100 >= c.answerRateTargetPct,
  }
}

const pct = (v: number | null): string => (v === null ? NOT_AVAILABLE : `${(v * 100).toFixed(1)}%`)
const sec = (v: number | null): string => {
  if (v === null) return NOT_AVAILABLE
  const s = Math.round(v)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function computeServiceLevel(
  inputs: ServiceLevelInputs,
  config: ServiceLevelConfig,
): MetricOutput {
  const all = [...new Set(inputs.series.map((s) => s.zone))].sort()
  const zones = config.zones.length ? all.filter((z) => config.zones.includes(z)) : all
  const rows = zones.map((z) => zoneRow(inputs.series, z, config))
  const met = rows.filter((r) => r.meetsTarget === true).length
  const offered = rows.reduce((a, r) => a + r.offered, 0)
  const answered = rows.reduce((a, r) => a + r.answered, 0)
  return {
    metricId: 'service_level',
    title: 'Service level',
    config,
    inputs: [
      { label: 'Channels scored', value: zones.join(', ') || NOT_AVAILABLE },
      { label: 'Answer rate target', value: `${config.answerRateTargetPct}%` },
      { label: 'Source of the target', value: config.targetSource },
      {
        label: 'Prompt answer threshold',
        value: `${config.thresholdSec} s longest wait in the interval`,
      },
      ...(config.rerouteTimerSec !== undefined
        ? [{ label: 'Rerouting timer', value: `${config.rerouteTimerSec} s` }]
        : []),
    ],
    summary: [
      { label: 'Answer rate, all channels', value: pct(ratio(answered, offered)) },
      { label: 'Channels meeting the target', value: `${met} of ${rows.length}` },
      {
        label: 'Longest wait',
        value: sec(rows.length ? Math.max(...rows.map((r) => r.longestWaitSec ?? 0)) : null),
      },
      {
        label: 'Contacts rerouted to backup',
        value: String(rows.reduce((a, r) => a + r.rerouted, 0)),
      },
    ],
    tables: [
      {
        title: 'By channel',
        columns: [
          'Channel',
          'Offered',
          'Answered',
          'Abandoned',
          'Rerouted',
          'Answer rate',
          'Abandonment',
          'Mean time to answer',
          'Longest wait',
          'Answered promptly',
          'Intervals over timer',
          'Target',
        ],
        rows: rows.map((r) => [
          r.zone,
          String(r.offered),
          String(r.answered),
          String(r.abandoned),
          String(r.rerouted),
          pct(r.answerRate),
          pct(r.abandonRate),
          sec(r.meanWaitSec),
          sec(r.longestWaitSec),
          pct(r.promptShare),
          r.overTimer === null ? NOT_AVAILABLE : String(r.overTimer),
          r.meetsTarget === null ? NOT_AVAILABLE : r.meetsTarget ? 'Met' : 'Not met',
        ]),
      },
    ],
    caveats: [
      'The answer rate counts only contacts this service answered; a contact rerouted to a backup center is shown separately and is not counted as answered here.',
      'The share answered promptly is estimated from intervals (contacts answered in intervals whose longest wait stayed within the threshold), not from each contact.',
      'The target is a published goal used as a default; a center sets its own.',
      ...(rows.length === 0
        ? ['No series were found for the channels asked for, so nothing was scored.']
        : []),
    ],
    data: {
      zones: Object.fromEntries(
        rows.map((r) => [
          r.zone,
          {
            offered: r.offered,
            answered: r.answered,
            abandoned: r.abandoned,
            rerouted: r.rerouted,
            answerRate: r.answerRate,
            abandonRate: r.abandonRate,
            meanWaitSec: r.meanWaitSec,
            longestWaitSec: r.longestWaitSec,
            promptShare: r.promptShare,
            meetsTarget: r.meetsTarget,
          },
        ]),
      ),
    },
  }
}

export const serviceLevel: Metric<ServiceLevelConfig, ServiceLevelInputs> = {
  id: 'service_level',
  title: 'Service level',
  configSchema: ServiceLevelConfig,
  compute: computeServiceLevel,
}
