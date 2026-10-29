// USGS earthquakes (earthquake.usgs.gov FDSN event service). U.S. public domain. Two one-off
// queries started by the user; this is not a poller. Distance is computed here (haversine).
import type { Quake } from '@shared/schemas'
import type { HazardGet } from '../http'
import type { SourceOutcome } from './nws'
import { clip, haversineKm, isRecord, num, oneDecimal, parseJson } from './util'

export interface QuakeQuery {
  radiusKm: number
  minMagnitude: number
}

export const RECENT_DEFAULTS: QuakeQuery = { radiusKm: 250, minMagnitude: 2.5 }
export const HISTORICAL_DEFAULTS: QuakeQuery = { radiusKm: 150, minMagnitude: 4.5 }
const RECENT_DAYS = 30
const RECENT_LIMIT = 100
const HISTORICAL_LIMIT = 50
const HISTORICAL_START = '1975-01-01'
const BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query'

/** Radius is kept within 10-500 km and magnitude within 0-9 whatever the caller sent. */
export function clampQuery(q: QuakeQuery): QuakeQuery {
  const radiusKm = Math.min(500, Math.max(10, Math.round(q.radiusKm)))
  const minMagnitude = Math.min(9, Math.max(0, Math.round(q.minMagnitude * 10) / 10))
  return { radiusKm, minMagnitude }
}

function queryUrl(lat: number, lon: number, q: QuakeQuery, extra: Record<string, string>): string {
  const p = new URLSearchParams({
    format: 'geojson',
    latitude: String(lat),
    longitude: String(lon),
    maxradiuskm: String(q.radiusKm),
    minmagnitude: String(q.minMagnitude),
    ...extra,
  })
  return `${BASE}?${p.toString()}`
}

export const recentUrl = (lat: number, lon: number, q: QuakeQuery, now: Date): string =>
  queryUrl(lat, lon, clampQuery(q), {
    starttime: new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10),
    orderby: 'time',
    limit: String(RECENT_LIMIT),
  })

export const historicalUrl = (lat: number, lon: number, q: QuakeQuery): string =>
  queryUrl(lat, lon, clampQuery(q), {
    starttime: HISTORICAL_START,
    orderby: 'magnitude',
    limit: String(HISTORICAL_LIMIT),
  })

export function parseQuakes(text: string, lat: number, lon: number, max: number): Quake[] {
  const root = parseJson(text, 'The earthquake service')
  const features = isRecord(root) && Array.isArray(root.features) ? root.features : []
  const out: Quake[] = []
  for (const f of features) {
    if (!isRecord(f) || !isRecord(f.properties) || !isRecord(f.geometry)) continue
    const coords = f.geometry.coordinates
    const mag = num(f.properties.mag)
    const ms = num(f.properties.time)
    if (!Array.isArray(coords) || mag === undefined || ms === undefined) continue
    const qLon = num(coords[0])
    const qLat = num(coords[1])
    if (qLat === undefined || qLon === undefined) continue
    const depth = num(coords[2])
    out.push({
      id: clip(f.id, 64),
      mag,
      place: clip(f.properties.place, 200),
      time: new Date(ms).toISOString(),
      ...(depth !== undefined ? { depthKm: oneDecimal(depth) } : {}),
      distanceKm: oneDecimal(haversineKm(lat, lon, qLat, qLon)),
    })
    if (out.length >= max) break
  }
  return out
}

export async function fetchRecent(
  get: HazardGet,
  lat: number,
  lon: number,
  q: QuakeQuery,
  now: Date,
  signal?: AbortSignal,
): Promise<SourceOutcome> {
  const url = recentUrl(lat, lon, q, now)
  const recent = parseQuakes((await get(url, signal)).text, lat, lon, RECENT_LIMIT)
  return { url, count: recent.length, patch: { earthquakes: { recent, historical: [] } } }
}

export async function fetchHistorical(
  get: HazardGet,
  lat: number,
  lon: number,
  q: QuakeQuery,
  signal?: AbortSignal,
): Promise<SourceOutcome> {
  const url = historicalUrl(lat, lon, q)
  const historical = parseQuakes((await get(url, signal)).text, lat, lon, HISTORICAL_LIMIT)
  return { url, count: historical.length, patch: { earthquakes: { recent: [], historical } } }
}
