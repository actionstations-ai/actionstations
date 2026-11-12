// FBI Crime Data Explorer monthly crime (spec 0465 FR-9): reported violent and property offenses
// and clearances by month for a state or one agency (by its ORI), with the per-100,000 rate and the
// national rate for context, from the FBI's public Crime Data Explorer API on api.usa.gov. The API
// needs a free api.data.gov key; the user saves it in Settings and it lives in the OS keychain
// under "fbi-cde". Without it the connector refuses to fetch. The key goes in the query string,
// which the fetch log never records, and is scrubbed from messages. Aggregate counts only.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { getSecret } from '../../secrets'
import { toBytes } from './json'
import type { Connector, ConnectorQuery } from './registry'
import { getText } from './wildfire-common'

const BASE = 'https://api.usa.gov/crime/fbi/cde/summarized'
const SOURCE = 'The FBI Crime Data Explorer'
/** The keychain entry for the api.data.gov key. */
export const FBI_CDE_KEY_ID = 'fbi-cde'
export const FBI_CDE_SIGNUP_URL = 'https://api.data.gov/signup/'
const MAX_MONTHS = 120
const STATE = /^[A-Z]{2}$/
const ORI = /^[A-Z]{2}[A-Z0-9]{7}$/

/** The offense groups asked for, with the path each scope takes. */
const OFFENSES = [
  { key: 'violent', state: 'violent-crime', agency: 'V' },
  { key: 'property', state: 'property-crime', agency: 'P' },
] as const

/** A 40-character api.data.gov key, or DEMO_KEY (api.data.gov's shared key, tightly rate limited). */
export const isValidDataGovKey = (key: string): boolean =>
  key === 'DEMO_KEY' || /^[A-Za-z0-9]{40}$/.test(key)

const Months = z.record(z.string(), z.number().nullable())
const Response = z.looseObject({
  offenses: z.looseObject({
    rates: z.record(z.string(), Months).nullish(),
    actuals: z.record(z.string(), Months).nullish(),
  }),
})
type Response = z.infer<typeof Response>

type Scope = { kind: 'state'; code: string } | { kind: 'agency'; code: string }

export function scopeOf(q: ConnectorQuery): Scope {
  const ori = String(q.options.ori ?? '')
    .trim()
    .toUpperCase()
  if (ori) {
    if (!ORI.test(ori))
      throw new AppError(
        'VALIDATION',
        'Name the agency by its nine-character ORI (for example OH0180900), or leave it empty for a state',
      )
    return { kind: 'agency', code: ori }
  }
  const state = String(q.options.state ?? '').toUpperCase()
  if (!STATE.test(state))
    throw new AppError(
      'VALIDATION',
      'Name the state by its two-letter code (for example OH), or an agency by its ORI',
    )
  return { kind: 'state', code: state }
}

/** The months of the range, as the API's MM-YYYY, at most ten years. */
export function monthsOf(range: { start: string; end: string }): string[] {
  const s = new Date(range.start)
  const e = new Date(range.end)
  const first = s.getUTCFullYear() * 12 + s.getUTCMonth()
  const last = e.getUTCFullYear() * 12 + e.getUTCMonth()
  if (last < first) throw new AppError('VALIDATION', 'The period has no length.')
  if (last - first + 1 > MAX_MONTHS)
    throw new AppError('VALIDATION', 'Crime data is fetched for at most ten years at a time.')
  const out: string[] = []
  for (let i = first; i <= last; i++)
    out.push(`${String((i % 12) + 1).padStart(2, '0')}-${Math.floor(i / 12)}`)
  return out
}

const placeKey = (keys: string[], suffix: string): string | undefined =>
  keys.find((k) => k.endsWith(` ${suffix}`))

/** One offense group's response as monthly values under `<group><Measure>` names. */
export function readOffense(
  res: Response,
  group: string,
): { name: string; months: Map<string, Record<string, number>> } {
  const actuals = res.offenses.actuals ?? {}
  const rates = res.offenses.rates ?? {}
  const offKey = placeKey(Object.keys(actuals), 'Offenses')
  if (!offKey) throw new AppError('NOT_FOUND', `${SOURCE} has no reported offenses for this place.`)
  const name = offKey.slice(0, -' Offenses'.length)
  const series: [string, Record<string, number | null> | undefined][] = [
    ['Offenses', actuals[offKey]],
    ['Clearances', actuals[`${name} Clearances`]],
    ['Per100k', rates[offKey]],
    ['UsPer100k', rates['United States Offenses']],
  ]
  const months = new Map<string, Record<string, number>>()
  for (const [measure, values] of series)
    for (const [mmyyyy, x] of Object.entries(values ?? {})) {
      if (x === null || !/^\d{2}-\d{4}$/.test(mmyyyy)) continue
      const v = months.get(mmyyyy) ?? {}
      v[`${group}${measure}`] = x
      months.set(mmyyyy, v)
    }
  return { name, months }
}

const isoMonth = (mmyyyy: string): string =>
  new Date(Date.UTC(Number(mmyyyy.slice(3)), Number(mmyyyy.slice(0, 2)) - 1, 1)).toISOString()

export interface FbiCdeDeps {
  getKey: () => Promise<string | undefined>
}

export function createFbiCdeConnector(
  deps: FbiCdeDeps = { getKey: () => getSecret(FBI_CDE_KEY_ID) },
): Connector {
  return {
    id: 'fbi-cde-crime',
    label: 'Reported crime by month, state or agency (FBI Crime Data Explorer)',
    source: 'FBI Crime Data Explorer API (api.usa.gov/crime/fbi/cde)',
    terms:
      'FBI Uniform Crime Reporting data, a U.S. government work; cite the FBI Crime Data Explorer. Counts are what agencies reported, and coverage varies by month. Needs the free api.data.gov key you saved in Settings.',
    hosts: ['api.usa.gov'],
    options: [
      {
        key: 'state',
        label: 'State',
        type: 'text',
        help: 'Two-letter state code, such as OH. Needed unless you name an agency below.',
        example: 'OH',
      },
      {
        key: 'ori',
        label: 'Agency ORI',
        type: 'text',
        help: 'Optional nine-character agency identifier (ORI), such as OH0180900, from the FBI Crime Data Explorer; leave empty for the whole state.',
        example: 'OH0180900',
      },
    ],
    estimate(query) {
      scopeOf(query)
      const months = monthsOf(query.range).length
      return {
        requests: OFFENSES.length,
        items: [
          {
            datasetId: 'fbi-crime-monthly',
            label: 'Violent and property offenses and clearances by month',
            kind: 'series',
            bytes: OFFENSES.length * (800 + months * 200),
          },
        ],
      }
    },
    async fetch(query, ctx) {
      const scope = scopeOf(query)
      const months = monthsOf(query.range)
      const key = await deps.getKey()
      if (!key)
        throw new AppError(
          'FORBIDDEN',
          'The FBI Crime Data Explorer needs a free api.data.gov key. Save one in Settings under Case data, then try again.',
        )
      if (!isValidDataGovKey(key))
        throw new AppError('VALIDATION', 'The saved api.data.gov key is not valid.')
      const merged = new Map<string, Record<string, number>>()
      let name = scope.code
      for (const o of OFFENSES) {
        const url =
          `${BASE}/${scope.kind}/${scope.code}/${scope.kind === 'state' ? o.state : o.agency}` +
          `?from=${months[0]}&to=${months[months.length - 1]}&API_KEY=${key}`
        const text = await getText(ctx, url, key)
        let parsed: unknown
        try {
          parsed = JSON.parse(text)
        } catch {
          throw new AppError('PROVIDER', `${SOURCE} did not return JSON; check the key.`)
        }
        const res = Response.safeParse(parsed)
        if (!res.success)
          throw new AppError(
            'PROVIDER',
            `${SOURCE} returned an unexpected shape; the service may have changed.`,
          )
        const one = readOffense(res.data, o.key)
        name = one.name
        for (const [m, v] of one.months) merged.set(m, { ...merged.get(m), ...v })
      }
      const points = [...merged.entries()]
        .map(([m, v]) => ({ t: isoMonth(m), v }))
        .sort((a, b) => a.t.localeCompare(b.t))
      return {
        datasets: [
          {
            id: 'fbi-crime-monthly',
            kind: 'series',
            label: `Reported violent and property crime by month, ${name} (FBI Crime Data Explorer)`,
            file: 'fbi-crime-monthly.json',
            unit: 'offenses',
            range: { start: isoMonth(months[0]!), end: isoMonth(months[months.length - 1]!) },
            area: { label: name },
          },
        ],
        files: [{ name: 'fbi-crime-monthly.json', data: toBytes(points) }],
        modified: `Violent and property offense groups only: reported offenses, clearances, the rate per 100,000 and the national rate, by month from ${months[0]} to ${months[months.length - 1]}.`,
        citation:
          'Federal Bureau of Investigation, Crime Data Explorer, Uniform Crime Reporting Program',
      }
    },
  }
}

export const fbiCdeCrime = createFbiCdeConnector()
