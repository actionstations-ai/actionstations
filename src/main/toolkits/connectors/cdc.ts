// CDC replay connectors (spec 0457 FR-10): wastewater viral activity levels and weekly notifiable
// disease counts, both from data.cdc.gov (Socrata open data, U.S. government works). They find
// aggregate history for one place and period and hand it to a scenario as historical data with
// source and retrieval date. No line list exists in either dataset and none is made up here:
// individual cases in a replayed scenario are simulated to fit the aggregate (see
// toolkits/epidemiology/simulate/replay-fit.ts) and marked simulated.
//
// Everything user-controlled that reaches a query is checked against a fixed shape first
// (a state name, a pathogen from a list, a site id, a disease label), so no text is ever pasted
// into a query unchecked. The host is fixed in code. Nothing runs without the user's consent
// (case:plan-fetch then case:fetch).
import { AppError } from '../../lib/errors'
import {
  registerConnector,
  type Connector,
  type ConnectorQuery,
  type ConnectorResult,
  type FetchContext,
} from './registry'

const HOST = 'data.cdc.gov'
const NWSS_ID = 'atcp-73re'
const NNDSS_ID = 'x9gk-5huc'
const PAGE = 50_000
const DAY_MS = 86_400_000

export const NWSS_PATHOGENS = ['SARS-CoV-2', 'Influenza A virus', 'RSV'] as const
const NWSS_URL = `https://${HOST}/resource/${NWSS_ID}.json`
const NWSS_VIEW = `https://${HOST}/api/views/${NWSS_ID}.json`
const NNDSS_URL = `https://${HOST}/resource/${NNDSS_ID}.json`

const BYTES_PER_NWSS_ROW = 340
const BYTES_PER_NNDSS_ROW = 330
/** Sites in a jurisdiction when none is named: an upper planning figure for the size estimate. */
const SITES_GUESS = 60

const STATE = /^[A-Za-z][A-Za-z .'-]{1,39}$/
const SITE = /^[A-Za-z0-9:_-]{1,24}$/
const DISEASE = /^[A-Za-z0-9][A-Za-z0-9 ,()/'-]{1,79}$/

const textOf = (data: Uint8Array): string => new TextDecoder().decode(data)
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const quote = (s: string): string => `'${s.replace(/'/g, "''")}'`

function weeksIn(q: ConnectorQuery): number {
  const span = Date.parse(q.range.end) - Date.parse(q.range.start)
  if (!(span >= 0)) throw new AppError('VALIDATION', 'The period ends before it starts')
  return Math.ceil(span / (7 * DAY_MS)) + 1
}

function jurisdiction(q: ConnectorQuery): string {
  const name = q.area.label.trim()
  if (!STATE.test(name))
    throw new AppError(
      'VALIDATION',
      'Name the state, territory or jurisdiction (letters, spaces and punctuation only)',
    )
  return name
}

function pathogenOf(q: ConnectorQuery): (typeof NWSS_PATHOGENS)[number] {
  const p = String(q.options.pathogen ?? 'SARS-CoV-2')
  const found = NWSS_PATHOGENS.find((x) => x === p)
  if (!found)
    throw new AppError('VALIDATION', `Pathogen must be one of: ${NWSS_PATHOGENS.join(', ')}`)
  return found
}

function siteOf(q: ConnectorQuery): string | undefined {
  const s = q.options.site
  if (s === undefined || s === '') return undefined
  if (typeof s !== 'string' || !SITE.test(s)) throw new AppError('VALIDATION', 'Invalid site id')
  return s
}

async function getJson(ctx: FetchContext, url: string): Promise<unknown> {
  const r = await ctx.get(url)
  if (r.status !== 200) throw new AppError('INTERNAL', `data.cdc.gov answered ${r.status}`)
  try {
    return JSON.parse(textOf(r.data))
  } catch {
    throw new AppError('INTERNAL', 'data.cdc.gov sent a response that is not JSON')
  }
}

/** Fetch every page of a Socrata query (most pages the estimate expected, never more than 20). */
async function getAllRows(
  ctx: FetchContext,
  base: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({
      ...params,
      $limit: String(PAGE),
      $offset: String(page * PAGE),
    })
    const got = await getJson(ctx, `${base}?${qs.toString().replace(/\+/g, '%20')}`)
    if (!Array.isArray(got)) throw new AppError('INTERNAL', 'Unexpected response from data.cdc.gov')
    rows.push(...(got as Record<string, unknown>[]))
    if (got.length < PAGE) break
  }
  return rows
}

// ---- wastewater ----------------------------------------------------------------------------

interface NwssRow {
  site: string
  site_wval: string
  site_wval_category: string
  week_end: string
  counties_served?: string
  population_served?: string
}

const asNwss = (r: Record<string, unknown>): NwssRow | undefined =>
  typeof r.site === 'string' && typeof r.week_end === 'string' && typeof r.site_wval === 'string'
    ? (r as unknown as NwssRow)
    : undefined

export function nwssQuery(q: ConnectorQuery): Record<string, string> {
  const where = [
    `state_territory=${quote(jurisdiction(q))}`,
    `pathogen_target=${quote(pathogenOf(q))}`,
    `week_end>=${quote(isoDay(Date.parse(q.range.start)))}`,
    `week_end<=${quote(isoDay(Date.parse(q.range.end)))}`,
  ]
  const site = siteOf(q)
  if (site) where.push(`site=${quote(site)}`)
  return { $where: where.join(' AND '), $order: 'week_end,site' }
}

export const cdcNwss: Connector = {
  id: 'cdc-nwss',
  label: 'CDC wastewater viral activity levels (NWSS)',
  source: 'CDC National Wastewater Surveillance System, data.cdc.gov dataset atcp-73re',
  terms:
    'U.S. government work, public domain. Weekly levels per sampling site; categories use pathogen-specific cut-offs published by CDC.',
  hosts: [HOST],
  options: [
    {
      key: 'pathogen',
      label: 'Pathogen',
      type: 'choice',
      help: 'The virus measured in wastewater.',
      choices: NWSS_PATHOGENS.map((p) => ({ value: p, label: p })),
      default: 'SARS-CoV-2',
      example: 'SARS-CoV-2',
    },
    {
      key: 'site',
      label: 'Sampling site',
      type: 'text',
      help: 'Optional NWSS site id such as ID:1508, from the CDC wastewater data; leave empty for every site in the state.',
      example: 'ID:1508',
    },
  ],
  area: {
    label: 'required',
    help: 'The state, territory or jurisdiction name as CDC spells it, such as Ohio.',
    example: { label: 'Ohio' },
  },
  estimate(q) {
    const rows = weeksIn(q) * (siteOf(q) ? 1 : SITES_GUESS)
    pathogenOf(q)
    jurisdiction(q)
    return {
      requests: 1 + Math.ceil(rows / PAGE),
      items: [
        {
          datasetId: 'nwss-wval',
          label: `Wastewater viral activity level, ${pathogenOf(q)}, ${jurisdiction(q)}`,
          kind: 'series',
          bytes: rows * 90,
        },
        {
          datasetId: 'nwss-levels',
          label: 'Levels by site and week, with the published definition',
          kind: 'text',
          bytes: rows * (BYTES_PER_NWSS_ROW - 90) + 2000,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const place = jurisdiction(q)
    const pathogen = pathogenOf(q)
    const meta = (await getJson(ctx, NWSS_VIEW)) as {
      columns?: { fieldName?: string; description?: string }[]
      rowsUpdatedAt?: number
    }
    const levelDef =
      meta.columns?.find((c) => c.fieldName === 'site_wval_category')?.description ??
      'Categories are ordinal based on pathogen-specific cut-offs of WVAL values.'
    const updated = meta.rowsUpdatedAt
      ? new Date(meta.rowsUpdatedAt * 1000).toISOString()
      : 'unknown'
    const rows = (await getAllRows(ctx, NWSS_URL, nwssQuery(q)))
      .map(asNwss)
      .filter((r): r is NwssRow => r !== undefined)
    const byWeek = new Map<string, Record<string, number>>()
    for (const r of rows) {
      const v = Number(r.site_wval)
      if (!Number.isFinite(v)) continue
      const rec = byWeek.get(r.week_end) ?? {}
      rec[r.site] = v
      byWeek.set(r.week_end, rec)
    }
    const series = [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({ t: `${week}T00:00:00Z`, v }))
    const entries = [
      {
        t: `${isoDay(Date.parse(q.range.start))}T00:00:00Z`,
        title: 'Level definition as published for this dataset',
        text: `${levelDef}\n\nDataset: ${NWSS_ID}. Data as of ${updated}. Methodology: https://www.cdc.gov/nwss/about-data.html`,
      },
      ...rows.map((r) => ({
        t: `${r.week_end}T00:00:00Z`,
        title: `${r.site} ${r.week_end}`,
        text: `Site ${r.site}${r.counties_served ? ` (${r.counties_served})` : ''}: ${r.site_wval_category} (WVAL ${r.site_wval})${r.population_served ? `, population served ${r.population_served}` : ''}.`,
      })),
    ]
    return {
      datasets: [
        {
          id: 'nwss-wval',
          kind: 'series',
          label: `Wastewater viral activity level, ${pathogen}, ${place}`,
          file: 'nwss-wval.json',
          range: q.range,
          area: q.area,
          unit: 'WVAL',
        },
        {
          id: 'nwss-levels',
          kind: 'text',
          label: 'Wastewater levels by site and week',
          file: 'nwss-levels.json',
          range: q.range,
          area: q.area,
        },
      ],
      files: [
        { name: 'nwss-wval.json', data: JSON.stringify(series) },
        { name: 'nwss-levels.json', data: JSON.stringify(entries) },
      ],
      modified: `Filtered to ${place}, ${pathogen}, weeks ending ${isoDay(Date.parse(q.range.start))} to ${isoDay(Date.parse(q.range.end))}${siteOf(q) ? `, site ${siteOf(q)}` : ''}; sites regrouped by week.`,
      citation: `CDC. Wastewater Viral Activity Level for SARS-CoV-2, Influenza A and RSV (dataset ${NWSS_ID}), data.cdc.gov, as of ${updated}.`,
    }
  },
}

// ---- notifiable diseases -----------------------------------------------------------------------

/** The Saturday that ends MMWR week `week` of `year` (week 1 is the first week with at least four days in the year). */
export function mmwrWeekEnd(year: number, week: number): number {
  const jan1 = Date.UTC(year, 0, 1)
  const dow = new Date(jan1).getUTCDay() // 0 = Sunday
  // Sunday that starts week 1: Jan 1 if it falls Sunday to Wednesday, else the following Sunday.
  const start = dow <= 3 ? jan1 - dow * DAY_MS : jan1 + (7 - dow) * DAY_MS
  return start + ((week - 1) * 7 + 6) * DAY_MS
}

interface NndssRow {
  year: string
  week: string
  m1?: string
  m1_flag?: string
  label: string
  states: string
}

const asNndss = (r: Record<string, unknown>): NndssRow | undefined =>
  typeof r.year === 'string' && typeof r.week === 'string' && typeof r.label === 'string'
    ? (r as unknown as NndssRow)
    : undefined

function diseaseOf(q: ConnectorQuery): string {
  const d = q.options.disease
  if (typeof d !== 'string' || !DISEASE.test(d))
    throw new AppError(
      'VALIDATION',
      'Name the disease exactly as NNDSS lists it (option "disease")',
    )
  return d
}

export function nndssQuery(q: ConnectorQuery): Record<string, string> {
  const y0 = new Date(q.range.start).getUTCFullYear()
  const y1 = new Date(q.range.end).getUTCFullYear()
  const years = Array.from({ length: Math.max(0, y1 - y0) + 1 }, (_, i) => quote(String(y0 + i)))
  if (years.length > 6) throw new AppError('VALIDATION', 'Ask for six years or fewer')
  const where = [
    `upper(states)=${quote(jurisdiction(q).toUpperCase())}`,
    `label=${quote(diseaseOf(q))}`,
    `year in(${years.join(',')})`,
  ]
  return { $where: where.join(' AND '), $order: 'year,week' }
}

/** Flags that mean the jurisdiction had no usable count that week; none of them is a zero. */
const NO_DATA_FLAGS = new Set(['U', 'N', 'NN', 'NP', 'NC'])

export const cdcNndss: Connector = {
  id: 'cdc-nndss',
  label: 'CDC weekly notifiable disease counts (NNDSS)',
  source: 'CDC National Notifiable Diseases Surveillance System, data.cdc.gov dataset x9gk-5huc',
  terms:
    'Provisional weekly counts published by CDC (a U.S. government work). Counts are revised as jurisdictions report; each week is shown as published.',
  hosts: [HOST],
  options: [
    {
      key: 'disease',
      label: 'Disease',
      type: 'text',
      required: true,
      help: 'The disease name exactly as the NNDSS weekly tables list it, such as Measles, Indigenous.',
      example: 'Measles, Indigenous',
    },
  ],
  area: {
    label: 'required',
    help: 'The state or territory name as NNDSS spells it, such as Ohio.',
    example: { label: 'Ohio' },
  },
  estimate(q) {
    jurisdiction(q)
    diseaseOf(q)
    const rows = weeksIn(q) + 53
    return {
      requests: 1,
      items: [
        {
          datasetId: 'nndss-weekly',
          label: `Weekly ${diseaseOf(q)} cases, ${jurisdiction(q)}`,
          kind: 'series',
          bytes: rows * BYTES_PER_NNDSS_ROW,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const place = jurisdiction(q)
    const disease = diseaseOf(q)
    const t0 = Date.parse(q.range.start)
    const t1 = Date.parse(q.range.end)
    const rows = (await getAllRows(ctx, NNDSS_URL, nndssQuery(q)))
      .map(asNndss)
      .filter((r): r is NndssRow => r !== undefined)
    let skipped = 0
    const points: { t: string; v: number }[] = []
    for (const r of rows) {
      const end = mmwrWeekEnd(Number(r.year), Number(r.week))
      if (end < t0 - 6 * DAY_MS || end > t1) continue
      const flag = r.m1_flag ?? ''
      if (r.m1 === undefined && NO_DATA_FLAGS.has(flag)) {
        skipped++
        continue
      }
      const v = r.m1 === undefined ? 0 : Number(r.m1)
      if (!Number.isFinite(v)) continue
      points.push({ t: `${isoDay(end)}T00:00:00Z`, v })
    }
    return {
      datasets: [
        {
          id: 'nndss-weekly',
          kind: 'series',
          label: `Weekly ${disease} cases, ${place} (provisional)`,
          file: 'nndss-weekly.json',
          range: q.range,
          area: q.area,
          unit: 'cases per week',
        },
      ],
      files: [{ name: 'nndss-weekly.json', data: JSON.stringify(points) }],
      modified: `Filtered to ${place}, ${disease}, MMWR weeks ending within the period; a week with no reported cases is a zero, a week flagged unavailable or not reportable is left out${skipped ? ` (${skipped} left out)` : ''}.`,
      citation: `CDC. NNDSS Weekly Data (dataset ${NNDSS_ID}), data.cdc.gov. Provisional.`,
    }
  },
}

export function registerCdcConnectors(): void {
  for (const c of [cdcNwss, cdcNndss]) registerConnector(c)
}
