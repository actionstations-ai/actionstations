// The governance incident as a case-data generator (spec 0448 FR-10, spec 0459 FR-6). The
// framework labels the output simulated; every dataset label says so as well. Datasets a metric
// reads (events and modeled series) are stored as a GeoJSON collection with no features and the
// rows under `events` or `series`, the form the metric input adapters read (flooding does the same).
import type { z } from 'zod'
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
  description:
    'Simulates a ransomware, data theft, site loss or cloud outage incident: a fact timeline whose early facts are incomplete or wrong, a financial impact range that widens and narrows, and recovery of each business function after the functions it depends on. Writes the fact and recovery events against RTO, percent recovered by hour, and the impact range.',
  toolkits: ['governance'],
  example: {
    incidentType: 'ransomware',
    startDate: '2026-10-22T11:15:00Z',
    seed: 7,
    plantsAffected: 2,
    financialMidpointUsdM: 8,
    thirdParty: false,
    horizonHours: 72,
    functions: [
      { name: 'Network and identity', rtoHours: 4, workHours: 3, dependsOn: [] },
      { name: 'ERP and billing', rtoHours: 8, workHours: 5, dependsOn: ['Network and identity'] },
      { name: 'Order entry', rtoHours: 8, workHours: 2, dependsOn: ['ERP and billing'] },
      { name: 'Payroll', rtoHours: 48, workHours: 6, dependsOn: ['ERP and billing'] },
    ],
  } satisfies z.input<typeof GovIncidentParams>,
  fields: {
    incidentType: { label: 'Incident type' },
    startDate: { label: 'Incident start (UTC)' },
    seed: { label: 'Random seed', help: 'Any whole number; the same seed gives the same data.' },
    plantsAffected: {
      label: 'Plants affected',
      help: 'How many plants or sites the incident finally reaches, 1 to 8.',
    },
    financialMidpointUsdM: {
      label: 'Financial impact midpoint (USD millions)',
      help: 'Middle of the final financial impact range, 0.1 to 5000.',
    },
    thirdParty: {
      label: 'Third party controls recovery',
      help: 'A supplier or cloud provider controls part of the recovery, which slows it.',
    },
    horizonHours: {
      label: 'Hours simulated',
      help: 'Length of the simulated period, 24 to 168 hours.',
    },
    functions: {
      label: 'Business functions',
      help: 'Each item: name, rtoHours (recovery time objective), workHours (its own recovery work once dependencies are back) and dependsOn (names of other listed functions, no cycles).',
    },
  },
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
