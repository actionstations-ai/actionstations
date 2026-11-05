// APHIS replay connector for confirmed HPAI detections in flocks (spec 0460 FR-9). The only
// machine-readable export of the APHIS dashboard that this project has verified is the CSV of
// its main view (Tableau, publicdashboards.dl.usda.gov): confirmations per month of confirmed
// diagnosis, by flock type. It carries no county, no flock size and no premises, so the replay
// sets the pace and scale of a scenario by month and never shows or invents a farm. County
// detail and the NASS farm inventories are not fetched here: the export does not have county
// rows and NASS Quick Stats needs a key, which the project does not use. The host is fixed in
// code and nothing runs before the user consents (case:plan-fetch then case:fetch).
import { AppError } from '../../lib/errors'
import { type Connector, type ConnectorQuery, type ConnectorResult } from './registry'

const HOST = 'publicdashboards.dl.usda.gov'
const URL_CSV = `https://${HOST}/t/MRP_PUB/views/VS_Avian_HPAIConfirmedDetections2022/HPAI2022ConfirmedDetections.csv`
const PAGE =
  'https://www.aphis.usda.gov/livestock-poultry-disease/avian/avian-influenza/hpai-detections/commercial-backyard-flocks'
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
] as const

// TextDecoder drops a leading byte order mark by default.
const textOf = (data: Uint8Array): string => new TextDecoder().decode(data)

/** Split one CSV line, honoring double quotes. */
export function csvCells(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

export interface MonthlyRow {
  /** First instant of the month, UTC. */
  t: string
  /** Confirmations by flock type, keyed by the column name lower-cased without "flocks". */
  v: Record<string, number>
}

/** The monthly rows of the dashboard export, in time order. */
export function parseMonthly(csv: string): MonthlyRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim())
  const header = csvCells(lines[0] ?? '')
  const monthAt = header.findIndex((h) => /month of confirmed diagnosis/i.test(h))
  const typeCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => i !== monthAt && /flocks?$/i.test(h.trim()))
  if (monthAt < 0 || !typeCols.length)
    throw new AppError('INTERNAL', 'APHIS sent an export with columns this connector does not know')
  const rows: MonthlyRow[] = []
  for (const line of lines.slice(1)) {
    const cells = csvCells(line)
    const m = /^([A-Za-z]+) (\d{4})$/.exec((cells[monthAt] ?? '').trim())
    const month = m ? MONTHS.findIndex((n) => n === m[1]) : -1
    if (!m || month < 0) continue
    const v: Record<string, number> = {}
    for (const { h, i } of typeCols) {
      const n = Number((cells[i] ?? '').replace(/,/g, ''))
      if (Number.isFinite(n))
        v[
          h
            .trim()
            .replace(/\s*flocks?$/i, '')
            .toLowerCase()
        ] = n
    }
    if (Object.keys(v).length)
      rows.push({
        t: new Date(Date.UTC(Number(m[2]), month, 1)).toISOString().replace('.000Z', 'Z'),
        v,
      })
  }
  return rows.sort((a, b) => a.t.localeCompare(b.t))
}

function monthsIn(q: ConnectorQuery): number {
  const span = Date.parse(q.range.end) - Date.parse(q.range.start)
  if (!(span >= 0)) throw new AppError('VALIDATION', 'The period ends before it starts')
  return Math.ceil(span / (30 * 86_400_000)) + 1
}

export const aphisHpai: Connector = {
  id: 'aphis-hpai',
  label: 'APHIS confirmed HPAI detections in flocks (monthly)',
  source: 'USDA APHIS, Confirmations of HPAI in commercial and backyard flocks dashboard',
  terms:
    'U.S. government work, public domain. Counts by month of confirmed diagnosis and flock type; no county, flock size or premises. The dashboard data change as APHIS updates them.',
  hosts: [HOST],
  estimate(q) {
    const months = monthsIn(q)
    return {
      requests: 1,
      items: [
        {
          datasetId: 'aphis-hpai-monthly',
          label: 'Confirmed HPAI detections by month and flock type',
          kind: 'series',
          bytes: 200 + months * 60,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    monthsIn(q)
    const r = await ctx.get(URL_CSV)
    if (r.status !== 200) throw new AppError('INTERNAL', `APHIS dashboards answered ${r.status}`)
    const all = parseMonthly(textOf(r.data))
    const from = new Date(q.range.start)
    const to = Date.parse(q.range.end)
    const first = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)
    const rows = all.filter((x) => Date.parse(x.t) >= first && Date.parse(x.t) <= to)
    return {
      datasets: [
        {
          id: 'aphis-hpai-monthly',
          kind: 'series',
          label: 'Confirmed HPAI detections by month and flock type (United States)',
          file: 'aphis-hpai-monthly.json',
          range: q.range,
          area: q.area,
          unit: 'flocks per month',
        },
      ],
      files: [{ name: 'aphis-hpai-monthly.json', data: JSON.stringify(rows) }],
      modified: `Months from ${rows[0]?.t.slice(0, 7) ?? 'none'} to ${rows.at(-1)?.t.slice(0, 7) ?? 'none'} kept (${rows.length} of ${all.length} in the export). No county, flock size or premises is in the export; scenario premises are fictional.`,
      citation: `USDA APHIS. Confirmations of HPAI in commercial and backyard flocks. ${PAGE}`,
    }
  },
}
