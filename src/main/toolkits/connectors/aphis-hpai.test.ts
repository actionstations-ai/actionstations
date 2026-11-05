// The APHIS HPAI replay connector (#863): the fixture is a real response of the dashboard's
// CSV export, the host is fixed, and nothing finer than a month is returned or made up. The
// live check runs only with LIVE=1 (aphis-hpai.live.test.ts) and never in CI.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SeriesFile } from '@shared/schemas/case-data'
import { aphisHpai, csvCells, parseMonthly } from './aphis-hpai'
import type { ConnectorQuery, FetchContext } from './registry'

const CSV = readFileSync(join(__dirname, '__fixtures__', 'aphis-hpai-monthly.csv'), 'utf8')
const ctxOf = (body: string, status = 200): { ctx: FetchContext; urls: string[] } => {
  const urls: string[] = []
  return {
    urls,
    ctx: {
      async get(url) {
        urls.push(url)
        return { status, data: new TextEncoder().encode(body) }
      },
    },
  }
}
const q: ConnectorQuery = {
  range: { start: '2026-09-01T00:00:00Z', end: '2026-11-30T00:00:00Z' },
  area: { label: 'United States' },
  options: {},
}

describe('csv parsing', () => {
  it('splits quoted cells', () => {
    expect(csvCells('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"'])
  })

  it('reads the months and flock types of the recorded export in time order', () => {
    const rows = parseMonthly(CSV)
    expect(rows.map((r) => r.t.slice(0, 7))).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
    expect(rows[2]!.v).toEqual({ backyard: 21 })
  })

  it('reads several flock types and skips rows it cannot place', () => {
    const rows = parseMonthly(
      'Month of Confirmed Diagnosis,Backyard Flocks,Commercial Flocks\nMarch 2025,"1,200",3\nbogus,1,1\n',
    )
    expect(rows).toEqual([{ t: '2025-03-01T00:00:00Z', v: { backyard: 1200, commercial: 3 } }])
  })

  it('refuses an export with columns it does not know', () => {
    expect(() => parseMonthly('a,b\n1,2\n')).toThrow(/columns/)
  })
})

describe('aphis-hpai', () => {
  it('estimates a small size without a request', () => {
    const e = aphisHpai.estimate(q)
    expect(e.requests).toBe(1)
    expect(e.items[0]!.bytes).toBeLessThan(2000)
    expect(() =>
      aphisHpai.estimate({ ...q, range: { start: q.range.end, end: q.range.start } }),
    ).toThrow(/ends before/)
  })

  it('fetches from the fixed host and keeps only the months in the period', async () => {
    const { ctx, urls } = ctxOf(CSV)
    const out = await aphisHpai.fetch(q, ctx)
    expect(urls).toHaveLength(1)
    expect(new URL(urls[0]!).host).toBe('publicdashboards.dl.usda.gov')
    const rows = JSON.parse(String(out.files[0]!.data)) as {
      t: string
      v: Record<string, number>
    }[]
    expect(rows.map((r) => r.t.slice(0, 7))).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(SeriesFile.safeParse(rows).success).toBe(true)
    expect(out.datasets.map((d) => d.file)).toEqual(out.files.map((f) => f.name))
    expect(out.modified).toMatch(/No county, flock size or premises/)
    expect(out.citation).toContain('aphis.usda.gov')
    expect(JSON.stringify(out)).not.toMatch(/county":/)
  })

  it('stops with a message when the host answers with an error', async () => {
    await expect(aphisHpai.fetch(q, ctxOf('', 503).ctx)).rejects.toThrow(/503/)
  })

  it('has one fixed public host', () => {
    expect(aphisHpai.hosts).toEqual(['publicdashboards.dl.usda.gov'])
  })
})
