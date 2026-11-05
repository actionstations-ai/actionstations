// Simulated case-data generators of the structures toolkit (spec 0471 FR-7). Importing this module
// registers them (generator-modules.ts lists it). The framework labels everything they produce as
// simulated; the labels here say so as well. Metric datasets are GeoJSON collections with no
// features and the rows under `events` or `series`, the shape the metric input readers accept.
import {
  registerGenerator,
  generatorIds,
  type GeneratedDataset,
  type SimulatedGenerator,
} from '../../case-data/generators'
import { DamageParams, simulateBuildings, truthShares } from './damage-sim'
import { MonitoringParams, simulateMonitoring } from './monitoring-sim'

const metricFile = (key: 'events' | 'series', rows: unknown[]) => ({
  type: 'FeatureCollection',
  features: [],
  [key]: rows,
})

export const monitoringGenerator: SimulatedGenerator<MonitoringParams> = {
  id: 'structures-monitoring',
  label: 'Simulated structural monitoring (sensor series, alarm crossings, failure onset)',
  params: MonitoringParams,
  generate(p) {
    const r = simulateMonitoring(p)
    const sensor = p.sensorId.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const reported = r.samples
      .filter((s) => s.v !== null)
      .map((s) => ({ t: s.t, v: s.v as number }))
    const events = [
      ...(r.onsetAt
        ? [
            {
              id: 'failure-onset',
              time: r.onsetAt,
              kind: 'failure_onset',
              area: p.location,
              attrs: { sensor: p.sensorId, shape: p.failureShape },
            },
          ]
        : []),
      ...(r.alarmAt
        ? [
            {
              id: 'alarm-crossing',
              time: r.alarmAt,
              kind: 'threshold_crossing',
              area: p.location,
              attrs: { sensor: p.sensorId, level: 'alarm', value: p.alarmLevel, unit: p.unit },
            },
          ]
        : []),
      ...(r.actionAt
        ? [
            {
              id: 'action-crossing',
              time: r.actionAt,
              kind: 'threshold_crossing',
              area: p.location,
              attrs: { sensor: p.sensorId, level: 'action', value: p.actionLevel, unit: p.unit },
            },
          ]
        : []),
      ...r.dropouts.map((d, i) => ({
        id: `dropout-${i + 1}`,
        time: d.start,
        kind: 'sensor_dropout',
        area: p.location,
        attrs: { sensor: p.sensorId, end: d.end },
      })),
    ]
    const out: GeneratedDataset[] = [
      {
        id: `monitoring-${sensor}`,
        kind: 'series',
        label: `${p.sensorId} (${p.sensorType.replace('_', ' ')}) at ${p.location}: reading, simulated`,
        data: reported,
        unit: p.unit,
        ...(reported.length
          ? { range: { start: reported[0]!.t, end: reported[reported.length - 1]!.t } }
          : {}),
      },
      {
        id: 'monitoring-truth',
        kind: 'features',
        label: `Failure onset and threshold crossings for ${p.sensorId}, simulated ground truth`,
        data: metricFile('events', events),
      },
      {
        id: 'monitoring-action-series',
        kind: 'features',
        label: `${p.sensorId}: ${p.unit} above the action level, simulated`,
        data: metricFile('series', [
          {
            zone: p.location,
            quantity: `${p.unit} above the action level`,
            points: r.samples.map((s) => ({
              time: s.t,
              value: Math.round((s.raw - p.actionLevel) * 100) / 100,
            })),
          },
        ]),
      },
    ]
    return out
  },
}

export const damageStatesGenerator: SimulatedGenerator<DamageParams> = {
  id: 'structures-damage-states',
  label: 'Simulated post-earthquake building list (fictional buildings, shaking, damage states)',
  params: DamageParams,
  generate(p) {
    const buildings = simulateBuildings(p)
    const shares = truthShares(buildings)
    const features = buildings.map((b) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
      properties: {
        id: b.id,
        name: b.name,
        buildingType: b.type,
        priority: b.priority,
        shakingMmi: b.mmi,
      },
    }))
    const events = [
      ...buildings.map((b) => ({
        id: `truth-${b.id}`,
        time: p.start,
        kind: 'building_truth',
        area: p.city,
        attrs: {
          buildingId: b.id,
          truthPlacard: b.truth,
          buildingType: b.type,
          priority: b.priority,
          shakingMmi: b.mmi,
        },
      })),
      {
        id: 'program-truth',
        time: p.start,
        kind: 'program_truth',
        area: p.city,
        attrs: {
          buildings: buildings.length,
          shareInspected: Math.round(shares.INSPECTED * 1000) / 1000,
          shareRestrictedUse: Math.round(shares['RESTRICTED USE'] * 1000) / 1000,
          shareUnsafe: Math.round(shares.UNSAFE * 1000) / 1000,
        },
      },
    ]
    return [
      {
        id: 'inspection-buildings',
        kind: 'features',
        label: `${p.city} buildings to evaluate (${buildings.length} fictional buildings), simulated`,
        data: { type: 'FeatureCollection', features },
      },
      {
        id: 'inspection-truth',
        kind: 'features',
        label: `Correct placard for each ${p.city} building, simulated ground truth`,
        data: metricFile('events', events),
      },
    ]
  },
}

/** Register both generators once (the module loads from generator-modules.ts and from tests). */
for (const g of [monitoringGenerator, damageStatesGenerator] as const)
  if (!generatorIds().includes(g.id)) registerGenerator(g as SimulatedGenerator)
