// Protective action distance and timing (spec 0456 FR-11): the isolation and protective action
// distances the players set against the distances the scenario was built with (entered from the
// author's guidebook or invented for a fictional material), and whether the action was in place
// before the plume reached each place. The metric never looks a distance up: the scenario's own
// numbers are the standard, and the result says which source they came from.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  attrText,
  decisionsOfKind,
  EMS_EVENT_KINDS,
  eventsOfKind,
  fieldText,
  minutesBetween,
  numberOf,
  toMeters,
} from './ems-inputs'
import { minutesText, NOT_AVAILABLE, type Metric, type MetricOutput } from './types'

export const ProtectiveActionDistanceConfig = z.object({
  decisionKind: z.string().default('set_protective_actions'),
  /** How far a distance may differ from the scenario's before it counts as wrong. */
  tolerancePercent: z.number().min(0).max(100).default(10),
})
export type ProtectiveActionDistanceConfig = z.infer<typeof ProtectiveActionDistanceConfig>

export interface ProtectiveActionInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const within = (set: number | null, expected: number | null, pct: number): string => {
  if (set === null || expected === null) return NOT_AVAILABLE
  return Math.abs(set - expected) <= (expected * pct) / 100
    ? 'Within tolerance'
    : 'Outside tolerance'
}

function distanceMeters(d: MetricDecision | undefined, key: string): number | null {
  const v = d ? numberOf(d.fields[key]) : null
  const unit = d ? fieldText(d, 'unit') : ''
  return v === null ? null : toMeters(v, unit || 'ft')
}

export function computeProtectiveActionDistance(
  inputs: ProtectiveActionInputs,
  config: ProtectiveActionDistanceConfig,
): MetricOutput {
  const zone = eventsOfKind(inputs.events, EMS_EVENT_KINDS.zone)[0]
  const arrivals = eventsOfKind(inputs.events, EMS_EVENT_KINDS.arrival)
  const call = decisionsOfKind(inputs.decisions, config.decisionKind)[0]
  const unit = zone ? attrText(zone, 'unit') || 'ft' : 'ft'
  const expIso = zone ? toMeters(numberOf(zone.attrs.isolationDistance) ?? NaN, unit) : null
  const expPad = zone ? toMeters(numberOf(zone.attrs.protectiveDistance) ?? NaN, unit) : null
  const iso = within(distanceMeters(call, 'isolation_distance'), expIso, config.tolerancePercent)
  const pad = within(distanceMeters(call, 'protective_distance'), expPad, config.tolerancePercent)
  const lead = (a: GroundTruthEvent) => (call ? minutesBetween(call.time, a.time) : null)
  const before = arrivals.filter((a) => (lead(a) ?? -1) >= 0).length
  return {
    metricId: 'protective_action_distance',
    title: 'Protective action distance and timing',
    config,
    inputs: [
      {
        label: 'Scenario isolation distance',
        value: zone ? `${zone.attrs.isolationDistance} ${unit}` : NOT_AVAILABLE,
      },
      {
        label: 'Scenario protective action distance',
        value: zone ? `${zone.attrs.protectiveDistance} ${unit}` : NOT_AVAILABLE,
      },
      {
        label: 'Source of the scenario distances',
        value: zone ? attrText(zone, 'distanceSource') : NOT_AVAILABLE,
      },
      {
        label: 'Source the players stated',
        value: call ? fieldText(call, 'distance_source') || NOT_AVAILABLE : NOT_AVAILABLE,
      },
      { label: 'Action set at', value: call?.time ?? NOT_AVAILABLE },
      { label: 'Tolerance', value: `${config.tolerancePercent} percent` },
    ],
    summary: [
      { label: 'Isolation distance', value: iso },
      { label: 'Protective action distance', value: pad },
      {
        label: 'Places with the action in place before the plume',
        value: `${before} of ${arrivals.length}`,
      },
    ],
    tables: [
      {
        title: 'Plume arrival at places',
        columns: [
          'Place',
          'Plume arrives',
          'Minutes after the action was set',
          'Action in place first',
        ],
        rows: arrivals.map((a) => {
          const m = lead(a)
          return [
            attrText(a, 'place') || a.id,
            a.time,
            minutesText(m),
            m === null ? NOT_AVAILABLE : m >= 0 ? 'Yes' : 'No',
          ]
        }),
      },
    ],
    caveats: [
      'The scenario distances are the exercise standard, not real guidance; players use their own guidebook for real decisions.',
      'Plume arrival is distance along the wind divided by wind speed, a simple relation and not a dispersion model.',
      ...(!call ? ['No protective action decision was recorded.'] : []),
      ...(!zone ? ['No release zone was found in the ground truth.'] : []),
    ],
    data: { isolation: iso, protective: pad, before, places: arrivals.length },
  }
}

export const protectiveActionDistance: Metric<
  ProtectiveActionDistanceConfig,
  ProtectiveActionInputs
> = {
  id: 'protective_action_distance',
  title: 'Protective action distance and timing',
  configSchema: ProtectiveActionDistanceConfig,
  compute: computeProtectiveActionDistance,
}
