// City open data calls for service (spec 0465 FR-9): police calls for one city and period from the
// city's Socrata open data portal, mapped to one record shape by a small adapter table and
// aggregated by hour before anything is stored. The request selects only call numbers, priority,
// timestamps and whether the call was officer-initiated; no address, location, call type text or
// narrative is asked for, and the stored series holds counts and response time percentiles only.
// The user picks the city from the table; each city's host is fixed in code. No key is needed.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { getJson, toBytes } from './json'
import type { Connector, ConnectorQuery } from './registry'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MAX_DAYS = 7
const PAGE = 50_000
const PAGES = 2

/** One call after the adapter: received time (UTC ms), priority, and seconds to dispatch and arrive. */
export interface CadRecord {
  id: string
  receivedMs: number
  priority: string
  onView: boolean
  dispatchSec: number | null
  arriveSec: number | null
}

type Row = Record<string, string | undefined>

interface CityAdapter {
  label: string
  agency: string
  host: string
  dataset: string
  /** IANA zone the portal's floating timestamps are in. */
  zone: string
  timeField: string
  fields: readonly string[]
  /** Calls per day, for the size estimate. */
  perDay: number
  bytesPerCall: number
  toRecord: (r: Row, zone: string) => CadRecord | null
  citation: string
}

const seconds = (s: string | undefined): number | null => {
  const n = Number(s)
  return s !== undefined && s !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

const between = (from: string | undefined, to: string | undefined, zone: string) => {
  if (!from || !to) return null
  const s = (floatingToUtc(to, zone) - floatingToUtc(from, zone)) / 1000
  return Number.isFinite(s) && s >= 0 ? s : null
}

/** The cities with a mapped calls-for-service dataset. Add a row to add a city. */
export const CAD_CITIES: Record<string, CityAdapter> = {
  seattle: {
    label: 'Seattle, WA',
    agency: 'Seattle Police Department',
    host: 'data.seattle.gov',
    dataset: '33kz-ixgy',
    zone: 'America/Los_Angeles',
    timeField: 'cad_event_original_time_queued',
    fields: [
      'cad_event_number',
      'priority',
      'cad_event_original_time_queued',
      'first_spd_call_sign_dispatch_delay_time_s_',
      'first_spd_call_sign_response_time_s_',
      'call_type_indicator',
    ],
    perDay: 1_200,
    bytesPerCall: 260,
    toRecord(r, zone) {
      if (!r.cad_event_number || !r.cad_event_original_time_queued) return null
      return {
        id: r.cad_event_number,
        receivedMs: floatingToUtc(r.cad_event_original_time_queued, zone),
        priority: r.priority ?? '',
        onView: r.call_type_indicator === 'ONVIEW',
        dispatchSec: seconds(r.first_spd_call_sign_dispatch_delay_time_s_),
        arriveSec: seconds(r.first_spd_call_sign_response_time_s_),
      }
    },
    citation: 'City of Seattle, Seattle Police Department Call Data, data.seattle.gov (33kz-ixgy)',
  },
  san_francisco: {
    label: 'San Francisco, CA',
    agency: 'San Francisco Police Department',
    host: 'data.sf.gov',
    dataset: '2zdj-bwza',
    zone: 'America/Los_Angeles',
    timeField: 'received_datetime',
    fields: [
      'cad_number',
      'priority_final',
      'received_datetime',
      'dispatch_datetime',
      'onscene_datetime',
      'onview_flag',
    ],
    perDay: 3_000,
    bytesPerCall: 260,
    toRecord(r, zone) {
      if (!r.cad_number || !r.received_datetime) return null
      return {
        id: r.cad_number,
        receivedMs: floatingToUtc(r.received_datetime, zone),
        priority: r.priority_final ?? '',
        onView: r.onview_flag === 'Y',
        dispatchSec: between(r.received_datetime, r.dispatch_datetime, zone),
        arriveSec: between(r.received_datetime, r.onscene_datetime, zone),
      }
    },
    citation:
      'City and County of San Francisco, Law Enforcement Dispatched Calls for Service: Closed, data.sf.gov (2zdj-bwza)',
  },
}

/** Offset of `zone` from UTC at instant `ms`, in ms (negative west of Greenwich). */
function zoneOffset(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const wall = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  return wall - Math.floor(ms / 1000) * 1000
}

/** A portal's floating local timestamp ("2025-07-04T00:02:01.000") to UTC ms. */
export function floatingToUtc(local: string, zone: string): number {
  const wall = Date.parse(`${local.replace(/Z$/, '').slice(0, 23)}Z`)
  const guess = wall - zoneOffset(wall, zone)
  return wall - zoneOffset(guess, zone)
}

/** UTC ms to the portal's floating local form, for the query. */
export function utcToFloating(ms: number, zone: string): string {
  return new Date(ms + zoneOffset(ms, zone)).toISOString().slice(0, 19)
}

export function cityOf(q: ConnectorQuery): CityAdapter & { id: string } {
  const id = String(q.options.city ?? '')
  const city = Object.hasOwn(CAD_CITIES, id) ? CAD_CITIES[id] : undefined
  if (!city)
    throw new AppError(
      'VALIDATION',
      `Pick a city: ${Object.entries(CAD_CITIES)
        .map(([k, c]) => `${k} (${c.label})`)
        .join(', ')}`,
    )
  return { ...city, id }
}

function periodOf(q: ConnectorQuery): { start: number; end: number } {
  const start = Date.parse(q.range.start)
  const end = Date.parse(q.range.end)
  if (!(end > start)) throw new AppError('VALIDATION', 'The period has no length.')
  if (end - start > MAX_DAYS * DAY_MS)
    throw new AppError(
      'VALIDATION',
      `Calls for service are fetched for at most ${MAX_DAYS} days; pick a shorter period.`,
    )
  return { start, end }
}

const percentile = (sorted: number[], p: number): number | null => {
  if (!sorted.length) return null
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[i]!
}

/** Hourly counts by priority and officer-initiated share, with dispatch and arrival percentiles. */
export function hourlySeries(records: CadRecord[]): { t: string; v: Record<string, number> }[] {
  const seen = new Set<string>()
  const hours = new Map<number, CadRecord[]>()
  for (const r of records) {
    if (seen.has(r.id) || !Number.isFinite(r.receivedMs)) continue
    seen.add(r.id)
    const h = Math.floor(r.receivedMs / HOUR_MS) * HOUR_MS
    hours.set(h, [...(hours.get(h) ?? []), r])
  }
  return [...hours.entries()]
    .sort(([a], [b]) => a - b)
    .map(([h, rs]) => {
      const v: Record<string, number> = {
        calls: rs.length,
        onView: rs.filter((r) => r.onView).length,
      }
      for (const r of rs) {
        const key = `priority_${r.priority.replace(/[^A-Za-z0-9]/g, '') || 'none'}`
        v[key] = (v[key] ?? 0) + 1
      }
      const answered = rs.filter((r) => !r.onView)
      const put = (k: string, xs: (number | null)[], p: number) => {
        const s = xs.filter((x): x is number => x !== null).sort((a, b) => a - b)
        const x = percentile(s, p)
        if (x !== null) v[k] = Math.round(x)
      }
      put(
        'dispatchMedianSeconds',
        answered.map((r) => r.dispatchSec),
        0.5,
      )
      put(
        'arriveMedianSeconds',
        answered.map((r) => r.arriveSec),
        0.5,
      )
      put(
        'arriveP90Seconds',
        answered.map((r) => r.arriveSec),
        0.9,
      )
      return { t: new Date(h).toISOString(), v }
    })
}

const Rows = z.array(z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])))

export const openCadCalls: Connector = {
  id: 'open-cad-calls',
  label: 'Police calls for service by hour (city open data)',
  source: `City open data portals: ${Object.values(CAD_CITIES)
    .map((c) => `${c.label} (${c.host})`)
    .join(', ')}`,
  terms:
    'Published by each city as open data. Only hourly counts and response time percentiles are kept; no address, location, call type text or narrative is fetched or stored.',
  hosts: Object.values(CAD_CITIES).map((c) => c.host),
  estimate(query) {
    const city = cityOf(query)
    const { start, end } = periodOf(query)
    const days = (end - start) / DAY_MS
    return {
      requests: Math.min(PAGES, Math.ceil((days * city.perDay) / PAGE)),
      items: [
        {
          datasetId: 'cad-calls-hourly',
          label: `Calls for service by hour, ${city.label}`,
          kind: 'series',
          bytes: Math.ceil(days * city.perDay * city.bytesPerCall),
        },
      ],
    }
  },
  async fetch(query, ctx) {
    const city = cityOf(query)
    const { start, end } = periodOf(query)
    const where = `${city.timeField} between '${utcToFloating(start, city.zone)}' and '${utcToFloating(end, city.zone)}'`
    const source = `The ${city.label} calls for service dataset`
    const records: CadRecord[] = []
    let complete = false
    for (let page = 0; page < PAGES; page++) {
      const url =
        `https://${city.host}/resource/${city.dataset}.json` +
        `?$select=${encodeURIComponent(`distinct ${city.fields.join(',')}`)}` +
        `&$where=${encodeURIComponent(where)}` +
        `&$order=${encodeURIComponent(`${city.timeField},${city.fields[0]}`)}` +
        `&$limit=${PAGE}&$offset=${page * PAGE}`
      const rows = await getJson(ctx, url, Rows, source)
      for (const r of rows) {
        const rec = city.toRecord(
          Object.fromEntries(Object.entries(r).map(([k, x]) => [k, String(x)])),
          city.zone,
        )
        if (rec) records.push(rec)
      }
      if (rows.length < PAGE) {
        complete = true
        break
      }
    }
    const series = hourlySeries(records)
    return {
      datasets: [
        {
          id: 'cad-calls-hourly',
          kind: 'series',
          label: `Police calls for service by hour, ${city.label} (${city.agency} open data)`,
          file: 'cad-calls-hourly.json',
          unit: 'calls per hour',
          range: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
          area: { label: city.label },
        },
      ],
      files: [{ name: 'cad-calls-hourly.json', data: toBytes(series) }],
      modified:
        `Aggregated by hour from ${records.length} call rows: counts by priority, officer-initiated calls, and median dispatch and arrival times and 90th percentile arrival for dispatched calls. No call-level record is kept.` +
        (complete
          ? ''
          : ` The period had more than ${PAGE * PAGES} rows; later hours are missing.`),
      citation: city.citation,
    }
  },
}
