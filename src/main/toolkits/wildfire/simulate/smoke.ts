// A simple smoke rule for an exercise illustration (spec 0461 FR-10): a plume downwind of the
// burned area in three densities, and PM2.5 at fixed places from a Gaussian-like falloff along
// and across the wind. The AQI follows the EPA breakpoints in effect since 6 May 2024. This is
// not a dispersion model.
import { offsetM, lonLatOf, type LonLat } from './spread'

const rad = (d: number): number => (d * Math.PI) / 180
const BACKGROUND_PM25 = 4

export type SmokeDensity = 'light' | 'medium' | 'heavy'

/** Plume length in km and half-angle in degrees by density, for a fire of `acres`. */
const PLUME: Record<SmokeDensity, { km: number; half: number }> = {
  heavy: { km: 4, half: 12 },
  medium: { km: 10, half: 18 },
  light: { km: 24, half: 28 },
}

/** A wedge polygon downwind of `from`, for one density. Longer for a larger fire. */
export function plumeRing(
  from: LonLat,
  towardDeg: number,
  acres: number,
  density: SmokeDensity,
): LonLat[] {
  const grow = Math.min(2.5, Math.max(0.4, Math.sqrt(Math.max(acres, 1)) / 40))
  const { km, half } = PLUME[density]
  const len = km * grow * 1000
  const ring: LonLat[] = [from]
  for (let k = -3; k <= 3; k++) {
    const bearing = rad(towardDeg + (half * k) / 3)
    ring.push(lonLatOf(from, len * Math.sin(bearing), len * Math.cos(bearing)))
  }
  return ring
}

/** PM2.5 in micrograms per cubic meter at a place, from the burned area's center and the wind. */
export function pm25At(place: LonLat, source: LonLat, towardDeg: number, acres: number): number {
  const o = offsetM(source, place)
  const h = rad(towardDeg)
  const downKm = (o.x * Math.sin(h) + o.y * Math.cos(h)) / 1000
  const crossKm = (o.x * Math.cos(h) - o.y * Math.sin(h)) / 1000
  const emission = 2.5 * Math.sqrt(Math.max(acres, 0))
  const along = downKm >= 0 ? Math.exp(-downKm / 10) : 0.05 * Math.exp(downKm / 4)
  const spread = 0.3 * Math.max(downKm, 0) + 1.5
  const across = Math.exp(-((crossKm / spread) ** 2))
  return Math.round((BACKGROUND_PM25 + emission * along * across) * 10) / 10
}

const BREAKPOINTS: ReadonlyArray<[number, number, number, number]> = [
  [0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
]

/** The EPA AQI for a PM2.5 concentration (truncated to one decimal first), 0 to 500. */
export function aqiFromPm25(ugm3: number): number {
  const c = Math.floor(Math.max(0, ugm3) * 10) / 10
  for (const [cl, ch, il, ih] of BREAKPOINTS)
    if (c <= ch) return Math.round(((ih - il) / (ch - cl)) * (Math.max(c, cl) - cl) + il)
  return 500
}
