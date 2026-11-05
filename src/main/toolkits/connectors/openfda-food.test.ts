// The openFDA food enforcement connector (#810): a recorded response (real, trimmed), the query it
// builds, what it refuses, the fixed host, and the data it hands back with firm names left out.
// The live test runs only with LIVE=1 and never in CI.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TextFile } from '@shared/schemas/case-data'
import { enforcementQuery, openfdaFoodEnforcement } from './openfda-food'
import type { ConnectorQuery, FetchContext } from './registry'

const BODY = readFileSync(
  join(__dirname, '__fixtures__/openfda-food-enforcement-class-i.json'),
  'utf8',
)
const live = process.env.LIVE === '1'

const q: ConnectorQuery = {
  range: { start: '2015-01-01T00:00:00Z', end: '2015-12-31T00:00:00Z' },
  area: { label: 'United States' },
  options: { classification: 'Class I', limit: 3 },
}

function recorded(): { ctx: FetchContext; urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    ctx: {
      async get(url) {
        urls.push(url)
        return { status: 200, data: new TextEncoder().encode(BODY) }
      },
    },
  }
}

describe('openfda-food-enforcement', () => {
  it('builds a query for a report-date range, a class and a limit', () => {
    expect(enforcementQuery(q)).toBe(
      'search=report_date:[20150101+TO+20151231]+AND+classification:"Class+I"&limit=3',
    )
    expect(enforcementQuery({ ...q, options: {} })).toBe(
      'search=report_date:[20150101+TO+20151231]&limit=25',
    )
  })

  it('refuses a class not on the list, a bad limit and a reversed period', () => {
    expect(() =>
      enforcementQuery({ ...q, options: { classification: 'Class I" OR 1:1' } }),
    ).toThrow(/Classification/)
    expect(() => enforcementQuery({ ...q, options: { limit: 5000 } })).toThrow(/Limit/)
    expect(() => enforcementQuery({ ...q, options: { limit: 2.5 } })).toThrow(/Limit/)
    expect(() =>
      enforcementQuery({ ...q, range: { start: q.range.end, end: q.range.start } }),
    ).toThrow(/ends before/)
  })

  it('estimates size and requests without a network call', () => {
    const e = openfdaFoodEnforcement.estimate(q)
    expect(e.requests).toBe(1)
    expect(e.items[0]!.datasetId).toBe('fda-food-enforcement')
    expect(e.items[0]!.bytes).toBeGreaterThan(3 * 1000)
  })

  it('calls only its fixed host and returns valid text entries without firm names', async () => {
    const { ctx, urls } = recorded()
    const out = await openfdaFoodEnforcement.fetch(q, ctx)
    expect(urls).toHaveLength(1)
    expect(new URL(urls[0]!).host).toBe('api.fda.gov')
    const entries = JSON.parse(String(out.files[0]!.data))
    expect(TextFile.safeParse(entries).success).toBe(true)
    expect(entries).toHaveLength(3)
    expect(entries[0].title).toMatch(/^F-\d{4}-\d{4} Class I$/)
    const firm = (JSON.parse(BODY).results[0].recalling_firm as string).toLowerCase()
    expect(JSON.stringify(entries).toLowerCase()).not.toContain(firm)
    expect(out.modified).toMatch(/firm names and addresses left out/)
    expect(out.citation).toMatch(/Data provided by the U.S. Food and Drug Administration/)
    expect(openfdaFoodEnforcement.hosts).toEqual(['api.fda.gov'])
  })

  it('refuses a response that is not the expected shape', async () => {
    const ctx: FetchContext = {
      async get() {
        return { status: 200, data: new TextEncoder().encode('{"results": [{"x": 1}]}') }
      },
    }
    await expect(openfdaFoodEnforcement.fetch(q, ctx)).rejects.toThrow(/unexpected shape/)
  })
})

describe.skipIf(!live)('live openFDA', () => {
  it('answers for a Class I query', async () => {
    const ctx: FetchContext = {
      async get(url) {
        const r = await fetch(url)
        return { status: r.status, data: new Uint8Array(await r.arrayBuffer()) }
      },
    }
    const out = await openfdaFoodEnforcement.fetch(q, ctx)
    expect(JSON.parse(String(out.files[0]!.data)).length).toBeGreaterThan(0)
  }, 60_000)
})
