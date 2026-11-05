// SPC storm reports (spec 0449 FR-7): the filtered tornado, wind and hail reports of each
// convective day (12 UTC to 12 UTC) from the Storm Prediction Center archive. The reports are
// the exercise's ground truth for warning verification and the source of local storm report
// injects: one features dataset whose points appear from the minute they were reported, and the
// same reports as ground-truth events in the same file.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { parseSpcReports, type StormReport } from '../weather/archives'
import {
  type Connector,
  type ConnectorEstimate,
  type ConnectorQuery,
  type ConnectorResult,
} from './registry'

export const SPC_HOST = 'www.spc.noaa.gov'
const MAX_DAYS = 7
/** A day's file is about 90 kB; what is kept is a fraction of it. */
const DAY_BYTES = 95_000

const Options = z.object({
  /** Keep only these kinds, comma separated: tornado, wind, hail. */
  kinds: z.string().max(40).default('tornado,wind,hail'),
})

const pad = (n: number): string => String(n).padStart(2, '0')

/** Convective days (their start dates, YYYY-MM-DD) that overlap the period. */
export function convectiveDays(startIso: string, endIso: string): string[] {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  const first = new Date(start - 12 * 3_600_000)
  let d = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate())
  const out: string[] = []
  for (; d + 12 * 3_600_000 < end; d += 86_400_000) {
    const x = new Date(d)
    out.push(`${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`)
  }
  return out
}

function days(query: ConnectorQuery): string[] {
  const list = convectiveDays(query.range.start, query.range.end)
  if (!list.length) throw new AppError('VALIDATION', 'The period must end after it starts')
  if (list.length > MAX_DAYS)
    throw new AppError(
      'VALIDATION',
      `That spans ${list.length} convective days; the most is ${MAX_DAYS}`,
    )
  return list
}

const estimate = (query: ConnectorQuery): ConnectorEstimate => {
  const n = days(query).length
  return {
    items: [
      {
        datasetId: 'storm-reports',
        label: `Storm reports, ${n} convective day${n === 1 ? '' : 's'}`,
        kind: 'features',
        bytes: n * DAY_BYTES,
      },
    ],
    requests: n,
  }
}

const KIND_WORD = { tornado: 'Tornado', wind: 'Wind damage', hail: 'Hail' } as const

export function reportFeatures(reports: readonly StormReport[], end: string) {
  return reports.map((r) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
    properties: {
      name: `${KIND_WORD[r.kind]} ${r.time.slice(11, 16)}Z ${r.location}, ${r.county} ${r.state}`,
      start: r.time,
      end,
      kind: r.kind,
      magnitude: r.magnitude,
      remarks: r.remarks,
    },
  }))
}

export function reportEvents(reports: readonly StormReport[]) {
  const counts = { tornado: 0, wind: 0, hail: 0 }
  return reports.map((r) => ({
    id: `${r.kind}-${String(++counts[r.kind]).padStart(3, '0')}`,
    time: r.time,
    area: `${r.county}, ${r.state}`,
    kind: r.kind,
    attrs: {
      lat: r.lat,
      lon: r.lon,
      magnitude: r.magnitude,
      location: r.location,
      remarks: r.remarks,
    },
  }))
}

async function fetchReports(
  query: ConnectorQuery,
  ctx: Parameters<Connector['fetch']>[1],
): Promise<ConnectorResult> {
  const kinds = new Set(
    Options.parse(query.options)
      .kinds.split(',')
      .map((s) => s.trim()),
  )
  const start = Date.parse(query.range.start)
  const end = Date.parse(query.range.end)
  const bbox = query.area.bbox
  const all: StormReport[] = []
  for (const day of days(query)) {
    const res = await ctx.get(
      `https://${SPC_HOST}/climo/reports/${day.slice(2).replaceAll('-', '')}_rpts.csv`,
    )
    all.push(...parseSpcReports(new TextDecoder().decode(res.data), day))
  }
  const reports = all.filter((r) => {
    const t = Date.parse(r.time)
    if (t < start || t > end || !kinds.has(r.kind)) return false
    return !bbox || (r.lon >= bbox[0] && r.lon <= bbox[2] && r.lat >= bbox[1] && r.lat <= bbox[3])
  })
  const lastEnd = new Date(end).toISOString()
  return {
    datasets: [
      {
        id: 'storm-reports',
        kind: 'features',
        label: 'Storm reports',
        file: 'storm-reports.geojson',
        range: { start: new Date(start).toISOString(), end: lastEnd },
        area: { label: query.area.label, ...(bbox ? { bbox } : {}) },
      },
    ],
    files: [
      {
        name: 'storm-reports.geojson',
        data: JSON.stringify({
          type: 'FeatureCollection',
          features: reportFeatures(reports, lastEnd),
          events: reportEvents(reports),
        }),
      },
    ],
    ...(bbox || start > Date.parse(`${days(query)[0]}T12:00:00Z`)
      ? { modified: 'Filtered to the scenario period and area' }
      : {}),
    citation: 'NOAA Storm Prediction Center, filtered storm reports',
  }
}

export const spcConnector: Connector = {
  id: 'spc-storm-reports',
  label: 'SPC storm reports',
  source: 'NOAA Storm Prediction Center storm report archive',
  terms:
    'US government work, public domain. Preliminary reports; times of many reports are estimated by the reporting office.',
  hosts: [SPC_HOST],
  estimate,
  fetch: fetchReports,
}
