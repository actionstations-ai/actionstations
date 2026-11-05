// The SEC EDGAR connector (spec 0459 FR-11): recorded response shapes (names replaced with
// fictional ones), the queries it builds, what it refuses, fair-access pacing and the contact
// rule, and the facilitator-only data it hands back. The live test runs only with LIVE=1.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCaseGet, caseUserAgent } from '../../case-data/http'
import { GroundTruthEvent } from '@shared/schemas/metrics'
import {
  EDGAR_MIN_INTERVAL_MS,
  edgarParams,
  edgarSearchUrl,
  hitsFrom,
  itemExcerpt,
  plainText,
  secEdgar8k,
} from './sec-edgar'
import type { ConnectorQuery, FetchContext } from './registry'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8')
const SEARCH = fixture('sec-edgar-search-8k.json')
const FILING = fixture('sec-edgar-8k-item-105.htm')

const query: ConnectorQuery = {
  range: { start: '2026-01-01T00:00:00Z', end: '2026-01-31T00:00:00Z' },
  area: { label: 'United States' },
  options: { item: '1.05' },
}

function recorded(): { ctx: FetchContext; urls: string[]; ranges: unknown[] } {
  const urls: string[] = []
  const ranges: unknown[] = []
  const ctx: FetchContext = {
    async get(url, init) {
      urls.push(url)
      ranges.push(init?.range)
      const body = url.includes('efts.sec.gov') ? SEARCH : FILING
      return { status: 200, data: new TextEncoder().encode(body) }
    },
  }
  return { ctx, urls, ranges }
}

describe('sec-edgar-8k queries', () => {
  it('builds a search for one item, form and period with only those values', () => {
    const url = new URL(edgarSearchUrl(edgarParams(query), 0))
    expect(url.host).toBe('efts.sec.gov')
    expect(url.searchParams.get('forms')).toBe('8-K')
    expect(url.searchParams.get('startdt')).toBe('2026-01-01')
    expect(url.searchParams.get('enddt')).toBe('2026-01-31')
    expect(url.searchParams.get('q')).toBe('"cybersecurity incident"')
  })

  it('refuses an unknown item, an unsafe phrase and an unreasonable size or period', () => {
    expect(() => edgarParams({ ...query, options: { item: '2.02' } })).toThrow(/Item must be/)
    expect(() =>
      edgarParams({ ...query, options: { item: '1.05', phrase: 'x" OR q="y' } }),
    ).toThrow(/search phrase/)
    expect(() => edgarParams({ ...query, options: { item: '1.05', limit: 500 } })).toThrow(/1 to/)
    expect(() =>
      edgarParams({
        ...query,
        range: { start: '2026-02-01T00:00:00Z', end: '2026-01-01T00:00:00Z' },
      }),
    ).toThrow(/before it starts/)
  })

  it('estimates size and requests without a network call', () => {
    const e = secEdgar8k.estimate(query)
    expect(e.requests).toBe(4)
    expect(e.items[0]!.bytes).toBeGreaterThan(100_000)
  })
})

describe('sec-edgar-8k responses', () => {
  it('keeps only filings that report the item and builds the archive link', () => {
    const { hits, total } = hitsFrom(JSON.parse(SEARCH), '1.05')
    expect(total).toBe(3)
    expect(hits.map((h) => h.company)).toEqual([
      'Fictional Fabrication Corp',
      'Sample Software Group',
    ])
    expect(hits[0]!.document).toBe('ardr-20260105.htm')
  })

  it('reads the item text, not the table of contents, and decodes entities', () => {
    const text = itemExcerpt(FILING, '1.05')!
    expect(text.startsWith('Item 1.05. Material Cybersecurity Incidents.')).toBe(true)
    expect(text).toContain('network & determined')
    expect(text).not.toContain('Item 9.01')
    expect(plainText('<p>a&nbsp;b</p><script>x()</script>')).toBe('a b')
  })

  it('refuses a response in an unknown shape', () => {
    expect(() => hitsFrom({ nope: true }, '1.05')).toThrow(/shape/)
  })
})

describe('sec-edgar-8k fetch', () => {
  it('uses the two fixed hosts and returns facilitator-only, scoring-shaped events', async () => {
    const { ctx, urls, ranges } = recorded()
    const out = await secEdgar8k.fetch(query, ctx)
    for (const u of urls) expect(['efts.sec.gov', 'www.sec.gov']).toContain(new URL(u).host)
    expect(urls).toHaveLength(3)
    expect(ranges[1]).toEqual([0, 299_999])
    const d = out.datasets[0]!
    expect(d.shape).toBe('ground-truth')
    expect(d.label).toMatch(/^Facilitator reference only/)
    const events = JSON.parse(String(out.files[0]!.data)) as unknown[]
    for (const e of events) expect(() => GroundTruthEvent.parse(e)).not.toThrow()
    const first = events[0] as {
      attrs: { facilitatorOnly: boolean; excerpt?: string; link: string }
    }
    expect(first.attrs.facilitatorOnly).toBe(true)
    expect(first.attrs.excerpt).toContain('Material Cybersecurity Incidents')
    expect(first.attrs.link).toBe(
      'https://www.sec.gov/Archives/edgar/data/1/000000000126000011/ardr-20260105.htm',
    )
    expect(out.modified).toMatch(/2 of 3 search results matched/)
  })
})

describe('fair access', () => {
  it('declares the connector needs a contact and a pace under 10 requests a second', () => {
    expect(secEdgar8k.contact).toBe('required')
    expect(EDGAR_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(100)
    expect(secEdgar8k.minIntervalMs).toBe(EDGAR_MIN_INTERVAL_MS)
  })

  it('puts the user-set contact in the User-Agent and never a built-in one', () => {
    expect(caseUserAgent('1.0.0', 'person@example.org')).toBe(
      'ActionStations/1.0.0 (person@example.org)',
    )
    expect(caseUserAgent('1.0.0')).not.toMatch(/@/)
  })

  it('spaces requests at least the interval apart and sends the contact', async () => {
    let now = 1_000
    const waits: number[] = []
    const seen: Record<string, string>[] = []
    const get = createCaseGet({
      hosts: ['efts.sec.gov'],
      version: '1.0.0',
      maxBytes: () => 1_000_000,
      onResponse: () => undefined,
      contact: 'person@example.org',
      minIntervalMs: 120,
      clock: () => now,
      sleep: async (ms) => {
        waits.push(ms)
        now += ms
      },
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        seen.push(init?.headers as Record<string, string>)
        return new Response('{}', { status: 200 })
      }) as unknown as typeof fetch,
    })
    for (let i = 0; i < 4; i++) await get('https://efts.sec.gov/LATEST/search-index?q=x')
    expect(waits).toEqual([120, 120, 120])
    expect(seen[0]!['user-agent']).toBe('ActionStations/1.0.0 (person@example.org)')
  })
})

const live = process.env.LIVE === '1'
describe.skipIf(!live)('live SEC EDGAR', () => {
  it('answers a search with the shape the connector reads', async () => {
    const contact = process.env.EDGAR_CONTACT
    if (!contact) throw new Error('Set EDGAR_CONTACT to your own email for the live test')
    const get = createCaseGet({
      hosts: ['efts.sec.gov', 'www.sec.gov'],
      version: 'live-test',
      contact,
      minIntervalMs: EDGAR_MIN_INTERVAL_MS,
      maxBytes: () => 5_000_000,
      onResponse: () => undefined,
    })
    const out = await secEdgar8k.fetch({ ...query, options: { item: '1.05', limit: 3 } }, { get })
    expect(out.datasets[0]!.id).toBe('edgar-8k-reference')
  }, 120_000)
})
