// Rescue timeline (spec 0471 FR-10): from the collapse, how soon the team called 911 and asked
// for rescue, set the exclusion zone and asked for shoring, when first responders arrived, and
// whether each secondary hazard (a gas leak, a fire, a falling element) was controlled within a
// designer-set time. The collapse, the arrival and the hazards are scenario ground truth; the
// calls and orders are the team's forms. Rescue tactics belong to the fire department and are
// not scored here.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { minutesText, ms, NOT_AVAILABLE, type Metric, type MetricOutput } from './types'

export const StructuresRescueTimelineConfig = z.object({
  callKind: z.string().default('structures_call_911'),
  zoneKind: z.string().default('structures_exclusion_zone'),
  shoreKind: z.string().default('structures_shore'),
  /** Minutes after a secondary hazard appears by which it should be controlled. */
  controlWithinMin: z.number().positive().default(30),
})
export type StructuresRescueTimelineConfig = z.infer<typeof StructuresRescueTimelineConfig>

export interface StructuresRescueTimelineInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const firstOf = <T extends { time: string }>(rows: T[]): T | undefined =>
  [...rows].sort((a, b) => ms(a.time) - ms(b.time))[0]

export function computeStructuresRescueTimeline(
  inputs: StructuresRescueTimelineInputs,
  config: StructuresRescueTimelineConfig,
): MetricOutput {
  const collapse = firstOf(inputs.events.filter((e) => e.kind === 'collapse'))
  const arrival = firstOf(inputs.events.filter((e) => e.kind === 'first_responders_on_scene'))
  const since = (d: MetricDecision | undefined): number | null =>
    d && collapse ? (ms(d.time) - ms(collapse.time)) / 60_000 : null
  const call = firstOf(inputs.decisions.filter((d) => d.kind === config.callKind))
  const zone = firstOf(inputs.decisions.filter((d) => d.kind === config.zoneKind))
  const shore = firstOf(inputs.decisions.filter((d) => d.kind === config.shoreKind))
  const hazards = inputs.events.filter((e) => e.kind === 'secondary_hazard')
  const controlled = hazards.map((h) => {
    const kind = String(h.attrs.controlledBy ?? '')
    const by = firstOf(
      inputs.decisions.filter((d) => d.kind === kind && ms(d.time) >= ms(h.time) - 60_000),
    )
    const minutes = by ? (ms(by.time) - ms(h.time)) / 60_000 : null
    return { h, minutes, ok: minutes !== null && minutes <= config.controlWithinMin }
  })
  const text = (v: number | null): string => (v === null ? NOT_AVAILABLE : minutesText(v))
  const responseMin = arrival && call ? (ms(arrival.time) - ms(call.time)) / 60_000 : null
  return {
    metricId: 'structures_rescue_timeline',
    title: 'Rescue timeline',
    config,
    inputs: [
      { label: 'Collapse', value: collapse?.time ?? NOT_AVAILABLE },
      { label: 'First responders on scene (scenario)', value: arrival?.time ?? NOT_AVAILABLE },
      { label: 'Secondary hazards', value: String(hazards.length) },
      {
        label: 'Control target',
        value: `within ${config.controlWithinMin} min of the hazard appearing (set by the designer)`,
      },
    ],
    summary: [
      { label: 'Minutes from collapse to the 911 call', value: text(since(call)) },
      { label: 'Minutes from collapse to the exclusion zone', value: text(since(zone)) },
      { label: 'Minutes from collapse to the shoring request', value: text(since(shore)) },
      { label: 'Minutes from the 911 call to first responders', value: text(responseMin) },
      {
        label: 'Secondary hazards controlled in time',
        value: `${controlled.filter((c) => c.ok).length} of ${hazards.length}`,
      },
    ],
    tables: [
      {
        title: 'Secondary hazards',
        columns: ['Hazard', 'Appeared', 'Controlled by', 'Minutes to control', 'Result'],
        rows: controlled.map((c) => [
          String(c.h.attrs.hazard ?? c.h.id),
          c.h.time,
          String(c.h.attrs.controlledBy ?? NOT_AVAILABLE),
          c.minutes === null ? NOT_AVAILABLE : String(Math.round(c.minutes)),
          c.ok ? 'controlled in time' : c.minutes === null ? 'not controlled' : 'late',
        ]),
      },
    ],
    caveats: [
      'Rescue tactics are run by the fire department and are not scored. The first responder arrival is set by the scenario, so a late arrival is not the team’s doing.',
      ...(collapse ? [] : ['The scenario recorded no collapse time.']),
    ],
    data: {
      toCallMin: since(call),
      toZoneMin: since(zone),
      toShoreMin: since(shore),
      hazardsControlled: controlled.filter((c) => c.ok).length,
      hazards: hazards.length,
    },
  }
}

export const structuresRescueTimeline: Metric<
  StructuresRescueTimelineConfig,
  StructuresRescueTimelineInputs
> = {
  id: 'structures_rescue_timeline',
  title: 'Rescue timeline',
  configSchema: StructuresRescueTimelineConfig,
  compute: computeStructuresRescueTimeline,
}
