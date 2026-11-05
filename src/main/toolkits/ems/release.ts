// Release simulation (spec 0456 FR-9b): a material, a container and a wind give the isolation
// zone, the downwind protective action zone for each stretch of wind, and when the wind would carry
// the plume front to each place. The distances are never looked up: they are the numbers the
// author entered (with the guidebook edition) or invented values for a fictional material. The
// arrival time is distance along the wind divided by wind speed, a simple relation and not a
// dispersion model.
import { z } from 'zod'
import {
  downwindBearing,
  insideIsolation,
  insideProtective,
  offsetAt,
  zoneGeoJson,
  type ZoneInput,
} from '../../render/figures/hazmat/geometry'

const Dist = z.number().positive().max(1_000_000)
const Wind = z.object({
  fromDeg: z.number().min(0).max(360),
  speed: z.number().min(0).max(300),
  unit: z.enum(['mph', 'kt', 'm/s', 'km/h']).default('mph'),
})

export const ReleaseParams = z
  .object({
    incident: z.string().min(1).max(120),
    material: z.string().min(1).max(120),
    container: z.string().min(1).max(120),
    amount: z.string().min(1).max(80),
    distanceSource: z.enum(['entered', 'fictional']),
    edition: z.string().max(80).optional(),
    isolationDistance: Dist,
    protectiveDistance: Dist,
    unit: z.enum(['ft', 'm', 'mi', 'km']),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    startTime: z.string().datetime(),
    durationMinutes: z.number().int().min(10).max(1440).default(120),
    wind: Wind,
    /** Wind changes: from `atMinutes` on, the wind is as given (speed defaults to the last). */
    shifts: z
      .array(
        z.object({
          atMinutes: z.number().min(1).max(1440),
          fromDeg: z.number().min(0).max(360),
          speed: z.number().min(0).max(300).optional(),
        }),
      )
      .max(6)
      .default([]),
    places: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          bearingDeg: z.number().min(0).max(360),
          distance: z.number().min(0).max(1_000_000),
        }),
      )
      .max(12)
      .default([]),
  })
  .refine((d) => d.distanceSource !== 'entered' || !!d.edition?.trim(), {
    message: 'distances entered from a guidebook need the edition they came from',
    path: ['edition'],
  })
export type ReleaseParams = z.infer<typeof ReleaseParams>

export interface WindSegment {
  startMinutes: number
  endMinutes: number
  fromDeg: number
  speed: number
  unit: 'mph' | 'kt' | 'm/s' | 'km/h'
}

export interface Exposure {
  place: string
  zone: 'isolation' | 'protective_action'
  segment: number
  /** Minutes after the release the plume front would arrive; null in calm wind. */
  arrivesAtMinutes: number | null
}

const MS_PER: Record<WindSegment['unit'], number> = {
  mph: 0.44704,
  kt: 0.514444,
  'm/s': 1,
  'km/h': 1 / 3.6,
}
const METERS_PER = { ft: 0.3048, m: 1, mi: 1609.344, km: 1000 } as const

export function windSegments(p: ReleaseParams): WindSegment[] {
  const shifts = [...p.shifts].sort((a, b) => a.atMinutes - b.atMinutes)
  const segs: WindSegment[] = []
  let cur = { fromDeg: p.wind.fromDeg, speed: p.wind.speed }
  let start = 0
  for (const s of shifts) {
    if (s.atMinutes >= p.durationMinutes) break
    segs.push({ startMinutes: start, endMinutes: s.atMinutes, ...cur, unit: p.wind.unit })
    cur = { fromDeg: s.fromDeg, speed: s.speed ?? cur.speed }
    start = s.atMinutes
  }
  segs.push({ startMinutes: start, endMinutes: p.durationMinutes, ...cur, unit: p.wind.unit })
  return segs
}

export const zoneOfSegment = (p: ReleaseParams, s: WindSegment): ZoneInput => ({
  windFromDeg: s.fromDeg,
  isolationDistance: p.isolationDistance,
  protectiveDistance: p.protectiveDistance,
})

function arrival(
  p: ReleaseParams,
  s: WindSegment,
  bearing: number,
  distance: number,
): number | null {
  const pt = offsetAt(bearing, distance)
  const b = (downwindBearing(s.fromDeg) * Math.PI) / 180
  const along = (pt.x * Math.sin(b) + pt.y * Math.cos(b)) * METERS_PER[p.unit]
  const speed = s.speed * MS_PER[s.unit]
  if (speed < 0.5) return null
  return Math.round((s.startMinutes + Math.max(0, along) / speed / 60) * 10) / 10
}

/** Which places each stretch of wind puts in a zone, and when the plume front would arrive. */
export function exposures(p: ReleaseParams): Exposure[] {
  const out: Exposure[] = []
  windSegments(p).forEach((s, i) => {
    const zone = zoneOfSegment(p, s)
    for (const place of p.places) {
      const pt = offsetAt(place.bearingDeg, place.distance)
      const inIso = insideIsolation(pt, zone)
      if (!inIso && !insideProtective(pt, zone)) continue
      out.push({
        place: place.name,
        zone: inIso ? 'isolation' : 'protective_action',
        segment: i,
        arrivesAtMinutes: arrival(p, s, place.bearingDeg, place.distance),
      })
    }
  })
  return out
}

/** The zones of every wind segment as one GeoJSON collection, each feature with its time span. */
export function zoneFeatures(p: ReleaseParams): { type: 'FeatureCollection'; features: unknown[] } {
  const t0 = Date.parse(p.startTime)
  const features = windSegments(p).flatMap((s, i) => {
    const start = new Date(t0 + s.startMinutes * 60_000).toISOString()
    const end = new Date(t0 + s.endMinutes * 60_000).toISOString()
    return zoneFeatureList(p, s).map((f) => {
      const feat = f as { properties: Record<string, unknown> }
      return {
        ...feat,
        properties: {
          ...feat.properties,
          start,
          end,
          segment: i,
          material: p.material,
          windFromDeg: s.fromDeg,
        },
      }
    })
  })
  return { type: 'FeatureCollection', features }
}

const zoneFeatureList = (p: ReleaseParams, s: WindSegment): unknown[] =>
  zoneGeoJson(p.lat, p.lon, zoneOfSegment(p, s), p.unit).features
