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
