// Geometry of an isolation and protective action zone (spec 0456 FR-6). The initial isolation zone
// is a circle around the release; the protective action zone is a square whose side is the
// protective action distance, centred across the wind and running downwind from the release, as
// the guidebook draws it (check your edition). Pure and unit-agnostic: distances share one unit.

export interface Point {
  /** East, in the unit of the distances. */
  x: number
  /** North, in the unit of the distances. */
  y: number
}

export interface ZoneInput {
  /** Compass bearing the wind blows FROM, degrees clockwise from north. */
  windFromDeg: number
  isolationDistance: number
  protectiveDistance: number
}

/** Bearing the plume travels toward. */
export const downwindBearing = (windFromDeg: number): number =>
  (((windFromDeg + 180) % 360) + 360) % 360

/** Offset of a point at a compass bearing and distance from the release. */
export function offsetAt(bearingDeg: number, distance: number): Point {
  const r = (bearingDeg * Math.PI) / 180
  return { x: distance * Math.sin(r), y: distance * Math.cos(r) }
}

/** The four corners of the protective action square, starting upwind-left and going round. */
export function protectiveSquare(z: ZoneInput): [Point, Point, Point, Point] {
  const b = (downwindBearing(z.windFromDeg) * Math.PI) / 180
  const down = { x: Math.sin(b), y: Math.cos(b) }
  const right = { x: Math.cos(b), y: -Math.sin(b) }
  const s = z.protectiveDistance
  const corner = (a: number, d: number): Point => ({
    x: right.x * a * s + down.x * d * s,
    y: right.y * a * s + down.y * d * s,
  })
  return [corner(-0.5, 0), corner(0.5, 0), corner(0.5, 1), corner(-0.5, 1)]
}

export const insideIsolation = (p: Point, z: ZoneInput): boolean =>
  Math.hypot(p.x, p.y) <= z.isolationDistance

export function insideProtective(p: Point, z: ZoneInput): boolean {
  const b = (downwindBearing(z.windFromDeg) * Math.PI) / 180
  const along = p.x * Math.sin(b) + p.y * Math.cos(b)
  const across = p.x * Math.cos(b) - p.y * Math.sin(b)
  const s = z.protectiveDistance
  return along >= 0 && along <= s && Math.abs(across) <= s / 2
}

/** A closed ring approximating the isolation circle, `steps` points. */
export function circleRing(radius: number, steps = 64): Point[] {
  const out: Point[] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    out.push({ x: radius * Math.sin(a), y: radius * Math.cos(a) })
  }
  return out
}

const METERS_PER: Record<string, number> = { ft: 0.3048, m: 1, mi: 1609.344, km: 1000 }

/** GeoJSON polygons of the two zones around a release at (lat, lon), for map overlays. */
export function zoneGeoJson(
  lat: number,
  lon: number,
  z: ZoneInput,
  unit: 'ft' | 'm' | 'mi' | 'km',
): { type: 'FeatureCollection'; features: unknown[] } {
  const toMeters = METERS_PER[unit]!
  const mPerDegLat = 111_320
  const mPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180)
  const ll = (p: Point): [number, number] => [
    Math.round((lon + (p.x * toMeters) / mPerDegLon) * 1e6) / 1e6,
    Math.round((lat + (p.y * toMeters) / mPerDegLat) * 1e6) / 1e6,
  ]
  const ring = (pts: Point[]): number[][][] => [[...pts.map(ll), ll(pts[0]!)]]
  const feature = (name: string, zone: string, pts: Point[]): unknown => ({
    type: 'Feature',
    properties: { name, zone },
    geometry: { type: 'Polygon', coordinates: ring(pts) },
  })
  return {
    type: 'FeatureCollection',
    features: [
      feature('Initial isolation zone', 'isolation', circleRing(z.isolationDistance)),
      feature('Protective action zone', 'protective_action', protectiveSquare(z)),
    ],
  }
}
