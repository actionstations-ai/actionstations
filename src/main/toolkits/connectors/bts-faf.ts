// Freight Analysis Framework state flows (spec 0462 FR-9): tons and value of freight moving
// between U.S. states by mode and commodity, from FAF version 5 (FHWA and BTS), so a lane
// disruption exercise can use a real sense of how much freight a state ships to and receives from
// its neighbours, by which mode. FAF is a U.S. Government work.
//
// FAF is published as fixed zip files on faf.ornl.gov, not as a query service. This connector
// downloads the state-level 2018-2024 file (about 91 MB, one request), inflates the CSV inside it
// as a stream without writing it to disk, keeps only the rows that start or end in the chosen
// state, and stores small summaries: lanes by partner state, modes, commodities and a yearly
// series. The size estimate says so before the user agrees.
//
// The state and year are checked against fixed lists before anything is fetched; the address is
// fixed in code. Nothing runs without the user's consent.
import { Readable } from 'node:stream'
import { createInflateRaw } from 'node:zlib'
import { AppError } from '../../lib/errors'
import type { Connector, ConnectorQuery, ConnectorResult } from './registry'

const HOST = 'faf.ornl.gov'
export const FAF_FILE = 'FAF5.7.1_State_2018-2024'
const URL_ = `https://${HOST}/faf5/Data/Download_Files/${FAF_FILE}.zip`
/** The published file's size on 2026-11-05, for the estimate. */
export const FAF_DOWNLOAD_BYTES = 90_779_769
const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024] as const
const TOP = 15

/** Postal code to the FIPS code FAF uses for each state. */
export const FAF_STATES: Record<string, [string, string]> = {
  AL: ['01', 'Alabama'],
  AK: ['02', 'Alaska'],
  AZ: ['04', 'Arizona'],
  AR: ['05', 'Arkansas'],
  CA: ['06', 'California'],
  CO: ['08', 'Colorado'],
  CT: ['09', 'Connecticut'],
  DE: ['10', 'Delaware'],
  DC: ['11', 'Washington DC'],
  FL: ['12', 'Florida'],
  GA: ['13', 'Georgia'],
  HI: ['15', 'Hawaii'],
  ID: ['16', 'Idaho'],
  IL: ['17', 'Illinois'],
  IN: ['18', 'Indiana'],
  IA: ['19', 'Iowa'],
  KS: ['20', 'Kansas'],
  KY: ['21', 'Kentucky'],
  LA: ['22', 'Louisiana'],
  ME: ['23', 'Maine'],
  MD: ['24', 'Maryland'],
  MA: ['25', 'Massachusetts'],
  MI: ['26', 'Michigan'],
  MN: ['27', 'Minnesota'],
  MS: ['28', 'Mississippi'],
  MO: ['29', 'Missouri'],
  MT: ['30', 'Montana'],
  NE: ['31', 'Nebraska'],
  NV: ['32', 'Nevada'],
  NH: ['33', 'New Hampshire'],
  NJ: ['34', 'New Jersey'],
  NM: ['35', 'New Mexico'],
  NY: ['36', 'New York'],
  NC: ['37', 'North Carolina'],
  ND: ['38', 'North Dakota'],
  OH: ['39', 'Ohio'],
  OK: ['40', 'Oklahoma'],
  OR: ['41', 'Oregon'],
  PA: ['42', 'Pennsylvania'],
  RI: ['44', 'Rhode Island'],
  SC: ['45', 'South Carolina'],
  SD: ['46', 'South Dakota'],
  TN: ['47', 'Tennessee'],
  TX: ['48', 'Texas'],
  UT: ['49', 'Utah'],
  VT: ['50', 'Vermont'],
  VA: ['51', 'Virginia'],
  WA: ['53', 'Washington'],
  WV: ['54', 'West Virginia'],
  WI: ['55', 'Wisconsin'],
  WY: ['56', 'Wyoming'],
}
const STATE_NAME = new Map(Object.values(FAF_STATES))

const MODES: Record<string, string> = {
  '1': 'Truck',
  '2': 'Rail',
  '3': 'Water',
  '4': 'Air (including truck-air)',
  '5': 'Multiple modes and mail',
  '6': 'Pipeline',
  '7': 'Other and unknown',
  '8': 'No domestic mode',
}

const COMMODITIES: Record<string, string> = {
  '01': 'Live animals and fish',
  '02': 'Cereal grains',
  '03': 'Other agricultural products',
  '04': 'Animal feed',
  '05': 'Meat and seafood',
  '06': 'Milled grain products',
  '07': 'Other foodstuffs',
  '08': 'Alcoholic beverages',
  '09': 'Tobacco products',
  '10': 'Building stone',
  '11': 'Natural sands',
  '12': 'Gravel',
  '13': 'Nonmetallic minerals',
  '14': 'Metallic ores',
  '15': 'Coal',
  '16': 'Crude petroleum',
  '17': 'Gasoline',
  '18': 'Fuel oils',
  '19': 'Natural gas and other fossil products',
  '20': 'Basic chemicals',
  '21': 'Pharmaceuticals',
  '22': 'Fertilizers',
  '23': 'Chemical products',
  '24': 'Plastics and rubber',
  '25': 'Logs',
  '26': 'Wood products',
  '27': 'Newsprint and paper',
  '28': 'Paper articles',
  '29': 'Printed products',
  '30': 'Textiles and leather',
  '31': 'Nonmetal mineral products',
  '32': 'Base metals',
  '33': 'Articles of base metal',
  '34': 'Machinery',
  '35': 'Electronics',
  '36': 'Motorized vehicles',
  '37': 'Transport equipment',
  '38': 'Precision instruments',
  '39': 'Furniture',
  '40': 'Miscellaneous manufactured products',
  '41': 'Waste and scrap',
  '43': 'Mixed freight',
}

export function stateOf(q: ConnectorQuery): { code: string; fips: string; name: string } {
  const code = String(q.options.state ?? '').toUpperCase()
  const found = Object.hasOwn(FAF_STATES, code) ? FAF_STATES[code] : undefined
  if (!found)
    throw new AppError('VALIDATION', 'Give the state as a two-letter postal code (option "state")')
  return { code, fips: found[0], name: found[1] }
}

/** The FAF year: the option, else the year the period starts in, within 2018 to 2024. */
export function yearOf(q: ConnectorQuery): number {
  const raw = q.options.year ?? new Date(q.range.start).getUTCFullYear()
  const y = typeof raw === 'number' ? raw : Number(raw)
  if (q.options.year !== undefined && !YEARS.includes(y as (typeof YEARS)[number]))
    throw new AppError('VALIDATION', `FAF year must be one of ${YEARS.join(', ')}`)
  return Math.min(Math.max(y, YEARS[0]), YEARS[YEARS.length - 1]!)
}

const u16 = (b: Uint8Array, at: number): number => b[at]! | (b[at + 1]! << 8)
const u32 = (b: Uint8Array, at: number): number => (u16(b, at) | (u16(b, at + 2) << 16)) >>> 0

/** The deflated bytes of the first .csv entry of a zip, located through its central directory. */
export function csvEntry(zip: Uint8Array): Uint8Array {
  const bad = (): never => {
    throw new AppError('PROVIDER', 'faf.ornl.gov sent a file that is not the expected zip.')
  }
  let eocd = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--)
    if (u32(zip, i) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) bad()
  const entries = u16(zip, eocd + 10)
  let at = u32(zip, eocd + 16)
  for (let n = 0; n < entries; n++) {
    if (at + 46 > zip.length || u32(zip, at) !== 0x02014b50) bad()
    const method = u16(zip, at + 10)
    const size = u32(zip, at + 20)
    const nameLen = u16(zip, at + 28)
    const skip = nameLen + u16(zip, at + 30) + u16(zip, at + 32)
    const local = u32(zip, at + 42)
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen))
    at += 46 + skip
    if (!/\.csv$/i.test(name)) continue
    if (method !== 8 || local + 30 > zip.length || u32(zip, local) !== 0x04034b50) bad()
    const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28)
    if (start + size > zip.length) bad()
    return zip.subarray(start, start + size)
  }
  return bad()
}

/** Inflate a deflated CSV and hand each line to `onLine`, without holding the whole text. */
export async function eachLine(
  deflated: Uint8Array,
  onLine: (line: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const chunks = function* (): Generator<Uint8Array> {
    for (let i = 0; i < deflated.length; i += 1 << 20) yield deflated.subarray(i, i + (1 << 20))
  }
  const inflater = Readable.from(chunks()).pipe(createInflateRaw())
  const decoder = new TextDecoder()
  let rest = ''
  try {
    for await (const chunk of inflater as AsyncIterable<Uint8Array>) {
      if (signal?.aborted) throw new AppError('CANCELLED', 'Cancelled')
      rest += decoder.decode(chunk, { stream: true })
      const lines = rest.split('\n')
      rest = lines.pop() ?? ''
      for (const l of lines) onLine(l.endsWith('\r') ? l.slice(0, -1) : l)
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('PROVIDER', 'The FAF file could not be read; it may be damaged or changed.')
  }
  if (rest) onLine(rest)
}

interface Flow {
  tons: number
  value: number
}
const add = (m: Map<string, Flow>, k: string, tons: number, value: number): void => {
  const f = m.get(k) ?? { tons: 0, value: 0 }
  f.tons += tons
  f.value += value
  m.set(k, f)
}

export interface StateFlows {
  outbound: Map<string, Flow>
  inbound: Map<string, Flow>
  modes: Map<string, Flow>
  commodities: Map<string, Flow>
  yearly: Map<number, { outbound: number; inbound: number; within: number }>
  rows: number
}

/** Sum the rows that start or end in `fips` (domestic legs of all trade types). */
export async function stateFlows(
  deflated: Uint8Array,
  fips: string,
  year: number,
  signal?: AbortSignal,
): Promise<StateFlows> {
  const out: StateFlows = {
    outbound: new Map(),
    inbound: new Map(),
    modes: new Map(),
    commodities: new Map(),
    yearly: new Map(YEARS.map((y) => [y, { outbound: 0, inbound: 0, within: 0 }])),
    rows: 0,
  }
  let col: Record<string, number> | undefined
  await eachLine(
    deflated,
    (line) => {
      const f = line.split(',')
      if (!col) {
        col = Object.fromEntries(f.map((name, i) => [name.trim(), i]))
        for (const need of ['dms_origst', 'dms_destst', 'dms_mode', 'sctg2', `tons_${year}`])
          if (col[need] === undefined)
            throw new AppError(
              'PROVIDER',
              `The FAF file has no ${need} column; it may have changed.`,
            )
        return
      }
      const o = f[col.dms_origst!]
      const d = f[col.dms_destst!]
      if (o !== fips && d !== fips) return
      out.rows++
      const tons = Number(f[col[`tons_${year}`]!]) || 0
      const value = Number(f[col[`value_${year}`]!]) || 0
      for (const y of YEARS) {
        const t = Number(f[col[`tons_${y}`]!]) || 0
        const slot = out.yearly.get(y)!
        if (o === fips && d === fips) slot.within += t
        else if (o === fips) slot.outbound += t
        else slot.inbound += t
      }
      add(out.modes, MODES[f[col.dms_mode!]!] ?? 'Other and unknown', tons, value)
      add(out.commodities, COMMODITIES[f[col.sctg2!]!] ?? 'Other', tons, value)
      if (o === fips && d !== fips) add(out.outbound, STATE_NAME.get(d!) ?? 'unknown', tons, value)
      if (d === fips && o !== fips) add(out.inbound, STATE_NAME.get(o!) ?? 'unknown', tons, value)
      if (o === fips && d === fips) {
        add(out.outbound, 'Within the state', tons, value)
      }
    },
    signal,
  )
  if (!col) throw new AppError('PROVIDER', 'The FAF file was empty.')
  return out
}

const kt = (n: number): string => `${Math.round(n).toLocaleString('en-US')} thousand tons`
const musd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')} million`
const ranked = (m: Map<string, Flow>): [string, Flow][] =>
  [...m.entries()].sort(([, a], [, b]) => b.tons - a.tons).slice(0, TOP)

function summary(
  s: StateFlows,
  name: string,
  year: number,
): { t: string; title: string; text: string }[] {
  const t = `${year}-01-01T00:00:00Z`
  const list = (m: Map<string, Flow>): string =>
    ranked(m)
      .map(([k, f]) => `${k}: ${kt(f.tons)}, ${musd(f.value)}`)
      .join('\n')
  return [
    { t, title: `Freight from ${name} by destination state, ${year}`, text: list(s.outbound) },
    { t, title: `Freight into ${name} by origin state, ${year}`, text: list(s.inbound) },
    { t, title: `Freight to, from and within ${name} by mode, ${year}`, text: list(s.modes) },
    {
      t,
      title: `Freight to, from and within ${name} by commodity, ${year}`,
      text: list(s.commodities),
    },
  ]
}

export const btsFafStateFlows: Connector = {
  id: 'bts-faf-state-flows',
  label: 'Freight flows to and from a state (Freight Analysis Framework)',
  source: `FHWA and BTS Freight Analysis Framework version 5, ${FAF_FILE} (faf.ornl.gov)`,
  terms:
    'A U.S. Government work (FHWA and BTS). Tons are thousands of tons and values millions of 2017 dollars; figures for 2018 to 2024 are FAF estimates, not counts.',
  hosts: [HOST],
  options: [
    {
      key: 'state',
      label: 'State',
      type: 'choice',
      required: true,
      help: 'The state whose freight flows in and out are summarized.',
      choices: Object.entries(FAF_STATES).map(([value, [, label]]) => ({ value, label })),
      example: 'OH',
    },
    {
      key: 'year',
      label: 'Year',
      type: 'choice',
      help: 'The FAF year, 2018 to 2024. Leave empty to use the year the period starts in.',
      choices: YEARS.map((y) => ({ value: String(y), label: String(y) })),
      example: '2022',
    },
  ],
  estimate(q) {
    const { name } = stateOf(q)
    const year = yearOf(q)
    return {
      requests: 1,
      items: [
        {
          datasetId: 'faf-state-lanes',
          label: `Freight lanes, modes and commodities for ${name}, ${year} (downloads the ${Math.round(FAF_DOWNLOAD_BYTES / 1e6)} MB FAF file, keeps a summary)`,
          kind: 'text',
          bytes: FAF_DOWNLOAD_BYTES,
        },
        {
          datasetId: 'faf-state-tons',
          label: `Tons shipped from, into and within ${name}, 2018 to 2024`,
          kind: 'series',
          bytes: 1_000,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const { fips, name } = stateOf(q)
    const year = yearOf(q)
    const res = await ctx.get(URL_)
    if (res.status !== 200) throw new AppError('PROVIDER', `faf.ornl.gov answered ${res.status}`)
    const flows = await stateFlows(csvEntry(res.data), fips, year, ctx.signal)
    if (!flows.rows) throw new AppError('PROVIDER', `The FAF file has no rows for ${name}.`)
    const series = YEARS.map((y) => {
      const v = flows.yearly.get(y)!
      return {
        t: `${y}-01-01T00:00:00Z`,
        v: {
          outbound: Math.round(v.outbound),
          inbound: Math.round(v.inbound),
          within: Math.round(v.within),
        },
      }
    })
    return {
      datasets: [
        {
          id: 'faf-state-lanes',
          kind: 'text',
          label: `Freight lanes for ${name}, ${year} (FAF)`,
          file: 'faf-state-lanes.json',
          range: { start: `${year}-01-01T00:00:00Z`, end: `${year}-12-31T23:59:59Z` },
          area: { label: name },
        },
        {
          id: 'faf-state-tons',
          kind: 'series',
          label: `Tons from, into and within ${name} (FAF)`,
          file: 'faf-state-tons.json',
          range: { start: '2018-01-01T00:00:00Z', end: '2024-12-31T23:59:59Z' },
          area: { label: name },
          unit: 'thousand tons',
        },
      ],
      files: [
        { name: 'faf-state-lanes.json', data: JSON.stringify(summary(flows, name, year)) },
        { name: 'faf-state-tons.json', data: JSON.stringify(series) },
      ],
      modified: `Rows of ${FAF_FILE} that start or end in ${name} (${flows.rows.toLocaleString('en-US')} rows), summed by partner state, mode and commodity for ${year} (top ${TOP} each), and by year; domestic legs of imports and exports included.`,
      citation: `U.S. Department of Transportation, FHWA and BTS, Freight Analysis Framework version 5 (${FAF_FILE}), faf.ornl.gov.`,
    }
  },
}
