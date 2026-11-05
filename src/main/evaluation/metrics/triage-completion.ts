// Time to triage complete (spec 0456 FR-11): from the first unit on scene to the moment the
// players report every patient categorized, against the simulated incident's own time for the
// last patient to be triaged, and the counts they reported against the counts that were true.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  attrText,
  decisionsOfKind,
  EMS_EVENT_KINDS,
  eventsOfKind,
  minutesBetween,
  numberOf,
} from './ems-inputs'
import { minutesText, NOT_AVAILABLE, type Metric, type MetricOutput } from './types'

export const TriageCompletionConfig = z.object({
  reportDecisionKind: z.string().default('report_triage_complete'),
})
export type TriageCompletionConfig = z.infer<typeof TriageCompletionConfig>

export interface TriageCompletionInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const PRIORITIES = ['Immediate', 'Delayed', 'Minor', 'Expectant'] as const

export function computeTriageCompletion(
  inputs: TriageCompletionInputs,
  config: TriageCompletionConfig,
): MetricOutput {
  const first = eventsOfKind(inputs.events, EMS_EVENT_KINDS.firstUnit)[0]
  const truth = eventsOfKind(inputs.events, EMS_EVENT_KINDS.triageComplete)[0]
  const report = decisionsOfKind(inputs.decisions, config.reportDecisionKind)[0]
  const patients = eventsOfKind(inputs.events, EMS_EVENT_KINDS.patient)
  const players = first && report ? minutesBetween(first.time, report.time) : null
  const simulated = first && truth ? minutesBetween(first.time, truth.time) : null
  const trueCount = (p: string) => patients.filter((e) => attrText(e, 'priority') === p).length
  const reported = (p: string) => (report ? numberOf(report.fields[p.toLowerCase()]) : null)
  return {
    metricId: 'triage_completion',
    title: 'Time to triage complete',
    config,
    inputs: [
      { label: 'First unit on scene', value: first?.time ?? NOT_AVAILABLE },
      { label: 'Triage complete reported at', value: report?.time ?? NOT_AVAILABLE },
      { label: 'Simulated last patient triaged at', value: truth?.time ?? NOT_AVAILABLE },
      { label: 'Patients in the simulated incident', value: String(patients.length) },
    ],
    summary: [
      { label: 'Time to triage complete (players)', value: minutesText(players) },
      { label: 'Time to triage complete (simulated incident)', value: minutesText(simulated) },
      {
        label: 'Difference (players minus simulated)',
        value:
          players !== null && simulated !== null ? minutesText(players - simulated) : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'Patients by priority',
        columns: ['Priority', 'In the incident', 'Reported by players'],
        rows: PRIORITIES.map((p) => [
          p,
          String(trueCount(p)),
          reported(p) === null ? NOT_AVAILABLE : String(reported(p)),
        ]),
      },
    ],
    caveats: [
      'A report made before the last patient was triaged shows a shorter time than the simulated incident; check the counts against the true ones.',
      ...(!first ? ['No first-unit event was found in the ground truth.'] : []),
      ...(!report ? ['No "triage complete" report was recorded.'] : []),
    ],
    data: { playersMin: players, simulatedMin: simulated },
  }
}

export const triageCompletion: Metric<TriageCompletionConfig, TriageCompletionInputs> = {
  id: 'triage_completion',
  title: 'Time to triage complete',
  configSchema: TriageCompletionConfig,
  compute: computeTriageCompletion,
}
