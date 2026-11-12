// Jail population baselines (spec 0465 FR-9): the Vera Institute of Justice Incarceration Trends
// files, which combine the Bureau of Justice Statistics Census of Jails and Annual Survey of Jails
// with state and local sources. One fixed file per level on one fixed host: the state file (about
// 1.8 MB) or the county file (about 62 MB, fetched whole because its rows are not in place order).
// The connector keeps one state's or one county's yearly jail population, rate, admissions,
// pretrial count and rated capacity, so a scenario can size a fictional facility from a real
// baseline. Aggregate counts only. No key is needed.
import { AppError } from '../../lib/errors'
import { toBytes } from './json'
import type { Connector, ConnectorQuery } from './registry'

const BASE = 'https://raw.githubusercontent.com/vera-institute/incarceration-trends/main'
export const VERA_STATE_FILE = `${BASE}/incarceration_trends_state.csv`
export const VERA_COUNTY_FILE = `${BASE}/incarceration_trends_county.csv`
const SOURCE = 'The Vera Institute Incarceration Trends file'
const STATE = /^[A-Z]{2}$/
const COUNTY_FIPS = /^\d{5}$/

/** The columns kept, as written in the file, and the name each gets in the series. */
export const VERA_FIELDS: Record<string, string> = {
  total_jail_pop: 'jailPopulation',
  total_jail_pop_rate: 'jailPopulationPer100k',
  total_pretrial_custody: 'pretrial',
  total_jail_admits: 'admissions',
  total_jail_admits_rate: 'admissionsPer100k',
  total_jail_discharges: 'discharges',
  jail_rated_capacity: 'ratedCapacity',
  total_pop_15to64: 'population15to64',
}

type Place = { level: 'state'; state: string } | { level: 'county'; fips: string }

export function placeOf(q: ConnectorQuery): Place {
  const county = String(q.options.county ?? '').trim()
  if (county) {
    if (!COUNTY_FIPS.test(county))
      throw new AppError(
        'VALIDATION',
        'Name the county by its five-digit FIPS code (for example 39035 for Cuyahoga County, OH)',
      )
    return { level: 'county', fips: county }
  }
  const state = String(q.options.state ?? '').toUpperCase()
  if (!STATE.test(state))
    throw new AppError(
      'VALIDATION',
      'Name the state by its two-letter code (for example OH), or a county by its five-digit FIPS code',
    )
  return { level: 'state', state }
}

/** One CSV line; handles quoted fields with commas and doubled quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

export interface JailYear {
  t: string
  v: Record<string, number>
}

/** The rows for one place, one point per year, refusing a file that lacks the columns it reads. */
export function pickRows(text: string, place: Place): { name: string; years: JailYear[] } {
  const lines = text.split(/\r?\n/)
  const first = lines[0] ?? ''
  const head = splitCsvLine(first.charCodeAt(0) === 0xfeff ? first.slice(1) : first)
  const col = (name: string) => head.indexOf(name)
  const key = place.level === 'state' ? 'state_abbr' : 'county_fips'
  const nameCol = place.level === 'state' ? 'state_name' : 'county_name'
  const needed = ['year', key, nameCol, ...Object.keys(VERA_FIELDS)]
  const missing = needed.filter((n) => col(n) < 0)
  if (missing.length)
    throw new AppError(
      'PROVIDER',
      `${SOURCE} no longer has the column ${missing[0]}; the file may have changed.`,
    )
  const want = place.level === 'state' ? place.state : place.fips
  const keyAt = col(key)
  const years: JailYear[] = []
  let name = ''
  for (const line of lines.slice(1)) {
    if (!line.includes(want)) continue
    const c = splitCsvLine(line)
    const id = place.level === 'county' ? (c[keyAt] ?? '').padStart(5, '0') : c[keyAt]
    if (id !== want) continue
    const year = Number(c[col('year')])
    if (!Number.isInteger(year)) continue
    name = name || (c[col(nameCol)] ?? '')
    const v: Record<string, number> = {}
    for (const [field, as] of Object.entries(VERA_FIELDS)) {
      const raw = c[col(field)]
      const n = Number(raw)
      if (raw !== undefined && raw !== '' && Number.isFinite(n)) v[as] = Math.round(n * 100) / 100
    }
    if (Object.keys(v).length) years.push({ t: new Date(Date.UTC(year, 0, 1)).toISOString(), v })
  }
  years.sort((a, b) => a.t.localeCompare(b.t))
  return { name, years }
}

export const veraJailTrends: Connector = {
  id: 'vera-jail-trends',
  label: 'Jail population by year, state or county (Vera Incarceration Trends)',
  source:
    'Vera Institute of Justice, Incarceration Trends (raw.githubusercontent.com/vera-institute/incarceration-trends), built on BJS jail collections',
  terms:
    'Published by the Vera Institute of Justice with a license file in its repository; cite Vera Institute of Justice, Incarceration Trends. Some years are estimates; counts are yearly aggregates.',
  hosts: ['raw.githubusercontent.com'],
  options: [
    {
      key: 'state',
      label: 'State',
      type: 'text',
      help: 'Two-letter state code, such as OH. Needed unless you name a county below.',
      example: 'OH',
    },
    {
      key: 'county',
      label: 'County FIPS code',
      type: 'text',
      help: 'Optional five-digit county FIPS code, such as 39035 for Cuyahoga County, OH; leave empty for the whole state.',
      example: '39035',
    },
  ],
  estimate(query) {
    const place = placeOf(query)
    return {
      requests: 1,
      items: [
        {
          datasetId: 'jail-trends',
          label:
            place.level === 'state'
              ? `Jail population by year, ${place.state}`
              : `Jail population by year, county ${place.fips} (downloads the whole county file)`,
          kind: 'series',
          bytes: place.level === 'state' ? 1_800_000 : 62_000_000,
        },
      ],
    }
  },
  async fetch(query, ctx) {
    const place = placeOf(query)
    const res = await ctx.get(place.level === 'state' ? VERA_STATE_FILE : VERA_COUNTY_FILE)
    const { name, years } = pickRows(new TextDecoder().decode(res.data), place)
    const where = place.level === 'state' ? place.state : place.fips
    if (!years.length) throw new AppError('NOT_FOUND', `${SOURCE} has no rows for ${where}.`)
    const label = name ? (place.level === 'county' ? `${name} (${where})` : name) : where
    return {
      datasets: [
        {
          id: 'jail-trends',
          kind: 'series',
          label: `Jail population by year, ${label} (Vera Incarceration Trends)`,
          file: 'jail-trends.json',
          unit: 'people',
          range: { start: years[0]!.t, end: years[years.length - 1]!.t },
          area: { label },
        },
      ],
      files: [{ name: 'jail-trends.json', data: toBytes(years) }],
      modified: `Rows for ${label} only; columns limited to ${Object.keys(VERA_FIELDS).join(', ')}; every year in the file is kept as a baseline whatever the scenario period.`,
      citation: 'Vera Institute of Justice, Incarceration Trends dataset (version 3, 2025)',
    }
  },
}
