// Destination appropriateness (spec 0456 FR-11): of the patients the players assigned to a
// hospital, how many went to one whose capability fits the injuries (trauma, burn, pediatric),
// how the Immediate patients fared, and whether any hospital was sent more than it said it could
// take. Scored against the simulated incident's own ground truth for each patient and hospital.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  attrText,
  decisionsOfKind,
  EMS_EVENT_KINDS,
  eventsOfKind,
  fieldText,
  listOf,
  norm,
  numberOf,
} from './ems-inputs'
import { ratio, ratioText, type Metric, type MetricOutput } from './types'

export const DestinationFitConfig = z.object({
  decisionKind: z.string().default('assign_patient_destination'),
})
export type DestinationFitConfig = z.infer<typeof DestinationFitConfig>

export interface DestinationFitInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

export function computeDestinationFit(
  inputs: DestinationFitInputs,
  config: DestinationFitConfig,
): MetricOutput {
  const patients = eventsOfKind(inputs.events, EMS_EVENT_KINDS.patient)
  const hospitals = eventsOfKind(inputs.events, EMS_EVENT_KINDS.hospital)
  const decisions = decisionsOfKind(inputs.decisions, config.decisionKind)
  const rows = patients.map((p) => {
    const tag = attrText(p, 'tag') || p.id
    const call = decisions.find((d) => norm(fieldText(d, 'tag_number')) === norm(tag))
    const hospital = call ? fieldText(call, 'hospital') : ''
    const ok = listOf(p.attrs.appropriate).some((h) => norm(h) === norm(hospital))
    return {
      tag,
      priority: attrText(p, 'priority'),
      hospital,
      ok,
      assigned: !!call,
      best: attrText(p, 'best'),
    }
  })
  const assigned = rows.filter((r) => r.assigned)
  const fit = assigned.filter((r) => r.ok).length
  const immediate = assigned.filter((r) => r.priority === 'Immediate')
  const sent = (name: string) => assigned.filter((r) => norm(r.hospital) === norm(name)).length
  const over = hospitals.filter((h) => {
    const limit = numberOf(h.attrs.limit)
    return limit !== null && sent(attrText(h, 'name') || h.id) > limit
  })
  return {
    metricId: 'destination_fit',
    title: 'Destination appropriateness',
    config,
    inputs: [
      { label: 'Patients in the simulated incident', value: String(patients.length) },
      { label: 'Patients assigned a hospital by the players', value: String(assigned.length) },
      { label: 'Hospitals with a stated limit', value: String(hospitals.length) },
    ],
    summary: [
      { label: 'Patients sent to a capable hospital', value: `${fit} of ${assigned.length}` },
      { label: 'Share sent to a capable hospital', value: ratioText(ratio(fit, assigned.length)) },
      {
        label: 'Immediate patients sent to a capable hospital',
        value: `${immediate.filter((r) => r.ok).length} of ${immediate.length}`,
      },
      {
        label: 'Patients with no destination assigned',
        value: String(rows.length - assigned.length),
      },
      {
        label: 'Hospitals sent more than their stated limit',
        value: over.length ? over.map((h) => attrText(h, 'name') || h.id).join(', ') : 'none',
      },
    ],
    tables: [
      {
        title: 'Patients',
        columns: ['Tag', 'Priority', 'Players chose', 'Capable hospital', 'Simulated best'],
        rows: rows.map((r) => [
          r.tag,
          r.priority,
          r.hospital || 'not assigned',
          !r.assigned ? 'n/a' : r.ok ? 'Yes' : 'No',
          r.best,
        ]),
      },
    ],
    caveats: [
      'A capable hospital fits the injuries (trauma, burn or pediatric); the simulated best also weighs distance and keeps the trauma center free, so a capable choice that differs from it is not wrong.',
      ...(patients.length === 0 ? ['No patients were found in the ground truth.'] : []),
    ],
    data: {
      assigned: assigned.length,
      capable: fit,
      share: ratio(fit, assigned.length),
      overLimit: over.map((h) => attrText(h, 'name') || h.id),
    },
  }
}

export const destinationFit: Metric<DestinationFitConfig, DestinationFitInputs> = {
  id: 'destination_fit',
  title: 'Destination appropriateness',
  configSchema: DestinationFitConfig,
  compute: computeDestinationFit,
}
