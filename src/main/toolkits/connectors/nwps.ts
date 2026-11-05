// National Water Prediction Service gauge connector (spec 0454 FR-8, FR-9). One gauge's record:
// the point's flood category stages and historic crests, the observed stage over the last weeks,
// the current forecast and the rating curve. The forecast endpoint returns only the forecast
// issued now, never an archive, so a past event replayed from here has no forecast of its own;
// the dataset labels say when the forecast was retrieved. Pinned to API v1: a change of the
// service is a change in this file.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { getJson, toBytes } from './json'
import type { Connector, ConnectorQuery, ConnectorResult, FetchContext } from './registry'

export const NWPS_API = 'https://api.water.noaa.gov/nwps/v1'
/** NWPS reports "no value" as -999 for readings and -9999 for undefined category flows. */
const MISSING = -900

const Category = z.looseObject({ stage: z.number().optional(), flow: z.number().optional() })
const Crest = z.looseObject({
  occurredTime: z.string(),
  stage: z.number(),
  flow: z.number().optional(),
})

export const NwpsGauge = z.looseObject({
  lid: z.string().min(3).max(10),
  usgsId: z.string().nullish(),
  name: z.string(),
  timeZone: z.string().nullish(),
  latitude: z.number(),
  longitude: z.number(),
  rfc: z.looseObject({ abbreviation: z.string() }).nullish(),
  wfo: z.looseObject({ abbreviation: z.string() }).nullish(),
  state: z.looseObject({ abbreviation: z.string() }).nullish(),
  upstreamLid: z.string().nullish(),
  downstreamLid: z.string().nullish(),
  flood: z.looseObject({
    categories: z.looseObject({
      action: Category.nullish(),
      minor: Category.nullish(),
      moderate: Category.nullish(),
      major: Category.nullish(),
    }),
    crests: z.looseObject({ historic: z.array(Crest).default([]) }).nullish(),
  }),
})
export type NwpsGauge = z.infer<typeof NwpsGauge>

const Reading = z.looseObject({
  validTime: z.string(),
  primary: z.number(),
  secondary: z.number().optional(),
})
const Section = z.looseObject({
  issuedTime: z.string().nullish(),
  primaryUnits: z.string().default('ft'),
  data: z.array(Reading),
})
export const NwpsStageFlow = z.looseObject({ observed: Section, forecast: Section })
export const NwpsRatings = z.looseObject({
  data: z.array(z.looseObject({ stage: z.number(), flow: z.number() })),
})

const Options = z.object({
  gauge: z.string().regex(/^[A-Za-z0-9]{5}$/, 'A gauge id is five letters and digits'),
  neighbors: z.boolean().default(false),
})

/** Stages of the point's categories in feet; a missing or undefined stage is left out. */
export function categoryStages(g: NwpsGauge): Record<string, number> {
  const c = g.flood.categories
  const out: Record<string, number> = {}
  for (const k of ['action', 'minor', 'moderate', 'major'] as const) {
    const stage = c[k]?.stage
    if (stage !== undefined && stage > MISSING) out[k] = stage
  }
  // NWS flood stage is the bottom of the minor category.
  if (out.minor !== undefined) out.flood = out.minor
  return out
}

const isoZ = (s: string): string => new Date(Date.parse(s)).toISOString().replace('.000Z', 'Z')
const THIN_RATING = 160

function thin<T>(rows: readonly T[], max: number): T[] {
  if (rows.length <= max) return [...rows]
  return Array.from(
    { length: max },
    (_, i) => rows[Math.round((i * (rows.length - 1)) / (max - 1))]!,
  )
}

/** The gauge as one GeoJSON point whose properties carry what the figures need. */
export function gaugeFeatureCollection(
  g: NwpsGauge,
  rating: readonly { stage: number; flow: number }[],
): unknown {
  const crests = [...(g.flood.crests?.historic ?? [])]
    .filter((c) => c.stage > MISSING)
    .sort((a, b) => b.stage - a.stage)
    .slice(0, 10)
    .map((c) => ({ date: c.occurredTime.slice(0, 10), stage: c.stage }))
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [g.longitude, g.latitude] },
        properties: {
          kind: 'flood_gauge',
          lid: g.lid,
          name: g.name,
          usgsId: g.usgsId ?? null,
          timeZone: g.timeZone ?? null,
          unit: 'ft',
          categories: categoryStages(g),
          historicCrests: crests,
          upstreamLid: g.upstreamLid ?? null,
          downstreamLid: g.downstreamLid ?? null,
          rfc: g.rfc?.abbreviation ?? null,
          wfo: g.wfo?.abbreviation ?? null,
          rating: thin(rating, THIN_RATING).map((r) => [r.stage, r.flow]),
        },
      },
    ],
  }
}

const series = (rows: readonly z.infer<typeof Reading>[]) =>
  rows
    .filter((r) => r.primary > MISSING)
    .map((r) => ({ t: isoZ(r.validTime), v: r.primary }))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))

async function fetchOne(
  lid: string,
  query: ConnectorQuery,
  ctx: FetchContext,
  withSeries: boolean,
): Promise<{ result: ConnectorResult; gauge: NwpsGauge }> {
  const id = lid.toUpperCase()
  const base = `${NWPS_API}/gauges/${id}`
  const gauge = await getJson(ctx, base, NwpsGauge, 'The National Water Prediction Service')
  const ratings = await getJson(
    ctx,
    `${base}/ratings`,
    NwpsRatings,
    'The National Water Prediction Service',
  ).catch(() => ({ data: [] as { stage: number; flow: number }[] }))
  const lower = id.toLowerCase()
  const datasets: ConnectorResult['datasets'] = [
    {
      id: `gauge-${lower}`,
      kind: 'features',
      label: `${gauge.name} (${id}): gauge record`,
      file: `gauge-${lower}.geojson`,
      unit: 'ft',
    },
  ]
  const files: ConnectorResult['files'] = [
    { name: `gauge-${lower}.geojson`, data: toBytes(gaugeFeatureCollection(gauge, ratings.data)) },
  ]
  let modified: string | undefined
  if (withSeries) {
    const flow = await getJson(
      ctx,
      `${base}/stageflow`,
      NwpsStageFlow,
      'The National Water Prediction Service',
    )
    const start = Date.parse(query.range.start)
    const end = Date.parse(query.range.end)
    const observed = series(flow.observed.data).filter(
      (p) => Date.parse(p.t) >= start && Date.parse(p.t) <= end,
    )
    if (observed.length) {
      datasets.push({
        id: `stage-observed-${lower}`,
        kind: 'series',
        label: `${gauge.name} (${id}): observed stage`,
        file: `stage-observed-${lower}.json`,
        unit: 'ft',
        range: { start: observed[0]!.t, end: observed.at(-1)!.t },
      })
      files.push({ name: `stage-observed-${lower}.json`, data: toBytes(observed) })
    } else {
      modified =
        'The service keeps only about a month of observed stage; none fell in the requested period (use the USGS source for older events).'
    }
    const forecast = series(flow.forecast.data)
    if (forecast.length) {
      const issued = flow.forecast.issuedTime ? isoZ(flow.forecast.issuedTime) : undefined
      datasets.push({
        id: `stage-forecast-${lower}`,
        kind: 'series',
        label: `${gauge.name.slice(0, 50)} (${id}): forecast${issued ? ` issued ${issued}` : ''}, not an archive`,
        file: `stage-forecast-${lower}.json`,
        unit: 'ft',
        range: { start: forecast[0]!.t, end: forecast.at(-1)!.t },
      })
      files.push({ name: `stage-forecast-${lower}.json`, data: toBytes(forecast) })
    }
  }
  return {
    gauge,
    result: {
      datasets,
      files,
      ...(modified ? { modified } : {}),
      citation: `NOAA National Weather Service, National Water Prediction Service, gauge ${id}`,
    },
  }
}

export const nwpsConnector: Connector = {
  id: 'nwps',
  label: 'NWS river gauge (National Water Prediction Service)',
  source: 'NOAA National Water Prediction Service',
  terms:
    'US Government work, public domain. Observed stage covers about the last month; the forecast is the current one only.',
  hosts: ['api.water.noaa.gov'],
  estimate(query) {
    const o = Options.parse(query.options)
    const per = (lid: string) => [
      {
        datasetId: `gauge-${lid}`,
        label: 'Gauge record and rating',
        kind: 'features' as const,
        bytes: 150_000,
      },
      {
        datasetId: `stage-observed-${lid}`,
        label: 'Observed stage',
        kind: 'series' as const,
        bytes: 250_000,
      },
    ]
    const lids = [o.gauge.toLowerCase(), ...(o.neighbors ? ['upstream', 'downstream'] : [])]
    return { requests: lids.length * 3, items: lids.flatMap(per) }
  },
  async fetch(query, ctx) {
    const o = Options.parse(query.options)
    const { result, gauge } = await fetchOne(o.gauge, query, ctx, true)
    if (!o.neighbors) return result
    for (const n of [gauge.upstreamLid, gauge.downstreamLid]) {
      if (!n) continue
      if (!/^[A-Za-z0-9]{5}$/.test(n))
        throw new AppError('PROVIDER', 'The service named a neighboring gauge with an odd id')
      const more = (await fetchOne(n, query, ctx, true)).result
      result.datasets.push(...more.datasets)
      result.files.push(...more.files)
    }
    return result
  },
}
