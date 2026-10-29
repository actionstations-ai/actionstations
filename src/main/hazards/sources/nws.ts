// NWS alerts and forecast (api.weather.gov). Open data; the User-Agent names the app (http.ts).
// The /points answer names the forecast URL; grid assignments can change, so it is not cached.
import type { HazardSnapshot } from '@shared/schemas'
import type { HazardGet } from '../http'
import { clip, isRecord, num, parseJson } from './util'

export interface SourceOutcome {
  /** The request URL for the snapshot (any key replaced by <MAP_KEY>). */
  url: string
  /** How many records came back; 0 is reported as "empty". */
  count: number
  patch: Partial<HazardSnapshot>
}

export const alertsUrl = (lat: number, lon: number): string =>
  `https://api.weather.gov/alerts/active?point=${lat},${lon}`
export const pointsUrl = (lat: number, lon: number): string =>
  `https://api.weather.gov/points/${lat},${lon}`

const MAX_ALERTS = 50
const MAX_PERIODS = 14

export function parseAlerts(text: string): HazardSnapshot['alerts'] {
  const root = parseJson(text, 'The alerts service')
  const features = isRecord(root) && Array.isArray(root.features) ? root.features : []
  const out: HazardSnapshot['alerts'] = []
  for (const f of features) {
    const p = isRecord(f) && isRecord(f.properties) ? f.properties : undefined
    if (!p) continue
    const event = clip(p.event, 120)
    if (!event) continue
    out.push({
      event,
      severity: clip(p.severity, 40) || 'Unknown',
      ...(clip(p.urgency, 40) ? { urgency: clip(p.urgency, 40) } : {}),
      headline: clip(p.headline, 400) || event,
      effective: clip(p.effective ?? p.onset, 40),
      ...(clip(p.expires, 40) ? { expires: clip(p.expires, 40) } : {}),
      areaDesc: clip(p.areaDesc, 400),
    })
    if (out.length >= MAX_ALERTS) break
  }
  return out
}

/** The forecast URL from a /points answer, or undefined when it has none. */
export function forecastUrlOf(text: string): string | undefined {
  const root = parseJson(text, 'The points service')
  const p = isRecord(root) && isRecord(root.properties) ? root.properties : undefined
  return typeof p?.forecast === 'string' ? p.forecast : undefined
}

export function parseForecast(text: string): HazardSnapshot['forecast'] {
  const root = parseJson(text, 'The forecast service')
  const p = isRecord(root) && isRecord(root.properties) ? root.properties : undefined
  const periods = Array.isArray(p?.periods) ? p.periods : []
  const out: HazardSnapshot['forecast'] = []
  for (const x of periods) {
    if (!isRecord(x)) continue
    const name = clip(x.name, 60)
    if (!name) continue
    const temperature = num(x.temperature)
    out.push({
      name,
      shortForecast: clip(x.shortForecast, 200),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(clip(x.temperatureUnit, 4) ? { unit: clip(x.temperatureUnit, 4) } : {}),
      ...(clip(x.windSpeed, 40) ? { windSpeed: clip(x.windSpeed, 40) } : {}),
    })
    if (out.length >= MAX_PERIODS) break
  }
  return out
}

export async function fetchAlerts(
  get: HazardGet,
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<SourceOutcome> {
  const url = alertsUrl(lat, lon)
  const alerts = parseAlerts((await get(url, signal)).text)
  return { url, count: alerts.length, patch: { alerts } }
}

export async function fetchForecast(
  get: HazardGet,
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<SourceOutcome> {
  const url = pointsUrl(lat, lon)
  const next = forecastUrlOf((await get(url, signal)).text)
  if (!next) return { url, count: 0, patch: { forecast: [] } }
  const forecast = parseForecast((await get(next, signal)).text)
  return { url, count: forecast.length, patch: { forecast } }
}
