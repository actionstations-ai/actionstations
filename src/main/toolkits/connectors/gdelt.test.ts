// GDELT connector contract test against a recorded response (spec 0458 FR-11). The live test
// runs only with LIVE=1 and never in CI.
import { describe, expect, it } from 'vitest'
import { gdeltConnector, gdeltStepMinutes, gdeltUrl, parseTimeline, GDELT_HOST } from './gdelt'
import { ConnectorQuery } from './registry'

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const query = (over: Record<string, unknown> = {}, startH = 48, endH = 24) =>
  ConnectorQuery.parse({
    range: { start: hoursAgo(startH), end: hoursAgo(endH) },
    area: {},
    options: { query: 'plant fire', ...over },
  })

/** The shape of a DOC 2.0 timeline response (recorded format, invented numbers). */
const recorded = (name: string) =>
  new TextEncoder().encode(
    JSON.stringify({
      query_details: { title: 'plant fire' },
      timeline: [
        {
          series: name,
          data: [
            { date: '20260901T000000Z', value: 0.0012 },
            { date: '20260901T001500Z', value: 0.0048 },
            { date: '20260901T003000Z', value: 0.0101 },
          ],
        },
      ],
    }),
  )

describe('gdelt connector', () => {
  it('names only its own host and cites the terms', () => {
    expect(gdeltConnector.hosts).toEqual([GDELT_HOST])
    expect(gdeltConnector.terms).toMatch(/cite the GDELT Project/)
  })

  it('estimates two series from the span, with no network call', () => {
    const e = gdeltConnector.estimate(query())
    expect(e.requests).toBe(2)
    expect(e.items.map((i) => i.datasetId)).toEqual(['gdelt-volume', 'gdelt-tone'])
    // 24 hours at 15-minute steps is 97 points of 48 bytes.
    expect(e.items[0]!.bytes).toBe(97 * 48)
  })

  it('uses the step GDELT uses for the span', () => {
    expect(gdeltStepMinutes(24 * 3_600_000)).toBe(15)
    expect(gdeltStepMinutes(100 * 3_600_000)).toBe(60)
    expect(gdeltStepMinutes(10 * 86_400_000)).toBe(1440)
  })

  it('refuses a period older than three months before any call', () => {
    const old = ConnectorQuery.parse({
      range: { start: '2020-01-01T00:00:00Z', end: '2020-01-02T00:00:00Z' },
      area: {},
      options: { query: 'storm' },
    })
    expect(() => gdeltConnector.estimate(old)).toThrow(/last three months/)
  })

  it('refuses empty or overlong search words and an inverted period', () => {
    expect(() => gdeltConnector.estimate(query({ query: '  ' }))).toThrow(/words to search/)
    expect(() => query({ query: 'x'.repeat(201) })).toThrow()
    expect(() => gdeltConnector.estimate(query({}, 24, 48))).toThrow(/end after it starts/)
  })

  it('builds an https address on its host with the words encoded', () => {
    const url = new URL(
      gdeltUrl('timelinevol', 'plant fire & smoke', 1_700_000_000_000, 1_700_086_400_000),
    )
    expect(url.protocol).toBe('https:')
    expect(url.host).toBe(GDELT_HOST)
    expect(url.searchParams.get('query')).toBe('plant fire & smoke')
    expect(url.searchParams.get('mode')).toBe('timelinevol')
    expect(url.searchParams.get('startdatetime')).toBe('20231114221320')
  })

  it('fetches both timelines, keeps numbers only and cites GDELT', async () => {
    const urls: string[] = []
    const result = await gdeltConnector.fetch(query(), {
      get: async (url) => {
        urls.push(url)
        return {
          status: 200,
          data: recorded(url.includes('timelinetone') ? 'Average Tone' : 'Volume Intensity'),
        }
      },
    })
    expect(urls).toHaveLength(2)
    expect(urls.every((u) => new URL(u).host === GDELT_HOST)).toBe(true)
    expect(result.datasets.map((d) => d.id)).toEqual(['gdelt-volume', 'gdelt-tone'])
    const volume = JSON.parse(result.files[0]!.data as string)
    expect(volume[1]).toEqual({ t: '2026-09-01T00:15:00.000Z', v: 0.0048 })
    expect(result.citation).toMatch(/gdeltproject\.org/)
    expect(JSON.stringify(result)).not.toMatch(/plant fire/)
  })

  it('reports a failed request and an unknown response shape plainly', async () => {
    await expect(
      gdeltConnector.fetch(query(), { get: async () => ({ status: 503, data: new Uint8Array() }) }),
    ).rejects.toThrow(/status 503/)
    expect(() => parseTimeline(new TextEncoder().encode('<html>'))).toThrow(
      /did not return a timeline/,
    )
    expect(() => parseTimeline(new TextEncoder().encode('{"timeline":[]}'))).toThrow(/shape/)
  })
})

describe.skipIf(process.env.LIVE !== '1')('gdelt connector (live)', () => {
  it('returns a timeline for a recent query', async () => {
    const q = query({ query: 'weather' }, 48, 24)
    const result = await gdeltConnector.fetch(q, {
      get: async (url) => {
        const r = await fetch(url)
        return { status: r.status, data: new Uint8Array(await r.arrayBuffer()) }
      },
    })
    expect(result.files).toHaveLength(2)
  })
})
