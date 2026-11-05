// NOAA National Data Buoy Center connector (spec 0455 FR-6): winds, pressure and waves observed
// at one buoy or coastal station, from the public standard meteorological files on one fixed
// host (https://www.ndbc.noaa.gov). A period in a past calendar year comes from that station's
// year file (about 0.6 MB compressed); a period inside the last 44 days comes from the realtime
// file. Older data of the current year is published month by month and is not fetched here. No
// key. Missing values (99, 999, MM) are left out, never filled in.
import { gunzipSync } from 'node:zlib'
import { AppError } from '../../lib/errors'
import { DAY_MS, num, rangeMs, stringOption } from './noaa-common'
import type { Connector, ConnectorQuery, ConnectorResult } from './registry'

const HOST = 'www.ndbc.noaa.gov'
const REALTIME_DAYS = 44
const YEAR_FILE_BYTES = 650_000
const REALTIME_BYTES = 760_000
const MAX_UNZIPPED = 60_000_000
const STATION = /^[A-Za-z0-9]{5}$/

/** Values the files use for "not measured". */
const MISSING: Record<string, number> = { WDIR: 999, WSPD: 99, GST: 99, WVHT: 99, PRES: 9999 }

const SERIES = [
  {
    key: 'wind',
    label: 'Wind',
    cols: { 'direction deg': 'WDIR', 'speed m/s': 'WSPD', 'gust m/s': 'GST' },
  },
  { key: 'pressure', label: 'Air pressure', unit: 'hPa', cols: { value: 'PRES' } },
  { key: 'waves', label: 'Wave height', unit: 'm', cols: { value: 'WVHT' } },
] as const

const datasetId = (station: string, key: string): string => `ndbc-${station.toLowerCase()}-${key}`

type Source = { kind: 'realtime' } | { kind: 'year'; year: number }

/** Which files cover the period, or an explanation of why none do. */
export function sourcesFor(startMs: number, endMs: number, nowMs: number): Source[] {
  if (startMs >= nowMs - REALTIME_DAYS * DAY_MS) return [{ kind: 'realtime' }]
  const thisYear = new Date(nowMs).getUTCFullYear()
  const first = new Date(startMs).getUTCFullYear()
  const last = new Date(endMs).getUTCFullYear()
  if (last >= thisYear)
    throw new AppError(
      'VALIDATION',
      `NDBC publishes data older than ${REALTIME_DAYS} days in the current year month by month, which this source does not fetch. Choose a period in a past year or in the last ${REALTIME_DAYS} days.`,
    )
  if (last - first >= 3)
    throw new AppError('VALIDATION', 'Ask for at most three years at a time from NDBC')
  return Array.from({ length: last - first + 1 }, (_, i) => ({
    kind: 'year' as const,
    year: first + i,
  }))
}

export function ndbcUrl(station: string, src: Source): string {
  const id = station.toLowerCase()
  return src.kind === 'realtime'
    ? `https://${HOST}/data/realtime2/${station.toUpperCase()}.txt`
    : `https://${HOST}/data/historical/stdmet/${id}h${src.year}.txt.gz`
}

export interface NdbcRow {
  ms: number
  values: Record<string, number | undefined>
}

/** Parse a standard meteorological file: the first header line names the columns. */
export function parseStdmet(text: string): NdbcRow[] {
  const lines = text.split(/\r?\n/)
  const header = lines.find((l) => l.startsWith('#'))
  if (!header) throw new AppError('PROVIDER', 'NDBC sent a file this app could not read')
  const cols = header.replace(/^#/, '').trim().split(/\s+/)
  const at = (name: string) => cols.indexOf(name)
  const yi = cols.findIndex((c) => c === 'YY' || c === 'YYYY')
  const [mi, di, hi, ni] = ['MM', 'DD', 'hh', 'mm'].map(at)
  if (yi < 0 || mi! < 0 || di! < 0 || hi! < 0)
    throw new AppError('PROVIDER', 'NDBC sent an unexpected file layout')
  const out: NdbcRow[] = []
  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) continue
    const f = line.trim().split(/\s+/)
    let year = Number(f[yi])
    if (year < 100) year += year > 50 ? 1900 : 2000
    const ms = Date.UTC(
      year,
      Number(f[mi!]) - 1,
      Number(f[di!]),
      Number(f[hi!]),
      ni! >= 0 ? Number(f[ni!]) : 0,
    )
    if (!Number.isFinite(ms)) continue
    const values: Record<string, number | undefined> = {}
    for (const name of Object.keys(MISSING)) {
      const raw = f[at(name)]
      const v = raw === undefined || raw === 'MM' ? undefined : num(raw)
      values[name] = v === undefined || v >= MISSING[name]! ? undefined : v
    }
    out.push({ ms, values })
  }
  return out
}

function readFile(data: Uint8Array, src: Source): string {
  if (src.kind === 'realtime') return Buffer.from(data).toString('utf8')
  try {
    return gunzipSync(data, { maxOutputLength: MAX_UNZIPPED }).toString('utf8')
  } catch {
    throw new AppError('PROVIDER', 'NDBC sent a year file this app could not unpack')
  }
}

function plan(q: ConnectorQuery, nowMs: number) {
  const station = stringOption(q, 'station', STATION).toUpperCase()
  const { start, end } = rangeMs(q)
  return { station, start, end, sources: sourcesFor(start, end, nowMs) }
}

export function makeNdbc(now: () => number = Date.now): Connector {
  return {
    id: 'noaa-ndbc',
    label: 'NOAA NDBC buoy winds, pressure and waves',
    source: 'NOAA National Data Buoy Center',
    terms:
      'NDBC data are public. Say where they came from; readings left out as missing stay missing.',
    hosts: [HOST],

    estimate(q) {
      const { station, sources } = plan(q, now())
      const per =
        sources[0]?.kind === 'realtime' ? REALTIME_BYTES : YEAR_FILE_BYTES * sources.length
      return {
        items: SERIES.map((s) => ({
          datasetId: datasetId(station, s.key),
          label: `${s.label}, station ${station}`,
          kind: 'series' as const,
          // The files are downloaded once for all three series; the saved series are small.
          bytes: s.key === 'wind' ? per : 40_000,
        })),
        requests: sources.length,
      }
    },

    async fetch(q, ctx): Promise<ConnectorResult> {
      const { station, start, end, sources } = plan(q, now())
      const rows: NdbcRow[] = []
      for (const src of sources) {
        const res = await ctx.get(ndbcUrl(station, src))
        rows.push(...parseStdmet(readFile(res.data, src)))
      }
      const inRange = rows.filter((r) => r.ms >= start && r.ms <= end).sort((a, b) => a.ms - b.ms)
      const datasets: ConnectorResult['datasets'] = []
      const files: ConnectorResult['files'] = []
      for (const s of SERIES) {
        const points = inRange.flatMap((r) => {
          const v: Record<string, number> = {}
          for (const [label, col] of Object.entries(s.cols)) {
            const x = r.values[col]
            if (x !== undefined) v[label] = x
          }
          const keys = Object.keys(v)
          if (!keys.length) return []
          const t = new Date(r.ms).toISOString()
          return [{ t, v: s.key === 'wind' ? v : (v.value as number) }]
        })
        if (!points.length) continue
        const file = `${datasetId(station, s.key)}.json`
        datasets.push({
          id: datasetId(station, s.key),
          kind: 'series',
          label: `${s.label}, NDBC ${station}`,
          file,
          range: { start: points[0]!.t, end: points[points.length - 1]!.t },
          ...('unit' in s ? { unit: s.unit } : {}),
        })
        files.push({ name: file, data: JSON.stringify(points) })
      }
      if (!datasets.length)
        throw new AppError(
          'NOT_FOUND',
          `NDBC has no readings for station ${station} in that period. Check the station id and the dates.`,
        )
      return {
        datasets,
        files,
        citation: `NOAA National Data Buoy Center, station ${station}, standard meteorological data, UTC.`,
      }
    },
  }
}

export const noaaNdbc: Connector = makeNdbc()
