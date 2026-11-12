// BTS Supply Chain and Freight Indicators replay connector (spec 0462 FR-9): weekly and monthly
// national freight series (containerships waiting for a berth, container rates, rail traffic and
// dwell, barge rates, diesel prices) from the Bureau of Transportation Statistics open data site
// (data.bts.gov, dataset y5ut-ibwt, a Socrata service). A disruption exercise can borrow the real
// shape of a past port backlog or rate spike. The dataset is a U.S. Government work (public
// domain, as the dataset's metadata states).
//
// The user picks an indicator from a fixed list in this file; the indicator text and the date
// range are the only things in the query, so no user text reaches it. One request, no key.
// The host is fixed in code. Nothing runs without the user's consent.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { getJson } from './json'
import type { Connector, ConnectorQuery, ConnectorResult } from './registry'

const HOST = 'data.bts.gov'
const DATASET = 'y5ut-ibwt'
const URL_BASE = `https://${HOST}/resource/${DATASET}.json`
const MAX_ROWS = 20_000
const BYTES_PER_POINT = 70
const DAY_MS = 86_400_000

interface Indicator {
  /** The INDICATOR text exactly as the dataset spells it. */
  name: string
  label: string
  /** Rows a period of `days` holds, for the size estimate. */
  perDay: number
  /** Set where the dataset's UNITS text is a sentence rather than a unit. */
  unit?: string
}

/** The series this connector offers. The keys are what a toolkit or the user passes. */
export const FREIGHT_INDICATORS: Record<string, Indicator> = {
  'containerships-awaiting-berth': {
    name: 'Number of Containerships Awaiting Berths at all U.S. Ports',
    label: 'Containerships awaiting a berth, by port',
    perDay: 4 / 3,
  },
  'containerships-anchored': {
    name: 'Number of Containerships Anchored off U.S. Ports',
    label: 'Containerships anchored off U.S. ports',
    perDay: 1,
  },
  'containership-capacity': {
    name: 'Capacity of Containerships Calling at U.S. Ports (in TEUs)',
    label: 'Containership capacity calling at U.S. ports (TEUs, weekly)',
    perDay: 1 / 7,
  },
  'loaded-imports-by-port': {
    name: 'Loaded Import Containers at Select U.S. Ports in TEUs',
    label: 'Loaded import containers by port (TEUs, monthly)',
    perDay: 9 / 30,
  },
  'container-rate-shanghai-la': {
    name: 'Freight Rates in $ per 40ft Container from Shanghai to LA',
    label: 'Container spot rate, Shanghai to Los Angeles ($ per 40 ft box, monthly)',
    perDay: 1 / 30,
  },
  'rail-intermodal': {
    name: 'U.S. Class I Rail Intermodal Units',
    label: 'Class I rail intermodal units (weekly)',
    perDay: 1 / 7,
  },
  'rail-carloads': {
    name: 'U.S. Class I Total Rail Non-Intermodal Carloads',
    label: 'Class I rail carloads, non-intermodal (weekly)',
    perDay: 1 / 7,
  },
  'rail-terminal-dwell': {
    name: 'Average Terminal Dwell Time in Hours by Railroad',
    label: 'Terminal dwell time by railroad (hours, weekly)',
    perDay: 7 / 7,
  },
  'rail-train-speed': {
    name: 'Average Train Speed in MPH by Railroad',
    label: 'Train speed by railroad (mph, weekly)',
    perDay: 7 / 7,
  },
  'grain-barge-rates': {
    name: 'Downbound Grain Barge Rates',
    label: 'Downbound grain barge rates by river segment ($ per ton, weekly)',
    perDay: 7 / 7,
  },
  'truck-speed-la-lb': {
    name: 'Average Truck Speed in MPH Around Port of Los Angeles-Long Beach',
    label: 'Truck speed around the Port of Los Angeles-Long Beach (mph, monthly)',
    perDay: 1 / 30,
  },
  'diesel-price': {
    name: 'U.S. Diesel Sales Prices  (in Dollars per Gallon)',
    label: 'U.S. retail diesel price ($ per gallon, weekly)',
    perDay: 1 / 7,
    unit: 'dollars per gallon',
  },
  'freight-tsi': {
    name: 'Freight Transportation Services Index',
    label: 'Freight Transportation Services Index (monthly)',
    perDay: 1 / 30,
  },
}

const Row = z.looseObject({
  date: z.string().optional(),
  indicator: z.string(),
  measure1: z.string().optional(),
  value1: z.string().optional(),
  units: z.string().optional(),
  source: z.string().optional(),
})
const Response = z.array(Row)

export function indicatorOf(q: ConnectorQuery): [string, Indicator] {
  const key = String(q.options.indicator ?? '')
  const found = Object.hasOwn(FREIGHT_INDICATORS, key) ? FREIGHT_INDICATORS[key] : undefined
  if (!found)
    throw new AppError(
      'VALIDATION',
      `Pick an indicator (option "indicator"): ${Object.keys(FREIGHT_INDICATORS).join(', ')}`,
    )
  return [key, found]
}

function period(q: ConnectorQuery): [string, string] {
  const start = Date.parse(q.range.start)
  const end = Date.parse(q.range.end)
  if (!(end >= start)) throw new AppError('VALIDATION', 'The period ends before it starts')
  const floating = (ms: number): string => new Date(ms).toISOString().slice(0, 19)
  return [floating(start), floating(end)]
}

/** The request URL: one indicator, one period, oldest first. Pure; used by estimate and fetch. */
export function indicatorsUrl(q: ConnectorQuery): string {
  const [, ind] = indicatorOf(q)
  const [from, to] = period(q)
  // The service does not match a literal with a double space (one indicator name has one), so
  // such a name is matched with `like` and a wildcard in place of the run of spaces.
  const literal = ind.name.replace(/'/g, "''")
  const pattern = literal.replace(/ {2,}/g, '%')
  const match = pattern === literal ? `indicator='${literal}'` : `indicator like '${pattern}'`
  const qs = new URLSearchParams({
    $where: `${match} AND date between '${from}' and '${to}'`,
    $order: 'date,measure1',
    $limit: String(MAX_ROWS),
  })
  return `${URL_BASE}?${qs}`
}

export const btsFreightIndicators: Connector = {
  id: 'bts-freight-indicators',
  label: 'Freight and supply chain indicators (BTS)',
  source: 'Bureau of Transportation Statistics, Supply Chain and Freight Indicators (data.bts.gov)',
  terms:
    'A U.S. Government work in the public domain, as the dataset states; BTS asks to be credited as the source. The latest week is often an estimate and later weeks can be revised.',
  hosts: [HOST],
  options: [
    {
      key: 'indicator',
      label: 'Indicator',
      type: 'choice',
      required: true,
      help: 'The freight or supply chain series to fetch from the BTS dashboard.',
      choices: Object.entries(FREIGHT_INDICATORS).map(([value, i]) => ({ value, label: i.label })),
      example: 'containerships-awaiting-berth',
    },
  ],
  estimate(q) {
    const [key, ind] = indicatorOf(q)
    indicatorsUrl(q)
    const days = (Date.parse(q.range.end) - Date.parse(q.range.start)) / DAY_MS
    const points = Math.min(MAX_ROWS, Math.max(1, Math.ceil(days * ind.perDay)))
    return {
      requests: 1,
      items: [
        {
          datasetId: `bts-${key}`,
          label: ind.label,
          kind: 'series',
          bytes: points * BYTES_PER_POINT + 500,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const [key, ind] = indicatorOf(q)
    const rows = await getJson(ctx, indicatorsUrl(q), Response, 'data.bts.gov')
    const byDate = new Map<string, Record<string, number>>()
    const measures = new Set<string>()
    for (const r of rows) {
      const v = Number(r.value1)
      if (!r.date || !Number.isFinite(v)) continue
      const t = `${r.date.slice(0, 19)}Z`
      const m = r.measure1?.trim() || 'value'
      measures.add(m)
      byDate.set(t, { ...(byDate.get(t) ?? {}), [m]: v })
    }
    const single = measures.size === 1 && measures.has('value')
    const points = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, v]) => ({ t, v: single ? v.value! : v }))
    const unit = (ind.unit ?? rows.find((r) => r.units)?.units)?.slice(0, 40)
    const sources = [...new Set(rows.map((r) => r.source).filter(Boolean))].slice(0, 2)
    return {
      datasets: [
        {
          id: `bts-${key}`,
          kind: 'series',
          label: ind.label,
          file: `bts-${key}.json`,
          range: q.range,
          ...(unit ? { unit } : {}),
        },
      ],
      files: [{ name: `bts-${key}.json`, data: JSON.stringify(points) }],
      modified:
        `${ind.name}, ${q.range.start.slice(0, 10)} to ${q.range.end.slice(0, 10)}${single ? '' : `; one value per series at each date (${[...measures].slice(0, 8).join(', ')})`}.`.slice(
          0,
          400,
        ),
      citation:
        `Bureau of Transportation Statistics, Supply Chain and Freight Indicators${sources.length ? `; data from ${sources.join('; ')}` : ''}.`.slice(
          0,
          600,
        ),
    }
  },
}
