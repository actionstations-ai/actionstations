// The governance incident as a case-data generator (spec 0448 FR-10, spec 0459 FR-6). The
// framework labels the output simulated; every dataset label says so as well. Datasets a metric
// reads (events and modeled series) are stored as a GeoJSON collection with no features and the
// rows under `events` or `series`, the form the metric input adapters read (flooding does the same).
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import {
  dependenciesValid,
  factEvents,
  GovIncidentParams,
  impactSeries,
  recoveryEvents,
  recoverySchedule,
  recoverySeries,
} from './simulate'

const metricFile = (key: 'series' | 'events', rows: unknown[]) => ({
  type: 'FeatureCollection',
  features: [],
  [key]: rows,
})

export const GOVERNANCE_GENERATOR_ID = 'governance-incident'
export const GOV_DATASET = {
  facts: 'gov-facts',
  recoveryEvents: 'gov-recovery-events',
  recoverySeries: 'gov-recovery-series',
  impact: 'gov-impact-range',
} as const

const params = GovIncidentParams.refine((p) => dependenciesValid(p.functions), {
  message: 'function dependencies must name listed functions and contain no cycle',
  path: ['functions'],
})

export const governanceIncidentGenerator: SimulatedGenerator<GovIncidentParams> = {
  id: GOVERNANCE_GENERATOR_ID,
  label: 'Simulated governance incident (facts, impact range, function recovery)',
  params,
  generate(p): GeneratedDataset[] {
    const t0 = Date.parse(p.startDate)
    const range = {
      start: new Date(t0).toISOString(),
      end: new Date(t0 + p.horizonHours * 3_600_000).toISOString(),
    }
    const schedule = recoverySchedule(p)
    return [
      {
        id: GOV_DATASET.facts,
        kind: 'features',
        label: 'Fact timeline: early facts are incomplete or wrong, simulated',
        range,
        data: metricFile('events', factEvents(p)),
      },
      {
        id: GOV_DATASET.recoveryEvents,
        kind: 'features',
        label: 'Function recovery against RTO, simulated',
        range,
        data: metricFile('events', recoveryEvents(p, schedule)),
      },
      {
        id: GOV_DATASET.recoverySeries,
        kind: 'features',
        label: 'Percent of each function recovered by hour, simulated',
        range,
        unit: 'percent',
        data: metricFile('series', recoverySeries(p, schedule, t0)),
      },
      {
        id: GOV_DATASET.impact,
        kind: 'features',
        label: 'Estimated financial impact range, simulated',
        range,
        unit: 'USD millions',
        data: metricFile('series', impactSeries(p)),
      },
    ]
  },
}
