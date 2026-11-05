// A simulated building list for a post-earthquake evaluation program (spec 0471 FR-7): fictional
// buildings of several types, shaking intensity that falls with distance from the strongest
// shaking, and a damage state drawn from a simple fragility relation of intensity and type. The
// damage state is the ground truth a team's placards are compared with (green INSPECTED, yellow
// RESTRICTED USE, red UNSAFE). It is a plausible-draw simulator, not a loss model: the logistic
// medians below are invented exercise values, chosen so that the share of buildings placarded
// yellow and red rises with intensity and is higher for weaker construction.
import { z } from 'zod'
import type { PRIORITIES } from '../../render/figures/structures/common'
import { intensityAt } from '../geo/simulate/models'
import { createStructuresRng } from './rng'

export const BUILDING_TYPES = [
  'wood_frame',
  'unreinforced_masonry',
  'reinforced_concrete',
  'steel_frame',
  'tilt_up',
] as const
export type BuildingType = (typeof BUILDING_TYPES)[number]

export const TYPE_LABEL: Record<BuildingType, string> = {
  wood_frame: 'Wood frame',
  unreinforced_masonry: 'Unreinforced masonry',
  reinforced_concrete: 'Reinforced concrete',
  steel_frame: 'Steel frame',
  tilt_up: 'Tilt-up concrete',
}

/**
 * Invented exercise medians (MMI) at which the chance of at least the state is one half. Weaker
 * construction has lower medians; "severe" (UNSAFE) needs more shaking than "moderate"
 * (RESTRICTED USE).
 */
export const FRAGILITY: Record<BuildingType, { moderate: number; severe: number }> = {
  unreinforced_masonry: { moderate: 6.8, severe: 8.0 },
  tilt_up: { moderate: 7.2, severe: 8.4 },
  wood_frame: { moderate: 7.8, severe: 9.2 },
  reinforced_concrete: { moderate: 7.8, severe: 9.0 },
  steel_frame: { moderate: 8.2, severe: 9.6 },
}
const SLOPE = 1.6

export type TruePlacard = 'INSPECTED' | 'RESTRICTED USE' | 'UNSAFE'

const logistic = (x: number): number => 1 / (1 + Math.exp(-x))

/** Chance that a building of this type at this intensity is damaged at least moderately, and severely. */
export function damageChances(
  type: BuildingType,
  mmi: number,
): { moderate: number; severe: number } {
  const f = FRAGILITY[type]
  return {
    moderate: logistic(SLOPE * (mmi - f.moderate)),
    severe: logistic(SLOPE * (mmi - f.severe)),
  }
}

export const DamageParams = z.object({
  /** Fictional city name for labels. */
  city: z.string().min(1).max(80).default('Westport'),
  buildingCount: z.number().int().min(10).max(300).default(300),
  /** Local meters across the evaluated area. */
  widthM: z.number().min(200).max(20_000).default(4000),
  heightM: z.number().min(200).max(20_000).default(3000),
  /** Where the strongest shaking is, in local meters from the lower left corner. */
  peakAt: z.tuple([z.number(), z.number()]).default([1200, 1000]),
  /** Intensity (MMI) at the peak, and how much it falls per kilometer. */
  peakMmi: z.number().min(3).max(11).default(8.5),
  fallPerKm: z.number().min(0).max(3).default(0.6),
  /**
   * Take the shaking from a simulated earthquake of this magnitude at `peakAt` (the earth science
   * simulator's intensity relation) instead of `peakMmi` and `fallPerKm`.
   */
  earthquakeMagnitude: z.number().min(3).max(9.5).optional(),
  /**
   * A ShakeMap intensity grid (north row first, as the earth science connector gives it); when
   * present it gives the shaking at each building and overrides the other shaking settings.
   */
  shakeGrid: z
    .object({
      west: z.number(),
      south: z.number(),
      east: z.number(),
      north: z.number(),
      cols: z.number().int().min(1).max(2000),
      rows: z.number().int().min(1).max(2000),
      values: z.array(z.number()).max(4_000_000),
    })
    .refine((g) => g.values.length === g.cols * g.rows, {
      message: 'the grid size does not match its values',
    })
    .optional(),
  /** Lower left corner and meters per degree, to place buildings on a map. */
  origin: z
    .tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)])
    .default([-81.69, 41.48]),
  start: z.string().default('2026-11-06T08:00:00Z'),
  seed: z
    .number()
    .int()
    .min(0)
    .max(2 ** 31)
    .default(11),
})
export type DamageParams = z.infer<typeof DamageParams>

export interface SimBuilding {
  id: string
  name: string
  type: BuildingType
  priority: (typeof PRIORITIES)[number]
  /** Local meters from the lower left corner. */
  x: number
  y: number
  lon: number
  lat: number
  mmi: number
  /** The ground truth a correct evaluation arrives at. */
  truth: TruePlacard
}

const TYPE_MIX: [BuildingType, number][] = [
  ['wood_frame', 0.45],
  ['unreinforced_masonry', 0.15],
  ['reinforced_concrete', 0.15],
  ['steel_frame', 0.1],
  ['tilt_up', 0.15],
]

function drawType(u: number): BuildingType {
  let acc = 0
  for (const [t, w] of TYPE_MIX) {
    acc += w
    if (u < acc) return t
  }
  return 'wood_frame'
}

/** Intensity from a north-first grid at a point; outside the grid the nearest edge cell is used. */
function gridMmi(g: NonNullable<DamageParams['shakeGrid']>, lon: number, lat: number): number {
  const col = Math.min(
    g.cols - 1,
    Math.max(0, Math.floor(((lon - g.west) / (g.east - g.west)) * g.cols)),
  )
  const row = Math.min(
    g.rows - 1,
    Math.max(0, Math.floor(((g.north - lat) / (g.north - g.south)) * g.rows)),
  )
  return g.values[row * g.cols + col]!
}

/** Shaking intensity at a point, from a grid, an earthquake or a peak with a fall; never below 2. */
export function mmiAt(p: DamageParams, x: number, y: number, lon?: number, lat?: number): number {
  if (p.shakeGrid && lon !== undefined && lat !== undefined)
    return Math.max(2, gridMmi(p.shakeGrid, lon, lat))
  const km = Math.hypot(x - p.peakAt[0], y - p.peakAt[1]) / 1000
  if (p.earthquakeMagnitude !== undefined)
    return Math.max(2, intensityAt(p.earthquakeMagnitude, km))
  return Math.max(2, p.peakMmi - p.fallPerKm * km)
}

const M_PER_DEG_LAT = 111_320

export function simulateBuildings(raw: z.input<typeof DamageParams>): SimBuilding[] {
  const p = DamageParams.parse(raw)
  const rng = createStructuresRng(p.seed)
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((p.origin[1] * Math.PI) / 180)
  const out: SimBuilding[] = []
  for (let i = 0; i < p.buildingCount; i++) {
    const x = Math.round(rng.next() * p.widthM)
    const y = Math.round(rng.next() * p.heightM)
    const type = drawType(rng.next())
    const roll = rng.next()
    const priority =
      roll < 0.03 ? 'hospital' : roll < 0.06 ? 'shelter' : roll < 0.11 ? 'school' : 'other'
    const lon = Math.round((p.origin[0] + x / mPerDegLon) * 1e5) / 1e5
    const lat = Math.round((p.origin[1] + y / M_PER_DEG_LAT) * 1e5) / 1e5
    const mmi = Math.round((mmiAt(p, x, y, lon, lat) + 0.3 * rng.normal()) * 10) / 10
    const c = damageChances(type, mmi)
    const draw = rng.next()
    const truth: TruePlacard =
      draw < c.severe ? 'UNSAFE' : draw < c.moderate ? 'RESTRICTED USE' : 'INSPECTED'
    const n = String(i + 1).padStart(4, '0')
    out.push({
      id: `B-${n}`,
      name:
        priority === 'hospital'
          ? `${p.city} clinic ${n}`
          : priority === 'shelter'
            ? `${p.city} shelter ${n}`
            : priority === 'school'
              ? `${p.city} school ${n}`
              : `${TYPE_LABEL[type]} building ${n}`,
      type,
      priority,
      x,
      y,
      lon,
      lat,
      mmi,
      truth,
    })
  }
  return out
}

/** The share of buildings in each true placard state. */
export function truthShares(buildings: readonly SimBuilding[]): Record<TruePlacard, number> {
  const n = Math.max(buildings.length, 1)
  const count = (s: TruePlacard): number => buildings.filter((b) => b.truth === s).length / n
  return {
    INSPECTED: count('INSPECTED'),
    'RESTRICTED USE': count('RESTRICTED USE'),
    UNSAFE: count('UNSAFE'),
  }
}
