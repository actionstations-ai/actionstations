// The CDC replay connectors (#839): recorded responses from data.cdc.gov (the fixtures are real
// responses, trimmed), the queries they build, what they refuse, and the data they hand back.
// The live test runs only with LIVE=1 and never in CI.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SeriesFile, TextFile } from '@shared/schemas/case-data'
import { casesFromWeeklyCounts } from '../epidemiology/simulate/replay-fit'
import { cdcNndss, cdcNwss, mmwrWeekEnd, nndssQuery, nwssQuery } from './cdc'
import type { ConnectorQuery, FetchContext } from './registry'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

const NWSS_ROWS = fixture('cdc-nwss-ohio.json')
const NWSS_VIEW = fixture('cdc-nwss-view.json')
const NNDSS_ROWS = fixture('cdc-nndss-ohio-measles.json')

function recorded(): { ctx: FetchContext; urls: string[] } {
  const urls: string[] = []
  const ctx: FetchContext = {
    async get(url) {
      urls.push(url)
      const body = url.includes('/api/views/')
        ? NWSS_VIEW
        : url.includes('atcp-73re')
          ? NWSS_ROWS
          : NNDSS_ROWS
      return { status: 200, data: new TextEncoder().encode(body) }
    },
  }
  return { ctx, urls }
}

const nwssQ: ConnectorQuery = {
  range: { start: '2026-09-26T00:00:00Z', end: '2026-10-17T00:00:00Z' },
  area: { label: 'Ohio' },
  options: { pathogen: 'SARS-CoV-2' },
}

describe('cdc-nwss', () => {
  it('builds a query limited to one place, pathogen and period', () => {
    const p = nwssQuery(nwssQ)
    expect(p.$where).toBe(
      "state_territory='Ohio' AND pathogen_target='SARS-CoV-2' AND week_end>='2026-09-26' AND week_end<='2026-10-17'",
    )
    expect(
      nwssQuery({ ...nwssQ, options: { ...nwssQ.options, site: 'ID:1508' } }).$where,
    ).toContain("site='ID:1508'")
  })

  it('refuses text that is not a place, a listed pathogen or a site id', () => {
    for (const label of ["Ohio' OR 1=1 --", 'Ohio;DROP', '', 'O'])
      expect(() => nwssQuery({ ...nwssQ, area: { label } })).toThrow()
    expect(() => nwssQuery({ ...nwssQ, options: { pathogen: 'Anthrax' } })).toThrow(/Pathogen/)
    expect(() => nwssQuery({ ...nwssQ, options: { site: "x' or '1'='1" } })).toThrow(/site/)
  })

  it('estimates the size without a request and lists both datasets', () => {
    const e = cdcNwss.estimate(nwssQ)
    expect(e.items.map((i) => i.datasetId)).toEqual(['nwss-wval', 'nwss-levels'])
    expect(e.items.reduce((n, i) => n + i.bytes, 0)).toBeGreaterThan(10_000)
    const one = cdcNwss.estimate({ ...nwssQ, options: { ...nwssQ.options, site: 'ID:1508' } })
    expect(one.items[0]!.bytes).toBeLessThan(e.items[0]!.bytes)
  })

  it('fetches from the fixed host only and returns valid, labeled data', async () => {
    const { ctx, urls } = recorded()
    const out = await cdcNwss.fetch(nwssQ, ctx)
    for (const u of urls) expect(new URL(u).host).toBe('data.cdc.gov')
    expect(urls[0]).toContain('/api/views/atcp-73re.json')
    expect(urls[1]).toContain('/resource/atcp-73re.json?')
    expect(decodeURIComponent(urls[1]!)).toContain("state_territory='Ohio'")
    const series = JSON.parse(String(out.files[0]!.data))
    expect(SeriesFile.safeParse(series).success).toBe(true)
    expect(series[0].v['ID:1508']).toBe(1)
    const levels = JSON.parse(String(out.files[1]!.data))
    expect(TextFile.safeParse(levels).success).toBe(true)
    expect(levels[0].title).toMatch(/Level definition/)
    expect(levels[0].text).toMatch(/very low, low, moderate, high, very high/)
    expect(levels[1].text).toMatch(/Very Low \(WVAL 1\.0\)/)
    expect(out.modified).toContain('Filtered to Ohio')
    expect(out.citation).toContain('atcp-73re')
    expect(out.datasets.map((d) => d.file)).toEqual(out.files.map((f) => f.name))
  })

  it('stops with a message when the host answers with an error', async () => {
    const ctx: FetchContext = { get: async () => ({ status: 503, data: new Uint8Array() }) }
    await expect(cdcNwss.fetch(nwssQ, ctx)).rejects.toThrow(/503/)
  })
})

const nndssQ: ConnectorQuery = {
  range: { start: '2025-01-01T00:00:00Z', end: '2025-02-15T00:00:00Z' },
  area: { label: 'Ohio' },
  options: { disease: 'Measles, Indigenous' },
}

describe('cdc-nndss', () => {
  it('builds a query for one disease, place and the years the period covers', () => {
    expect(nndssQuery(nndssQ).$where).toBe(
      "upper(states)='OHIO' AND label='Measles, Indigenous' AND year in('2025')",
    )
    expect(
      nndssQuery({
        ...nndssQ,
        range: { start: '2024-11-01T00:00:00Z', end: '2026-02-01T00:00:00Z' },
      }).$where,
    ).toContain("year in('2024','2025','2026')")
  })

  it('requires a plain disease name and refuses a long span', () => {
    expect(() => nndssQuery({ ...nndssQ, options: {} })).toThrow(/disease/)
    expect(() => nndssQuery({ ...nndssQ, options: { disease: "x' OR '1'='1" } })).toThrow()
    expect(() =>
      nndssQuery({
        ...nndssQ,
        range: { start: '2010-01-01T00:00:00Z', end: '2026-01-01T00:00:00Z' },
      }),
    ).toThrow(/six years/)
  })

  it('returns weekly counts as history: no reported cases is zero, unavailable is left out', async () => {
    const rows = [
      { year: '2025', week: '1', label: 'x', states: 'Ohio', m1: '3' },
      { year: '2025', week: '2', label: 'x', states: 'Ohio', m1_flag: '-' },
      { year: '2025', week: '3', label: 'x', states: 'Ohio', m1_flag: 'U' },
      { year: '2025', week: '4', label: 'x', states: 'Ohio', m1: '1', m1_flag: '' },
    ]
    const ctx: FetchContext = {
      get: async () => ({ status: 200, data: new TextEncoder().encode(JSON.stringify(rows)) }),
    }
    const out = await cdcNndss.fetch(nndssQ, ctx)
    const points = JSON.parse(String(out.files[0]!.data)) as { t: string; v: number }[]
    expect(points.map((p) => p.v)).toEqual([3, 0, 1])
    expect(points[0]!.t).toBe('2025-01-04T00:00:00Z')
    expect(out.modified).toContain('1 left out')
    expect(SeriesFile.safeParse(points).success).toBe(true)
  })

  it('reads the recorded response', async () => {
    const { ctx } = recorded()
    const out = await cdcNndss.fetch(nndssQ, ctx)
    expect(out.datasets[0]!.id).toBe('nndss-weekly')
    expect(JSON.parse(String(out.files[0]!.data)).length).toBeGreaterThan(0)
  })
})

describe('MMWR weeks', () => {
  it('puts week 1 of 2025 ending Saturday Jan 4 and week 1 of 2026 ending Saturday Jan 10', () => {
    expect(new Date(mmwrWeekEnd(2025, 1)).toISOString().slice(0, 10)).toBe('2025-01-04')
    expect(new Date(mmwrWeekEnd(2026, 1)).toISOString().slice(0, 10)).toBe('2026-01-10')
    expect(new Date(mmwrWeekEnd(2024, 1)).toISOString().slice(0, 10)).toBe('2024-01-06')
    expect(new Date(mmwrWeekEnd(2025, 1)).getUTCDay()).toBe(6)
  })
})

describe('simulated cases fitted to an aggregate', () => {
  const weekly = [
    { t: '2025-01-04T00:00:00Z', v: 3 },
    { t: '2025-01-11T00:00:00Z', v: 0 },
    { t: '2025-01-18T00:00:00Z', v: 5 },
  ]

  it('holds exactly the real count in each week and marks every case simulated', () => {
    const cases = casesFromWeeklyCounts(weekly, 4)
    expect(cases).toHaveLength(8)
    expect(cases.every((c) => c.simulated)).toBe(true)
    const inWeek = (endIso: string) =>
      cases.filter((c) => {
        const end = Date.parse(endIso) + 86_400_000
        return c.onsetMs >= end - 7 * 86_400_000 && c.onsetMs < end
      }).length
    expect(inWeek('2025-01-04T00:00:00Z')).toBe(3)
    expect(inWeek('2025-01-11T00:00:00Z')).toBe(0)
    expect(inWeek('2025-01-18T00:00:00Z')).toBe(5)
    expect(casesFromWeeklyCounts(weekly, 4)).toEqual(cases)
  })
})

describe.skipIf(process.env.LIVE !== '1')('live (opt-in, LIVE=1)', () => {
  it('reads real rows from data.cdc.gov', async () => {
    const ctx: FetchContext = {
      async get(url) {
        const r = await fetch(url)
        return { status: r.status, data: new Uint8Array(await r.arrayBuffer()) }
      },
    }
    const out = await cdcNwss.fetch(nwssQ, ctx)
    expect(JSON.parse(String(out.files[0]!.data)).length).toBeGreaterThan(0)
  })
})
