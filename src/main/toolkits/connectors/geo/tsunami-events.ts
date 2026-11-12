// NOAA NCEI Global Historical Tsunami Database replay connector (spec 0450 FR-9): past tsunami
// events by year and earthquake magnitude, and for one event the runup observations (where the
// waves were measured, how high, and how long they took to arrive). NOAA data, U.S. public
// domain. Datasets: tsunami-events (points) and, when an event id is given, tsunami-runups
// (points with runup height and travel time, ready for the tsunami travel-time map).
import { AppError } from '../../../lib/errors'
import {
  registerConnector,
  type Connector,
  type ConnectorQuery,
  type ConnectorResult,
} from '../registry'
import {
  featureCollection,
  getJson,
  isRecord,
  item,
  jsonFile,
  numberOption,
  patternOption,
} from './common'

export const NCEI_HOST = 'www.ngdc.noaa.gov'
const BASE = `https://${NCEI_HOST}/hazel/hazard-service/api/v1/tsunamis`
const COUNTRY = /^[A-Z][A-Z .'-]{1,30}$/
const EVENT_ID = /^\d{1,7}$/
const MAX_RUNUP_PAGES = 3

const yearOf = (iso: string): number => new Date(Date.parse(iso)).getUTCFullYear()

export function eventsUrl(q: ConnectorQuery): string {
  const a = yearOf(q.range.start)
  const b = yearOf(q.range.end)
  if (b < a) throw new AppError('VALIDATION', 'The period ends before it starts')
  if (b - a > 50) throw new AppError('VALIDATION', 'Ask for at most 50 years at a time')
  const p = new URLSearchParams({
    minYear: String(a),
    maxYear: String(b),
    minEqMagnitude: String(numberOption(q, 'minMagnitude', 6.5, 0, 10)),
  })
  return `${BASE}/events?${p.toString()}`
}

export function runupsUrl(q: ConnectorQuery, eventId: string, page: number): string {
  const p = new URLSearchParams({ tsunamiEventId: eventId, page: String(page) })
  const country = patternOption(q, 'country', COUNTRY, 'country name (capital letters)')
  if (country) p.set('country', country)
  return `${BASE}/runups?${p.toString()}`
}

const n = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

function timeOf(r: Record<string, unknown>): string | undefined {
  const year = n(r.year)
  if (year === undefined) return undefined
  const d = new Date(0)
  d.setUTCFullYear(year, (n(r.month) ?? 1) - 1, n(r.day) ?? 1)
  d.setUTCHours(n(r.hour) ?? 0, n(r.minute) ?? 0, Math.floor(n(r.second) ?? 0), 0)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function eventFeatures(body: unknown, bbox?: [number, number, number, number]): unknown[] {
  const items = isRecord(body) && Array.isArray(body.items) ? body.items : []
  return items
    .filter(isRecord)
    .filter((e) => {
      const lon = n(e.longitude)
      const lat = n(e.latitude)
      if (lon === undefined || lat === undefined) return false
      return !bbox || (lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3])
    })
    .map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.longitude, e.latitude] },
      properties: {
        name: `${e.eqMagnitude !== undefined ? `M ${e.eqMagnitude} ` : ''}${String(e.locationName ?? '')}, ${String(e.country ?? '')} ${String(e.year ?? '')}`
          .replace(/\s+/g, ' ')
          .trim(),
        id: e.id,
        magnitude: n(e.eqMagnitude),
        time: timeOf(e),
        depthKm: n(e.eqDepth),
        maxWaterHeightM: n(e.maxWaterHeight),
        runups: n(e.numRunups),
        deaths: n(e.deaths),
        oceanic: e.oceanicTsunami === true,
      },
    }))
}

export function runupFeatures(items: unknown[]): unknown[] {
  return items.filter(isRecord).flatMap((r) => {
    const lon = n(r.longitude)
    const lat = n(r.latitude)
    if (lon === undefined || lat === undefined) return []
    const minutes =
      n(r.travHours) !== undefined ? (n(r.travHours) ?? 0) * 60 + (n(r.travMins) ?? 0) : undefined
    return [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          name: String(r.locationName ?? ''),
          country: String(r.country ?? ''),
          runupHeightM: n(r.runupHt),
          travelMinutes: minutes,
          distanceFromSourceKm:
            n(r.distFromSource) !== undefined ? Math.round(n(r.distFromSource)!) : undefined,
        },
      },
    ]
  })
}

export const tsunamiEvents: Connector = {
  id: 'tsunami-events',
  label: 'Historical tsunami events and runups',
  source: 'NOAA NCEI Global Historical Tsunami Database',
  terms:
    'NOAA data, U.S. government work. Cite NOAA National Centers for Environmental Information.',
  hosts: [NCEI_HOST],
  options: [
    {
      key: 'minMagnitude',
      label: 'Smallest earthquake magnitude',
      type: 'number',
      help: 'Only tsunamis caused by an earthquake of at least this magnitude, 0 to 10.',
      default: 6.5,
      example: 6.5,
    },
    {
      key: 'eventId',
      label: 'Tsunami event id',
      type: 'text',
      help: "Optional NCEI tsunami event number, such as 5413 for Japan 2011, from the NCEI tsunami database; adds that event's runup observations.",
      example: '5413',
    },
    {
      key: 'country',
      label: 'Runup country',
      type: 'text',
      help: 'Optional country name in capital letters, such as JAPAN or USA, to keep only the runups recorded there.',
      example: 'JAPAN',
    },
  ],
  area: {
    bbox: 'optional',
    help: 'Draw a box to keep only the tsunamis whose source lies inside it; leave it empty for the whole world.',
    example: { bbox: [130, 30, 150, 45] },
  },
  estimate(q) {
    eventsUrl(q)
    const id = patternOption(q, 'eventId', EVENT_ID, 'tsunami event id')
    patternOption(q, 'country', COUNTRY, 'country name (capital letters)')
    return {
      items: [
        item('tsunami-events', 'Tsunami events', 'features', 60_000),
        ...(id
          ? [
              item(
                'tsunami-runups',
                'Runup observations (up to 600)',
                'features',
                MAX_RUNUP_PAGES * 100_000,
              ),
            ]
          : []),
      ],
      requests: 1 + (id ? MAX_RUNUP_PAGES : 0),
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const events = eventFeatures(
      await getJson(ctx, eventsUrl(q), 'The tsunami database'),
      q.area.bbox,
    )
    const files = [jsonFile('tsunami-events.geojson', featureCollection(events))]
    const datasets: ConnectorResult['datasets'] = [
      {
        id: 'tsunami-events',
        kind: 'features',
        label: 'Tsunami events',
        file: 'tsunami-events.geojson',
        range: q.range,
      },
    ]
    const id = patternOption(q, 'eventId', EVENT_ID, 'tsunami event id')
    if (id) {
      const all: unknown[] = []
      for (let page = 1; page <= MAX_RUNUP_PAGES; page++) {
        const body = await getJson(ctx, runupsUrl(q, id, page), 'The tsunami database')
        const items = isRecord(body) && Array.isArray(body.items) ? body.items : []
        all.push(...items)
        const pages = isRecord(body) ? n(body.totalPages) : undefined
        if (!items.length || page >= (pages ?? 1)) break
      }
      files.push(jsonFile('tsunami-runups.geojson', featureCollection(runupFeatures(all))))
      datasets.push({
        id: 'tsunami-runups',
        kind: 'features',
        label: 'Tsunami runup observations',
        file: 'tsunami-runups.geojson',
        unit: 'm',
      })
    }
    return {
      datasets,
      files,
      citation:
        'NOAA National Centers for Environmental Information, Global Historical Tsunami Database, https://www.ngdc.noaa.gov/hazard/tsu_db.shtml',
    }
  },
}

export const registerTsunamiEvents = (): void => registerConnector(tsunamiEvents)
