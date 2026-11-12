// 988 Lifeline monthly performance by state (spec 0464 FR-8): the state-by-state data file GAO
// published with report GAO-26-108114, built from the network administrator's monthly key
// performance indicators (routed calls, texts and chats, answer rates and average time to answer,
// July 2022 to September 2025). One fixed file on one fixed host, about 170 KB zipped; the
// connector keeps the months of the state the user names (or every state added up for "US") as a
// monthly series, a baseline for a contact surge. No key is needed.
import JSZip from 'jszip'
import { AppError } from '../../lib/errors'
import { toBytes } from './json'
import type { Connector, ConnectorQuery } from './registry'

export const GAO_988_FILE =
  'https://files.gao.gov/multimedia/gao-26-108114/interactive/GAO-26-108114_State-by-State_988_Lifeline_Performance.zip'
const CSV_NAME = 'GAO-26-108114_State-by-State_988_Lifeline_Performance.csv'
const SOURCE = 'The GAO 988 Lifeline performance file'
const HEADER = [
  'State',
  'Timeframe',
  'Number of Routed Calls',
  'Call Answer Rate',
  'Call Average Time to Answer',
  'Number of Routed Texts',
  'Text Answer Rate',
  'Text Average Time to Answer',
  'Number of Routed Chats',
  'Chat Answer Rate',
  'Chat Average Time to Answer',
] as const
const CHANNELS = ['call', 'text', 'chat'] as const
type Channel = (typeof CHANNELS)[number]
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const JURISDICTION = /^[A-Z]{2}$/

export interface LifelineMonth {
  state: string
  /** First day of the month, UTC. */
  t: string
  routed: Record<Channel, number | null>
  answerRate: Record<Channel, number | null>
  /** Average time to answer, seconds. */
  answerSec: Record<Channel, number | null>
}

/** The state, territory or "US" named in the options, checked against a fixed shape. */
export function jurisdictionOf(q: ConnectorQuery): string {
  const s = String(q.options.state ?? '').toUpperCase()
  if (!JURISDICTION.test(s))
    throw new AppError(
      'VALIDATION',
      'Name the state or territory by its two-letter code (for example OH), or US for all of them',
    )
  return s
}

const number = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** "0 days 00:00:35" to 35. */
export function durationSeconds(s: string | undefined): number | null {
  const m = /^(\d+) days (\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec((s ?? '').trim())
  if (!m) return null
  return Number(m[1]) * 86_400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4])
}

/** "July 2022" to 2022-07-01T00:00:00.000Z. */
function monthStart(s: string): string | null {
  const [name, year] = s.trim().split(' ')
  const i = MONTHS.indexOf(name ?? '')
  if (i < 0 || !/^\d{4}$/.test(year ?? '')) return null
  return new Date(Date.UTC(Number(year), i, 1)).toISOString()
}

/** The rows of the GAO file; refuses a file whose columns are not the ones it was written for. */
export function parseLifelineCsv(text: string): LifelineMonth[] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const lines = body.split(/\r?\n/)
  const head = (lines[0] ?? '').split(',').map((h) => h.trim())
  if (head.length !== HEADER.length || head.some((h, i) => h !== HEADER[i]))
    throw new AppError('PROVIDER', `${SOURCE} has different columns; the file may have changed.`)
  const out: LifelineMonth[] = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const c = line.split(',')
    const t = monthStart(c[1] ?? '')
    if (!t || !JURISDICTION.test(c[0] ?? '')) continue
    const at = (ch: Channel, k: 0 | 1 | 2) => c[2 + CHANNELS.indexOf(ch) * 3 + k]
    const per = <T>(f: (ch: Channel) => T) =>
      Object.fromEntries(CHANNELS.map((ch) => [ch, f(ch)])) as Record<Channel, T>
    out.push({
      state: c[0]!,
      t,
      routed: per((ch) => number(at(ch, 0))),
      answerRate: per((ch) => number(at(ch, 1))),
      answerSec: per((ch) => durationSeconds(at(ch, 2))),
    })
  }
  return out
}

/** Every state and territory in a month added up: counts summed, rate and time weighted by count. */
export function sumMonths(rows: LifelineMonth[]): LifelineMonth[] {
  const byMonth = new Map<string, LifelineMonth[]>()
  for (const r of rows) byMonth.set(r.t, [...(byMonth.get(r.t) ?? []), r])
  return [...byMonth.entries()].map(([t, rs]) => {
    const routed = {} as Record<Channel, number | null>
    const answerRate = {} as Record<Channel, number | null>
    const answerSec = {} as Record<Channel, number | null>
    for (const ch of CHANNELS) {
      const have = rs.filter((r) => r.routed[ch] !== null)
      const total = have.reduce((n, r) => n + r.routed[ch]!, 0)
      const weighted = (f: (r: LifelineMonth) => number | null) => {
        const w = have.filter((r) => f(r) !== null)
        const n = w.reduce((s, r) => s + r.routed[ch]!, 0)
        return n > 0 ? w.reduce((s, r) => s + f(r)! * r.routed[ch]!, 0) / n : null
      }
      routed[ch] = have.length ? total : null
      answerRate[ch] = weighted((r) => r.answerRate[ch])
      answerSec[ch] = weighted((r) => r.answerSec[ch])
    }
    return { state: 'US', t, routed, answerRate, answerSec }
  })
}

const round = (v: number | null, digits: number): number | null =>
  v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits

function toPoints(rows: LifelineMonth[]) {
  return rows
    .sort((a, b) => a.t.localeCompare(b.t))
    .map((r) => {
      const v: Record<string, number> = {}
      for (const ch of CHANNELS) {
        const put = (k: string, x: number | null) => {
          if (x !== null) v[k] = x
        }
        put(`${ch}sRouted`, r.routed[ch])
        put(`${ch}AnswerRate`, round(r.answerRate[ch], 4))
        put(`${ch}AnswerSeconds`, round(r.answerSec[ch], 1))
      }
      return { t: r.t, v }
    })
}

async function csvFrom(zipBytes: Uint8Array): Promise<string> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(zipBytes)
  } catch {
    throw new AppError('PROVIDER', `${SOURCE} is not a zip archive; the file may have changed.`)
  }
  const entry = zip.file(CSV_NAME)
  if (!entry) throw new AppError('PROVIDER', `${SOURCE} no longer holds ${CSV_NAME}.`)
  return entry.async('string')
}

export const lifeline988: Connector = {
  id: 'lifeline-988-gao',
  label: '988 Lifeline monthly performance by state (GAO data file)',
  source:
    'GAO-26-108114 state-by-state 988 Lifeline performance data (files.gao.gov), from the network administrator monthly KPIs',
  terms:
    'Published by the U.S. Government Accountability Office with its report; cite GAO-26-108114. Covers in-state routed Lifeline contacts, July 2022 to September 2025; specialty lines (Spanish, veterans) are not broken out.',
  hosts: ['files.gao.gov'],
  options: [
    {
      key: 'state',
      label: 'State or territory',
      type: 'text',
      required: true,
      help: 'Two-letter state or territory code, such as OH, or US for the whole country.',
      example: 'OH',
    },
  ],
  estimate(query) {
    jurisdictionOf(query)
    return {
      requests: 1,
      items: [
        {
          datasetId: 'lifeline-988-monthly',
          label: '988 Lifeline routed contacts, answer rate and time to answer by month',
          kind: 'series',
          bytes: 175_000,
        },
      ],
    }
  },
  async fetch(query, ctx) {
    const who = jurisdictionOf(query)
    const res = await ctx.get(GAO_988_FILE)
    const rows = parseLifelineCsv(await csvFrom(res.data))
    const picked = who === 'US' ? sumMonths(rows) : rows.filter((r) => r.state === who)
    if (!picked.length) throw new AppError('NOT_FOUND', `${SOURCE} has no rows for ${who}.`)
    const points = toPoints(picked)
    const first = points[0]!.t
    const last = points[points.length - 1]!.t
    return {
      datasets: [
        {
          id: 'lifeline-988-monthly',
          kind: 'series',
          label: `988 Lifeline monthly performance, ${who === 'US' ? 'all states and territories' : who} (GAO-26-108114 data file)`,
          file: 'lifeline-988-monthly.json',
          range: { start: first, end: last },
          area: { label: who === 'US' ? 'United States' : who },
        },
      ],
      files: [{ name: 'lifeline-988-monthly.json', data: toBytes(points) }],
      modified:
        (who === 'US'
          ? 'All states and territories added up per month (answer rate and time weighted by routed contacts). '
          : `Rows for ${who} only. `) +
        'Every month in the file is kept, whatever the scenario period, as a baseline; times converted to seconds.',
      citation:
        'U.S. Government Accountability Office, GAO-26-108114, state-by-state 988 Lifeline performance data (interactive data file)',
    }
  },
}
