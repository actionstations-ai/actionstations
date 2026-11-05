// Days of supply protected (spec 0462 FR-11): against the scenario's modeled days-of-supply series
// (the baseline with the disruption and no protective action), how many item and site zones fall
// below the floor or run out, when the first one does, and how early the team made its first
// protective decision (allocate, switch source, reroute) before that. The series is the baseline:
// a decision does not change it, so the metric scores timing, not a recomputed stock-out date.
import { z } from 'zod'
import type { MetricDecision, ModeledSeries } from '@shared/schemas/metrics'
import { ms, NOT_AVAILABLE, stringList, type Metric, type MetricOutput } from './types'

export const LogisticsSupplyConfig = z.object({
  /** The series quantity to read. */
  quantity: z.string().default('days_of_supply'),
  /** Days of supply below which an item is critical. */
  floorDays: z.number().min(0).default(3),
  /** Decision kinds that count as protective action. */
  actionKinds: stringList.default([
    'logistics_allocate_supply',
    'logistics_switch_source',
    'logistics_reroute_or_change_mode',
  ]),
})
export type LogisticsSupplyConfig = z.infer<typeof LogisticsSupplyConfig>

export interface LogisticsSupplyInputs {
  series: ModeledSeries[]
  decisions: MetricDecision[]
}

interface ZoneResult {
  zone: string
  minDays: number
  belowFloorAt: string | null
  outAt: string | null
}

function scoreZone(s: ModeledSeries, floor: number): ZoneResult {
  const pts = [...s.points].sort((a, b) => ms(a.time) - ms(b.time))
  const below = pts.find((p) => p.value < floor)
  const out = pts.find((p) => p.value <= 0)
  return {
    zone: s.zone,
    minDays: pts.length ? Math.min(...pts.map((p) => p.value)) : 0,
    belowFloorAt: below?.time ?? null,
    outAt: out?.time ?? null,
  }
}

export function computeLogisticsSupply(
  i: LogisticsSupplyInputs,
  c: LogisticsSupplyConfig,
): MetricOutput {
  const zones = i.series
    .filter((s) => s.quantity === c.quantity)
    .map((s) => scoreZone(s, c.floorDays))
  const out = zones.filter((z) => z.outAt)
  const critical = zones.filter((z) => z.belowFloorAt)
  const firstCritical =
    critical.map((z) => z.belowFloorAt!).sort((a, b) => ms(a) - ms(b))[0] ?? null
  const action = [...i.decisions]
    .filter((d) => c.actionKinds.includes(d.kind))
    .sort((a, b) => ms(a.time) - ms(b.time))[0]
  const leadDays =
    firstCritical && action ? (ms(firstCritical) - ms(action.time)) / 86_400_000 : null
  return {
    metricId: 'logistics_supply_protection',
    title: 'Days of supply protected',
    config: c,
    inputs: [
      { label: 'Zones in the series', value: String(zones.length) },
      { label: 'Floor', value: `${c.floorDays} days of supply (set by the designer)` },
      {
        label: 'First protective decision',
        value: action ? `${action.kind}, ${action.time}` : NOT_AVAILABLE,
      },
    ],
    summary: [
      {
        label: 'Zones that stay above the floor',
        value: `${zones.length - critical.length} of ${zones.length}`,
      },
      { label: 'Zones that run out in the baseline', value: String(out.length) },
      { label: 'First zone below the floor', value: firstCritical ?? NOT_AVAILABLE },
      {
        label: 'Lead of the first protective decision before that',
        value: leadDays === null ? NOT_AVAILABLE : `${Math.round(leadDays * 10) / 10} days`,
      },
    ],
    tables: [
      {
        title: 'Zones',
        columns: ['Zone', 'Lowest days of supply', 'Below the floor at', 'Out at'],
        rows: zones.map((z) => [
          z.zone,
          String(Math.round(z.minDays * 10) / 10),
          z.belowFloorAt ?? NOT_AVAILABLE,
          z.outAt ?? NOT_AVAILABLE,
        ]),
      },
    ],
    caveats: [
      'The series is the modeled baseline. A decision does not change it, so a negative lead means the first protective decision came after the first zone fell below the floor.',
      ...(action ? [] : ['No protective decision was recorded.']),
    ],
    data: { zones: zones.length, critical: critical.length, out: out.length, leadDays },
  }
}

export const logisticsSupplyProtection: Metric<LogisticsSupplyConfig, LogisticsSupplyInputs> = {
  id: 'logistics_supply_protection',
  title: 'Days of supply protected',
  configSchema: LogisticsSupplyConfig,
  compute: computeLogisticsSupply,
}
