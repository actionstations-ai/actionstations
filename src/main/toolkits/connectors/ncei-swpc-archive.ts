// NCEI archive of Space Weather Prediction Center daily products (spec 0468 FR-6, FR-7): for each
// UTC day of a past period, the daily space weather indices (planetary Kp by three-hour interval,
// flare counts) and the daily geomagnetic forecast text as SWPC issued it. This is where a storm
// from before the last week comes from; the real-time feeds hold only the recent past. A day with
// no archived file is reported and never filled in. The host serves plain files at a fixed path
// layout (year, month, date), so the path is built from the period and nothing else.
import { AppError } from '../../lib/errors'
import { parseDailyIndices, parseIssued, hasKpForecast } from '../space_weather/archives'
import { DAY_MS, rangeMs } from './noaa-common'
import type {
  Connector,
  ConnectorEstimate,
  ConnectorQuery,
  ConnectorResult,
  FetchContext,
} from './registry'

export const NCEI_SWPC_HOST = 'www.ngdc.noaa.gov'
const BASE = `https://${NCEI_SWPC_HOST}/stp/space-weather/swpc-products/daily_reports`
const MAX_DAYS = 14
/** A day's geomagnetic forecast text is about 0.9 kB. */
const FORECAST_BYTES = 900

const pad = (n: number): string => String(n).padStart(2, '0')

/** UTC days (YYYY-MM-DD) that the period touches, from its first moment to its last. */
export function archiveDays(startIso: string, endIso: string): string[] {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  const out: string[] = []
  for (let d = Math.floor(start / DAY_MS) * DAY_MS; d < end; d += DAY_MS) {
    const x = new Date(d)
    out.push(`${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`)
  }
  return out
}

export const indicesUrl = (day: string): string => {
  const [y, m, d] = day.split('-')
  return `${BASE}/space_weather_indices/${y}/${m}/${y}${m}${d}dayind.txt`
}
export const forecastUrl = (day: string): string => {
  const [y, m, d] = day.split('-')
  return `${BASE}/geomag_forecast/${y}/${m}/${y}${m}${d}geomag_forecast.txt`
}

function days(q: ConnectorQuery): string[] {
  rangeMs(q)
  const list = archiveDays(q.range.start, q.range.end)
  if (list.length > MAX_DAYS)
    throw new AppError('VALIDATION', `That spans ${list.length} days; the most is ${MAX_DAYS}`)
  return list
}

function estimate(q: ConnectorQuery): ConnectorEstimate {
  const n = days(q).length
  return {
    items: [
      {
        datasetId: 'kp-archive',
        label: `Planetary Kp, ${n} day${n === 1 ? '' : 's'}`,
        kind: 'series',
        bytes: n * 8 * 60,
      },
      { datasetId: 'flare-counts', label: 'Flare counts by day', kind: 'series', bytes: n * 90 },
      {
        datasetId: 'swpc-forecasts',
        label: 'Daily geomagnetic forecast text',
        kind: 'reports',
        bytes: n * FORECAST_BYTES,
      },
    ],
    requests: n * 2,
  }
}

const isMissing = (e: unknown): boolean => e instanceof AppError && /HTTP 404/.test(e.message)

async function tryGet(ctx: FetchContext, url: string): Promise<string | undefined> {
  try {
    return new TextDecoder().decode((await ctx.get(url)).data)
  } catch (e) {
    if (isMissing(e)) return undefined
    throw e
  }
}

async function fetchArchive(q: ConnectorQuery, ctx: FetchContext): Promise<ConnectorResult> {
  const { start, end } = rangeMs(q)
  const kp: { t: string; v: number }[] = []
  const flares: { t: string; v: { c: number; m: number; x: number } }[] = []
  const forecasts: { t: string; title: string; text: string }[] = []
  const missing: string[] = []
  for (const day of days(q)) {
    const idx = await tryGet(ctx, indicesUrl(day))
    const parsed = idx ? parseDailyIndices(idx, day) : undefined
    if (!idx) missing.push(`indices ${day}`)
    else if (!parsed)
      throw new AppError(
        'PROVIDER',
        `The indices file for ${day} is not in the layout this app reads; the archive may have changed.`,
      )
    if (parsed) {
      kp.push(
        ...parsed.kp.filter(
          (p) => Date.parse(p.t) + 3 * 3_600_000 > start && Date.parse(p.t) < end,
        ),
      )
      if (parsed.flares) flares.push({ t: `${day}T00:00:00.000Z`, v: parsed.flares })
    }
    const fc = await tryGet(ctx, forecastUrl(day))
    if (!fc) missing.push(`forecast ${day}`)
    else if (hasKpForecast(fc) && parseIssued(fc))
      forecasts.push({ t: parseIssued(fc)!, title: `Geomagnetic forecast issued ${day}`, text: fc })
  }
  if (!kp.length && !forecasts.length)
    throw new AppError('PROVIDER', 'The archive has no space weather files for those days.')
  const range = { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
  return {
    datasets: [
      {
        id: 'kp-archive',
        kind: 'series',
        label: 'Planetary Kp by three-hour interval (NCEI archive)',
        file: 'kp-archive.json',
        range,
        unit: 'Kp',
      },
      {
        id: 'flare-counts',
        kind: 'series',
        label: 'Flares per day by X-ray class (NCEI archive)',
        file: 'flare-counts.json',
        range,
        unit: 'count',
      },
      {
        id: 'swpc-forecasts',
        kind: 'reports',
        label: 'Daily geomagnetic forecast text (NCEI archive)',
        file: 'swpc-forecasts.json',
        range,
      },
    ],
    files: [
      { name: 'kp-archive.json', data: JSON.stringify(kp) },
      { name: 'flare-counts.json', data: JSON.stringify(flares) },
      { name: 'swpc-forecasts.json', data: JSON.stringify(forecasts) },
    ],
    ...(missing.length ? { modified: `Not archived, left out: ${missing.join(', ')}` } : {}),
    citation: 'NOAA Space Weather Prediction Center daily products, archived by NOAA NCEI.',
  }
}

export const nceiSwpcArchiveConnector: Connector = {
  id: 'ncei-swpc-archive',
  label: 'SWPC daily products archive (NCEI)',
  source: 'NOAA NCEI archive of Space Weather Prediction Center daily products',
  terms: 'US government work, public domain. Cite NOAA SWPC and NCEI.',
  hosts: [NCEI_SWPC_HOST],
  estimate,
  fetch: fetchArchive,
}
