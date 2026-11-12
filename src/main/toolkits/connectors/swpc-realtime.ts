// SWPC data service (spec 0468 FR-6): the recent past of planetary Kp, GOES X-ray flux, GOES
// proton flux, GOES magnetometer, solar wind speed, and the alerts, watches and warnings list,
// from services.swpc.noaa.gov. These feeds hold about the last week at most; a storm from before
// that comes from the NCEI archive connector. No key is used and the request carries no place.
// Every response is validated, because these feeds have changed shape (the Kp feed did).
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { parseSwpcMessage } from '../space_weather/archives'
import { getJson } from './json'
import { rangeMs, stringOption } from './noaa-common'
import type {
  Connector,
  ConnectorEstimate,
  ConnectorQuery,
  ConnectorResult,
  FetchContext,
} from './registry'

export const SWPC_HOST = 'services.swpc.noaa.gov'
const BASE = `https://${SWPC_HOST}`
const PRODUCTS = ['kp', 'xray', 'proton', 'magnetometer', 'alerts', 'wind'] as const
type Product = (typeof PRODUCTS)[number]
const SOURCE = 'The SWPC data service'

/** About what each feed costs for one day of data. */
const DAY_BYTES: Record<Product, number> = {
  kp: 4_500,
  xray: 650_000,
  proton: 240_000,
  magnetometer: 260_000,
  alerts: 55_000,
  wind: 2_450_000,
}
const SERIES_LABEL: Record<Exclude<Product, 'alerts'>, string> = {
  kp: 'Planetary Kp',
  xray: 'GOES X-ray flux (0.1 to 0.8 nm)',
  proton: 'GOES proton flux (10 MeV and above)',
  magnetometer: 'GOES magnetometer (Hp component)',
  wind: 'Solar wind speed',
}

const KpFeed = z.array(z.looseObject({ time_tag: z.string(), Kp: z.number() }))
const FluxFeed = z.array(
  z.looseObject({ time_tag: z.string(), flux: z.number().nullable(), energy: z.string() }),
)
const MagFeed = z.array(z.looseObject({ time_tag: z.string(), Hp: z.number().nullable() }))
const WindFeed = z.array(
  z.looseObject({ time_tag: z.string(), proton_speed: z.number().nullable() }),
)
const AlertFeed = z.array(
  z.looseObject({ product_id: z.string(), issue_datetime: z.string(), message: z.string() }),
)

interface Options {
  products: Product[]
  window: '1-day' | '3-day' | '7-day'
}

function options(q: ConnectorQuery): Options {
  const list = stringOption(q, 'products', /^[a-z,]+$/, 'kp,xray,proton,magnetometer,alerts')
    .split(',')
    .filter(Boolean)
  const bad = list.find((p) => !(PRODUCTS as readonly string[]).includes(p))
  if (bad) throw new AppError('VALIDATION', `"${bad}" is not a product this source has`)
  return {
    products: list as Product[],
    window: stringOption(q, 'window', /^(1|3|7)-day$/, '1-day') as Options['window'],
  }
}

const dayCount = (w: Options['window']): number => Number(w[0])

function estimate(q: ConnectorQuery): ConnectorEstimate {
  const o = options(q)
  rangeMs(q)
  const items = o.products.map((p) => {
    const scale = p === 'xray' || p === 'proton' || p === 'magnetometer' ? dayCount(o.window) : 1
    return {
      datasetId: p === 'alerts' ? 'swpc-messages' : `swpc-${p}`,
      label: p === 'alerts' ? 'SWPC alerts, watches and warnings' : SERIES_LABEL[p],
      kind: (p === 'alerts' ? 'reports' : 'series') as 'reports' | 'series',
      bytes: DAY_BYTES[p] * scale,
    }
  })
  return { items, requests: o.products.length }
}

/** A feed time, which is UTC with or without a trailing Z, as an ISO time. */
function feedTime(t: string): string {
  const s = t.trim().replace(' ', 'T')
  const ms = Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`)
  if (Number.isNaN(ms))
    throw new AppError('PROVIDER', `${SOURCE} sent a time this app cannot read: ${t}`)
  return new Date(ms).toISOString()
}

const inRange = (t: string, start: number, end: number): boolean => {
  const ms = Date.parse(t)
  return ms >= start && ms <= end
}

type Series = { t: string; v: number }[]

async function series(
  p: Exclude<Product, 'alerts'>,
  o: Options,
  ctx: FetchContext,
  r: { start: number; end: number },
): Promise<Series> {
  const w = o.window
  const keep = (rows: { time_tag: string; v: number | null }[]): Series =>
    rows.flatMap((x) => {
      const t = feedTime(x.time_tag)
      return x.v === null || !inRange(t, r.start, r.end) ? [] : [{ t, v: x.v }]
    })
  if (p === 'kp') {
    const rows = await getJson(ctx, `${BASE}/products/noaa-planetary-k-index.json`, KpFeed, SOURCE)
    return keep(rows.map((x) => ({ time_tag: x.time_tag, v: x.Kp })))
  }
  if (p === 'xray' || p === 'proton') {
    const file = p === 'xray' ? `xrays-${w}` : `integral-protons-${w}`
    const energy = p === 'xray' ? '0.1-0.8nm' : '>=10 MeV'
    const rows = await getJson(ctx, `${BASE}/json/goes/primary/${file}.json`, FluxFeed, SOURCE)
    return keep(
      rows.filter((x) => x.energy === energy).map((x) => ({ time_tag: x.time_tag, v: x.flux })),
    )
  }
  if (p === 'magnetometer') {
    const rows = await getJson(
      ctx,
      `${BASE}/json/goes/primary/magnetometers-${w}.json`,
      MagFeed,
      SOURCE,
    )
    return keep(rows.map((x) => ({ time_tag: x.time_tag, v: x.Hp })))
  }
  const rows = await getJson(ctx, `${BASE}/json/rtsw/rtsw_wind_1m.json`, WindFeed, SOURCE)
  return keep(
    rows
      .filter((x) => Date.parse(feedTime(x.time_tag)) % 300_000 === 0)
      .map((x) => ({ time_tag: x.time_tag, v: x.proton_speed })),
  )
}

async function alerts(ctx: FetchContext, r: { start: number; end: number }) {
  const rows = await getJson(ctx, `${BASE}/products/alerts.json`, AlertFeed, SOURCE)
  return rows.flatMap((a) => {
    const t = feedTime(a.issue_datetime)
    const parsed = parseSwpcMessage(a.message)
    return inRange(t, r.start, r.end)
      ? [{ t, product: a.product_id, text: a.message.replace(/\r\n/g, '\n'), parsed }]
      : []
  })
}

async function fetchRealtime(q: ConnectorQuery, ctx: FetchContext): Promise<ConnectorResult> {
  const o = options(q)
  const r = rangeMs(q)
  const range = { start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString() }
  const datasets: ConnectorResult['datasets'] = []
  const files: ConnectorResult['files'] = []
  for (const p of o.products) {
    if (p === 'alerts') {
      const rows = await alerts(ctx, r)
      if (!rows.length) continue
      datasets.push(
        {
          id: 'swpc-messages',
          kind: 'reports',
          label: 'SWPC alerts, watches and warnings',
          file: 'swpc-messages.json',
          range,
        },
        {
          id: 'swpc-events',
          kind: 'features',
          label: 'SWPC messages as events',
          file: 'swpc-events.geojson',
          range,
        },
      )
      files.push(
        {
          name: 'swpc-messages.json',
          data: JSON.stringify(
            rows.map((x) => ({
              t: x.t,
              title: x.parsed ? `${x.parsed.code} serial ${x.parsed.serial}` : x.product,
              text: x.text,
            })),
          ),
        },
        {
          name: 'swpc-events.geojson',
          data: JSON.stringify({
            type: 'FeatureCollection',
            features: [],
            events: rows.flatMap((x) =>
              x.parsed
                ? [
                    {
                      id: `swpc-${x.parsed.code}-${x.parsed.serial}`,
                      time: x.t,
                      kind: 'swpc_message',
                      attrs: {
                        code: x.parsed.code,
                        productKind: x.parsed.kind,
                        headline: x.parsed.headline,
                        serial: x.parsed.serial,
                      },
                    },
                  ]
                : [],
            ),
          }),
        },
      )
      continue
    }
    const points = await series(p, o, ctx, r)
    if (!points.length) continue
    const id = `swpc-${p}`
    datasets.push({
      id,
      kind: 'series',
      label: SERIES_LABEL[p],
      file: `${id}.json`,
      range,
      unit: { kp: 'Kp', xray: 'W/m2', proton: 'pfu', magnetometer: 'nT', wind: 'km/s' }[p],
    })
    files.push({ name: `${id}.json`, data: JSON.stringify(points) })
  }
  if (!datasets.length)
    throw new AppError(
      'PROVIDER',
      'The SWPC data service holds only about the last week; nothing in it falls in that period. For an older storm use the NCEI archive.',
    )
  return {
    datasets,
    files,
    modified: 'Cropped to the scenario period; solar wind speed thinned to five-minute values.',
    citation: 'NOAA Space Weather Prediction Center data service, services.swpc.noaa.gov.',
  }
}

export const swpcRealtimeConnector: Connector = {
  id: 'swpc-realtime',
  label: 'SWPC data service (recent past)',
  source: 'NOAA Space Weather Prediction Center data service',
  terms: 'US government work, public domain. Cite NOAA SWPC.',
  hosts: [SWPC_HOST],
  options: [
    {
      key: 'products',
      label: 'Feeds',
      type: 'text',
      help: 'Comma-separated list from kp, xray, proton, magnetometer, alerts and wind, with no spaces.',
      default: 'kp,xray,proton,magnetometer,alerts',
      example: 'kp,xray,alerts',
    },
    {
      key: 'window',
      label: 'How far back',
      type: 'choice',
      help: 'How many recent days of the X-ray, proton and magnetometer feeds to fetch.',
      choices: [
        { value: '1-day', label: 'The last day' },
        { value: '3-day', label: 'The last 3 days' },
        { value: '7-day', label: 'The last 7 days' },
      ],
      default: '1-day',
      example: '1-day',
    },
  ],
  estimate,
  fetch: fetchRealtime,
}
