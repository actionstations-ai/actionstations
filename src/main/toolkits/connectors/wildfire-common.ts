// Helpers shared by the wildfire connectors (spec 0461 FR-8): GeoJSON geometry reduced to one
// outer ring, epoch milliseconds to ISO, a text GET and key scrubbing. No connector here sends
// plan content: requests carry a fire name, a year, a rounded box or dates.
import { AppError } from '../../lib/errors'
import type { FetchContext } from './registry'

export type LonLat = [number, number]

export const isoFromMs = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')

/** The largest outer ring (by point count) of a Polygon or MultiPolygon, without the closing repeat. */
export function outerRing(
  geometry: { type: string; coordinates?: unknown } | null,
): LonLat[] | null {
  if (!geometry) return null
  const polys: LonLat[][][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as LonLat[][]]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as LonLat[][][])
        : []
  const rings = polys.map((p) => p[0] ?? []).filter((r) => r.length >= 4)
  if (!rings.length) return null
  const best = rings.reduce((a, b) => (b.length > a.length ? b : a))
  const first = best[0]!
  const last = best[best.length - 1]!
  return first[0] === last[0] && first[1] === last[1] ? best.slice(0, -1) : best
}

export function bboxOfRing(ring: readonly LonLat[]): [number, number, number, number] {
  const lons = ring.map((p) => p[0])
  const lats = ring.map((p) => p[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

export const boxesIntersect = (
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): boolean => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]

export async function getText(ctx: FetchContext, url: string, secret?: string): Promise<string> {
  try {
    const res = await ctx.get(url)
    return new TextDecoder().decode(res.data)
  } catch (err) {
    if (!secret) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new AppError('PROVIDER', message.split(secret).join('<KEY>'))
  }
}

/** A name for a where clause: letters, digits, spaces and . ' - only; quotes doubled. */
export function safeName(name: unknown, source: string): string {
  const s = typeof name === 'string' ? name.trim() : ''
  if (!/^[A-Za-z0-9 .'-]{2,80}$/.test(s))
    throw new AppError(
      'VALIDATION',
      `${source}: give the fire's name (letters, digits and spaces).`,
    )
  return s.toUpperCase().replace(/'/g, "''")
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** "2018-11-08 14:30:00" in UTC, the form ArcGIS timestamp literals take. */
export function sqlTimestamp(iso: string): string {
  const d = new Date(Date.parse(iso))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

export const dayStamp = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}
