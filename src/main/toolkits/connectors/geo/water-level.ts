// NOAA water level replay connectors (spec 0450 FR-9): tide gauge records from CO-OPS (coastal
// stations, 6-minute water level with the predicted tide) and deep-ocean DART buoy records from
// the NDBC historical archive. NOAA data, U.S. public domain. The series feed the gauge_record
// figure and the tide gauge and DART injects. Station ids are checked against a fixed shape
// before they reach an address.
import { gunzipSync } from 'node:zlib'
import { AppError } from '../../../lib/errors'
import {
  registerConnector,
  type Connector,
  type ConnectorQuery,
  type ConnectorResult,
} from '../registry'
import { checkRange, getJson, isRecord, item, jsonFile, patternOption } from './common'

export const COOPS_HOST = 'api.tidesandcurrents.noaa.gov'
export const NDBC_HOST = 'www.ndbc.noaa.gov'
const STATION = /^\d{7}$/
const DART_STATION = /^\d{5}$/
const MAX_POINTS = 12_000

const compact = (iso: string): string =>
  new Date(Date.parse(iso)).toISOString().slice(0, 10).replace(/-/g, '')

export function coopsUrl(q: ConnectorQuery, product: 'water_level' | 'predictions'): string {
  checkRange(q, 31)
  const station = patternOption(q, 'station', STATION, 'CO-OPS station id (seven digits)')
  if (!station) throw new AppError('VALIDATION', 'Name the tide gauge station (seven digits)')
  const p = new URLSearchParams({
    station,
    product,
    begin_date: compact(q.range.start),
    end_date: compact(q.range.end),
    datum: 'MLLW',
    units: 'metric',
    time_zone: 'gmt',
    format: 'json',
    application: 'ActionStations',
  })
  if (product === 'predictions') p.set('interval', '6')
  return `https://${COOPS_HOST}/api/prod/datagetter?${p.toString()}`
}

interface Reading {
  t: string
  v: string
}

export function readings(
  body: unknown,
  key: 'data' | 'predictions',
  range: ConnectorQuery['range'],
): { t: string; v: number }[] {
  if (isRecord(body) && isRecord(body.error))
    throw new AppError(
      'NOT_FOUND',
      `CO-OPS: ${String(body.error.message ?? 'no data')}`.slice(0, 200),
    )
  const rows = isRecord(body) && Array.isArray(body[key]) ? (body[key] as Reading[]) : []
  const a = Date.parse(range.start)
  const b = Date.parse(range.end)
  return rows.flatMap((r) => {
    const t = Date.parse(`${r.t.replace(' ', 'T')}:00Z`)
    const v = Number(r.v)
    return Number.isFinite(t) && Number.isFinite(v) && t >= a && t <= b
      ? [{ t: new Date(t).toISOString(), v }]
      : []
  })
}

export const coopsTides: Connector = {
  id: 'coops-tides',
  label: 'Tide gauge water level and predicted tide',
  source: 'NOAA CO-OPS (api.tidesandcurrents.noaa.gov)',
  terms:
    'NOAA data, U.S. government work. Cite NOAA Center for Operational Oceanographic Products and Services.',
  hosts: [COOPS_HOST],
  options: [
    {
      key: 'station',
      label: 'Tide gauge station',
      type: 'text',
      required: true,
      help: 'Seven-digit NOAA station number, such as 9414290 for San Francisco, from tidesandcurrents.noaa.gov.',
      example: '9414290',
    },
  ],
  estimate(q) {
    const days = Math.max(1, Math.ceil(checkRange(q, 31)) + 1)
    coopsUrl(q, 'water_level')
    return {
      items: [
        item('tide-observed', 'Observed water level (6 minute)', 'series', days * 240 * 55 + 2_000),
        item('tide-predicted', 'Predicted tide', 'series', days * 240 * 55 + 2_000),
      ],
      requests: 2,
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const station = patternOption(q, 'station', STATION, 'station')!
    const observed = readings(
      await getJson(ctx, coopsUrl(q, 'water_level'), 'CO-OPS'),
      'data',
      q.range,
    )
    if (!observed.length)
      throw new AppError('NOT_FOUND', 'CO-OPS has no water level for that station and period')
    const predicted = readings(
      await getJson(ctx, coopsUrl(q, 'predictions'), 'CO-OPS'),
      'predictions',
      q.range,
    )
    const datasets: ConnectorResult['datasets'] = [
      {
        id: `tide-${station}-observed`,
        kind: 'series',
        label: `Water level, station ${station} (m above MLLW)`,
        file: `tide-${station}-observed.json`,
        unit: 'm',
        range: { start: observed[0]!.t, end: observed[observed.length - 1]!.t },
      },
    ]
    const files = [jsonFile(`tide-${station}-observed.json`, observed)]
    if (predicted.length) {
      datasets.push({
        id: `tide-${station}-predicted`,
        kind: 'series',
        label: `Predicted tide, station ${station} (m above MLLW)`,
        file: `tide-${station}-predicted.json`,
        unit: 'm',
      })
      files.push(jsonFile(`tide-${station}-predicted.json`, predicted))
    }
    return {
      datasets,
      files,
      citation: `NOAA CO-OPS station ${station}, https://tidesandcurrents.noaa.gov/stationhome.html?id=${station}`,
    }
  },
}

// ---- DART (NDBC) -----------------------------------------------------------------------------

export const dartUrl = (station: string, year: number): string =>
  `https://${NDBC_HOST}/data/historical/dart/${station}t${year}.txt.gz`

export function dartYears(q: ConnectorQuery): number[] {
  const a = new Date(Date.parse(q.range.start)).getUTCFullYear()
  const b = new Date(Date.parse(q.range.end)).getUTCFullYear()
  if (b < a) throw new AppError('VALIDATION', 'The period ends before it starts')
  if (b - a > 1) throw new AppError('VALIDATION', 'Ask for at most two calendar years at a time')
  return a === b ? [a] : [a, b]
}

/** Parse an NDBC DART file: `YY MM DD hh mm ss T HEIGHT`, height in meters; 9999 means missing. */
export function parseDart(
  text: string,
  range: ConnectorQuery['range'],
): { t: string; v: number }[] {
  const a = Date.parse(range.start)
  const b = Date.parse(range.end)
  const out: { t: string; v: number }[] = []
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const f = line.trim().split(/\s+/)
    if (f.length < 8) continue
    const t = Date.UTC(
      Number(f[0]),
      Number(f[1]) - 1,
      Number(f[2]),
      Number(f[3]),
      Number(f[4]),
      Number(f[5]),
    )
    const v = Number(f[7])
    if (Number.isFinite(t) && Number.isFinite(v) && v < 9000 && t >= a && t <= b)
      out.push({ t: new Date(t).toISOString(), v })
  }
  return out
}

export const ndbcDart: Connector = {
  id: 'ndbc-dart',
  label: 'DART deep-ocean tsunami buoy record',
  source: 'NOAA National Data Buoy Center (ndbc.noaa.gov)',
  terms:
    'NOAA data, U.S. government work. Cite NOAA National Data Buoy Center and the buoy number.',
  hosts: [NDBC_HOST],
  options: [
    {
      key: 'station',
      label: 'DART buoy number',
      type: 'text',
      required: true,
      help: 'Five-digit DART buoy number, such as 46404, from the DART map on ndbc.noaa.gov.',
      example: '46404',
    },
  ],
  estimate(q) {
    const years = dartYears(q)
    patternOption(q, 'station', DART_STATION, 'DART buoy number (five digits)')
    return {
      items: [item('dart-record', 'DART water column height', 'series', years.length * 400_000)],
      requests: years.length,
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const station = patternOption(q, 'station', DART_STATION, 'DART buoy number (five digits)')
    if (!station) throw new AppError('VALIDATION', 'Name the DART buoy (five digits)')
    let points: { t: string; v: number }[] = []
    for (const year of dartYears(q)) {
      const r = await ctx.get(dartUrl(station, year))
      if (r.status === 404) continue
      if (r.status !== 200) throw new AppError('INTERNAL', `NDBC answered ${r.status}`)
      let text: string
      try {
        text = gunzipSync(Buffer.from(r.data), { maxOutputLength: 64 * 1024 * 1024 }).toString(
          'utf8',
        )
      } catch {
        throw new AppError('INTERNAL', 'NDBC did not return a compressed DART file')
      }
      points = points.concat(parseDart(text, q.range))
    }
    if (!points.length)
      throw new AppError('NOT_FOUND', 'NDBC has no DART record for that buoy and period')
    const stride = Math.max(1, Math.ceil(points.length / MAX_POINTS))
    const kept = points.filter((_, i) => i % stride === 0)
    return {
      datasets: [
        {
          id: `dart-${station}`,
          kind: 'series',
          label: `DART buoy ${station}, water column height (m)`,
          file: `dart-${station}.json`,
          unit: 'm',
          range: { start: kept[0]!.t, end: kept[kept.length - 1]!.t },
        },
      ],
      files: [jsonFile(`dart-${station}.json`, kept)],
      ...(stride > 1 ? { modified: `The record was thinned to every ${stride}th reading.` } : {}),
      citation: `NOAA National Data Buoy Center, DART station ${station}, https://www.ndbc.noaa.gov/station_page.php?station=${station}`,
    }
  },
}

export const registerWaterLevel = (): void => {
  registerConnector(coopsTides)
  registerConnector(ndbcDart)
}
