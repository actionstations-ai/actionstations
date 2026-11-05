// Shared drawing for the earth science map figures (spec 0450 FR-8): a schematic map on an
// equirectangular projection (longitude scaled by the cosine of the middle latitude), with a
// frame, corner coordinates, a scale bar and a legend. There are no map tiles and no network: the
// figure draws only the layers its data carries (grids, areas, lines, points). Pure and
// deterministic like every figure kind.
import { z } from 'zod'
import { AXIS, GRID, INK, MUTED, SURFACE } from '../theme'
import { fmt, n, text, textWidth } from '../svg'

export const Lon = z.number().finite().min(-180).max(180)
export const Lat = z.number().finite().min(-90).max(90)
export const GeoPoint = z.object({ lon: Lon, lat: Lat })
export type GeoPoint = z.infer<typeof GeoPoint>

export const GeoLine = z.object({
  name: z.string().min(1).max(80).optional(),
  points: z.array(GeoPoint).min(2).max(1000),
})
export type GeoLine = z.infer<typeof GeoLine>

export const GeoRing = z.array(GeoPoint).min(3).max(1000)

export const NamedPlace = GeoPoint.extend({ name: z.string().min(1).max(80) })
export type NamedPlace = z.infer<typeof NamedPlace>

export interface Plot {
  x: number
  y: number
  w: number
  h: number
}

export interface Projection {
  px: (p: GeoPoint) => [number, number]
  /** Kilometers per pixel at the middle latitude. */
  kmPerPx: number
  plot: Plot
  west: number
  east: number
  south: number
  north: number
}

const KM_PER_DEG = 111.32

/** Fit the points into the plot box, keeping the aspect ratio, centered, with a margin. */
export function makeProjection(points: GeoPoint[], plot: Plot, margin = 0.08): Projection {
  const lons = points.map((p) => p.lon)
  const lats = points.map((p) => p.lat)
  let west = Math.min(...lons)
  let east = Math.max(...lons)
  let south = Math.min(...lats)
  let north = Math.max(...lats)
  if (east - west < 0.01) {
    west -= 0.05
    east += 0.05
  }
  if (north - south < 0.01) {
    south -= 0.05
    north += 0.05
  }
  const k = Math.cos((((south + north) / 2) * Math.PI) / 180)
  const spanX = (east - west) * k
  const spanY = north - south
  const scale = Math.min(plot.w / (spanX * (1 + 2 * margin)), plot.h / (spanY * (1 + 2 * margin)))
  const cx = (west + east) / 2
  const cy = (south + north) / 2
  const px = (p: GeoPoint): [number, number] => [
    plot.x + plot.w / 2 + (p.lon - cx) * k * scale,
    plot.y + plot.h / 2 - (p.lat - cy) * scale,
  ]
  const halfW = plot.w / 2 / (k * scale)
  const halfH = plot.h / 2 / scale
  return {
    px,
    kmPerPx: KM_PER_DEG / scale,
    plot,
    west: cx - halfW,
    east: cx + halfW,
    south: cy - halfH,
    north: cy + halfH,
  }
}

/** Great-circle distance in kilometers (haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLon = (b.lon - a.lon) * r
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const coord = (p: GeoPoint): string =>
  `${Math.abs(p.lat).toFixed(2)}° ${p.lat >= 0 ? 'N' : 'S'}, ${Math.abs(p.lon).toFixed(2)}° ${p.lon >= 0 ? 'E' : 'W'}`

/** Frame, corner coordinates and a scale bar around the projected area. */
export function mapChrome(proj: Projection, plot: Plot): string {
  let out = `<rect x="${n(plot.x)}" y="${n(plot.y)}" width="${n(plot.w)}" height="${n(plot.h)}" fill="#f6f3ea" stroke="${AXIS}" stroke-width="1.5"/>`
  const corner = (lat: number, lon: number): string =>
    `${Math.abs(lat).toFixed(1)}${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}${lon >= 0 ? 'E' : 'W'}`
  out += text(plot.x + 4, plot.y + 13, corner(proj.north, proj.west), { size: 10, fill: MUTED })
  out += text(plot.x + plot.w - 4, plot.y + plot.h - 5, corner(proj.south, proj.east), {
    size: 10,
    fill: MUTED,
    anchor: 'end',
  })
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
  const target = plot.w * 0.22 * proj.kmPerPx
  const km = steps.find((s) => s >= target) ?? 1000
  const len = km / proj.kmPerPx
  const x0 = plot.x + 12
  const y0 = plot.y + plot.h - 16
  out += `<path d="M${n(x0)} ${n(y0 - 4)}V${n(y0)}H${n(x0 + len)}V${n(y0 - 4)}" fill="none" stroke="${INK}" stroke-width="2"/>`
  out += text(x0, y0 - 8, `${km} km`, { size: 11, fill: INK })
  out += `<path d="M${n(plot.x + plot.w - 22)} ${n(plot.y + 36)}l6 -16l6 16l-6 -4z" fill="${INK}"/>`
  out += text(plot.x + plot.w - 16, plot.y + 50, 'N', { size: 10, anchor: 'middle', weight: 700 })
  return out
}

export function polyline(proj: Projection, pts: GeoPoint[], attrs: string, close = false): string {
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${n(proj.px(p)[0])} ${n(proj.px(p)[1])}`).join('')
  return `<path d="${d}${close ? 'Z' : ''}" ${attrs}/>`
}

/** A point label with a white halo so it stays legible over fills. */
export function label(
  x: number,
  y: number,
  s: string,
  o: { anchor?: 'start' | 'middle' | 'end' } = {},
): string {
  return text(x, y, s, {
    size: 11,
    weight: 600,
    anchor: o.anchor ?? 'start',
    extra: `stroke="${SURFACE}" stroke-width="3" paint-order="stroke"`,
  })
}

export function circleKm(proj: Projection, center: GeoPoint, radiusKm: number): string {
  const [cx, cy] = proj.px(center)
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radiusKm / proj.kmPerPx)}"`
}

export interface KeyItem {
  name: string
  swatch: (x: number, y: number) => string
}

/** A legend in rows below the map; returns the markup and its height. */
export function mapKey(items: KeyItem[], x0: number, y0: number, maxX: number) {
  let x = x0
  let y = y0
  let svg = ''
  for (const it of items) {
    const w = 30 + textWidth(it.name, 12) + 16
    if (x + w > maxX && x > x0) {
      x = x0
      y += 20
    }
    svg += it.swatch(x, y) + text(x + 26, y + 4, it.name, { size: 12, fill: MUTED })
    x += w
  }
  return { svg, height: items.length ? y - y0 + 22 : 0 }
}

export const gridLine = (x1: number, y1: number, x2: number, y2: number): string =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${GRID}" stroke-width="1"/>`

export const round1 = (v: number): string => fmt(Math.round(v * 10) / 10)
