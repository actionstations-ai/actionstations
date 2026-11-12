// The clinical downtime generator (issue #1130): a fictional hospital's EHR and interface failure
// as simulated case data. It writes the hourly message queues by feed and the failure as
// ground-truth events (the outage, the units, critical results that arrive while the systems are
// down, the recovery and the paper each unit has to enter). The first event carries the model's
// parameters, so live play, Facilitate and the evaluation run the consequence rules and release
// the seeded discrepancies from the same case. register-generators.ts registers it.
import { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import {
  DOWNTIME_EVENTS_DATASET,
  FEEDS,
  downtimeCaseEvents,
  downtimeSetup,
  queueSeries,
} from '@shared/clinical/downtime-play'
import type { FeedId } from '@shared/clinical/downtime'

export const ClinicalDowntimeParams = z.object({
  seed: z.number().int().default(1),
  beds: z.number().int().min(10).max(2000).default(300),
  /** ISO time the systems fail. */
  start: z.string().datetime(),
  durationHours: z.number().int().min(1).max(72).default(6),
  failedFeeds: z
    .array(z.enum(FEEDS as [FeedId, ...FeedId[]]))
    .min(1)
    .max(5)
    .default(['lab_results', 'orders', 'adt', 'pharmacy']),
  dataLost: z.boolean().default(false),
  units: z
    .array(z.string().min(1).max(60))
    .min(1)
    .max(20)
    .default(['4 West', '5 East', 'Intensive care unit', 'Emergency department']),
  patientCount: z.number().int().min(2).max(60).default(12),
  extraDiscrepancies: z.number().int().min(0).max(6).default(0),
  criticalResults: z.number().int().min(0).max(12).default(3),
})
type Params = z.infer<typeof ClinicalDowntimeParams>

export function clinicalDowntimeDatasets(p: Params): GeneratedDataset[] {
  const setup = downtimeSetup(p)
  const range = {
    start: p.start,
    end: new Date(Date.parse(p.start) + setup.case.hours.length * 3_600_000).toISOString(),
  }
  return [
    {
      id: 'downtime-queues',
      label: `Interface queues by feed during the downtime (${p.beds} beds, simulated)`,
      kind: 'series',
      unit: 'messages',
      data: queueSeries(setup),
      range,
    },
    {
      id: DOWNTIME_EVENTS_DATASET,
      label: 'Clinical systems downtime events (simulated)',
      kind: 'reports',
      shape: 'ground-truth',
      data: downtimeCaseEvents(p),
      range,
    },
  ]
}

export const clinicalDowntimeGenerator: SimulatedGenerator<Params> = {
  id: 'clinical-downtime',
  label: 'Simulated EHR and interface downtime (clinical systems toolkit)',
  params: ClinicalDowntimeParams,
  generate: clinicalDowntimeDatasets,
}
