// NASA FIRMS active fire detections (firms.modaps.eosdis.nasa.gov). The map key is part of the
// request path, so it is checked against a strict pattern, replaced by <MAP_KEY> in everything
// that is stored or shown, and scrubbed from error text. It is never logged.
import type { HazardSnapshot } from '@shared/schemas'
import { AppError } from '../../lib/errors'
import type { HazardGet } from '../http'
import { csvRecords } from './csv'
import type { SourceOutcome } from './nws'
import { haversineKm, oneDecimal } from './util'

const BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv'
const PRODUCT = 'VIIRS_SNPP_NRT'
const HALF_BOX_DEG = 0.5
const MAX_DETECTIONS = 500
export const KEY_PLACEHOLDER = '<MAP_KEY>'

/** FIRMS map keys are letters and digits; anything else is refused before it reaches a URL. */
export const isValidMapKey = (key: string): boolean => /^[A-Za-z0-9]{16,64}$/.test(key)

export function clampDays(days: number): number {
  return Math.min(5, Math.max(1, Math.round(days)))
}

/** The bounding box west,south,east,north, ±0.5° around the (rounded) point. */
export function firmsBox(lat: number, lon: number): string {
  const f = (n: number) => n.toFixed(2)
  const clampLat = (n: number) => Math.min(90, Math.max(-90, n))
  const clampLon = (n: number) => Math.min(180, Math.max(-180, n))
  return [
    f(clampLon(lon - HALF_BOX_DEG)),
    f(clampLat(lat - HALF_BOX_DEG)),
    f(clampLon(lon + HALF_BOX_DEG)),
    f(clampLat(lat + HALF_BOX_DEG)),
  ].join(',')
}

export const firmsUrl = (key: string, lat: number, lon: number, days: number): string =>
  `${BASE}/${key}/${PRODUCT}/${firmsBox(lat, lon)}/${clampDays(days)}`

/** The URL as it is stored and shown. */
export const maskedFirmsUrl = (lat: number, lon: number, days: number): string =>
  firmsUrl(KEY_PLACEHOLDER, lat, lon, days)

export function parseFires(
  text: string,
  lat: number,
  lon: number,
  days: number,
): NonNullable<HazardSnapshot['fires']> {
  const trimmed = text.trim()
  if (trimmed !== '' && !/^latitude,/i.test(trimmed))
    throw new Error('FIRMS did not return detection data (check the map key)')
  const found = csvRecords(trimmed).flatMap((r) => {
    const dLat = Number(r.latitude)
    const dLon = Number(r.longitude)
    if (!Number.isFinite(dLat) || !Number.isFinite(dLon)) return []
    const frp = Number(r.frp)
    return [
      {
        km: haversineKm(lat, lon, dLat, dLon),
        lat: dLat,
        lon: dLon,
        acqDate: (r.acq_date ?? '').slice(0, 20),
        confidence: (r.confidence ?? '').slice(0, 20),
        ...(r.frp !== undefined && r.frp !== '' && Number.isFinite(frp) ? { frp } : {}),
      },
    ]
  })
  found.sort((a, b) => a.km - b.km)
  const nearest = found[0]
  return {
    days: clampDays(days),
    count: found.length,
    ...(nearest ? { nearestKm: oneDecimal(nearest.km) } : {}),
    detections: found.slice(0, MAX_DETECTIONS).map(({ km: _km, ...d }) => d),
  }
}

/** Replace the key in text that might quote the URL. */
function scrub(text: string, key: string): string {
  return text.split(key).join(KEY_PLACEHOLDER)
}

export async function fetchFires(
  get: HazardGet,
  key: string,
  lat: number,
  lon: number,
  days: number,
  signal?: AbortSignal,
): Promise<SourceOutcome> {
  if (!isValidMapKey(key)) throw new AppError('VALIDATION', 'The FIRMS map key looks wrong')
  try {
    const res = await get(firmsUrl(key, lat, lon, days), signal)
    const fires = parseFires(res.text, lat, lon, days)
    return { url: maskedFirmsUrl(lat, lon, days), count: fires.count, patch: { fires } }
  } catch (err) {
    const message = scrub(err instanceof Error ? err.message : String(err), key)
    if (err instanceof AppError && err.code === 'CANCELLED') throw err
    throw Object.assign(new AppError(err instanceof AppError ? err.code : 'PROVIDER', message), {
      httpStatus: (err as { httpStatus?: number }).httpStatus,
    })
  }
}
