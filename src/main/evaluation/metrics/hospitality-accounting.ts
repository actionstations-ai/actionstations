// Guest and crew accounting (spec 0470 FR-11): how long the team took to declare every person
// accounted for, whether the declaration came while persons were still unaccounted, and how the
// counts the team reported compare with the persons still missing at that time. Ground truth is
// the simulated muster or evacuation: a start event, one `person_unaccounted` event for each
// person found late (with the minutes after the start when they are found) and an
// `all_accounted` event; the team's work is the guest accounting form.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { choiceKey, decisionsOfKind, eventsOfKind, fieldText, minutesBetween } from './media-inputs'
import { numberOf } from './ems-inputs'
import { minutesText, NOT_AVAILABLE, stringList, type Metric, type MetricOutput } from './types'

export const HospitalityAccountingConfig = z.object({
  /** The decision form the team records counts with. */
  declareKind: z.string().default('hosp_guest_accounting'),
  /** Event kinds that start the count (muster alarm, fire alarm). */
  startKinds: stringList.default(['muster_start', 'fire_alarm']),
  /** The status choice that declares everyone accounted for. */
  allClearStatus: z.string().default('Count complete, all accounted for'),
})
export type HospitalityAccountingConfig = z.infer<typeof HospitalityAccountingConfig>

export interface HospitalityAccountingInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

interface Report {
  time: string
  minutes: number
  status: string
  reported: number | null
  stillMissing: number | null
}

export function computeHospitalityAccounting(
  inputs: HospitalityAccountingInputs,
  config: HospitalityAccountingConfig,
): MetricOutput {
  const start = config.startKinds
    .flatMap((k) => eventsOfKind(inputs.events, k))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))[0]
  const truthDone = eventsOfKind(inputs.events, 'all_accounted')[0]
  const late = eventsOfKind(inputs.events, 'person_unaccounted')
  const forms = decisionsOfKind(inputs.decisions, config.declareKind)
  const clearKey = choiceKey(config.allClearStatus)
  const missingAt = (min: number): number | null =>
    late.length === 0
      ? null
      : late.filter((e) => (numberOf(e.attrs.foundAfterMin) ?? 0) > min).length
  const reports: Report[] = forms.map((d) => {
    const minutes = start ? minutesBetween(start.time, d.time) : 0
    return {
      time: d.time,
      minutes,
      status: fieldText(d, 'status'),
      reported: numberOf(d.fields.unaccounted),
      stillMissing: start ? missingAt(minutes) : null,
    }
  })
  const clear = reports.find((r) => choiceKey(r.status) === clearKey)
  const toClear = clear && start ? clear.minutes : null
  const truthMin = truthDone && start ? minutesBetween(start.time, truthDone.time) : null
  const falseClear = clear && truthMin !== null ? clear.minutes < truthMin : false
  const missedAtClear = clear && start ? missingAt(clear.minutes) : null
  const errors = reports.flatMap((r) =>
    r.reported !== null && r.stillMissing !== null ? [Math.abs(r.reported - r.stillMissing)] : [],
  )
  return {
    metricId: 'hospitality_accounting',
    title: 'Time to account for every person',
    config,
    inputs: [
      { label: 'Count started', value: start?.time ?? NOT_AVAILABLE },
      { label: 'Accounting reports recorded', value: String(reports.length) },
      { label: 'Persons found late in the scenario', value: String(late.length) },
      { label: 'Minutes until everyone is truly accounted for', value: minutesText(truthMin) },
    ],
    summary: [
      { label: 'Time to declare all accounted for', value: minutesText(toClear) },
      {
        label: 'Declared before everyone was accounted for',
        value: clear ? (falseClear ? 'Yes' : 'No') : 'No declaration',
      },
      {
        label: 'Persons still missing when declared',
        value: missedAtClear === null ? NOT_AVAILABLE : String(missedAtClear),
      },
      {
        label: 'Mean error in the reported unaccounted count',
        value:
          errors.length === 0
            ? NOT_AVAILABLE
            : (errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(1),
      },
    ],
    tables: [
      {
        title: 'Accounting reports',
        columns: [
          'Time',
          'Minutes from start',
          'Status',
          'Reported not accounted for',
          'Truly missing',
        ],
        rows: reports.map((r) => [
          r.time,
          minutesText(r.minutes),
          r.status || NOT_AVAILABLE,
          r.reported === null ? NOT_AVAILABLE : String(r.reported),
          r.stillMissing === null ? NOT_AVAILABLE : String(r.stillMissing),
        ]),
      },
    ],
    caveats: [
      'Persons found late are the ones planted in the simulation; persons who reach a station on their own in the first minutes are not listed as missing.',
      ...(start ? [] : ['The scenario has no count start event, so times are not available.']),
    ],
    data: {
      reports: reports.length,
      minutesToClear: toClear,
      falseClear,
      missedAtClear,
    },
  }
}

export const hospitalityAccounting: Metric<
  HospitalityAccountingConfig,
  HospitalityAccountingInputs
> = {
  id: 'hospitality_accounting',
  title: 'Time to account for every person',
  configSchema: HospitalityAccountingConfig,
  compute: computeHospitalityAccounting,
}
