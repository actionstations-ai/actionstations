// Flood connectors (spec 0454 FR-8..FR-10) against recorded responses: nothing touches the
// network. The fixtures are trimmed real responses of the services (retrieved 2026-11-05).
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectorQuery, FetchContext } from './registry'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { femaNfhlConnector } = await import('./fema-nfhl')
const { nwpsConnector, categoryStages, NwpsGauge } = await import('./nwps')
const { nwsFimConnector } = await import('./nws-fim')
const { seriesFromFeatures, usgsWaterdataConnector } = await import('./usgs-waterdata')
const { registerBuiltinConnectors } = await import('./index')
const { connectorIds, clearConnectors } = await import('./registry')
const { planFetch, runFetch, clearPendingFetches } = await import('../../case-data/acquire')
const { readDatasetFile } = await import('../../case-data/store')

const fx = (name: string): string =>
  readFileSync(resolve('src/main/toolkits/connectors/__fixtures__', name), 'utf8')
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s)

/** A `get` answering from a table of URL fragments, recording every address asked for. */
function fakeGet(table: Record<string, string>): { ctx: FetchContext; urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    ctx: {
      get: async (url) => {
        urls.push(url)
        const hit = Object.entries(table).find(([frag]) => url.includes(frag))
        if (!hit) throw new Error(`no fixture for ${url}`)
        return { status: 200, data: bytes(hit[1]) }
      },
    },
  }
}

const RANGE = { start: '2026-10-26T00:00:00Z', end: '2026-11-04T00:00:00Z' }
const q = (
  options: ConnectorQuery['options'],
  extra: Partial<ConnectorQuery> = {},
): ConnectorQuery => ({
  range: RANGE,
  area: { label: 'Test area' },
  options,
  ...extra,
})

describe('nwps', () => {
  const table = {
    '/gauges/EADM7/ratings': fx('nwps-ratings-eadm7.json'),
    '/gauges/EADM7/stageflow': fx('nwps-stageflow-eadm7.json'),
    '/gauges/EADM7': fx('nwps-gauge-eadm7.json'),
  }
  it('reads category stages and leaves out the ones the point does not have', () => {
    const st = categoryStages(NwpsGauge.parse(JSON.parse(fx('nwps-gauge-levee-point.json'))))
    expect(st).toEqual({ action: 20, moderate: 26 })
    const full = categoryStages(NwpsGauge.parse(JSON.parse(fx('nwps-gauge-eadm7.json'))))
    expect(full).toMatchObject({ action: 28, minor: 30, flood: 30, moderate: 35, major: 40 })
  })
  it('fetches the gauge record, the observed series in the period and the current forecast', async () => {
    const { ctx, urls } = fakeGet(table)
    const r = await nwpsConnector.fetch(q({ gauge: 'EADM7' }), ctx)
    expect(r.datasets.map((d) => d.id)).toEqual([
      'gauge-eadm7',
      'stage-observed-eadm7',
      'stage-forecast-eadm7',
    ])
    const gauge = JSON.parse(String(new TextDecoder().decode(r.files[0]!.data as Uint8Array)))
    expect(gauge.features[0].properties).toMatchObject({
      lid: 'EADM7',
      unit: 'ft',
      categories: { action: 28, flood: 30, major: 40 },
    })
    expect(gauge.features[0].properties.historicCrests[0].stage).toBeGreaterThan(40)
    expect(r.datasets[2]!.label).toContain('not an archive')
    expect(urls.every((u) => u.startsWith('https://api.water.noaa.gov/nwps/v1/gauges/EADM7'))).toBe(
      true,
    )
  })
  it('says so when the period is older than the month the service keeps', async () => {
    const { ctx } = fakeGet(table)
    const r = await nwpsConnector.fetch(
      q(
        { gauge: 'EADM7' },
        { range: { start: '2019-06-01T00:00:00Z', end: '2019-06-15T00:00:00Z' } },
      ),
      ctx,
    )
    expect(r.datasets.map((d) => d.id)).not.toContain('stage-observed-eadm7')
    expect(r.modified).toMatch(/USGS/)
  })
  it('refuses a malformed gauge id and an unexpected response shape', async () => {
    expect(() => nwpsConnector.estimate(q({ gauge: 'x;y' }))).toThrow()
    const { ctx } = fakeGet({ '/gauges/EADM7': '{"lid":"EADM7"}' })
    await expect(nwpsConnector.fetch(q({ gauge: 'EADM7' }), ctx)).rejects.toThrow(
      /unexpected shape.*service may have changed/,
    )
  })
  it('estimates three requests per gauge, three gauges with neighbors', () => {
    expect(nwpsConnector.estimate(q({ gauge: 'EADM7' })).requests).toBe(3)
    expect(nwpsConnector.estimate(q({ gauge: 'EADM7', neighbors: true })).requests).toBe(9)
  })
})

describe('usgs-waterdata', () => {
  const range = { start: '2019-06-08T00:00:00Z', end: '2019-06-10T00:00:00Z' }
  it('builds a series from the instantaneous values, oldest first', async () => {
    const { ctx, urls } = fakeGet({ '/collections/continuous/items': fx('usgs-continuous.json') })
    const r = await usgsWaterdataConnector.fetch(q({ sites: '07010000' }, { range }), ctx)
    expect(r.datasets[0]).toMatchObject({ id: 'usgs-07010000-stage', unit: 'ft', kind: 'series' })
    const pts = JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array)) as {
      t: string
      v: number
    }[]
    expect(pts.length).toBeGreaterThan(2)
    expect(Date.parse(pts[0]!.t)).toBeLessThan(Date.parse(pts.at(-1)!.t))
    expect(typeof pts[0]!.v).toBe('number')
    expect(urls[0]).toContain('monitoring_location_id=USGS-07010000')
    expect(urls[0]).toContain('parameter_code=00065')
    expect(urls[0]).toMatch(/^https:\/\/api\.waterdata\.usgs\.gov\/ogcapi\/v0\//)
  })
  it('uses daily values with a note about their time', async () => {
    const { ctx } = fakeGet({ '/collections/daily/items': fx('usgs-daily.json') })
    const r = await usgsWaterdataConnector.fetch(
      q(
        { sites: '07010000', interval: 'daily' },
        { range: { start: '2019-06-01T00:00:00Z', end: '2019-06-15T00:00:00Z' } },
      ),
      ctx,
    )
    expect(r.modified).toContain('00:00 UTC')
    expect(r.datasets[0]!.label).toContain('daily')
  })
  it('limits instantaneous values to 45 days and checks site numbers', () => {
    expect(() =>
      usgsWaterdataConnector.estimate(
        q(
          { sites: '07010000' },
          { range: { start: '2019-01-01T00:00:00Z', end: '2019-06-15T00:00:00Z' } },
        ),
      ),
    ).toThrow(/limited to 45 days/)
    expect(() => usgsWaterdataConnector.estimate(q({ sites: 'abc' }, { range }))).toThrow()
  })
  it('follows the next link and stops when a page is empty', async () => {
    const page = JSON.parse(fx('usgs-continuous.json'))
    const first = {
      ...page,
      features: page.features.slice(0, 3),
      links: [
        {
          rel: 'next',
          href: 'https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items?page=2',
        },
      ],
    }
    const second = { ...page, features: page.features.slice(3, 6), links: [] }
    const urls: string[] = []
    const ctx: FetchContext = {
      get: async (url) => {
        urls.push(url)
        return { status: 200, data: bytes(JSON.stringify(url.includes('page=2') ? second : first)) }
      },
    }
    const r = await usgsWaterdataConnector.fetch(q({ sites: '07010000' }, { range }), ctx)
    expect(urls).toHaveLength(2)
    expect(JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array))).toHaveLength(6)
  })
  it('keeps the statistic with most points and skips empty values', () => {
    const f = (time: string, value: string | null, stat: string) => ({
      properties: { time, value, statistic_id: stat },
    })
    const out = seriesFromFeatures([
      f('2019-06-01', '1', '00001'),
      f('2019-06-01', '2', '00003'),
      f('2019-06-02', '3', '00003'),
      f('2019-06-03', null, '00003'),
    ])
    expect(out).toEqual([
      { t: '2019-06-01T00:00:00Z', v: 2 },
      { t: '2019-06-02T00:00:00Z', v: 3 },
    ])
  })
})

describe('flood hazard layers', () => {
  const area = {
    label: 'Test area',
    bbox: [-90.2, 38.6, -90.15, 38.65] as [number, number, number, number],
  }
  it('fetches regulatory zones for a rounded box and labels them regulatory', async () => {
    const { ctx, urls } = fakeGet({ '/NFHL/MapServer/28/query': fx('nfhl-zones.json') })
    const r = await femaNfhlConnector.fetch(q({}, { area }), ctx)
    expect(urls[0]).toContain('geometry=-90.2,38.6,-90.15,38.65')
    expect(r.datasets[0]!.label).toContain('Regulatory flood zones')
    expect(r.modified).toMatch(/not a modeled forecast/)
    const data = JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array))
    expect(data.features[0].properties.kind).toBe('regulatory_flood_zone')
  })
  it('rounds a precise box outward and refuses a box that is too large or missing', () => {
    const urlsBox = femaNfhlConnector.estimate(
      q({}, { area: { label: '', bbox: [-90.2049, 38.6049, -90.1551, 38.6451] } }),
    )
    expect(urlsBox.items[0]!.bytes).toBe(1_500_000)
    expect(() => femaNfhlConnector.estimate(q({}))).toThrow(/needs an area/)
    expect(() =>
      femaNfhlConnector.estimate(q({}, { area: { label: '', bbox: [-91, 38, -90, 39] } })),
    ).toThrow(/larger than/)
  })
  it('labels a modeled extent as such and reports an empty answer plainly', async () => {
    const empty = JSON.stringify({ type: 'FeatureCollection', features: [] })
    const { ctx } = fakeGet({ '/rfc_based_5day_max_inundation_extent/MapServer/0/query': empty })
    const r = await nwsFimConnector.fetch(q({}, { area }), ctx)
    expect(r.datasets[0]!.label).toContain('Modeled forecast inundation extent')
    expect(r.modified).toMatch(/No extent was returned/)
  })
  it('never calls a host the connector does not name', () => {
    for (const c of [nwpsConnector, usgsWaterdataConnector, femaNfhlConnector, nwsFimConnector])
      expect(c.hosts.every((h) => /^[a-z.]+$/.test(h))).toBe(true)
  })
})

describe('through the consent flow', () => {
  beforeEach(() => {
    clearConnectors()
    clearPendingFetches()
    registerBuiltinConnectors()
  })
  it('registers the four connectors by id', () => {
    expect(connectorIds()).toEqual(['fema-nfhl', 'nwps', 'nws-fim', 'usgs-waterdata'])
  })
  it('saves the gauge record as historical data dated at retrieval, and reads it back', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ttx-flood-'))
    const plan = await planFetch(root, 's1', 'nwps', q({ gauge: 'EADM7' }), {
      maxMbPerScenario: 500,
      now: () => new Date('2026-11-05T10:00:00Z'),
    })
    expect(plan.hosts).toEqual(['api.water.noaa.gov'])
    const table: Record<string, string> = {
      '/ratings': fx('nwps-ratings-eadm7.json'),
      '/stageflow': fx('nwps-stageflow-eadm7.json'),
      '/gauges/EADM7': fx('nwps-gauge-eadm7.json'),
    }
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url)
      const hit = Object.entries(table).find(([f]) => u.includes(f))
      return new Response(hit ? hit[1] : 'nope', { status: hit ? 200 : 404 })
    }) as unknown as typeof fetch
    const manifest = await runFetch(root, 's1', plan.estimateId, true, {
      maxMbPerScenario: 500,
      version: '0.0.1',
      now: () => new Date('2026-11-05T10:00:00Z'),
      fetchImpl,
    })
    expect(manifest.datasets[0]!.provenance).toMatchObject({
      origin: 'historical',
      retrieved: '2026-11-05T10:00:00.000Z',
    })
    const data = await readDatasetFile(root, 's1', manifest.datasets[0]!)
    expect(JSON.stringify(data)).toContain('flood_gauge')
  })
})
