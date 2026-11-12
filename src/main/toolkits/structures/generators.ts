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
  description:
    'A sensor on a structure (crack width, tilt, settlement, shoring load, strain or vibration) drifts, then fails along the shape you choose, with dropouts. Writes the sensor series, and the failure onset, alarm and action crossings as scoring events.',
  toolkits: ['structures'],
  example: {
    sensorId: 'LC-14',
    sensorType: 'shoring_load',
    unit: 'kN',
    location: 'level 8, east bay',
    start: '2026-11-09T12:00:00Z',
    stepMinutes: 10,
    durationHours: 6,
    baseline: 120,
    driftPerHour: 1,
    noise: 2,
    failureOnsetHour: 3,
    failureShape: 'accelerating',
    failureMagnitude: 190,
    dropouts: [{ fromHour: 4, toHour: 4.5 }],
    alarmLevel: 150,
    actionLevel: 180,
    seed: 7,
  } satisfies z.input<typeof MonitoringParams>,
  fields: {
    sensorId: { label: 'Sensor id' },
    sensorType: { label: 'Sensor type' },
    unit: { label: 'Unit', help: 'Unit of the readings, e.g. kN, mm or degrees.' },
    location: { label: 'Location', help: 'Where the sensor is, as the site names it.' },
    start: { label: 'Start (UTC)' },
    stepMinutes: { label: 'Step (minutes)', help: 'Minutes between readings, 1 to 60.' },
    durationHours: { label: 'Length (hours)', help: '1 to 72.' },
    baseline: { label: 'Baseline', help: 'Reading at the start, in the unit.' },
    driftPerHour: {
      label: 'Drift per hour',
      help: 'Slow change per hour before the failure (curing, temperature, loading).',
    },
    noise: { label: 'Noise', help: 'Standard deviation of the noise, in the unit.' },
    failureOnsetHour: {
      label: 'Failure begins (hour)',
      help: 'Hours after the start; leave empty for a series with no failure.',
    },
    failureShape: { label: 'Failure shape' },
    failureMagnitude: {
      label: 'Failure magnitude',
      help: 'How far above the pre-failure level the reading is at the end of the series, in the unit.',
    },
    dropouts: {
      label: 'Dropouts',
      help: 'Each item: fromHour and toHour (hours after the start) when the sensor reports nothing.',
    },
    alarmLevel: { label: 'Alarm level', help: 'In the unit.' },
    actionLevel: { label: 'Action level', help: 'In the unit; at or above the alarm level.' },
    seed: { label: 'Seed', help: 'Any whole number; the same seed gives the same noise.' },
  },
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
  description:
    'A list of fictional buildings of several construction types with the shaking at each and a damage state drawn from a simple fragility relation. Writes the buildings as a map layer and the correct placard (INSPECTED, RESTRICTED USE or UNSAFE) for each as ground truth.',
  toolkits: ['structures', 'seismic'],
  example: {
    city: 'Westport',
    buildingCount: 40,
    widthM: 4000,
    heightM: 3000,
    peakAt: [1200, 1000],
    peakMmi: 8.5,
    fallPerKm: 0.6,
    origin: [-81.69, 41.48],
    start: '2026-11-06T08:00:00Z',
    seed: 11,
  } satisfies z.input<typeof DamageParams>,
  fields: {
    city: { label: 'City', help: 'Fictional city name used in the labels.' },
    buildingCount: { label: 'Buildings', help: 'Number of fictional buildings, 10 to 300.' },
    widthM: { label: 'Area width (m)', help: 'Meters across the evaluated area, 200 to 20,000.' },
    heightM: { label: 'Area height (m)', help: 'Meters north to south, 200 to 20,000.' },
    peakAt: {
      label: 'Strongest shaking at',
      help: 'Two numbers [east, north]: meters from the lower left corner of the area.',
    },
    peakMmi: {
      label: 'Peak intensity (MMI)',
      help: 'Modified Mercalli intensity at the peak, 3 to 11.',
    },
    fallPerKm: {
      label: 'Intensity fall per km',
      help: 'MMI lost per kilometer from the peak, 0 to 3.',
    },
    earthquakeMagnitude: {
      label: 'Earthquake magnitude',
      help: 'Optional, 3 to 9.5: take the shaking from a simulated earthquake at the peak point instead of the two settings above.',
    },
    shakeGrid: {
      label: 'ShakeMap grid',
      help: 'Optional intensity grid from the earth science toolkit: west, south, east, north, cols, rows and values (north row first, cols × rows numbers). Overrides the other shaking settings.',
    },
    origin: {
      label: 'Map origin',
      help: 'Two numbers [longitude, latitude] of the lower left corner, to place buildings on a map.',
    },
    start: { label: 'Program start (UTC)' },
    seed: { label: 'Seed', help: 'Any whole number; the same seed gives the same buildings.' },
  },
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
  description:
    'A collapse or injury at a work site with its clock: a first sign players could have seen, responders arriving, the reportable event and when the employer learned of it, and secondary hazards. Writes the timeline as ground truth for the timing measures.',
  toolkits: ['structures'],
  example: {
    site: 'Pier Street Mid-rise',
    start: '2026-11-09T12:00:00Z',
    collapseAtMinute: 0,
    reportedSign: { atMinute: -90, text: 'Shoring post on level 8 visibly bowed' },
    reportable: 'In-patient hospitalization',
    learnedAtMinute: 30,
    firstRespondersMinute: 9,
    secondaryHazards: [
      { hazard: 'Natural gas leak', atMinute: 20, controlledBy: 'structures_shutoff' },
    ],
  } satisfies z.input<typeof SiteEventParams>,
  fields: {
    site: { label: 'Site', help: 'Fictional site name.' },
    start: { label: 'Start (UTC)' },
    collapseAtMinute: {
      label: 'Collapse at (minute)',
      help: 'Minutes after the start that the collapse or injury happens.',
    },
    reportedSign: {
      label: 'First sign',
      help: 'Optional: atMinute (minutes after the start, may be negative) and text describing the sign players could have seen.',
    },
    reportable: {
      label: 'Reportable event',
      help: 'The OSHA-reportable outcome: a fatality must be reported within 8 hours, the others within 24.',
    },
    learnedAtMinute: {
      label: 'Employer learns at (minute)',
      help: 'Minutes after the start; the reporting clock starts here.',
    },
    firstRespondersMinute: {
      label: 'Responders arrive (minute)',
      help: 'Minutes after the start, 1 to 240.',
    },
    secondaryHazards: {
      label: 'Secondary hazards',
      help: 'Each item: hazard, atMinute, and controlledBy, the decision form kind that controls it (e.g. structures_shutoff).',
    },
  },
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
  description:
    'A full post-earthquake inspection program: the building list and damage states, what an evaluator would see in each building, an evaluator roster, requests from owners, neighbors and the EOC, and any traps you switch on. Writes the records, roster and requests, and the correct placards and traps as ground truth.',
  toolkits: ['structures', 'seismic'],
  example: {
    city: 'Westport',
    buildingCount: 40,
    widthM: 4000,
    heightM: 3000,
    peakAt: [1200, 1000],
    peakMmi: 8.5,
    fallPerKm: 0.6,
    origin: [-81.69, 41.48],
    start: '2026-11-06T08:00:00Z',
    seed: 11,
    evaluatorCount: 12,
    traps: { conflictingPlacards: true, unsafeAdjacent: false, ownerRefuses: true },
  } satisfies z.input<typeof ProgramParams>,
  fields: {
    city: { label: 'City', help: 'Fictional city name used in the labels.' },
    buildingCount: { label: 'Buildings', help: 'Number of fictional buildings, 10 to 300.' },
    widthM: { label: 'Area width (m)', help: 'Meters across the evaluated area, 200 to 20,000.' },
    heightM: { label: 'Area height (m)', help: 'Meters north to south, 200 to 20,000.' },
    peakAt: {
      label: 'Strongest shaking at',
      help: 'Two numbers [east, north]: meters from the lower left corner of the area.',
    },
    peakMmi: {
      label: 'Peak intensity (MMI)',
      help: 'Modified Mercalli intensity at the peak, 3 to 11.',
    },
    fallPerKm: {
      label: 'Intensity fall per km',
      help: 'MMI lost per kilometer from the peak, 0 to 3.',
    },
    earthquakeMagnitude: {
      label: 'Earthquake magnitude',
      help: 'Optional, 3 to 9.5: take the shaking from a simulated earthquake at the peak point instead of the two settings above.',
    },
    shakeGrid: {
      label: 'ShakeMap grid',
      help: 'Optional intensity grid from the earth science toolkit: west, south, east, north, cols, rows and values (north row first, cols × rows numbers). Overrides the other shaking settings.',
    },
    origin: {
      label: 'Map origin',
      help: 'Two numbers [longitude, latitude] of the lower left corner, to place buildings on a map.',
    },
    start: { label: 'Program start (UTC)' },
    seed: { label: 'Seed', help: 'Any whole number; the same seed gives the same buildings.' },
    evaluatorCount: { label: 'Evaluators', help: 'Evaluators on the roster, 2 to 40.' },
    traps: {
      label: 'Traps',
      help: 'Three true or false switches: conflictingPlacards (one condition placarded two ways), unsafeAdjacent (an unsafe building next to one being walked), ownerRefuses (an owner who refuses to leave). All off by default.',
    },
  },
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
