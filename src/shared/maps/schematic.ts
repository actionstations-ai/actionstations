// A schematic frame for places on a geographic map (#500): the places placed by their latitude
// and longitude in a box that fits them, with no basemap. Devices and printed Locations pages use
// it where a rendered basemap is not available, so every label stays exact text.

export interface GeoLike {
  lat: number
  lon: number
}

export interface SchematicPoint {
  /** Percent from the left edge, 0 to 100. */
  x: number
  /** Percent from the top edge, 0 to 100. */
  y: number
}

/** Margin kept free around the outermost places, in percent. */
export const SCHEMATIC_MARGIN = 10
/** Width to height of the frame. */
export const SCHEMATIC_ASPECT = 4 / 3

/**
 * Places in a 4:3 frame. Longitude is scaled by the cosine of the middle latitude so distances
 * look right. One place sits in the middle. The result is in the same order as the input.
 */
export function schematicPoints(places: readonly GeoLike[]): SchematicPoint[] {
  if (places.length === 0) return []
  const lats = places.map((p) => p.lat)
  const lons = places.map((p) => p.lon)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const spanX = Math.max((maxLon - minLon) * cos, 1e-9)
  const spanY = Math.max(maxLat - minLat, 1e-9)
  // Fit the larger of the two spans; the frame is wider than tall.
  const inner = 100 - 2 * SCHEMATIC_MARGIN
  const scale = Math.min(inner / spanX, inner / SCHEMATIC_ASPECT / spanY)
  const usedW = spanX * scale
  const usedH = spanY * scale
  const left = (100 - usedW) / 2
  const top = (100 / SCHEMATIC_ASPECT - usedH) / 2
  const single = places.length === 1 || (maxLat === minLat && maxLon === minLon)
  return places.map((p) =>
    single
      ? { x: 50, y: 50 }
      : {
          x: round(left + (p.lon - minLon) * cos * scale),
          y: round(((top + (maxLat - p.lat) * scale) * 100) / (100 / SCHEMATIC_ASPECT)),
        },
  )
}

const round = (n: number): number => Math.round(n * 100) / 100

/** "47.4502° N, 122.3088° W" for a place list. */
export function formatLatLon(p: GeoLike): string {
  const ns = p.lat >= 0 ? 'N' : 'S'
  const ew = p.lon >= 0 ? 'E' : 'W'
  return `${Math.abs(p.lat).toFixed(4)}° ${ns}, ${Math.abs(p.lon).toFixed(4)}° ${ew}`
}
