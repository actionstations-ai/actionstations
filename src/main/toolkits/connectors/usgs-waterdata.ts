// USGS Water Data OGC API connector (spec 0454 FR-8, FR-9): observed stage or flow at one or a
// few USGS stream gauges, instantaneous or daily, for a past period. This is the source of a
// replayed event's observed series. The retiring WaterServices are not used. Pinned to the
// ogcapi/v0 path: a change of the service is a change in this file.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { getJson, toBytes } from './json'
import type { Connector, ConnectorQuery, ConnectorResult, FetchContext } from './registry'

export const USGS_API = 'https://api.waterdata.usgs.gov/ogcapi/v0'
export const USGS_PARAMETERS = {
  stage: { code: '00065', unit: 'ft', label: 'stage' },
  flow: { code: '00060', unit: 'cfs', label: 'flow' },
} as const

const Feature = z.looseObject({
  properties: z.looseObject({
    time: z.string(),
    value: z.union([z.string(), z.number()]).nullish(),
    statistic_id: z.string().nullish(),
    approval_status: z.string().nullish(),
  }),
})
const Page = z.looseObject({
  features: z.array(Feature),
  links: z.array(z.looseObject({ rel: z.string(), href: z.string() })).default([]),
})

const Options = z.object({
  /** One to three USGS site numbers (8 to 15 digits), comma separated. */
  sites: z
    .string()
    .regex(
      /^\d{8,15}(,\d{8,15}){0,2}$/,
      'Site numbers are 8 to 15 digits, up to three, with commas',
    ),
  parameter: z.enum(['stage', 'flow']).default('stage'),
  interval: z.enum(['continuous', 'daily']).default('continuous'),
})

const MS_DAY = 86_400_000
const MAX_CONTINUOUS_DAYS = 45
const MAX_PAGES = 30
const BYTES_PER_FEATURE = 700

const spanDays = (q: ConnectorQuery): number =>
  Math.max(0, (Date.parse(q.range.end) - Date.parse(q.range.start)) / MS_DAY)

function checkRange(o: z.infer<typeof Options>, q: ConnectorQuery): void {
  if (!(spanDays(q) > 0))
    throw new AppError('VALIDATION', 'The end of the period is before its start')
  if (o.interval === 'continuous' && spanDays(q) > MAX_CONTINUOUS_DAYS)
    throw new AppError(
      'VALIDATION',
      `Instantaneous values are limited to ${MAX_CONTINUOUS_DAYS} days; choose daily values or a shorter period.`,
    )
}

const sites = (o: z.infer<typeof Options>): string[] => o.sites.split(',')

/** The time as an ISO string at second precision, in UTC. */
const isoZ = (s: string): string => {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s
  return new Date(Date.parse(t)).toISOString().replace('.000Z', 'Z')
}

/** Points from the features of one statistic: the one with the most points when several exist. */
export function seriesFromFeatures(
  features: readonly z.infer<typeof Feature>[],
): { t: string; v: number }[] {
  const byStat = new Map<string, { t: string; v: number }[]>()
  for (const f of features) {
    const v =
      typeof f.properties.value === 'number' ? f.properties.value : Number(f.properties.value)
    if (
      f.properties.value === null ||
      f.properties.value === undefined ||
      f.properties.value === '' ||
      !Number.isFinite(v)
    )
      continue
    const stat = f.properties.statistic_id ?? ''
    const list = byStat.get(stat) ?? []
    list.push({ t: isoZ(f.properties.time), v })
    byStat.set(stat, list)
  }
  const best = [...byStat.values()].sort((a, b) => b.length - a.length)[0] ?? []
  const seen = new Set<string>()
  return best
    .filter((p) => (seen.has(p.t) ? false : (seen.add(p.t), true)))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t))
}

async function fetchSite(
  site: string,
  o: z.infer<typeof Options>,
  q: ConnectorQuery,
  ctx: FetchContext,
): Promise<z.infer<typeof Feature>[]> {
  const p = USGS_PARAMETERS[o.parameter]
  const collection = o.interval === 'continuous' ? 'continuous' : 'daily'
  const time =
    o.interval === 'continuous'
      ? `${q.range.start}/${q.range.end}`
      : `${q.range.start.slice(0, 10)}/${q.range.end.slice(0, 10)}`
  let url: string | undefined =
    `${USGS_API}/collections/${collection}/items?monitoring_location_id=USGS-${site}` +
    `&parameter_code=${p.code}&time=${encodeURIComponent(time)}&limit=10000&f=json`
  const all: z.infer<typeof Feature>[] = []
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res: z.infer<typeof Page> = await getJson(ctx, url, Page, 'The USGS Water Data API')
    all.push(...res.features)
    url = res.features.length ? res.links.find((l) => l.rel === 'next')?.href : undefined
  }
  return all
}

export const usgsWaterdataConnector: Connector = {
  id: 'usgs-waterdata',
  label: 'USGS stream gauge values (Water Data API)',
  source: 'USGS Water Data for the Nation',
  terms:
    'US Government work, public domain. Data from before the last water year may be provisional; cite the USGS site number.',
  hosts: ['api.waterdata.usgs.gov'],
  options: [
    {
      key: 'sites',
      label: 'USGS site numbers',
      type: 'text',
      required: true,
      help: 'One to three USGS site numbers (8 to 15 digits) separated by commas, such as 03255000, from waterdata.usgs.gov.',
      example: '03255000',
    },
    {
      key: 'parameter',
      label: 'Measurement',
      type: 'choice',
      help: 'Water height (stage, feet) or discharge (flow, cubic feet per second).',
      choices: [
        { value: 'stage', label: 'Stage (feet)' },
        { value: 'flow', label: 'Flow (cubic feet per second)' },
      ],
      default: 'stage',
      example: 'stage',
    },
    {
      key: 'interval',
      label: 'Interval',
      type: 'choice',
      help: 'Instantaneous values (every 15 minutes, at most 45 days) or one value a day.',
      choices: [
        { value: 'continuous', label: 'Instantaneous (at most 45 days)' },
        { value: 'daily', label: 'Daily values' },
      ],
      default: 'continuous',
      example: 'continuous',
    },
  ],
  estimate(query) {
    const o = Options.parse(query.options)
    checkRange(o, query)
    const perDay = o.interval === 'continuous' ? 96 : 1
    const bytes = Math.max(2000, Math.ceil(spanDays(query) * perDay * BYTES_PER_FEATURE))
    return {
      requests: sites(o).length * Math.max(1, Math.ceil((spanDays(query) * perDay) / 10_000)),
      items: sites(o).map((s) => ({
        datasetId: `usgs-${s}-${o.parameter}`,
        label: `USGS ${s} ${USGS_PARAMETERS[o.parameter].label}, ${o.interval}`,
        kind: 'series' as const,
        bytes,
      })),
    }
  },
  async fetch(query, ctx) {
    const o = Options.parse(query.options)
    checkRange(o, query)
    const p = USGS_PARAMETERS[o.parameter]
    const result: ConnectorResult = {
      datasets: [],
      files: [],
      citation: `U.S. Geological Survey, National Water Information System (USGS Water Data API), retrieved for site(s) ${sites(o).join(', ')}`,
    }
    for (const s of sites(o)) {
      const points = seriesFromFeatures(await fetchSite(s, o, query, ctx))
      if (!points.length)
        throw new AppError(
          'NOT_FOUND',
          `USGS has no ${p.label} values for site ${s} in that period.`,
        )
      result.datasets.push({
        id: `usgs-${s}-${o.parameter}`,
        kind: 'series',
        label: `USGS ${s}: ${p.label}, ${o.interval === 'daily' ? 'daily values' : 'instantaneous values'}`,
        file: `usgs-${s}-${o.parameter}.json`,
        unit: p.unit,
        range: { start: points[0]!.t, end: points.at(-1)!.t },
      })
      result.files.push({ name: `usgs-${s}-${o.parameter}.json`, data: toBytes(points) })
    }
    if (o.interval === 'daily')
      result.modified = 'Daily values are placed at 00:00 UTC of their date.'
    return result
  },
}
