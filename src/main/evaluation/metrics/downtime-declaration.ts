// Outage to downtime declaration, a clinical systems measure. The downtime chain has two links
// and the clinical systems toolkit owns both: this one, from the scripted outage to the decision
// that starts downtime procedures (recognition and escalation, where the charge nurse and house
// supervisor matter), and time_to_downtime_procedures, from the declaration to every unit on
// paper. They are kept apart so an after-action report can say whether the delay was in
// recognizing the outage or in spreading the procedures to the units. The id
// downtime_workflow_time and the title are kept from when the clinical care toolkit listed it, so
// saved evaluations still read and a re-run replaces the old result.
import { z } from 'zod'
import {
  CLINICAL_EVENT_KINDS as E,
  attr,
  decisionsOfKind,
  eventsOfKind,
  minutesBetween,
} from './clinical-care-inputs'
import type { ClinicalInputs } from './clinical-care'
import { mean, minutesText, NOT_AVAILABLE, ms, type Metric, type MetricOutput } from './types'

const count = (n: number, of: number): string => `${n} of ${of}`

export const DowntimeDeclarationConfig = z.object({
  /** The decision form that declares downtime. */
  decisionKind: z.string().default('declare_downtime'),
  targetMinutes: z.number().positive().default(30),
})
type DowntimeDeclarationConfig = z.infer<typeof DowntimeDeclarationConfig>

function computeDeclaration(i: ClinicalInputs, config: DowntimeDeclarationConfig): MetricOutput {
  const starts = eventsOfKind(i.events, E.downtimeStart)
  const calls = decisionsOfKind(i.decisions, config.decisionKind)
  const rows = starts.map((e) => {
    const call = calls.find((c) => ms(c.time) >= ms(e.time))
    return { e, call, minutes: call ? minutesBetween(e.time, call.time) : null }
  })
  const done = rows.filter((r) => r.minutes !== null)
  return {
    metricId: 'downtime_workflow_time',
    title: 'Outage to downtime declaration',
    config,
    inputs: [
      { label: 'Downtime periods scripted', value: String(starts.length) },
      { label: `Decisions of kind "${config.decisionKind}"`, value: String(calls.length) },
    ],
    summary: [
      { label: 'Outages with downtime declared', value: count(done.length, starts.length) },
      {
        label: 'Mean minutes, outage to declaration',
        value: minutesText(mean(done.map((r) => r.minutes!))),
      },
      {
        label: `Declared within ${config.targetMinutes} minutes`,
        value: starts.length
          ? count(done.filter((r) => r.minutes! <= config.targetMinutes).length, starts.length)
          : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'Downtime periods',
        columns: ['Outage', 'Declared', 'Minutes'],
        rows: rows.map((r) => [
          attr(r.e, 'system') || r.e.id,
          r.call?.time ?? 'Not declared',
          minutesText(r.minutes),
        ]),
      },
    ],
    caveats: [
      'This measures the outage to the downtime declaration only. The time from the declaration to every unit working on downtime procedures is the separate measure "Declaration to all units on downtime procedures".',
      'It reads the clinical systems form "Declare downtime"; set decisionKind to another form id if the scenario declares downtime on its own form.',
    ],
    data: {
      periods: starts.length,
      started: done.length,
      meanMinutes: mean(done.map((r) => r.minutes!)),
    },
  }
}

export const downtimeWorkflowTime: Metric<DowntimeDeclarationConfig, ClinicalInputs> = {
  id: 'downtime_workflow_time',
  title: 'Outage to downtime declaration',
  configSchema: DowntimeDeclarationConfig,
  compute: computeDeclaration,
}
