// Warning to action (spec 0471 FR-10): how long after the first sign of trouble (the first alarm
// or action level crossing on a monitoring series, or a reported sign) the team stopped work and
// ordered the evacuation, and whether work stopped before the failure began. The failure onset
// and the crossings are the simulated ground truth; the decisions are the team's stop-work and
// evacuation forms. A negative number means the team acted before the sign, which is a result,
// not an error.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { minutesText, ms, NOT_AVAILABLE, type Metric, type MetricOutput } from './types'

export const StructuresWarningToActionConfig = z.object({
  /** Which crossing counts as the first sign: the alarm level or the action level. */
  signLevel: z.enum(['alarm', 'action']).default('alarm'),
  stopKind: z.string().default('structures_stop_work'),
  evacuateKind: z.string().default('structures_evacuate'),
})
export type StructuresWarningToActionConfig = z.infer<typeof StructuresWarningToActionConfig>

export interface StructuresWarningToActionInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const first = <T extends { time: string }>(rows: T[]): T | undefined =>
  [...rows].sort((a, b) => ms(a.time) - ms(b.time))[0]

const minutesBetween = (from: string | undefined, to: string | undefined): number | null =>
  from && to ? (ms(to) - ms(from)) / 60_000 : null

export function computeStructuresWarningToAction(
  inputs: StructuresWarningToActionInputs,
  config: StructuresWarningToActionConfig,
): MetricOutput {
  const signs = inputs.events.filter(
    (e) =>
      e.kind === 'reported_sign' ||
      (e.kind === 'threshold_crossing' && e.attrs.level === config.signLevel),
  )
  const sign = first(signs)
  const onset = first(inputs.events.filter((e) => e.kind === 'failure_onset'))
  const stop = first(inputs.decisions.filter((d) => d.kind === config.stopKind))
  const evac = first(inputs.decisions.filter((d) => d.kind === config.evacuateKind))
  const toStop = minutesBetween(sign?.time, stop?.time)
  const toEvac = minutesBetween(sign?.time, evac?.time)
  const beforeOnset = stop && onset ? ms(stop.time) <= ms(onset.time) : null
  const text = (v: number | null): string => (v === null ? NOT_AVAILABLE : minutesText(v))
  return {
    metricId: 'structures_warning_to_action',
    title: 'Warning to action',
    config,
    inputs: [
      {
        label: 'First sign',
        value: sign ? `${sign.kind} (${config.signLevel}) at ${sign.time}` : NOT_AVAILABLE,
      },
      { label: 'Failure onset (simulated ground truth)', value: onset?.time ?? NOT_AVAILABLE },
      { label: 'Stop-work decision', value: stop?.time ?? 'none recorded' },
      { label: 'Evacuation decision', value: evac?.time ?? 'none recorded' },
    ],
    summary: [
      { label: 'Minutes from first sign to stop work', value: text(toStop) },
      { label: 'Minutes from first sign to evacuation', value: text(toEvac) },
      {
        label: 'Work stopped before the failure began',
        value: beforeOnset === null ? NOT_AVAILABLE : beforeOnset ? 'yes' : 'no',
      },
      {
        label: 'Minutes between stop work and failure onset',
        value: text(minutesBetween(stop?.time, onset?.time)),
      },
    ],
    tables: [],
    caveats: [
      'A negative time means the team acted before the first sign. The failure onset is known only to the simulation; players could not see it.',
      ...(sign ? [] : ['The scenario recorded no first sign, so no time can be computed.']),
    ],
    data: { toStopMin: toStop, toEvacuateMin: toEvac, beforeOnset },
  }
}

export const structuresWarningToAction: Metric<
  StructuresWarningToActionConfig,
  StructuresWarningToActionInputs
> = {
  id: 'structures_warning_to_action',
  title: 'Warning to action',
  configSchema: StructuresWarningToActionConfig,
  compute: computeStructuresWarningToAction,
}
