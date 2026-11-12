// Humanitarian key figures by country (spec 0469 FR-9): people in need and targeted, refugees and
// asylum seekers hosted, internally displaced people and appeal funding, from the Humanitarian
// Data Exchange's HAPI service (hapi.humdata.org). HAPI serves the same OCHA response plan,
// UNHCR, IOM and FTS figures that OCHA's key figures pages show, and it works without
// registration, so it stands in for the OCHA key figures service. The figures set a scenario's
// baseline: how many people a response plan counts in need, how much of an appeal is funded.
//
// The app identifies itself as the HDX connector does (humanitarian-hdx.ts): its own name and
// contact unless the user gives theirs in the fetch form. The licence of each source dataset is read
// at fetch time and stored with the data. Hosts are fixed in code; nothing runs without consent.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import {
  HAPI_IDENTITY_OPTIONS,
  identifier,
  LOCATION_OPTION,
  locationOf,
  readLicences,
} from './humanitarian-hdx'
import { getJson } from './json'
import type { Connector, ConnectorQuery, ConnectorResult, FetchContext } from './registry'

const HAPI = 'hapi.humdata.org'
const HDX = 'data.humdata.org'
const TREND_YEARS = 10
const PAGE = 10_000

const num = z.number().nullable().optional()
const str = z.string().nullable().optional()
const Needs = z.looseObject({
  sector_code: str,
  sector_name: str,
  category: str,
  population_status: str,
  population: num,
  reference_period_start: z.string(),
  resource_hdx_id: str,
})
const Refugees = z.looseObject({
  population_group: str,
  population: num,
  origin_location_name: str,
  reference_period_start: z.string(),
  resource_hdx_id: str,
})
const Idps = z.looseObject({
  operation: str,
  assessment_type: str,
  population: num,
  reference_period_start: z.string(),
  resource_hdx_id: str,
})
const Funding = z.looseObject({
  appeal_name: str,
  appeal_type: str,
  requirements_usd: num,
  funding_usd: num,
  funding_pct: num,
  reference_period_start: z.string(),
  resource_hdx_id: str,
})
const page = <T extends z.ZodType>(row: T) => z.looseObject({ data: z.array(row) })

const STATUS: Record<string, string> = {
  all: 'population',
  AFF: 'affected',
  INN: 'in need',
  TGT: 'targeted',
  REA: 'reached',
}
const GROUPS: Record<string, string> = {
  REF: 'refugees',
  ASY: 'asylum seekers',
  OIP: 'others in need of international protection',
  OOC: 'others of concern',
  STA: 'stateless people',
  HST: 'host community',
  RET: 'returned refugees',
  IDP: 'internally displaced people',
}

/** The year the figures are for: the year the scenario period starts in. */
export const yearOf = (q: ConnectorQuery): number => new Date(q.range.start).getUTCFullYear()

/** The four HAPI requests, oldest year first. Pure; used by estimate and fetch. */
export function figuresUrls(
  q: ConnectorQuery,
): Record<'needs' | 'refugees' | 'idps' | 'funding', string> {
  const place = locationOf(q)
  const y = yearOf(q)
  if (!(Date.parse(q.range.end) >= Date.parse(q.range.start)))
    throw new AppError('VALIDATION', 'The period ends before it starts')
  const base = {
    output_format: 'json',
    limit: String(PAGE),
    offset: '0',
    app_identifier: identifier(q),
  }
  const url = (path: string, params: Record<string, string>): string =>
    `https://${HAPI}/api/v2/${path}?${new URLSearchParams({ ...params, ...base })}`
  const window = { start_date: `${y - TREND_YEARS + 1}-01-01`, end_date: `${y}-12-31` }
  return {
    needs: url('affected-people/humanitarian-needs', {
      location_code: place,
      admin_level: '0',
      ...window,
    }),
    refugees: url('affected-people/refugees-persons-of-concern', {
      asylum_location_code: place,
      age_range: 'all',
      gender: 'all',
      ...window,
    }),
    idps: url('affected-people/idps', { location_code: place, admin_level: '0' }),
    funding: url('coordination-context/funding', { location_code: place }),
  }
}

const year = (iso: string): number => Number(iso.slice(0, 4))
const n = (v: number | null | undefined): string =>
  v === null || v === undefined ? 'not stated' : Math.round(v).toLocaleString('en-US')
const usd = (v: number | null | undefined): string =>
  v === null || v === undefined ? 'not stated' : `US$${(v / 1e6).toFixed(1)} million`

/** The latest year with rows at or before `y`, else the earliest year there is. */
function pickYear<T extends { reference_period_start: string }>(
  rows: T[],
  y: number,
): number | undefined {
  const years = [...new Set(rows.map((r) => year(r.reference_period_start)))].sort((a, b) => a - b)
  return years.filter((x) => x <= y).pop() ?? years[0]
}

type NeedsRow = z.infer<typeof Needs>
function needsEntry(rows: NeedsRow[], y: number, place: string) {
  const at = pickYear(rows, y)
  if (at === undefined) return { text: `No response plan figures for ${place} in HAPI.`, at: y }
  const ofYear = rows.filter((r) => year(r.reference_period_start) === at)
  // One plan's national totals: category "" or "total", whichever the plan uses (first found).
  const cat = ofYear.some((r) => (r.category ?? '') === '') ? '' : 'total'
  const totals = ofYear.filter((r) => (r.category ?? '') === cat)
  const lines: string[] = []
  const sectors = new Map<string, Map<string, number>>()
  for (const r of totals) {
    if (r.population === null || r.population === undefined) continue
    const sector =
      r.sector_code === 'Intersectoral'
        ? 'All sectors'
        : (r.sector_name ?? r.sector_code ?? 'Other')
    const m = sectors.get(sector) ?? new Map<string, number>()
    if (!m.has(r.population_status ?? '')) m.set(r.population_status ?? '', r.population)
    sectors.set(sector, m)
  }
  const order = ['All sectors', ...[...sectors.keys()].filter((k) => k !== 'All sectors').sort()]
  for (const s of order) {
    const m = sectors.get(s)
    if (!m) continue
    const parts = ['all', 'AFF', 'INN', 'TGT', 'REA']
      .filter((k) => m.has(k))
      .map((k) => `${STATUS[k]} ${n(m.get(k))}`)
    lines.push(`${s}: ${parts.join(', ')}`)
  }
  return { at, text: lines.join('\n') || `No national totals for ${place} in ${at}.` }
}

type RefRow = z.infer<typeof Refugees>
function refugeesEntry(rows: RefRow[], y: number, place: string) {
  const at = pickYear(rows, y)
  if (at === undefined)
    return { at: y, text: `No refugee figures for ${place} as a host country in HAPI.` }
  const ofYear = rows.filter((r) => year(r.reference_period_start) === at)
  const groups = new Map<string, number>()
  const origins = new Map<string, number>()
  for (const r of ofYear) {
    const p = r.population ?? 0
    const g = GROUPS[r.population_group ?? ''] ?? (r.population_group || 'other')
    groups.set(g, (groups.get(g) ?? 0) + p)
    if (r.population_group === 'REF' || r.population_group === 'ASY') {
      const o = r.origin_location_name || 'origin not stated'
      origins.set(o, (origins.get(o) ?? 0) + p)
    }
  }
  const top = [...origins.entries()].sort(([, a], [, b]) => b - a).slice(0, 8)
  return {
    at,
    text: [
      [...groups.entries()].map(([g, p]) => `${g}: ${n(p)}`).join('\n'),
      top.length
        ? `Refugees and asylum seekers by origin: ${top.map(([o, p]) => `${o} ${n(p)}`).join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

type IdpRow = z.infer<typeof Idps>
function idpsEntry(rows: IdpRow[], endIso: string, place: string): string {
  const latest = new Map<string, IdpRow>()
  for (const r of rows) {
    if (r.reference_period_start.slice(0, 10) > endIso.slice(0, 10)) continue
    const k = r.operation || 'Displacement'
    const prev = latest.get(k)
    if (!prev || r.reference_period_start >= prev.reference_period_start) latest.set(k, r)
  }
  if (!latest.size)
    return `No national displacement figures for ${place} in HAPI up to ${endIso.slice(0, 10)}.`
  return [...latest.entries()]
    .sort(([, a], [, b]) => b.reference_period_start.localeCompare(a.reference_period_start))
    .slice(0, 6)
    .map(
      ([op, r]) =>
        `${op}: ${n(r.population)} people, as of ${r.reference_period_start.slice(0, 10)}`,
    )
    .join('\n')
}

type FundRow = z.infer<typeof Funding>
function fundingEntry(rows: FundRow[], y: number, place: string): string {
  const plans = rows.filter((r) => year(r.reference_period_start) === y && r.requirements_usd)
  if (!plans.length) return `No appeal for ${place} in ${y} in HAPI.`
  return plans
    .map(
      (r) =>
        `${r.appeal_name ?? 'Appeal'} (${r.appeal_type || 'type not stated'}): requirements ${usd(r.requirements_usd)}, funding ${usd(r.funding_usd)}${r.funding_pct === null || r.funding_pct === undefined ? '' : `, ${r.funding_pct}% funded`}`,
    )
    .join('\n')
}

function trend(needs: NeedsRow[], refs: RefRow[], funding: FundRow[], y: number) {
  return Array.from({ length: TREND_YEARS }, (_, i) => y - TREND_YEARS + 1 + i)
    .map((yr) => {
      const v: Record<string, number> = {}
      const hosted = refs
        .filter(
          (r) =>
            year(r.reference_period_start) === yr &&
            ['REF', 'ASY', 'OIP'].includes(r.population_group ?? ''),
        )
        .reduce((s, r) => s + (r.population ?? 0), 0)
      if (hosted) v.refugees_and_asylum_seekers = hosted
      const inNeed = needs.find(
        (r) =>
          year(r.reference_period_start) === yr &&
          r.sector_code === 'Intersectoral' &&
          r.population_status === 'INN' &&
          ['', 'total'].includes(r.category ?? ''),
      )
      if (inNeed?.population) v.people_in_need = inNeed.population
      const plans = funding.filter(
        (r) => year(r.reference_period_start) === yr && r.requirements_usd,
      )
      if (plans.length) {
        v.requirements_usd = plans.reduce((s, r) => s + (r.requirements_usd ?? 0), 0)
        v.funding_usd = plans.reduce((s, r) => s + (r.funding_usd ?? 0), 0)
      }
      return { t: `${yr}-01-01T00:00:00Z`, v }
    })
    .filter((p) => Object.keys(p.v).length > 0)
}

async function all(ctx: FetchContext, q: ConnectorQuery) {
  const u = figuresUrls(q)
  return {
    needs: (await getJson(ctx, u.needs, page(Needs), 'HDX HAPI')).data,
    refugees: (await getJson(ctx, u.refugees, page(Refugees), 'HDX HAPI')).data,
    idps: (await getJson(ctx, u.idps, page(Idps), 'HDX HAPI')).data,
    funding: (await getJson(ctx, u.funding, page(Funding), 'HDX HAPI')).data,
  }
}

export const hdxKeyFigures: Connector = {
  id: 'hdx-key-figures',
  label: 'Humanitarian key figures by country (HDX HAPI)',
  source:
    'Humanitarian Data Exchange, HAPI (hapi.humdata.org): response plan needs, UNHCR refugees, IOM displacement, FTS funding',
  terms:
    'Published by OCHA, UNHCR, IOM and FTS through HDX. The licence of each source dataset is read when you fetch and kept with the data; data under a licence that does not allow redistribution stays in this scenario and is not exported in packs.',
  hosts: [HAPI, HDX],
  options: [LOCATION_OPTION, ...HAPI_IDENTITY_OPTIONS],
  estimate(q) {
    figuresUrls(q)
    const place = locationOf(q)
    return {
      requests: 4 + 8,
      items: [
        {
          datasetId: 'hdx-key-figures',
          label: `Key figures for ${place}, ${yearOf(q)}: people in need, refugees hosted, displacement, appeal funding`,
          kind: 'text',
          bytes: 6_000,
        },
        {
          datasetId: 'hdx-key-figures-trend',
          label: `Refugees hosted, people in need and appeal funding by year, ${place}`,
          kind: 'series',
          bytes: 2_000,
        },
      ],
    }
  },
  async fetch(q, ctx): Promise<ConnectorResult> {
    const place = locationOf(q)
    const y = yearOf(q)
    const got = await all(ctx, q)
    const resources = [got.needs, got.refugees, got.idps, got.funding].map(
      (rows) => rows[0]?.resource_hdx_id ?? undefined,
    )
    const { text: licence, open } = await readLicences(q, ctx, resources, 4)
    const needs = needsEntry(got.needs, y, place)
    const refs = refugeesEntry(got.refugees, y, place)
    const entries = [
      {
        t: `${needs.at}-01-01T00:00:00Z`,
        title: `People in need and targeted, ${place} ${needs.at}`,
        text: needs.text,
      },
      {
        t: `${refs.at}-01-01T00:00:00Z`,
        title: `Refugees and others hosted in ${place}, ${refs.at}`,
        text: refs.text,
      },
      {
        t: q.range.end,
        title: `Internally displaced people, ${place}`,
        text: idpsEntry(got.idps, q.range.end, place),
      },
      {
        t: `${y}-01-01T00:00:00Z`,
        title: `Humanitarian appeals for ${place}, ${y}`,
        text: fundingEntry(got.funding, y, place),
      },
    ]
    return {
      datasets: [
        {
          id: 'hdx-key-figures',
          kind: 'text',
          label: `Key figures, ${place} ${y}`,
          file: 'hdx-key-figures.json',
          range: q.range,
        },
        {
          id: 'hdx-key-figures-trend',
          kind: 'series',
          label: `Key figures by year, ${place}`,
          file: 'hdx-key-figures-trend.json',
          range: { start: `${y - TREND_YEARS + 1}-01-01T00:00:00Z`, end: `${y}-12-31T23:59:59Z` },
          unit: 'people; US dollars',
        },
      ],
      files: [
        { name: 'hdx-key-figures.json', data: JSON.stringify(entries) },
        {
          name: 'hdx-key-figures-trend.json',
          data: JSON.stringify(trend(got.needs, got.refugees, got.funding, y)),
        },
      ],
      modified: `National figures for ${place}: needs for the latest plan year up to ${y}, refugees hosted (all ages and sexes) summed by group and origin, the latest displacement figure per operation up to the period end, appeals for ${y}; ${TREND_YEARS}-year series of the same.`,
      citation:
        `OCHA, UNHCR, IOM and FTS via HDX HAPI, ${place}. Licence read at fetch: ${licence}.${open ? '' : ' Used in this scenario only; not exported in packs.'}`.slice(
          0,
          600,
        ),
    }
  },
}
