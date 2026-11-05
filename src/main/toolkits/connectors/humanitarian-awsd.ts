// Aid Worker Security Database connector (spec 0469 FR-9): yearly counts of major security
// incidents affecting aid workers (killings, kidnappings, detentions and attacks causing serious
// injury), for a country or worldwide, from Humanitarian Outcomes' database
// (aidworkersecurity.org). Field security exercises use them as context: how many incidents a
// year, what kind, how many national and international staff.
//
// The site offers the incident list as a CSV without a key (its JSON export needs one). This
// connector downloads that CSV once, for one country when given, and keeps only counts by year,
// outcome, staff type, means of attack and attack context. Incident details, places, coordinates
// and actor names are dropped and never stored (spec 0469 NFR-2: aggregate data only).
// The country code is checked before it reaches the address; the host is fixed in code.
// Nothing runs without the user's consent.
import { csvRecords } from '../../hazards/sources/csv'
import { AppError } from '../../lib/errors'
import type { Connector, ConnectorQuery, ConnectorResult } from './registry'

const HOST = 'www.aidworkersecurity.org'
const URL_BASE = `https://${HOST}/incidents/search`
const CONTEXT_YEARS = 10
/** Sizes of the CSV on 2026-11-05, for the estimate: one country is far smaller. */
const ALL_BYTES = 2_400_000
const COUNTRY_BYTES = 200_000
const ISO2 = /^[A-Z]{2}$/

export function countryOf(q: ConnectorQuery): string | undefined {
  const c = String(q.options.country ?? '').toUpperCase()
  if (c === '') return undefined
  if (!ISO2.test(c))
    throw new AppError(
      'VALIDATION',
      'Give the country as a two-letter ISO code (option "country"), or leave it empty for worldwide counts',
    )
  return c
}

/** First and last year counted: the ten years up to the year the scenario period ends in. */
export function yearsOf(q: ConnectorQuery): [number, number] {
  const start = Date.parse(q.range.start)
  const end = Date.parse(q.range.end)
  if (!(end >= start)) throw new AppError('VALIDATION', 'The period ends before it starts')
  const last = new Date(end).getUTCFullYear()
  return [Math.min(new Date(start).getUTCFullYear(), last - CONTEXT_YEARS + 1), last]
}

export function awsdUrl(q: ConnectorQuery): string {
  const c = countryOf(q)
  return `${URL_BASE}?format=csv${c ? `&country=${c}` : ''}`
}

interface YearCount {
  incidents: number
  affected: number
  killed: number
  wounded: number
  kidnapped: number
  detained: number
  nationals: number
  internationals: number
  unverified: number
  means: Map<string, number>
  contexts: Map<string, number>
}

const blank = (): YearCount => ({
  incidents: 0,
  affected: 0,
  killed: 0,
  wounded: 0,
  kidnapped: 0,
  detained: 0,
  nationals: 0,
  internationals: 0,
  unverified: 0,
  means: new Map(),
  contexts: new Map(),
})

const int = (s: string | undefined): number => {
  const v = Number(s)
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0
}
const bump = (m: Map<string, number>, k: string | undefined): void => {
  const key = k && k !== 'Unknown' ? k : 'unknown'
  m.set(key, (m.get(key) ?? 0) + 1)
}

/** The incident table, refused when it is not one (an error page, a browser check). */
export function incidentRecords(csv: string): Record<string, string>[] {
  const records = csvRecords(csv)
  if (!records.length || !('year' in records[0]!) || !('total affected' in records[0]!))
    throw new AppError(
      'PROVIDER',
      'aidworkersecurity.org did not send the expected incident table; the site may have changed or asked for a browser check.',
    )
  return records.filter((r) => !r['incident id']?.startsWith('#'))
}

/** Count incidents by year. Only the columns named here are read; everything else is dropped. */
export function countByYear(
  records: Record<string, string>[],
  first: number,
  last: number,
): Map<number, YearCount> {
  const out = new Map<number, YearCount>()
  for (let y = first; y <= last; y++) out.set(y, blank())
  for (const r of records) {
    const slot = out.get(Number(r.year))
    if (!slot) continue
    slot.incidents++
    slot.affected += int(r['total affected'])
    slot.killed += int(r['total killed'])
    slot.wounded += int(r['total wounded'])
    slot.kidnapped += int(r['total kidnapped'])
    slot.detained += int(r['total detained'])
    slot.nationals += int(r['total nationals'])
    slot.internationals += int(r['total internationals'])
    if (r.verified && r.verified !== 'Yes' && r.verified !== 'Archived') slot.unverified++
    bump(slot.means, r['means of attack'])
    bump(slot.contexts, r['attack context'])
  }
  return out
}

const top = (m: Map<string, number>): string =>
  [...m.entries()]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .slice(0, 5)
    .map(([k, v]) => `${k.toLowerCase()} ${v}`)
    .join(', ')

function sentence(y: number, c: YearCount, where: string): string {
  if (!c.incidents) return `No major incidents affecting aid workers recorded ${where} in ${y}.`
  return [
    `${c.incidents} major incidents ${where} in ${y}, affecting ${c.affected} aid workers (${c.nationals} national, ${c.internationals} international staff): ${c.killed} killed, ${c.wounded} wounded, ${c.kidnapped} kidnapped, ${c.detained} detained.`,
    `Means of attack: ${top(c.means)}.`,
    `Attack context: ${top(c.contexts)}.`,
    c.unverified ? `${c.unverified} of these incidents are not yet verified and may change.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const awsdIncidentCounts: Connector = {
  id: 'awsd-incident-counts',
  label: 'Aid worker security incident counts (Aid Worker Security Database)',
  source: 'Humanitarian Outcomes, Aid Worker Security Database (aidworkersecurity.org)',
  terms:
    'Compiled by Humanitarian Outcomes from public reports and partner information and verified yearly; the latest incidents are provisional. The site states no licence. Only yearly counts are kept, no incident details.',
  hosts: [HOST],
  estimate(q) {
    const c = countryOf(q)
    const [first, last] = yearsOf(q)
    return {
      requests: 1,
      items: [
        {
          datasetId: 'awsd-incidents-by-year',
          label: `Aid worker incident counts by year, ${c ?? 'worldwide'}, ${first} to ${last} (downloads about ${c ? '0.2' : '2.4'} MB, keeps counts only)`,
          kind: 'series',
          bytes: c ? COUNTRY_BYTES : ALL_BYTES,
        },
        {
          datasetId: 'awsd-summary',
          label: 'One summary per year: outcomes, staff type, means and context of attack',
          kind: 'text',
          bytes: 6_000,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const c = countryOf(q)
    const [first, last] = yearsOf(q)
    const res = await ctx.get(awsdUrl(q))
    if (res.status === 403)
      throw new AppError(
        'PROVIDER',
        'aidworkersecurity.org refused the download (403); the site may be asking for a browser check. Try again later.',
      )
    if (res.status !== 200)
      throw new AppError('PROVIDER', `aidworkersecurity.org answered ${res.status}`)
    const records = incidentRecords(new TextDecoder().decode(res.data)).filter(
      (r) => !c || r['country code'] === c,
    )
    const counts = countByYear(records, first, last)
    const name = c ? (records.find((r) => r.country)?.country ?? c).slice(0, 60) : 'worldwide'
    const where = c ? `in ${name}` : 'worldwide'
    const years = [...counts.entries()]
    const series = years.map(([y, n]) => ({
      t: `${y}-01-01T00:00:00Z`,
      v: {
        incidents: n.incidents,
        killed: n.killed,
        wounded: n.wounded,
        kidnapped: n.kidnapped,
        detained: n.detained,
        national_staff: n.nationals,
        international_staff: n.internationals,
      },
    }))
    const summary = years.map(([y, n]) => ({
      t: `${y}-01-01T00:00:00Z`,
      title: `Aid worker security, ${name}, ${y}`,
      text: sentence(y, n, where),
    }))
    const range = { start: `${first}-01-01T00:00:00Z`, end: `${last}-12-31T23:59:59Z` }
    return {
      datasets: [
        {
          id: 'awsd-incidents-by-year',
          kind: 'series',
          label: `Aid worker incidents by year, ${name}`,
          file: 'awsd-incidents-by-year.json',
          range,
          unit: 'incidents; aid workers',
        },
        {
          id: 'awsd-summary',
          kind: 'text',
          label: `Aid worker security by year, ${name}`,
          file: 'awsd-summary.json',
          range,
        },
      ],
      files: [
        { name: 'awsd-incidents-by-year.json', data: JSON.stringify(series) },
        { name: 'awsd-summary.json', data: JSON.stringify(summary) },
      ],
      modified: `Counted by year ${first} to ${last}${c ? ` for ${c}` : ''}: incidents, aid workers by outcome and staff type, means and context of attack. Incident details, places, coordinates and actor names left out.`,
      citation: `Aid Worker Security Database, Humanitarian Outcomes (aidworkersecurity.org), retrieved with the latest incidents provisional.`,
    }
  },
}
