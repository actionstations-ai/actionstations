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
import { z } from 'zod'
import { IsoDateTime } from '@shared/schemas/common'
import { DamageParams, truthShares } from './damage-sim'
import { buildProgram, ProgramParams } from './program'
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
    const { buildings } = buildProgram(p)
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

// ---- a site emergency timeline ----------------------------------------------------------------

const REPORTABLE = [
  'Work-related fatality',
  'In-patient hospitalization',
  'Amputation',
  'Loss of an eye',
] as const

export const SiteEventParams = z.object({
  site: z.string().min(1).max(80).default('Pier Street Mid-rise'),
  start: IsoDateTime,
  /** Minutes after `start` that the collapse or the injury happens. */
  collapseAtMinute: z.number().min(0).max(1440).default(0),
  /** A first sign players could have seen, and when (minutes after `start`; may be negative). */
  reportedSign: z
    .object({ atMinute: z.number().min(-720).max(1440), text: z.string().min(1).max(200) })
    .optional(),
  reportable: z.enum(REPORTABLE).default('In-patient hospitalization'),
  /** When the employer learns of the reportable event, in minutes after `start`. */
  learnedAtMinute: z.number().min(0).max(2880).default(30),
  firstRespondersMinute: z.number().min(1).max(240).default(9),
  secondaryHazards: z
    .array(
      z.object({
        hazard: z.string().min(1).max(80),
        atMinute: z.number().min(0).max(1440),
        /** The decision form kind that controls it. */
        controlledBy: z.string().min(1).max(80),
      }),
    )
    .max(6)
    .default([{ hazard: 'Natural gas leak', atMinute: 20, controlledBy: 'structures_shutoff' }]),
})
export type SiteEventParams = z.infer<typeof SiteEventParams>

export const siteEventGenerator: SimulatedGenerator<SiteEventParams> = {
  id: 'structures-site-event',
  label:
    'Simulated site emergency timeline (collapse, responders, reportable event, secondary hazards)',
  params: SiteEventParams,
  generate(p) {
    const at = (m: number): string =>
      new Date(Date.parse(p.start) + m * 60_000).toISOString().replace('.000Z', 'Z')
    const events = [
      { id: 'collapse', time: at(p.collapseAtMinute), kind: 'collapse', area: p.site, attrs: {} },
      {
        id: 'first-responders',
        time: at(p.collapseAtMinute + p.firstRespondersMinute),
        kind: 'first_responders_on_scene',
        area: p.site,
        attrs: {},
      },
      {
        id: 'reportable-event',
        time: at(p.learnedAtMinute),
        kind: 'reportable_event',
        area: p.site,
        attrs: {
          eventType: p.reportable,
          clockHours: p.reportable === 'Work-related fatality' ? 8 : 24,
        },
      },
      ...(p.reportedSign
        ? [
            {
              id: 'reported-sign',
              time: at(p.reportedSign.atMinute),
              kind: 'reported_sign',
              area: p.site,
              attrs: { text: p.reportedSign.text },
            },
          ]
        : []),
      ...p.secondaryHazards.map((h, i) => ({
        id: `hazard-${i + 1}`,
        time: at(h.atMinute),
        kind: 'secondary_hazard',
        area: p.site,
        attrs: { hazard: h.hazard, controlledBy: h.controlledBy },
      })),
    ]
    return [
      {
        id: 'site-event-truth',
        kind: 'features',
        label: `Timeline of the ${p.site} emergency, simulated ground truth`,
        data: metricFile('events', events),
      },
    ]
  },
}

// ---- the inspection program ---------------------------------------------------------------------

export const inspectionProgramGenerator: SimulatedGenerator<ProgramParams> = {
  id: 'structures-inspection-program',
  label: 'Simulated inspection program (building records, evaluators, requests and traps)',
  params: ProgramParams,
  generate(p) {
    const program = buildProgram(p)
    const at = (m: number): string =>
      new Date(Date.parse(p.start) + m * 60_000).toISOString().replace('.000Z', 'Z')
    const base = damageStatesGenerator.generate(p)
    return [
      ...base,
      {
        id: 'inspection-records',
        kind: 'features',
        label: `Observed conditions for each ${p.city} building, simulated records`,
        data: {
          type: 'FeatureCollection',
          features: program.records.map((r) => {
            const b = program.buildings.find((x) => x.id === r.id)!
            return {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
              properties: {
                id: r.id,
                name: r.name,
                constructionType: r.constructionType,
                conditions: r.conditions,
              },
            }
          }),
        },
      },
      {
        id: 'inspection-evaluators',
        kind: 'text',
        label: `Evaluators available to ${p.city}, simulated roster`,
        data: program.evaluators.map((e) => ({
          t: at(e.availableFromMinute),
          title: `${e.id} ${e.name}`,
          text: `${e.name}, ${e.qualification}, available from ${at(e.availableFromMinute)}.`,
        })),
      },
      {
        id: 'inspection-requests',
        kind: 'text',
        label: `Requests and reports to the ${p.city} program, simulated`,
        data: program.requests.map((r) => ({
          t: at(r.atMinute),
          title: `From ${r.from}`,
          text: r.text,
        })),
      },
      {
        id: 'inspection-traps',
        kind: 'features',
        label: `Traps the facilitator introduced, simulated ground truth`,
        data: metricFile(
          'events',
          program.requests
            .filter((r) => r.trap)
            .map((r, i) => ({
              id: `trap-${i + 1}`,
              time: at(r.atMinute),
              kind: 'trap',
              area: p.city,
              attrs: { trap: r.trap, buildingId: r.buildingId ?? '' },
            })),
        ),
      },
    ]
  },
}

/** Register the generators once (the module loads from generator-modules.ts and from tests). */
for (const g of [
  monitoringGenerator,
  damageStatesGenerator,
  siteEventGenerator,
  inspectionProgramGenerator,
] as const)
  if (!generatorIds().includes(g.id)) registerGenerator(g as SimulatedGenerator)
