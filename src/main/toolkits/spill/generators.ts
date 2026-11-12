// The simulated-data generators of the spill and plume toolkit (spec 0455 FR-7, #771): a fictional
// release becomes a trajectory with an uncertainty envelope, a mass balance series and landfall
// notes, or a toxic plume becomes threat zones. They are the simple relations of simulate.ts, run
// by the case-data framework, which labels the result simulated and gives it no retrieval date.
import { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import { generatorIds, registerGenerator } from '../../case-data/generators'
import { trajectoryImportGenerator } from './trajectory-import'
import {
  PRODUCTS,
  STABILITY_CLASSES,
  currentVector,
  plumeFootprint,
  simulateSpill,
  windVector,
  type LatLon,
  type ProductId,
} from './simulate'

const LAT = z.number().min(-90).max(90)
const LON = z.number().min(-180).max(180)
const PRODUCT_IDS = Object.keys(PRODUCTS) as [ProductId, ...ProductId[]]
const r5 = (n: number): number => Math.round(n * 1e5) / 1e5
const iso = (ms: number): string => new Date(ms).toISOString()

/** A circle of `radiusM` meters around a point as a closed GeoJSON ring. */
function circle(center: LatLon, radiusM: number, sides = 48): number[][][] {
  const ring: number[][] = []
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides
    const dn = radiusM * Math.cos(a)
    const de = radiusM * Math.sin(a)
    ring.push([
      r5(center.lon + de / (111_320 * Math.cos((center.lat * Math.PI) / 180))),
      r5(center.lat + dn / 110_540),
    ])
  }
  return [[...ring, ring[0]!]]
}

// ---- oil spill -----------------------------------------------------------------------------------

export const SpillSimulationParams = z.object({
  /** Exercise (case) time of the release. */
  start: z.iso.datetime({ offset: true }),
  origin: z.object({ lat: LAT, lon: LON }),
  product: z.enum(PRODUCT_IDS),
  volume: z.number().positive().max(1e8),
  unit: z.enum(['bbl', 'gal', 'm3']).default('bbl'),
  releaseHours: z.number().min(0).max(240).default(0),
  hours: z.number().positive().max(240).default(72),
  stepHours: z.number().positive().max(24).default(1),
  /** The direction the wind blows from (degrees) and its speed. */
  windFromDeg: z.number().min(0).max(360),
  windMs: z.number().min(0).max(60),
  /** The direction the current flows toward (degrees) and its speed. */
  currentTowardDeg: z.number().min(0).max(360).default(0),
  currentMs: z.number().min(0).max(5).default(0),
  seaStateFactor: z.number().min(0.1).max(4).default(1),
  recovery: z
    .object({ startHour: z.number().min(0).max(240), perHour: z.number().min(0).max(1e7) })
    .optional(),
  shorelines: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().min(1).max(80),
        esi: z.string().max(40).optional(),
        points: z
          .array(z.object({ lat: LAT, lon: LON }))
          .min(2)
          .max(2000),
      }),
    )
    .max(100)
    .default([]),
  /** Notifications the plan requires, in minutes after the release, for scoring timeliness. */
  notifications: z
    .array(z.object({ who: z.string().min(1).max(80), minutes: z.number().min(0).max(14_400) }))
    .max(12)
    .default([]),
})
export type SpillSimulationParams = z.infer<typeof SpillSimulationParams>

export function generateSpill(p: SpillSimulationParams): GeneratedDataset[] {
  const startMs = Date.parse(p.start)
  const result = simulateSpill({
    origin: p.origin,
    product: p.product,
    volume: p.volume,
    unit: p.unit,
    releaseHours: p.releaseHours,
    hours: p.hours,
    stepHours: p.stepHours,
    wind: windVector(p.windFromDeg, p.windMs),
    current: currentVector(p.currentTowardDeg, p.currentMs),
    seaStateFactor: p.seaStateFactor,
    ...(p.recovery ? { recovery: p.recovery } : {}),
    shorelines: p.shorelines,
  })
  const at = (hour: number): number => startMs + hour * 3_600_000
  const features: unknown[] = []
  result.steps.forEach((s, i) => {
    const start = iso(at(s.hour))
    const end = iso(at(result.steps[i + 1]?.hour ?? s.hour + p.stepHours))
    if (s.remaining > 0) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: circle(s.center, Math.max(s.radiusM, 50)) },
        properties: {
          name: 'Best estimate',
          kind: 'best_estimate',
          start,
          end,
          radiusM: Math.round(s.radiusM),
        },
      })
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: circle(s.center, Math.max(s.uncertaintyM, 100)) },
        properties: {
          name: 'Uncertainty',
          kind: 'uncertainty',
          start,
          end,
          radiusM: Math.round(s.uncertaintyM),
        },
      })
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r5(s.center.lon), r5(s.center.lat)] },
      properties: { name: 'Center of the oil', kind: 'centroid', start, end },
    })
  })
  features.push({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: result.steps.map((s) => [r5(s.center.lon), r5(s.center.lat)]),
    },
    properties: { name: 'Track of the center', kind: 'track' },
  })
  const range = { start: iso(startMs), end: iso(at(result.steps[result.steps.length - 1]!.hour)) }
  const round = (n: number): number => Math.round(n * 100) / 100
  const landfalls = result.landfalls.map((l) => {
    const shore = p.shorelines.find((s) => s.id === l.shorelineId)!
    const best = Number.isFinite(l.bestEstimateHour)
      ? `best estimate hour ${l.bestEstimateHour}`
      : 'not reached in the best estimate'
    return {
      t: iso(at(l.hour)),
      title: `Oil may reach ${shore.name}${shore.esi ? ` (ESI ${shore.esi})` : ''}`,
      text: `Earliest contact, with the uncertainty envelope: hour ${l.hour} after the release (${iso(at(l.hour))}); ${best}. Simulated for the exercise.`,
    }
  })
  // Scoring inputs (see CaseDataset.shape): when the oil reaches each shoreline, and when each
  // required notification is due.
  const arrival = p.shorelines.map((sh) => {
    const hit = result.landfalls.find((l) => l.shorelineId === sh.id)
    return {
      zone: sh.name,
      quantity: 'oil_presence',
      points: result.steps.map((st) => ({
        time: iso(at(st.hour)),
        value: hit && st.hour >= hit.hour ? 1 : 0,
      })),
    }
  })
  const deadlines = p.notifications.map((nt, i) => ({
    id: `notify-${i + 1}`,
    time: iso(startMs + nt.minutes * 60_000),
    kind: 'notification_due',
    attrs: { who: nt.who },
  }))
  return [
    {
      id: 'spill-trajectory',
      label: `Simulated trajectory, ${PRODUCTS[p.product].label}`,
      kind: 'features',
      data: { type: 'FeatureCollection', features },
      range,
    },
    {
      id: 'spill-mass-balance',
      label: `Simulated mass balance, ${PRODUCTS[p.product].label}`,
      kind: 'series',
      data: result.steps.map((s) => ({
        t: iso(at(s.hour)),
        v: {
          released: round(s.released),
          evaporated: round(s.evaporated),
          dispersed: round(s.dispersed),
          recovered: round(s.recovered),
          remaining: round(s.remaining),
        },
      })),
      range,
      unit: p.unit,
    },
    ...(arrival.length
      ? [
          {
            id: 'spill-arrival',
            label: 'Simulated oil arrival by shoreline (for scoring)',
            kind: 'series' as const,
            shape: 'modeled-series' as const,
            data: arrival,
            range,
          },
        ]
      : []),
    ...(deadlines.length
      ? [
          {
            id: 'notification-deadlines',
            label: 'Required notification times (for scoring)',
            kind: 'reports' as const,
            shape: 'ground-truth' as const,
            data: deadlines,
            range,
          },
        ]
      : []),
    ...(landfalls.length
      ? [
          {
            id: 'spill-landfall',
            label: 'Simulated landfall times',
            kind: 'text' as const,
            data: landfalls,
            range,
          },
        ]
      : []),
  ]
}

export const spillSimulationGenerator: SimulatedGenerator<SpillSimulationParams> = {
  id: 'spill-simulation',
  label: 'Simulated oil spill (drift, weathering, landfall)',
  params: SpillSimulationParams,
  description:
    'A fictional release drifts with the current and a share of the wind, spreads and weathers, with an uncertainty envelope and the landfall time on each shoreline you draw. Writes the trajectory map, a mass balance series, landfall notes, and the oil arrival and notification deadlines the timing measures read.',
  toolkits: ['spill_plume'],
  example: {
    start: '2026-11-04T12:00:00Z',
    origin: { lat: 30.3, lon: -88.1 },
    product: 'diesel',
    volume: 4200,
    unit: 'bbl',
    releaseHours: 4,
    hours: 48,
    stepHours: 2,
    windFromDeg: 135,
    windMs: 6,
    currentTowardDeg: 300,
    currentMs: 0.2,
    seaStateFactor: 1,
    recovery: { startHour: 6, perHour: 60 },
    shorelines: [
      {
        id: 'marsh',
        name: 'Heron Bay marsh',
        esi: '10A',
        points: [
          { lat: 30.4, lon: -88.4 },
          { lat: 30.4, lon: -87.9 },
        ],
      },
    ],
    notifications: [
      { who: 'National Response Center', minutes: 30 },
      { who: 'State environmental agency', minutes: 60 },
    ],
  } satisfies z.input<typeof SpillSimulationParams>,
  fields: {
    start: { label: 'Release time (UTC)' },
    origin: { label: 'Release point', help: 'An object with lat and lon in decimal degrees.' },
    product: { label: 'Product' },
    volume: { label: 'Volume', help: 'Total volume released, in the unit below.' },
    unit: { label: 'Volume unit', help: 'bbl (barrels), gal (US gallons) or m3 (cubic meters).' },
    releaseHours: {
      label: 'Release duration (hours)',
      help: '0 for an instant release, up to 240.',
    },
    hours: { label: 'Hours to model', help: 'Up to 240.' },
    stepHours: { label: 'Step (hours)', help: 'Hours between output times, up to 24.' },
    windFromDeg: { label: 'Wind from (degrees)', help: 'Direction the wind blows from, 0 to 360.' },
    windMs: { label: 'Wind speed (m/s)', help: '0 to 60.' },
    currentTowardDeg: {
      label: 'Current toward (degrees)',
      help: 'Direction the current flows toward, 0 to 360.',
    },
    currentMs: { label: 'Current speed (m/s)', help: '0 to 5.' },
    seaStateFactor: {
      label: 'Sea state factor',
      help: 'Scales spreading and dispersion; 1 is moderate, 0.1 to 4.',
    },
    recovery: {
      label: 'Recovery',
      help: 'Optional: startHour (hours after the release) and perHour, the volume skimmers recover each hour in the volume unit.',
    },
    shorelines: {
      label: 'Shorelines',
      help: 'Each item: id, name, optional esi class (such as 10A), and points, a line of at least two {lat, lon}.',
    },
    notifications: {
      label: 'Required notifications',
      help: 'Each item: who (as the decision form names the party, such as National Response Center) and minutes after the release the notice is due.',
    },
  },
  generate: generateSpill,
}

// ---- toxic plume ---------------------------------------------------------------------------------

export const ToxicPlumeParams = z.object({
  start: z.iso.datetime({ offset: true }),
  source: z.object({ lat: LAT, lon: LON }),
  releaseGramsPerSecond: z.number().positive().max(1e7),
  windFromDeg: z.number().min(0).max(360),
  windMs: z.number().min(0.5).max(40),
  stability: z.enum(STABILITY_CLASSES).default('D'),
  molecularWeight: z.number().positive().max(1000),
  substance: z.string().trim().min(1).max(60),
  levels: z
    .array(z.object({ label: z.string().min(1).max(20), ppm: z.number().positive().max(1e6) }))
    .min(1)
    .max(4),
  hours: z.number().positive().max(48).default(1),
})
export type ToxicPlumeParams = z.infer<typeof ToxicPlumeParams>

export function generatePlume(p: ToxicPlumeParams): GeneratedDataset[] {
  const zones = plumeFootprint({
    releaseGramsPerSecond: p.releaseGramsPerSecond,
    windMs: p.windMs,
    windFromDeg: p.windFromDeg,
    stability: p.stability,
    molecularWeight: p.molecularWeight,
    levels: p.levels,
  })
  const start = Date.parse(p.start)
  const range = { start: iso(start), end: iso(start + p.hours * 3_600_000) }
  const lonScale = 111_320 * Math.cos((p.source.lat * Math.PI) / 180)
  const features = zones
    .filter((z) => z.outline.length > 2)
    .map((z) => {
      const r = z.outline.map((q) => [
        r5(p.source.lon + q.east / lonScale),
        r5(p.source.lat + q.north / 110_540),
      ])
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...r, r[0]!]] },
        properties: {
          name: `${z.label} zone (${z.ppm} ppm or more)`,
          kind: 'threat_zone',
          level: z.label,
          ppm: z.ppm,
          distanceM: Math.round(z.distanceM),
          widthM: Math.round(z.widthM),
          start: range.start,
          end: range.end,
        },
      }
    })
  return [
    {
      id: 'plume-zones',
      label: `Simulated ${p.substance} plume zones`.slice(0, 120),
      kind: 'features',
      data: { type: 'FeatureCollection', features },
      range,
      area: { label: 'Plume extent' },
    },
  ]
}

export const toxicPlumeGenerator: SimulatedGenerator<ToxicPlumeParams> = {
  id: 'toxic-plume',
  label: 'Simulated toxic plume (Gaussian, threat zones by level)',
  params: ToxicPlumeParams,
  description:
    'A continuous ground-level release spreading downwind as a Gaussian plume. Writes the threat zones around the source for each concentration level you set, as an illustration and not a protective action distance.',
  toolkits: ['spill_plume', 'hazmat'],
  example: {
    start: '2026-11-04T12:00:00Z',
    source: { lat: 30.3, lon: -88.1 },
    releaseGramsPerSecond: 2000,
    windFromDeg: 250,
    windMs: 3,
    stability: 'D',
    molecularWeight: 70.9,
    substance: 'Chlorine',
    levels: [
      { label: 'Red', ppm: 20 },
      { label: 'Orange', ppm: 2 },
      { label: 'Yellow', ppm: 0.5 },
    ],
    hours: 1,
  } satisfies z.input<typeof ToxicPlumeParams>,
  fields: {
    start: { label: 'Release start (UTC)' },
    source: { label: 'Source', help: 'An object with lat and lon in decimal degrees.' },
    releaseGramsPerSecond: { label: 'Release rate (g/s)', help: 'Grams per second, steady.' },
    windFromDeg: { label: 'Wind from (degrees)', help: 'Direction the wind blows from, 0 to 360.' },
    windMs: { label: 'Wind speed (m/s)', help: '0.5 to 40.' },
    stability: {
      label: 'Stability class',
      help: 'Pasquill class: A (very unstable, sunny) to F (stable, clear night); D is neutral.',
    },
    molecularWeight: {
      label: 'Molecular weight (g/mol)',
      help: 'Used to convert to ppm, e.g. 70.9 for chlorine.',
    },
    substance: { label: 'Substance' },
    levels: {
      label: 'Concentration levels',
      help: 'One to four items: label (such as Red) and ppm; each draws a zone where the concentration is at or above it.',
    },
    hours: { label: 'Duration (hours)', help: 'How long the zones stand, up to 48.' },
  },
  generate: generatePlume,
}

export const SPILL_GENERATORS = [
  spillSimulationGenerator,
  toxicPlumeGenerator,
  trajectoryImportGenerator,
] as const

/** Register once at app start; registering again is a no-op. */
export function registerSpillGenerators(): void {
  const have = new Set(generatorIds())
  for (const g of SPILL_GENERATORS) if (!have.has(g.id)) registerGenerator(g as SimulatedGenerator)
}

registerSpillGenerators()
