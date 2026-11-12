// EPA AirNow observations (spec 0461 FR-8): the hourly AQI for the reporting area nearest a point,
// one request per hour. The free key is stored in the OS keychain under "airnow" and used only
// when present; it goes in the query string, which the fetch layer never records, and is
// scrubbed from messages. The request carries a rounded latitude and longitude and an hour.
// The response shape follows the AirNow API documentation; this connector was written without a
// live key, so the opt-in live test is the check that the shape still matches.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { getSecret } from '../../secrets'
import { toBytes } from './json'
import type { Connector } from './registry'
import { getText, isoFromMs } from './wildfire-common'

const BASE = 'https://www.airnowapi.org/aq/observation/latLong/historical/'
const SOURCE = 'EPA AirNow'
const MAX_HOURS = 48
const HOUR_MS = 3_600_000
const DISTANCE_MILES = 25
/** The keychain entry for the AirNow key. */
export const AIRNOW_KEY_ID = 'airnow'

const Observation = z.looseObject({
  DateObserved: z.string(),
  HourObserved: z.number(),
  LocalTimeZone: z.string().optional(),
  ReportingArea: z.string(),
  StateCode: z.string().optional(),
  Latitude: z.number(),
  Longitude: z.number(),
  ParameterName: z.string(),
  AQI: z.number(),
  Category: z.looseObject({ Number: z.number(), Name: z.string() }).optional(),
})
const Observations = z.array(Observation)

export const isValidAirNowKey = (key: string): boolean => /^[A-Za-z0-9-]{16,64}$/.test(key)

export interface AirNowDeps {
  getKey: () => Promise<string | undefined>
}

const r2 = (v: number): number => Math.round(v * 100) / 100
const hourStamp = (ms: number): string => `${new Date(ms).toISOString().slice(0, 13)}-0000`

export function createAirNowConnector(
  deps: AirNowDeps = { getKey: () => getSecret(AIRNOW_KEY_ID) },
): Connector {
  return {
    id: 'airnow-observations',
    label: 'Air quality observations (EPA AirNow)',
    source: 'EPA AirNow',
    terms:
      'AirNow data are preliminary and unverified; cite EPA AirNow. Needs the free AirNow key you saved in Settings.',
    hosts: ['www.airnowapi.org'],
    area: {
      bbox: 'required',
      label: 'optional',
      help: 'Pick a point or draw a small box; the reporting area nearest its centre is used. The name is a fallback title.',
      example: { label: 'Sacramento', bbox: [-121.55, 38.55, -121.45, 38.62] },
    },
    estimate(query) {
      const hours = hoursIn(query.range)
      if (!query.area.bbox)
        throw new AppError('VALIDATION', `${SOURCE} needs a place: pick a point on the map.`)
      return {
        requests: hours.length,
        items: [
          {
            datasetId: 'airnow-aqi',
            label: 'Hourly AQI',
            kind: 'series',
            bytes: hours.length * 1500,
          },
        ],
      }
    },
    async fetch(query, ctx) {
      const key = await deps.getKey()
      if (!key)
        throw new AppError(
          'FORBIDDEN',
          'AirNow needs a free key. Save one in Settings, then try again.',
        )
      if (!isValidAirNowKey(key))
        throw new AppError('VALIDATION', 'The saved AirNow key is not valid.')
      const b = query.area.bbox
      if (!b) throw new AppError('VALIDATION', `${SOURCE} needs a place: pick a point on the map.`)
      const lat = r2((b[1] + b[3]) / 2)
      const lon = r2((b[0] + b[2]) / 2)
      const points: { t: string; v: Record<string, number> }[] = []
      let area = ''
      for (const h of hoursIn(query.range)) {
        const url =
          `${BASE}?format=application/json&latitude=${lat}&longitude=${lon}` +
          `&date=${hourStamp(h)}&distance=${DISTANCE_MILES}&API_KEY=${key}`
        const text = await getText(ctx, url, key)
        let parsed: unknown
        try {
          parsed = JSON.parse(text)
        } catch {
          throw new AppError('PROVIDER', `${SOURCE} did not return JSON; check the key.`)
        }
        const rows = Observations.safeParse(parsed)
        if (!rows.success)
          throw new AppError(
            'PROVIDER',
            `${SOURCE} returned an unexpected shape; the service may have changed.`,
          )
        const pm = rows.data.find((r) => r.ParameterName === 'PM2.5')
        if (pm) {
          area = area || `${pm.ReportingArea}${pm.StateCode ? `, ${pm.StateCode}` : ''}`
          points.push({ t: isoFromMs(h), v: { [pm.ReportingArea]: pm.AQI } })
        }
      }
      return {
        datasets: [
          {
            id: 'airnow-aqi',
            kind: 'series',
            label: `Hourly PM2.5 AQI${area ? ` (${area})` : ''}, EPA AirNow, preliminary`,
            file: 'airnow-aqi.json',
            unit: 'AQI',
            area: { label: area || query.area.label },
          },
        ],
        files: [{ name: 'airnow-aqi.json', data: toBytes(points) }],
        modified: `PM2.5 only, the reporting area nearest ${lat}, ${lon} within ${DISTANCE_MILES} miles; hours with no report are left out.`,
        citation: 'EPA AirNow, airnowapi.org (preliminary, unverified data)',
      }
    },
  }
}

function hoursIn(range: { start: string; end: string }): number[] {
  const first = Math.floor(Date.parse(range.start) / HOUR_MS) * HOUR_MS
  const last = Math.floor(Date.parse(range.end) / HOUR_MS) * HOUR_MS
  const out: number[] = []
  for (let t = first; t <= last && out.length < MAX_HOURS; t += HOUR_MS) out.push(t)
  return out
}

export const airnowConnector = createAirNowConnector()
