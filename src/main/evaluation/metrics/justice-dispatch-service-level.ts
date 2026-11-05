// Justice dispatch service level (spec 0465 FR-12): of the calls in a simulated surge, how many had
// a unit arrive within the designer's target, with the mean and 90th percentile response. Reads
// the `unit_arrival` events the call surge generator writes (`attrs.responseMin`). The target is the
// designer's; no national response standard is assumed.
import { z } from 'zod'
import type { GroundTruthEvent } from '@shared/schemas/metrics'
import { mean, minutesText, ratio, ratioText, type Metric, type MetricOutput } from './types'

export const JusticeServiceLevelConfig = z.object({
  /** Minutes from call received to a unit arriving that count as on time. */
  targetMin: z.number().positive().default(8),
})
export type JusticeServiceLevelConfig = z.infer<typeof JusticeServiceLevelConfig>

export interface JusticeServiceLevelInputs {
  events: GroundTruthEvent[]
}

const percentile = (sorted: number[], p: number): number | null =>
  sorted.length === 0
    ? null
    : sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!

export function computeJusticeServiceLevel(
  inputs: JusticeServiceLevelInputs,
  config: JusticeServiceLevelConfig,
): MetricOutput {
  const times = inputs.events
    .filter((e) => e.kind === 'unit_arrival' && typeof e.attrs.responseMin === 'number')
    .map((e) => e.attrs.responseMin as number)
  const sorted = [...times].sort((a, b) => a - b)
  const onTime = times.filter((t) => t <= config.targetMin).length
  return {
    metricId: 'justice_dispatch_service_level',
    title: 'Dispatch service level',
    config,
    inputs: [
      { label: 'Calls with an arrival', value: String(times.length) },
      {
        label: 'Target',
        value: `${config.targetMin} min from call to arrival (set by the designer)`,
      },
    ],
    summary: [
      { label: 'Arrived within target', value: `${onTime} of ${times.length}` },
      { label: 'Share within target', value: ratioText(ratio(onTime, times.length)) },
      { label: 'Mean response', value: minutesText(mean(times)) },
      { label: '90th percentile response', value: minutesText(percentile(sorted, 0.9)) },
    ],
    tables: [],
    caveats: [
      'The target is the exercise designer’s, not a national standard. The calls are simulated.',
      ...(times.length === 0 ? ['No unit arrivals were recorded.'] : []),
    ],
    data: {
      calls: times.length,
      onTime,
      shareOnTime: ratio(onTime, times.length),
      meanMinutes: mean(times),
      p90Minutes: percentile(sorted, 0.9),
    },
  }
}

export const justiceDispatchServiceLevel: Metric<
  JusticeServiceLevelConfig,
  JusticeServiceLevelInputs
> = {
  id: 'justice_dispatch_service_level',
  title: 'Dispatch service level',
  configSchema: JusticeServiceLevelConfig,
  compute: computeJusticeServiceLevel,
}
