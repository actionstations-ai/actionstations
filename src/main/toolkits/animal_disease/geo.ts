// Distances and a local flat projection for premises, in kilometers. Zones are sized in
// kilometers from the response plans, so the checks use great-circle distance and the figures
// use the local projection around the scenario's center.

export interface LatLon {
  lat: number
  lon: number
}

const EARTH_RADIUS_KM = 6371.0088
const rad = (d: number): number => (d * Math.PI) / 180

/** Great-circle distance in kilometers. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Local east and north offsets in kilometers from `origin` (equirectangular; fine at county scale). */
export function toLocalKm(origin: LatLon, p: LatLon): { x: number; y: number } {
  return {
    x: rad(p.lon - origin.lon) * EARTH_RADIUS_KM * Math.cos(rad(origin.lat)),
    y: rad(p.lat - origin.lat) * EARTH_RADIUS_KM,
  }
}

/** The point `eastKm` east and `northKm` north of `origin`. */
export function fromLocalKm(origin: LatLon, eastKm: number, northKm: number): LatLon {
  return {
    lat: origin.lat + (northKm / EARTH_RADIUS_KM) * (180 / Math.PI),
    lon: origin.lon + (eastKm / (EARTH_RADIUS_KM * Math.cos(rad(origin.lat)))) * (180 / Math.PI),
  }
}

/** A circle of `radiusKm` around `center` as a closed ring of [lon, lat] points. */
export function circleRing(center: LatLon, radiusKm: number, steps = 48): [number, number][] {
  const ring: [number, number][] = []
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps
    const p = fromLocalKm(center, radiusKm * Math.cos(a), radiusKm * Math.sin(a))
    ring.push([Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6])
  }
  ring.push(ring[0]!)
  return ring
}
