// Shared drawing for the spill map figures (spec 0455 FR-5, #762): a plan view in longitude and
// latitude with equal scale on both axes, the shoreline drawn by ESI class, a scale bar and a
// north arrow. No base map tiles: a figure is drawn from case data and must render offline and
// identically every time. ESI classes rise in sensitivity with their number (1 least, 10 most),
// so a line's weight and dash both follow the class group, never color alone.
import { INK, MUTED, GRID } from '../theme'
import { esc, n, text } from '../svg'
import { distanceM, type LatLon } from '../../../toolkits/spill/simulate'

export type Pt = [number, number]

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Projection {
  x: (lon: number) => number
  y: (lat: number) => number
  /** Meters per pixel. */
  metersPerPx: number
}

/** A projection that fits the points into `rect` with equal scale and a margin. */
export function fit(points: readonly Pt[], rect: Rect, margin = 0.08): Projection {
  const lons = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  const lon0 = Math.min(...lons)
  const lon1 = Math.max(...lons)
  const lat0 = Math.min(...lats)
  const lat1 = Math.max(...lats)
  const midLat = (lat0 + lat1) / 2
  const k = Math.cos((midLat * Math.PI) / 180)
  const spanX = Math.max((lon1 - lon0) * k, 1e-4)
  const spanY = Math.max(lat1 - lat0, 1e-4)
  const scale = Math.min(rect.w / (spanX * (1 + 2 * margin)), rect.h / (spanY * (1 + 2 * margin)))
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const midLon = (lon0 + lon1) / 2
  return {
    x: (lon) => cx + (lon - midLon) * k * scale,
    y: (lat) => cy - (lat - midLat) * scale,
    metersPerPx: 111_195 / scale,
  }
}

export const pathOf = (pts: readonly Pt[], p: Projection, close = false): string =>
  pts.map((q, i) => `${i ? 'L' : 'M'}${n(p.x(q[0]))} ${n(p.y(q[1]))}`).join('') + (close ? 'Z' : '')

// ---- ESI classes ---------------------------------------------------------------------------------

export interface EsiStyle {
  group: 'low' | 'moderate' | 'high' | 'very_high'
  label: string
  color: string
  width: number
  dash: string | undefined
}

/** Group of an ESI code ("10A", "6B", "3"): by the number, 1 to 10. */
export function esiRank(code: string): number {
  const m = /^(\d{1,2})/.exec(code.trim())
  return m ? Math.min(10, Math.max(1, Number(m[1]))) : 0
}

const GROUPS: Record<number, EsiStyle> = {
  0: { group: 'low', label: 'Unclassified', color: '#594c3c', width: 1.5, dash: '1 3' },
  1: {
    group: 'low',
    label: 'Least sensitive (ESI 1 to 2)',
    color: '#1f5fbf',
    width: 2,
    dash: undefined,
  },
  2: {
    group: 'moderate',
    label: 'Moderately sensitive (ESI 3 to 5)',
    color: '#1b7a3a',
    width: 3,
    dash: '10 4',
  },
  3: {
    group: 'high',
    label: 'Highly sensitive (ESI 6 to 8)',
    color: '#c25b00',
    width: 4,
    dash: '3 3',
  },
  4: {
    group: 'very_high',
    label: 'Most sensitive (ESI 9 to 10)',
    color: '#b3121b',
    width: 5.5,
    dash: '12 3 2 3',
  },
}

export function esiStyle(code: string): EsiStyle {
  const r = esiRank(code)
  if (r === 0) return GROUPS[0]!
  return GROUPS[r <= 2 ? 1 : r <= 5 ? 2 : r <= 8 ? 3 : 4]!
}

export const ESI_GROUP_STYLES: readonly EsiStyle[] = [
  GROUPS[1]!,
  GROUPS[2]!,
  GROUPS[3]!,
  GROUPS[4]!,
]

/** Draw shoreline lines with the ESI style of their class; returns the SVG and the groups used. */
export function shorelineSvg(
  lines: readonly { esi?: string | undefined; points: readonly Pt[] }[],
  p: Projection,
): { svg: string; groups: Set<EsiStyle> } {
  const groups = new Set<EsiStyle>()
  let svg = ''
  for (const l of lines) {
    if (l.points.length < 2) continue
    const st = esiStyle(l.esi ?? '')
    groups.add(st)
    svg += `<path d="${pathOf(l.points, p)}" fill="none" stroke="${st.color}" stroke-width="${st.width}" stroke-linecap="round" stroke-linejoin="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>`
  }
  return { svg, groups }
}

/** A legend of the ESI groups drawn, with a sample stroke and the group's name. */
export function esiLegend(
  groups: Set<EsiStyle>,
  x: number,
  y: number,
): { svg: string; height: number } {
  const used = ESI_GROUP_STYLES.filter((g) => groups.has(g)).concat(
    groups.has(GROUPS[0]!) ? [GROUPS[0]!] : [],
  )
  let svg = ''
  used.forEach((g, i) => {
    const yy = y + i * 18
    svg += `<line x1="${n(x)}" y1="${n(yy)}" x2="${n(x + 30)}" y2="${n(yy)}" stroke="${g.color}" stroke-width="${g.width}" stroke-linecap="round"${g.dash ? ` stroke-dasharray="${g.dash}"` : ''}/>`
    svg += text(x + 38, yy + 4, g.label, { size: 12, fill: MUTED })
  })
  return { svg, height: used.length * 18 }
}

/** Scale bar of a round length at the bottom left of a rect, and a north arrow at its top right. */
export function mapFurniture(p: Projection, rect: Rect): string {
  const meters = [100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000]
  const target = rect.w * 0.2 * p.metersPerPx
  const len = [...meters].reverse().find((m) => m <= target) ?? meters[0]!
  const bar = len / p.metersPerPx
  const by = rect.y + rect.h - 14
  const bx = rect.x + 12
  const label = len >= 1000 ? `${len / 1000} km` : `${len} m`
  let svg = `<line x1="${n(bx)}" y1="${n(by)}" x2="${n(bx + bar)}" y2="${n(by)}" stroke="${INK}" stroke-width="3"/>`
  svg += text(bx + bar / 2, by - 6, label, { size: 11, anchor: 'middle', extra: HALO })
  const nx = rect.x + rect.w - 24
  const ny = rect.y + 20
  svg += `<path d="M${n(nx)} ${n(ny)}L${n(nx - 7)} ${n(ny + 20)}L${n(nx)} ${n(ny + 15)}L${n(nx + 7)} ${n(ny + 20)}Z" fill="${INK}"/>`
  svg += text(nx, ny - 5, 'N', { size: 13, weight: 700, anchor: 'middle' })
  return svg
}

export const HALO = 'paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"'

/** The map area: a frame with light grid lines at round distances. */
export function mapBackground(rect: Rect, p: Projection): string {
  let svg = `<rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.w)}" height="${n(rect.h)}" fill="#fbf8f0" stroke="${GRID}"/>`
  const step = ((): number => {
    const target = (rect.w * p.metersPerPx) / 5
    const pow = 10 ** Math.floor(Math.log10(target))
    const f = target / pow
    return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * pow
  })()
  const dx = step / p.metersPerPx
  for (
    let x = rect.x + rect.w / 2 - Math.floor(rect.w / 2 / dx) * dx;
    x <= rect.x + rect.w;
    x += dx
  )
    svg += `<line x1="${n(x)}" x2="${n(x)}" y1="${n(rect.y)}" y2="${n(rect.y + rect.h)}" stroke="${GRID}" stroke-width="0.7"/>`
  for (
    let y = rect.y + rect.h / 2 - Math.floor(rect.h / 2 / dx) * dx;
    y <= rect.y + rect.h;
    y += dx
  )
    svg += `<line x1="${n(rect.x)}" x2="${n(rect.x + rect.w)}" y1="${n(y)}" y2="${n(y)}" stroke="${GRID}" stroke-width="0.7"/>`
  return svg
}

/** Mean of a ring's vertices (the closing point is dropped). */
export function ringCenter(ring: readonly Pt[]): LatLon {
  const pts =
    ring.length > 1 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.slice(0, -1)
      : ring
  return {
    lon: pts.reduce((a, q) => a + q[0], 0) / pts.length,
    lat: pts.reduce((a, q) => a + q[1], 0) / pts.length,
  }
}

const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']

/** "12.4 km toward the east" from one point to another. */
export function movedText(a: LatLon, b: LatLon): string {
  const d = distanceM(a, b)
  const bearing =
    (Math.atan2((b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI
  const dir = DIRS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]!
  return d >= 1000
    ? `${(Math.round(d / 100) / 10).toString()} km toward the ${dir}`
    : `${Math.round(d)} m toward the ${dir}`
}

export const km = (m: number): string =>
  m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${Math.round(m)} m`
export { esc }
