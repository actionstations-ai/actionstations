// USGS Geomagnetism web service (spec 0468 FR-6): ground magnetometer series from one USGS
// observatory for a past period, one minute or hourly values of H, D, Z and F. The request
// carries the observatory code, the dates and the sampling period, nothing else. The response is
// validated because the service has changed shape before; missing samples (null) stay missing.
// The service answers 404 to a User-Agent that starts with "Action" and holds an http(s) URL,
// which is why the app names itself AS/<version> (#1095).
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { getJson } from './json'
import { DAY_MS, rangeMs, stringOption } from './noaa-common'
import type {
  Connector,
  ConnectorEstimate,
  ConnectorQuery,
  ConnectorResult,
  FetchContext,
} from './registry'

export const USGS_GEOMAG_HOST = 'geomag.usgs.gov'
/** The USGS observatories in the United States and its territories that report in near real time. */
export const USGS_OBSERVATORIES = [
  'BOU',
  'BRW',
  'BSL',
  'CMO',
  'DED',
  'FRD',
  'FRN',
  'GUA',
  'HON',
  'NEW',
  'SHU',
  'SIT',
  'SJG',
  'TUC',
] as const
/** Where each observatory is, for the fetch form. */
const OBSERVATORY_PLACES: Record<(typeof USGS_OBSERVATORIES)[number], string> = {
  BOU: 'Boulder, Colorado',
  BRW: 'Utqiagvik (Barrow), Alaska',
  BSL: 'Stennis Space Center, Mississippi',
  CMO: 'College (Fairbanks), Alaska',
  DED: 'Deadhorse, Alaska',
  FRD: 'Fredericksburg, Virginia',
  FRN: 'Fresno, California',
  GUA: 'Guam',
  HON: 'Honolulu, Hawaii',
  NEW: 'Newport, Washington',
  SHU: 'Shumagin, Alaska',
  SIT: 'Sitka, Alaska',
  SJG: 'San Juan, Puerto Rico',
  TUC: 'Tucson, Arizona',
}
const ELEMENTS = ['H', 'D', 'Z', 'F'] as const
const UNITS: Record<(typeof ELEMENTS)[number], string> = { H: 'nT', D: 'arcmin', Z: 'nT', F: 'nT' }
const MAX_DAYS = { minute: 7, hour: 60 } as const
/** Time text (26 bytes) plus four values (about 10 bytes each) per sample, with punctuation. */
const BYTES_PER_SAMPLE = 74

const Response = z.looseObject({
  times: z.array(z.string()),
  values: z.array(z.looseObject({ id: z.string(), values: z.array(z.number().nullable()) })),
})

function params(q: ConnectorQuery): { id: string; sampling: 'minute' | 'hour' } {
  const id = stringOption(q, 'observatory', /^[A-Z]{3}$/).toUpperCase()
  if (!(USGS_OBSERVATORIES as readonly string[]).includes(id))
    throw new AppError('VALIDATION', `${id} is not a USGS observatory this source uses`)
  const sampling = stringOption(q, 'sampling', /^(minute|hour)$/, 'minute') as 'minute' | 'hour'
  const { start, end } = rangeMs(q)
  const days = (end - start) / DAY_MS
  if (days > MAX_DAYS[sampling])
    throw new AppError(
      'VALIDATION',
      `${sampling === 'minute' ? 'One-minute' : 'Hourly'} values are limited to ${MAX_DAYS[sampling]} days; choose ${sampling === 'minute' ? 'hourly values or ' : ''}a shorter period.`,
    )
  return { id, sampling }
}

function estimate(q: ConnectorQuery): ConnectorEstimate {
  const { id, sampling } = params(q)
  const { start, end } = rangeMs(q)
  const samples = Math.ceil((end - start) / (sampling === 'minute' ? 60_000 : 3_600_000))
  return {
    items: ELEMENTS.map((e) => ({
      datasetId: `geomag-${id.toLowerCase()}-${e.toLowerCase()}`,
      label: `${id} ${e} component, ${sampling} values`,
      kind: 'series' as const,
      bytes: Math.round((samples * BYTES_PER_SAMPLE) / ELEMENTS.length),
    })),
    requests: 1,
  }
}

const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')

async function fetchSeries(q: ConnectorQuery, ctx: FetchContext): Promise<ConnectorResult> {
  const { id, sampling } = params(q)
  const { start, end } = rangeMs(q)
  const url =
    `https://${USGS_GEOMAG_HOST}/ws/data/?id=${id}&format=json&type=variation` +
    `&elements=${ELEMENTS.join(',')}&sampling_period=${sampling === 'minute' ? 60 : 3600}` +
    `&starttime=${iso(start)}&endtime=${iso(end)}`
  const body = await getJson(ctx, url, Response, 'The USGS geomagnetism service')
  if (!body.times.length)
    throw new AppError(
      'PROVIDER',
      `The USGS geomagnetism service has no ${id} data for that period.`,
    )
  const datasets: ConnectorResult['datasets'] = []
  const files: ConnectorResult['files'] = []
  for (const e of ELEMENTS) {
    const col = body.values.find((v) => v.id === e)
    if (!col || col.values.length !== body.times.length)
      throw new AppError(
        'PROVIDER',
        `The USGS geomagnetism service did not return the ${e} component for ${id}.`,
      )
    const points = body.times.flatMap((t, i) => {
      const v = col.values[i]
      return v === null || v === undefined ? [] : [{ t: new Date(t).toISOString(), v }]
    })
    const dsId = `geomag-${id.toLowerCase()}-${e.toLowerCase()}`
    datasets.push({
      id: dsId,
      kind: 'series',
      label: `${id} ${e} component (USGS)`,
      file: `${dsId}.json`,
      range: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
      unit: UNITS[e],
    })
    files.push({ name: `${dsId}.json`, data: JSON.stringify(points) })
  }
  return {
    datasets,
    files,
    citation: `USGS Geomagnetism Program, observatory ${id}, ${sampling} variation data.`,
  }
}

export const usgsGeomagConnector: Connector = {
  id: 'usgs-geomag',
  label: 'Ground magnetometer (USGS observatory)',
  source: 'USGS Geomagnetism Program web service',
  terms: 'US government work, public domain. Cite the USGS Geomagnetism Program.',
  hosts: [USGS_GEOMAG_HOST],
  options: [
    {
      key: 'observatory',
      label: 'Observatory',
      type: 'choice',
      required: true,
      help: 'The USGS magnetic observatory whose readings are fetched.',
      choices: USGS_OBSERVATORIES.map((id) => ({
        value: id,
        label: `${id}, ${OBSERVATORY_PLACES[id]}`,
      })),
      example: 'FRD',
    },
    {
      key: 'sampling',
      label: 'Sampling',
      type: 'choice',
      help: 'One value a minute (at most 7 days) or one an hour (at most 60 days).',
      choices: [
        { value: 'minute', label: 'Every minute (at most 7 days)' },
        { value: 'hour', label: 'Every hour (at most 60 days)' },
      ],
      default: 'minute',
      example: 'hour',
    },
  ],
  estimate,
  fetch: fetchSeries,
}
