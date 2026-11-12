// Iowa Environmental Mesonet archives (spec 0449 FR-7): NWS warning polygons from the VTEC
// archive and radiosonde profiles. The IEM keeps unofficial archives of public National
// Weather Service products. Warning polygons become a features dataset (active from issue to
// expiry); soundings become figure frames for the skew-T and hodograph.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { chainFrames, frameCollection } from '../weather/frames'
import { raobToSounding } from '../weather/sounding-data'
import {
  type Connector,
  type ConnectorEstimate,
  type ConnectorQuery,
  type ConnectorResult,
} from './registry'

export const IEM_HOST = 'mesonet.agron.iastate.edu'
const TERMS =
  'Archive of public National Weather Service products kept by the Iowa Environmental Mesonet; unofficial. NWS products are US government work.'

const pad = (n: number): string => String(n).padStart(2, '0')
const stamp = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
}

// ---- warning polygons -----------------------------------------------------------------------

const WarningOptions = z.object({
  /** Three-letter forecast office id, for example ILN; all offices when left out. */
  wfo: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .optional(),
})

type Ring = number[][]
interface Feature {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown } | null
  properties: Record<string, unknown>
}

const rings = (g: Feature['geometry']): Ring[] =>
  !g
    ? []
    : g.type === 'Polygon'
      ? (g.coordinates as Ring[])
      : g.type === 'MultiPolygon'
        ? (g.coordinates as Ring[][]).flat()
        : []

function touches(f: Feature, bbox: readonly number[]): boolean {
  return rings(f.geometry).some((ring) => {
    const xs = ring.map((p) => p[0]!)
    const ys = ring.map((p) => p[1]!)
    return (
      Math.max(...xs) >= bbox[0]! &&
      Math.min(...xs) <= bbox[2]! &&
      Math.max(...ys) >= bbox[1]! &&
      Math.min(...ys) <= bbox[3]!
    )
  })
}

const warningEstimate = (q: ConnectorQuery): ConnectorEstimate => {
  const o = WarningOptions.parse(q.options)
  return {
    items: [
      {
        datasetId: 'warnings',
        label: o.wfo ? `Warnings from ${o.wfo.toUpperCase()}` : 'Warnings from all offices',
        kind: 'features',
        bytes: o.wfo ? 120_000 : 2_000_000,
      },
    ],
    requests: 1,
  }
}

async function fetchWarnings(
  query: ConnectorQuery,
  ctx: Parameters<Connector['fetch']>[1],
): Promise<ConnectorResult> {
  const o = WarningOptions.parse(query.options)
  const url =
    `https://${IEM_HOST}/geojson/sbw.py?sts=${encodeURIComponent(new Date(query.range.start).toISOString().replace('.000Z', 'Z'))}` +
    `&ets=${encodeURIComponent(new Date(query.range.end).toISOString().replace('.000Z', 'Z'))}` +
    (o.wfo ? `&wfo=${o.wfo.toUpperCase()}` : '')
  const body = JSON.parse(new TextDecoder().decode((await ctx.get(url)).data)) as {
    features?: Feature[]
  }
  const bbox = query.area.bbox
  const features = (body.features ?? [])
    .filter((f) => !bbox || touches(f, bbox))
    .map((f) => {
      const p = f.properties
      const start = String(p.polygon_begin ?? p.issue)
      const end = String(p.polygon_end ?? p.expire ?? p.expire_utc)
      return {
        ...f,
        properties: {
          ...p,
          name: `${String(p.ps)} ${String(p.eventid)} (${String(p.wfo)})`,
          start,
          end,
        },
      }
    })
  return {
    datasets: [
      {
        id: 'warnings',
        kind: 'features',
        label: 'NWS warning polygons',
        file: 'warnings.geojson',
        range: {
          start: new Date(query.range.start).toISOString(),
          end: new Date(query.range.end).toISOString(),
        },
        area: { label: query.area.label, ...(bbox ? { bbox } : {}) },
      },
    ],
    files: [
      { name: 'warnings.geojson', data: JSON.stringify({ type: 'FeatureCollection', features }) },
    ],
    ...(bbox ? { modified: 'Filtered to the scenario area' } : {}),
    citation: 'National Weather Service warnings, Iowa Environmental Mesonet VTEC archive',
  }
}

export const iemWarningsConnector: Connector = {
  id: 'iem-warnings',
  label: 'NWS warning polygons (IEM archive)',
  source: 'Iowa Environmental Mesonet VTEC archive of National Weather Service warnings',
  terms: TERMS,
  hosts: [IEM_HOST],
  options: [
    {
      key: 'wfo',
      label: 'Forecast office',
      type: 'text',
      help: 'Optional three-letter NWS forecast office id, such as ILN for Wilmington, OH, from weather.gov; every office when left empty.',
      example: 'ILN',
    },
  ],
  area: {
    bbox: 'optional',
    label: 'optional',
    help: 'Draw a box to keep only the warnings that touch it; leave it empty for every warning the office issued.',
    example: { label: 'Dayton, OH', bbox: [-84.4, 39.6, -84.0, 39.9] },
  },
  estimate: warningEstimate,
  fetch: fetchWarnings,
}

// ---- soundings ------------------------------------------------------------------------------

const SoundingOptions = z.object({
  /** Four-letter upper-air station id, for example KILN. */
  station: z.string().regex(/^[A-Za-z]{4}$/),
  name: z.string().max(80).default(''),
})

const MAX_SOUNDINGS = 14

/** Launch times (00 and 12 UTC) from the one at or before the start to the end. */
export function launchTimes(startIso: string, endIso: string): number[] {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  const first = Math.floor(start / (12 * 3_600_000)) * 12 * 3_600_000
  const out: number[] = []
  for (let t = first; t <= end; t += 12 * 3_600_000) out.push(t)
  return out
}

function soundingTimes(q: ConnectorQuery): number[] {
  const times = launchTimes(q.range.start, q.range.end)
  if (times.length > MAX_SOUNDINGS)
    throw new AppError(
      'VALIDATION',
      `That is ${times.length} soundings; the most is ${MAX_SOUNDINGS}`,
    )
  return times
}

const soundingEstimate = (q: ConnectorQuery): ConnectorEstimate => {
  const o = SoundingOptions.parse(q.options)
  const n = soundingTimes(q).length
  return {
    items: [
      {
        datasetId: `soundings-${o.station.toLowerCase()}`,
        label: `${o.station.toUpperCase()} soundings, ${n} launches`,
        kind: 'features',
        bytes: n * 30_000,
      },
    ],
    requests: n,
  }
}

async function fetchSoundings(
  query: ConnectorQuery,
  ctx: Parameters<Connector['fetch']>[1],
): Promise<ConnectorResult> {
  const o = SoundingOptions.parse(query.options)
  const station = o.station.toUpperCase()
  const frames: { start: string; name: string; data: unknown }[] = []
  for (const t of soundingTimes(query)) {
    const res = await ctx.get(`https://${IEM_HOST}/json/raob.py?ts=${stamp(t)}&station=${station}`)
    const text = new TextDecoder().decode(res.data)
    const parsed = JSON.parse(text) as { profiles?: { profile?: unknown[] }[] }
    if (!parsed.profiles?.[0]?.profile?.length) continue
    const data = raobToSounding(text, o.name || station)
    frames.push({ start: data.time, name: `${station} ${data.time.slice(11, 13)}Z sounding`, data })
  }
  if (!frames.length) throw new AppError('NOT_FOUND', `${station} has no soundings for that period`)
  const id = `soundings-${station.toLowerCase()}`
  const lastEnd = new Date(query.range.end).toISOString()
  return {
    datasets: [
      {
        id,
        kind: 'features',
        label: `${station} soundings`,
        file: `${id}.geojson`,
        range: { start: frames[0]!.start, end: lastEnd },
        area: { label: query.area.label },
      },
    ],
    files: [
      {
        name: `${id}.geojson`,
        data: frameCollection(chainFrames(frames, lastEnd).map((f) => ({ ...f }))),
      },
    ],
    citation: 'National Weather Service radiosonde reports, Iowa Environmental Mesonet archive',
  }
}

export const iemSoundingsConnector: Connector = {
  id: 'iem-soundings',
  label: 'Upper-air soundings (IEM archive)',
  source: 'Iowa Environmental Mesonet archive of National Weather Service radiosonde reports',
  terms: TERMS,
  hosts: [IEM_HOST],
  options: [
    {
      key: 'station',
      label: 'Upper-air station',
      type: 'text',
      required: true,
      help: 'Four-letter radiosonde station id, such as KILN for Wilmington, OH, from the IEM upper-air station list.',
      example: 'KILN',
    },
    {
      key: 'name',
      label: 'Station name',
      type: 'text',
      help: 'Optional name shown on the sounding chart, up to 80 characters; the station id when left empty.',
      example: 'Wilmington, OH',
    },
  ],
  area: {
    label: 'optional',
    help: 'The place the soundings stand for, kept with the data.',
    example: { label: 'Southwest Ohio' },
  },
  exampleRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-05T00:00:00Z' },
  estimate: soundingEstimate,
  fetch: fetchSoundings,
}
