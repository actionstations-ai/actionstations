// NOAA CO-OPS (Tides and Currents) connector (spec 0455 FR-6): water levels, winds and currents
// observed at one station over a period, as case data series. One fixed host, the public data
// API (https://api.tidesandcurrents.noaa.gov/api/prod/datagetter), 6-minute data in metric units,
// time in GMT. The API limits 6-minute data to one month a request, so a longer period is fetched
// in 30-day windows (at most three, about three months). No key; the `application` parameter
// names this app as CO-OPS asks external users to.
import type { CaseDataset } from '@shared/schemas/case-data'
import { AppError } from '../../lib/errors'
import { coopsDate, num, rangeMs, stringOption, utcToIso, windows } from './noaa-common'
import type { Connector, ConnectorQuery, ConnectorResult, FetchContext } from './registry'

const HOST = 'api.tidesandcurrents.noaa.gov'
const BASE = `https://${HOST}/api/prod/datagetter`
const MAX_WINDOWS = 3
const WINDOW_DAYS = 30

const PRODUCTS = ['water_level', 'wind', 'currents'] as const
type Product = (typeof PRODUCTS)[number]

interface ProductInfo {
  label: string
  /** Estimated bytes of API response per 6-minute reading. */
  bytesPerReading: number
  unit?: string
}

const INFO: Record<Product, ProductInfo> = {
  water_level: { label: 'Water level', bytesPerReading: 75, unit: 'm' },
  wind: { label: 'Wind', bytesPerReading: 85 },
  currents: { label: 'Current', bytesPerReading: 60 },
}

const STATION = /^[A-Za-z0-9]{5,10}$/

function chosen(q: ConnectorQuery): Product[] {
  const raw = stringOption(q, 'products', /^[a-z_,\s]+$/, 'water_level,wind')
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const bad = list.find((p) => !(PRODUCTS as readonly string[]).includes(p))
  if (bad || !list.length)
    throw new AppError('VALIDATION', `Choose from ${PRODUCTS.join(', ')} (got ${bad ?? 'nothing'})`)
  return [...new Set(list)] as Product[]
}

function plan(q: ConnectorQuery) {
  const station = stringOption(q, 'station', STATION)
  const { start, end } = rangeMs(q)
  const wins = windows(start, end, WINDOW_DAYS)
  if (wins.length > MAX_WINDOWS)
    throw new AppError(
      'VALIDATION',
      `Ask for at most ${MAX_WINDOWS * WINDOW_DAYS} days at a time from CO-OPS`,
    )
  return { station, start, end, wins, products: chosen(q) }
}

const datasetId = (station: string, p: Product): string =>
  `coops-${station.toLowerCase()}-${p.replace('_', '-')}`

export function coopsUrl(
  product: Product,
  station: string,
  from: number,
  to: number,
  datum: string,
): string {
  const params = new URLSearchParams({
    product,
    application: 'ActionStations',
    begin_date: coopsDate(from),
    end_date: coopsDate(to),
    station,
    time_zone: 'gmt',
    units: 'metric',
    format: 'json',
  })
  if (product === 'water_level') params.set('datum', datum)
  return `${BASE}?${params.toString()}`
}

interface Reading {
  t: string
  v: number | Record<string, number>
}

interface CoopsBody {
  metadata?: { id?: string; name?: string; lat?: string; lon?: string }
  data?: Record<string, string>[]
  error?: { message?: string }
}

/** One reading in the series shape, or undefined when the archive left a value out. */
export function toReading(product: Product, r: Record<string, string>): Reading | undefined {
  if (!r.t) return undefined
  const t = utcToIso(r.t)
  if (product === 'water_level') {
    const v = num(r.v)
    return v === undefined ? undefined : { t, v }
  }
  if (product === 'wind') {
    const speed = num(r.s)
    const dir = num(r.d)
    const gust = num(r.g)
    if (speed === undefined) return undefined
    return {
      t,
      v: {
        'speed m/s': speed,
        ...(gust !== undefined ? { 'gust m/s': gust } : {}),
        ...(dir !== undefined ? { 'direction deg': dir } : {}),
      },
    }
  }
  // Currents come in centimeters per second.
  const cm = num(r.s)
  const dir = num(r.d)
  if (cm === undefined) return undefined
  return {
    t,
    v: {
      'speed m/s': Math.round(cm) / 100,
      ...(dir !== undefined ? { 'direction deg': dir } : {}),
    },
  }
}

async function fetchProduct(
  p: Product,
  station: string,
  wins: { from: number; to: number }[],
  datum: string,
  ctx: FetchContext,
): Promise<{ readings: Reading[]; meta: CoopsBody['metadata'] }> {
  const readings: Reading[] = []
  let meta: CoopsBody['metadata']
  for (const w of wins) {
    const res = await ctx.get(coopsUrl(p, station, w.from, w.to, datum))
    let body: CoopsBody
    try {
      body = JSON.parse(Buffer.from(res.data).toString('utf8')) as CoopsBody
    } catch {
      throw new AppError('PROVIDER', 'CO-OPS sent an answer this app could not read')
    }
    if (body.error) {
      if (/no data/i.test(body.error.message ?? '')) continue
      throw new AppError('PROVIDER', `CO-OPS: ${(body.error.message ?? 'error').trim()}`)
    }
    meta ??= body.metadata
    for (const row of body.data ?? []) {
      const r = toReading(p, row)
      if (r) readings.push(r)
    }
  }
  return { readings, meta }
}

export const noaaCoops: Connector = {
  id: 'noaa-coops',
  label: 'NOAA CO-OPS water levels, winds and currents',
  source: 'NOAA CO-OPS Tides and Currents',
  terms:
    'NOAA data are public. Say where they came from; CO-OPS asks users to download only what they need.',
  hosts: [HOST],
  options: [
    {
      key: 'station',
      label: 'Station id',
      type: 'text',
      required: true,
      help: 'NOAA Tides and Currents station id, such as 8518750 for The Battery, NY, from tidesandcurrents.noaa.gov.',
      example: '8518750',
    },
    {
      key: 'products',
      label: 'Measurements',
      type: 'text',
      help: 'Comma-separated list from water_level, wind and currents; currents need a current station id, such as cb1101.',
      default: 'water_level,wind',
      example: 'water_level,wind',
    },
    {
      key: 'datum',
      label: 'Water level datum',
      type: 'text',
      help: 'The reference the water level is measured from, such as MLLW (mean lower low water), MSL or NAVD.',
      default: 'MLLW',
      example: 'MLLW',
    },
  ],

  estimate(q) {
    const { station, start, end, wins, products } = plan(q)
    const readings = Math.ceil((end - start) / (6 * 60_000))
    return {
      items: products.map((p) => ({
        datasetId: datasetId(station, p),
        label: `${INFO[p].label}, station ${station}`,
        kind: 'series',
        bytes: readings * INFO[p].bytesPerReading,
      })),
      requests: wins.length * products.length,
    }
  },

  async fetch(q, ctx): Promise<ConnectorResult> {
    const { station, start, end, wins, products } = plan(q)
    const datum = stringOption(q, 'datum', /^[A-Za-z]{3,5}$/, 'MLLW').toUpperCase()
    const datasets: ConnectorResult['datasets'] = []
    const files: ConnectorResult['files'] = []
    for (const p of products) {
      const { readings, meta } = await fetchProduct(p, station, wins, datum, ctx)
      const inRange = readings.filter((r) => Date.parse(r.t) >= start && Date.parse(r.t) <= end)
      if (!inRange.length) continue
      const lat = num(meta?.lat)
      const lon = num(meta?.lon)
      const file = `${datasetId(station, p)}.json`
      const name = meta?.name ? `, ${meta.name}` : ''
      const first = inRange[0]!.t
      const last = inRange[inRange.length - 1]!.t
      datasets.push({
        id: datasetId(station, p),
        kind: 'series',
        label:
          `${INFO[p].label}${name} (${station})${p === 'water_level' ? `, ${datum}` : ''}`.slice(
            0,
            120,
          ),
        file,
        range: { start: first, end: last },
        ...(lat !== undefined && lon !== undefined
          ? {
              area: {
                label: meta?.name ?? station,
                bbox: [lon, lat, lon, lat] as [number, number, number, number],
              },
            }
          : {}),
        ...(INFO[p].unit ? { unit: INFO[p].unit } : {}),
      } satisfies Omit<CaseDataset, 'provenance' | 'bytes'>)
      files.push({ name: file, data: JSON.stringify(inRange) })
    }
    if (!datasets.length)
      throw new AppError(
        'NOT_FOUND',
        `CO-OPS has no ${products.join(' or ')} data for station ${station} in that period. Check the station number and the dates.`,
      )
    return {
      datasets,
      files,
      citation: `NOAA CO-OPS Tides and Currents, station ${station}, ${new Date(start).toISOString().slice(0, 10)} to ${new Date(end).toISOString().slice(0, 10)}, 6-minute data, metric units, GMT.`,
    }
  },
}
