// The justice replay connectors (spec 0465 FR-9): recorded responses (real responses, trimmed),
// the requests they build on their fixed hosts, what they refuse and what they hand back. The
// live checks are in justice-connectors.live.test.ts and run only with LIVE=1.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createFbiCdeConnector,
  isValidDataGovKey,
  monthsOf,
  readOffense,
  scopeOf,
} from './fbi-cde-crime'
import {
  CAD_CITIES,
  cityOf,
  floatingToUtc,
  hourlySeries,
  openCadCalls,
  utcToFloating,
} from './open-cad-calls'
import { clearConnectors, registerConnector } from './registry'
import type { ConnectorQuery, FetchContext } from './registry'
import {
  pickRows,
  placeOf,
  splitCsvLine,
  VERA_COUNTY_FILE,
  VERA_STATE_FILE,
  veraJailTrends,
} from './vera-jail-trends'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

function recorded(bodies: (url: string) => string): { ctx: FetchContext; urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    ctx: {
      async get(url) {
        urls.push(url)
        return { status: 200, data: new TextEncoder().encode(bodies(url)) }
      },
    },
  }
}

const json = (d: Uint8Array | string) =>
  JSON.parse(typeof d === 'string' ? d : new TextDecoder().decode(d))

// gitleaks:allow (a made-up test key)
const FAKE_KEY = 'abcdefghij0123456789ABCDEFGHIJ0123456789' // gitleaks:allow (a made-up test key)

describe('connector registration', () => {
  it('registers with fixed public hosts', () => {
    clearConnectors()
    for (const c of [openCadCalls, veraJailTrends, createFbiCdeConnector()]) registerConnector(c)
    expect(openCadCalls.hosts).toEqual(['data.seattle.gov', 'data.sf.gov'])
    expect(veraJailTrends.hosts).toEqual(['raw.githubusercontent.com'])
    expect(createFbiCdeConnector().hosts).toEqual(['api.usa.gov'])
    clearConnectors()
  })
})

describe('open-cad-calls', () => {
  const day = { start: '2025-07-04T07:00:00Z', end: '2025-07-05T07:00:00Z' }
  const seattle: ConnectorQuery = { range: day, area: { label: '' }, options: { city: 'seattle' } }
  const sf: ConnectorQuery = { ...seattle, options: { city: 'san_francisco' } }

  it('takes a city only from its table', () => {
    expect(cityOf(seattle).host).toBe('data.seattle.gov')
    for (const city of ['', 'boston', 'toString', '__proto__', 'data.evil.example'])
      expect(() => cityOf({ ...seattle, options: { city } })).toThrow(/Pick a city/)
  })

  it('estimates from the period without a request and refuses more than seven days', () => {
    const e = openCadCalls.estimate(sf)
    expect(e.requests).toBe(1)
    expect(e.items[0]!.datasetId).toBe('cad-calls-hourly')
    const week = openCadCalls.estimate({
      ...sf,
      range: { start: '2025-07-01T00:00:00Z', end: '2025-07-08T00:00:00Z' },
    })
    expect(week.items[0]!.bytes).toBeGreaterThan(e.items[0]!.bytes)
    expect(() =>
      openCadCalls.estimate({
        ...sf,
        range: { start: '2025-07-01T00:00:00Z', end: '2025-07-09T00:00:00Z' },
      }),
    ).toThrow(/at most 7 days/)
  })

  it('converts between UTC and the portal local time across daylight saving', () => {
    expect(utcToFloating(Date.parse('2025-07-04T07:00:00Z'), 'America/Los_Angeles')).toBe(
      '2025-07-04T00:00:00',
    )
    expect(utcToFloating(Date.parse('2025-01-04T08:00:00Z'), 'America/Los_Angeles')).toBe(
      '2025-01-04T00:00:00',
    )
    expect(
      new Date(floatingToUtc('2025-07-04T00:02:01.000', 'America/Los_Angeles')).toISOString(),
    ).toBe('2025-07-04T07:02:01.000Z')
  })

  it('asks Seattle for call numbers, priority and times only, in local time', async () => {
    const { ctx, urls } = recorded(() => fixture('seattle-cad-calls-sample.json'))
    await openCadCalls.fetch(seattle, ctx)
    expect(urls.length).toBe(1)
    const u = new URL(urls[0]!)
    expect(u.host).toBe('data.seattle.gov')
    expect(u.pathname).toBe('/resource/33kz-ixgy.json')
    const select = u.searchParams.get('$select')!
    expect(select.startsWith('distinct ')).toBe(true)
    expect(select).not.toMatch(/address|latitude|longitude|neighborhood|beat|type_desc/)
    expect(u.searchParams.get('$where')).toBe(
      "cad_event_original_time_queued between '2025-07-04T00:00:00' and '2025-07-05T00:00:00'",
    )
  })

  it('keeps only hourly aggregates for Seattle', async () => {
    const { ctx } = recorded(() => fixture('seattle-cad-calls-sample.json'))
    const out = await openCadCalls.fetch(seattle, ctx)
    expect(out.datasets[0]).toMatchObject({ id: 'cad-calls-hourly', kind: 'series' })
    expect(out.modified).toMatch(/No call-level record is kept/)
    const series = json(out.files[0]!.data)
    expect(series).toHaveLength(1)
    expect(series[0].t).toBe('2025-07-04T07:00:00.000Z')
    expect(series[0].v).toMatchObject({ calls: 7, onView: 1, priority_2: 4, priority_4: 2 })
    expect(series[0].v.arriveMedianSeconds).toBeGreaterThan(0)
    expect(JSON.stringify(series)).not.toMatch(/2025000186/)
  })

  it('computes San Francisco times from its timestamps and counts officer-initiated calls', async () => {
    const { ctx, urls } = recorded(() => fixture('sf-cad-calls-sample.json'))
    const out = await openCadCalls.fetch(sf, ctx)
    expect(new URL(urls[0]!).host).toBe('data.sf.gov')
    const v = json(out.files[0]!.data)[0].v
    expect(v.calls).toBe(8)
    expect(v.onView).toBe(3)
    expect(v.priority_C).toBeGreaterThan(0)
    expect(v.dispatchMedianSeconds).toBeGreaterThan(0)
  })

  it('counts a call once however many rows it has, and splits by hour', () => {
    const at = (iso: string) => Date.parse(iso)
    const rec = (id: string, iso: string, arriveSec: number | null) => ({
      id,
      receivedMs: at(iso),
      priority: '1',
      onView: false,
      dispatchSec: 30,
      arriveSec,
    })
    const s = hourlySeries([
      rec('a', '2025-07-04T07:05:00Z', 300),
      rec('a', '2025-07-04T07:05:00Z', 300),
      rec('b', '2025-07-04T07:10:00Z', 600),
      rec('c', '2025-07-04T08:01:00Z', null),
    ])
    expect(s.map((p) => p.v.calls)).toEqual([2, 1])
    expect(s[0]!.v.arriveMedianSeconds).toBe(300)
    expect(s[0]!.v.arriveP90Seconds).toBe(600)
    expect(s[1]!.v).not.toHaveProperty('arriveMedianSeconds')
  })

  it('refuses a response that is not a list of rows', async () => {
    const { ctx } = recorded(() => '{"error":true,"message":"query failed"}')
    await expect(openCadCalls.fetch(seattle, ctx)).rejects.toThrow(/unexpected shape/)
  })

  it('maps every city to the same record fields', () => {
    for (const c of Object.values(CAD_CITIES)) expect(c.fields.length).toBe(6)
  })
})

describe('vera-jail-trends', () => {
  const range = { start: '2026-01-01T00:00:00Z', end: '2026-01-02T00:00:00Z' }
  const state: ConnectorQuery = { range, area: { label: '' }, options: { state: 'oh' } }
  const county: ConnectorQuery = { range, area: { label: '' }, options: { county: '39035' } }

  it('takes a two-letter state or a five-digit county FIPS and nothing else', () => {
    expect(placeOf(state)).toEqual({ level: 'state', state: 'OH' })
    expect(placeOf(county)).toEqual({ level: 'county', fips: '39035' })
    expect(() => placeOf({ ...state, options: { state: 'Ohio' } })).toThrow(/two-letter/)
    expect(() => placeOf({ ...state, options: { county: '3903' } })).toThrow(/five-digit/)
  })

  it('estimates the state file small and the county file large', () => {
    expect(veraJailTrends.estimate(state).items[0]!.bytes).toBeLessThan(2_000_000)
    expect(veraJailTrends.estimate(county).items[0]!.bytes).toBeGreaterThan(50_000_000)
    expect(veraJailTrends.estimate(county).items[0]!.label).toMatch(/whole county file/)
  })

  it('splits quoted CSV fields', () => {
    expect(splitCsvLine('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"'])
  })

  it('reads one state from the state file as a yearly series', async () => {
    const { ctx, urls } = recorded(() => fixture('vera-jail-state-sample.csv'))
    const out = await veraJailTrends.fetch(state, ctx)
    expect(urls).toEqual([VERA_STATE_FILE])
    expect(out.datasets[0]!.label).toMatch(/Ohio/)
    const years = json(out.files[0]!.data)
    expect(years.map((y: { t: string }) => y.t)).toEqual([
      '2022-01-01T00:00:00.000Z',
      '2023-01-01T00:00:00.000Z',
    ])
    expect(years[1].v).toMatchObject({ jailPopulation: 16366.58, ratedCapacity: 16033.74 })
  })

  it('reads one county from the county file', async () => {
    const { ctx, urls } = recorded(() => fixture('vera-jail-county-sample.csv'))
    const out = await veraJailTrends.fetch(county, ctx)
    expect(urls).toEqual([VERA_COUNTY_FILE])
    expect(out.datasets[0]!.label).toMatch(/Cuyahoga County \(39035\)/)
    expect(json(out.files[0]!.data)).toHaveLength(2)
  })

  it('refuses a file without the columns it reads, and a place with no rows', async () => {
    expect(() => pickRows('year,state_abbr\n2023,OH', { level: 'state', state: 'OH' })).toThrow(
      /no longer has the column/,
    )
    const { ctx } = recorded(() => fixture('vera-jail-state-sample.csv'))
    await expect(veraJailTrends.fetch({ ...state, options: { state: 'ZZ' } }, ctx)).rejects.toThrow(
      /no rows for ZZ/,
    )
  })
})

describe('fbi-cde-crime', () => {
  const range = { start: '2023-01-01T00:00:00Z', end: '2023-03-31T00:00:00Z' }
  const state: ConnectorQuery = { range, area: { label: '' }, options: { state: 'oh' } }
  const agency: ConnectorQuery = { range, area: { label: '' }, options: { ori: 'oh0180900' } }
  const withKey = createFbiCdeConnector({ getKey: async () => FAKE_KEY })

  it('takes a state code or an ORI and the months of the period, at most ten years', () => {
    expect(scopeOf(state)).toEqual({ kind: 'state', code: 'OH' })
    expect(scopeOf(agency)).toEqual({ kind: 'agency', code: 'OH0180900' })
    expect(() => scopeOf({ ...state, options: { ori: 'OH/../x' } })).toThrow(/ORI/)
    expect(monthsOf(range)).toEqual(['01-2023', '02-2023', '03-2023'])
    expect(() => monthsOf({ start: '2010-01-01T00:00:00Z', end: '2024-01-01T00:00:00Z' })).toThrow(
      /ten years/,
    )
  })

  it('estimates without the key or a request', () => {
    const e = createFbiCdeConnector({ getKey: async () => undefined }).estimate(state)
    expect(e.requests).toBe(2)
    expect(e.items[0]!.datasetId).toBe('fbi-crime-monthly')
  })

  it('is off without a key and refuses a malformed one', async () => {
    const { ctx, urls } = recorded(() => '{}')
    await expect(
      createFbiCdeConnector({ getKey: async () => undefined }).fetch(state, ctx),
    ).rejects.toThrow(/needs a free api.data.gov key/)
    await expect(
      createFbiCdeConnector({ getKey: async () => 'short' }).fetch(state, ctx),
    ).rejects.toThrow(/not valid/)
    expect(urls).toEqual([])
    expect(isValidDataGovKey(FAKE_KEY)).toBe(true)
  })

  it('asks for violent and property crime for a state on its host', async () => {
    const { ctx, urls } = recorded(() => fixture('fbi-cde-state-oh-violent.json'))
    await withKey.fetch(state, ctx)
    expect(urls.map((u) => new URL(u).pathname)).toEqual([
      '/crime/fbi/cde/summarized/state/OH/violent-crime',
      '/crime/fbi/cde/summarized/state/OH/property-crime',
    ])
    const u = new URL(urls[0]!)
    expect(u.host).toBe('api.usa.gov')
    expect(u.searchParams.get('from')).toBe('01-2023')
    expect(u.searchParams.get('to')).toBe('03-2023')
  })

  it('reads the place, its counts, rate and the national rate by month', () => {
    const one = readOffense(json(fixture('fbi-cde-state-oh-violent.json')), 'violent')
    expect(one.name).toBe('Ohio')
    expect(one.months.get('01-2023')).toEqual({
      violentOffenses: 2816,
      violentClearances: 786,
      violentPer100k: 25.16,
      violentUsPer100k: 31.6,
    })
  })

  it('merges both offense groups for an agency into one monthly series', async () => {
    const { ctx, urls } = recorded((u) =>
      fixture(u.includes('/P?') ? 'fbi-cde-agency-property.json' : 'fbi-cde-agency-violent.json'),
    )
    const out = await withKey.fetch(agency, ctx)
    expect(urls.map((u) => new URL(u).pathname.split('/').slice(-2).join('/'))).toEqual([
      'OH0180900/V',
      'OH0180900/P',
    ])
    expect(out.datasets[0]!.label).toMatch(/Broadview Heights Police Department/)
    const points = json(out.files[0]!.data)
    expect(points).toHaveLength(3)
    expect(points[2].v).toMatchObject({ violentOffenses: 0, propertyOffenses: 1 })
    expect(JSON.stringify(out)).not.toContain(FAKE_KEY)
  })

  it('keeps the key out of an error message', async () => {
    const ctx: FetchContext = {
      async get(url) {
        throw new Error(`failed ${url}`)
      },
    }
    const err = await withKey.fetch(state, ctx).catch((e: Error) => e)
    expect(String(err)).not.toContain(FAKE_KEY)
    expect(String(err)).toContain('<KEY>')
  })
})
