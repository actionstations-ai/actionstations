// The event finder (spec 0449 FR-7): from a date, a place and a length of time (or a storm name),
// the connector queries that replay the event. Pure; the consent step shows each connector's
// estimate before anything is fetched. The scenario's dates, places and products follow the
// replayed event; the exercising organization stays fictional.
import type { ConnectorQuery } from '../connectors/registry'
import { nearestRadarSites } from './archives'

export interface ReplayPlan {
  /** The radars within reach of the place, nearest first. */
  radars: { icao: string; name: string; state: string; distanceKm: number }[]
  /** One query per connector, in the order they are worth fetching. */
  queries: { connectorId: string; label: string; query: ConnectorQuery }[]
}

export interface ReplayRequest {
  /** Start of the exercise period, ISO 8601. */
  start: string
  hours: number
  lat: number
  lon: number
  /** Half-width of the area in degrees (default 1.5). */
  spanDeg?: number
  /** Name of the area for provenance, for example "Southwest Ohio". */
  place: string
  /** Upper-air station and forecast office near the place, when known. */
  sounding?: string
  wfo?: string
}

const iso = (ms: number): string => new Date(ms).toISOString()

/** Queries for a convective event replay: radar, storm reports, warnings and a sounding. */
export function planConvectiveReplay(req: ReplayRequest): ReplayPlan {
  const span = req.spanDeg ?? 1.5
  const start = Date.parse(req.start)
  const range = { start: iso(start), end: iso(start + req.hours * 3_600_000) }
  const area = {
    label: req.place,
    bbox: [req.lon - span, req.lat - span, req.lon + span, req.lat + span] as [
      number,
      number,
      number,
      number,
    ],
  }
  const radars = nearestRadarSites(req.lat, req.lon, 3)
  const queries: ReplayPlan['queries'] = [
    {
      connectorId: 'nexrad-level2',
      label: `Radar ${radars[0]!.icao}`,
      query: { range, area, options: { site: radars[0]!.icao } },
    },
    {
      connectorId: 'spc-storm-reports',
      label: 'Storm reports',
      query: { range, area, options: {} },
    },
    {
      connectorId: 'iem-warnings',
      label: 'Warning polygons',
      query: { range, area, options: req.wfo ? { wfo: req.wfo } : {} },
    },
  ]
  if (req.sounding)
    queries.push({
      connectorId: 'iem-soundings',
      label: `Sounding ${req.sounding}`,
      query: { range, area, options: { station: req.sounding } },
    })
  return { radars, queries }
}

/** The query that replays a tropical cyclone from its best track. */
export function planStormReplay(req: {
  name: string
  year: number
  basin?: 'atlantic' | 'east_pacific'
  place: string
}): ReplayPlan['queries'][number] {
  return {
    connectorId: 'nhc-hurdat2',
    label: `Best track of ${req.name} ${req.year}`,
    query: {
      range: { start: `${req.year}-01-01T00:00:00.000Z`, end: `${req.year}-12-31T23:59:00.000Z` },
      area: { label: req.place },
      options: { name: req.name, year: req.year, basin: req.basin ?? 'atlantic' },
    },
  }
}
