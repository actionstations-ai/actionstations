// The wildfire connectors (spec 0461 FR-8, FR-9) against recorded responses: nothing touches the
// network. The NIFC and NOAA fixtures are trimmed real responses (retrieved 2026-11-05). The
// FIRMS and AirNow fixtures are written from the services' documented column and field lists,
// because both need a key; the opt-in live test checks them (LIVE=1).
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectorQuery, FetchContext } from './registry'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
}))

const { findFires, layerFor, wfigsPerimetersConnector } = await import('./wildfire-wfigs')
const { createFirmsConnector } = await import('./wildfire-firms')
const { hmsSmokeConnector, hmsTime, parseHmsKml } = await import('./wildfire-hms')
const { createAirNowConnector } = await import('./wildfire-airnow')
const { outerRing, safeName } = await import('./wildfire-common')
const { registerConnector, clearConnectors, connectorIds } = await import('./registry')

const fx = (name: string): string =>
  readFileSync(resolve('src/main/toolkits/connectors/__fixtures__', name), 'utf8')
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s)

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

const q = (
  options: ConnectorQuery['options'],
  range = { start: '2018-11-08T00:00:00Z', end: '2018-11-09T12:00:00Z' },
  bbox?: [number, number, number, number],
): ConnectorQuery => ({
  range,
  area: { label: 'Butte County', ...(bbox ? { bbox } : {}) },
  options,
})

describe('wfigs-perimeters', () => {
  it('uses the GeoMAC history for 2000 to 2019, WFIGS after and the current layer on request', () => {
    expect(layerFor(2018).url).toContain('Historic_Geomac_Perimeters_2018')
    expect(layerFor(2022).url).toContain('WFIGS_Interagency_Perimeters/')
    expect(layerFor('current').url).toContain('WFIGS_Interagency_Perimeters_Current')
  })
  it('estimates without a request and refuses a missing name or year', () => {
    expect(wfigsPerimetersConnector.estimate(q({ name: 'Camp', year: 2018 })).requests).toBe(1)
    expect(() => wfigsPerimetersConnector.estimate(q({ year: 2018 }))).toThrow(/name/)
    expect(() => wfigsPerimetersConnector.estimate(q({ name: 'Camp' }))).toThrow(/year/)
  })
  it('keeps a quote out of the query by refusing it in a name', () => {
    expect(() => safeName("x' OR 1=1 --", 'test')).toThrow()
    expect(safeName("O'Brien", 'test')).toBe("O''BRIEN")
  })
  it('fetches the mapped perimeters of the Camp fire in time order, as polygons', async () => {
    const { ctx, urls } = fakeGet({
      Historic_Geomac_Perimeters_2018: fx('wildfire-geomac-camp-2018.geojson'),
    })
    const r = await wfigsPerimetersConnector.fetch(q({ name: 'Camp', year: 2018 }), ctx)
    expect(urls).toHaveLength(1)
    expect(decodeURIComponent(urls[0]!)).toContain("UPPER(incidentname)='CAMP'")
    expect(decodeURIComponent(urls[0]!)).toContain(
      "perimeterdatetime >= timestamp '2018-11-08 00:00:00'",
    )
    const data = JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array))
    expect(data.features).toHaveLength(2)
    const times = data.features.map((f: { properties: { time: string } }) =>
      Date.parse(f.properties.time),
    )
    expect(times[0]).toBeLessThan(times[1])
    expect(data.features[0].geometry.type).toBe('Polygon')
    expect(data.features[0].properties).toMatchObject({ name: 'CAMP', state: 'CA' })
    expect(r.modified).toMatch(/generalized/)
    expect(r.citation).toMatch(/National Interagency Fire Center/)
  })
  it('says so when the fire has no perimeters in the period', async () => {
    const { ctx } = fakeGet({
      Historic_Geomac_Perimeters_2018: JSON.stringify({ type: 'FeatureCollection', features: [] }),
    })
    await expect(
      wfigsPerimetersConnector.fetch(q({ name: 'Nothing', year: 2018 }), ctx),
    ).rejects.toThrow(/no perimeters/)
  })
  it('rejects a response of the wrong shape with a message naming the source', async () => {
    const { ctx } = fakeGet({ Historic_Geomac_Perimeters_2018: '{"features": 3}' })
    await expect(
      wfigsPerimetersConnector.fetch(q({ name: 'Camp', year: 2018 }), ctx),
    ).rejects.toThrow(/NIFC/)
  })
  it('reads the current layer, whose records have missing fields', async () => {
    const { ctx } = fakeGet({
      WFIGS_Interagency_Perimeters_Current: fx('wildfire-wfigs-current.geojson'),
    })
    const fires = await findFires(ctx, { name: 'South Street', year: 'current' })
    expect(fires.find((f) => f.name === 'South Street')).toMatchObject({ perimeters: 1 })
  })
  it('lists the fires of a name with their first and last perimeter and largest size', async () => {
    const { ctx } = fakeGet({
      Historic_Geomac_Perimeters_2018: fx('wildfire-geomac-camp-list.json'),
    })
    const fires = await findFires(ctx, { name: 'Camp', year: 2018 })
    expect(fires).toHaveLength(1)
    expect(fires[0]!.uniqueFireId).toBe('2018-CABTU-016737')
    expect(fires[0]!.perimeters).toBe(8)
    expect(Date.parse(fires[0]!.firstTime)).toBeLessThan(Date.parse(fires[0]!.lastTime))
    expect(fires[0]!.maxAcres).toBeGreaterThan(100_000)
  })
  it('takes the largest part of a multipolygon', () => {
    const ring = outerRing({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
        [
          [
            [5, 5],
            [6, 5],
            [6, 6],
            [5, 6],
            [5, 5],
          ],
        ],
      ],
    })
    expect(ring).toHaveLength(4)
    expect(ring![0]).toEqual([5, 5])
  })
})

describe('firms-hotspots', () => {
  const KEY = 'ABCDEF1234567890ABCDEF12' // gitleaks:allow (a made-up test key)
  const BOX: [number, number, number, number] = [-121.7, 39.7, -121.5, 39.85]
  const connector = createFirmsConnector({
    getKey: async () => KEY,
    now: () => Date.parse('2026-11-05T00:00:00Z'),
  })
  it('needs a key and refuses an invalid one', async () => {
    const none = createFirmsConnector({ getKey: async () => undefined, now: () => 0 })
    await expect(none.fetch(q({}, undefined, BOX), fakeGet({}).ctx)).rejects.toThrow(/map key/)
    const bad = createFirmsConnector({ getKey: async () => 'bad/key', now: () => 0 })
    await expect(bad.fetch(q({}, undefined, BOX), fakeGet({}).ctx)).rejects.toThrow(/not valid/)
  })
  it('asks the standard product for old dates, with the box rounded and the day count capped', async () => {
    const { ctx, urls } = fakeGet({ '/api/area/csv/': fx('wildfire-firms-sample.csv') })
    const r = await connector.fetch(
      q({}, { start: '2018-11-08T00:00:00Z', end: '2018-11-20T00:00:00Z' }, BOX),
      ctx,
    )
    expect(urls[0]).toBe(
      `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${KEY}/VIIRS_SNPP_SP/-121.7,39.7,-121.5,39.85/5/2018-11-08`,
    )
    const data = JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array))
    expect(data.features).toHaveLength(4)
    expect(data.features[0].properties.time).toBe('2018-11-08T10:18:00Z')
    expect(data.features[1].properties.frp).toBe(48.9)
  })
  it('keeps only detections inside the period and uses the near real time product for recent days', async () => {
    const { ctx, urls } = fakeGet({ '/api/area/csv/': fx('wildfire-firms-sample.csv') })
    const r = await connector.fetch(
      q({}, { start: '2018-11-08T00:00:00Z', end: '2018-11-09T00:00:00Z' }, BOX),
      ctx,
    )
    expect(
      JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array)).features,
    ).toHaveLength(3)
    const recent = createFirmsConnector({
      getKey: async () => KEY,
      now: () => Date.parse('2018-11-10T00:00:00Z'),
    })
    await recent.fetch(
      q({}, { start: '2018-11-08T00:00:00Z', end: '2018-11-09T00:00:00Z' }, BOX),
      ctx,
    )
    expect(urls[urls.length - 1]).toContain('VIIRS_SNPP_NRT')
  })
  it('never lets the key appear in an error', async () => {
    const failing: FetchContext = {
      get: async (url) => {
        throw new Error(`${url} answered HTTP 500`)
      },
    }
    const err = await connector.fetch(q({}, undefined, BOX), failing).catch((e: Error) => e)
    expect((err as Error).message).not.toContain(KEY)
    expect((err as Error).message).toContain('<KEY>')
  })
  it('refuses a reply that is not detection data', async () => {
    const { ctx } = fakeGet({ '/api/area/csv/': 'Invalid MAP_KEY.' })
    await expect(connector.fetch(q({}, undefined, BOX), ctx)).rejects.toThrow(/map key/)
  })
  it('estimates without the key and refuses a box that is too large', () => {
    expect(connector.estimate(q({}, undefined, BOX)).requests).toBe(1)
    expect(() => connector.estimate(q({}, undefined, [-125, 30, -110, 45]))).toThrow(/larger than/)
  })
})

describe('hms-smoke', () => {
  it('reads the imagery times and densities of a day file', () => {
    expect(hmsTime('2024131 1230UTC')).toBe(Date.UTC(2024, 4, 10, 12, 30))
    const polys = parseHmsKml(fx('wildfire-hms-smoke-20240510.kml'))
    expect(polys.map((p) => p.density).sort()).toEqual(['light', 'medium'])
    expect(polys[0]!.end).toBeGreaterThan(polys[0]!.start)
    expect(polys[0]!.satellite).toBeTruthy()
  })
  it('crops a national file to the box and says which days had no file', async () => {
    const kml = fx('wildfire-hms-smoke-20240510.kml')
    const polys = parseHmsKml(kml)
    const [w, s, e, n] = polys
      .flatMap((p) => p.ring)
      .reduce<[number, number, number, number]>(
        (a, p) => [
          Math.min(a[0], p[0]),
          Math.min(a[1], p[1]),
          Math.max(a[2], p[0]),
          Math.max(a[3], p[1]),
        ],
        [180, 90, -180, -90],
      )
    const get: FetchContext['get'] = async (url) => {
      if (url.includes('hms_smoke20240510')) return { status: 200, data: bytes(kml) }
      throw new Error(`${url} answered HTTP 404`)
    }
    const { AppError } = await import('../../lib/errors')
    const ctx: FetchContext = {
      get: async (url) => {
        try {
          return await get(url)
        } catch (err) {
          throw new AppError('PROVIDER', (err as Error).message)
        }
      },
    }
    const inside = await hmsSmokeConnector.fetch(
      q({}, { start: '2024-05-10T00:00:00Z', end: '2024-05-11T23:00:00Z' }, [
        w,
        s,
        Math.min(e, w + 15),
        Math.min(n, s + 15),
      ]),
      ctx,
    )
    const data = JSON.parse(new TextDecoder().decode(inside.files[0]!.data as Uint8Array))
    expect(data.features.length).toBeGreaterThan(0)
    expect(data.features[0].properties.density).toMatch(/light|medium|heavy/)
    expect(inside.modified).toMatch(/No file for 20240511/)
    const far = await hmsSmokeConnector.fetch(
      q({}, { start: '2024-05-10T00:00:00Z', end: '2024-05-10T23:00:00Z' }, [10, 10, 11, 11]),
      ctx,
    )
    expect(
      JSON.parse(new TextDecoder().decode(far.files[0]!.data as Uint8Array)).features,
    ).toHaveLength(0)
  })
  it('estimates one request per day and caps the days', () => {
    expect(
      hmsSmokeConnector.estimate(
        q({}, { start: '2024-05-10T00:00:00Z', end: '2024-05-12T00:00:00Z' }, [-90, 30, -85, 35]),
      ).requests,
    ).toBe(3)
    expect(
      hmsSmokeConnector.estimate(
        q({}, { start: '2024-01-01T00:00:00Z', end: '2024-06-01T00:00:00Z' }, [-90, 30, -85, 35]),
      ).requests,
    ).toBe(14)
  })
})

describe('airnow-observations', () => {
  const KEY = 'abcdef12-3456-7890-abcd-ef1234567890' // gitleaks:allow (a made-up test key)
  const BOX: [number, number, number, number] = [-121.9, 39.7, -121.7, 39.8]
  const RANGE = { start: '2018-11-09T12:00:00Z', end: '2018-11-09T13:00:00Z' }
  const connector = createAirNowConnector({ getKey: async () => KEY })
  it('needs a key', async () => {
    const none = createAirNowConnector({ getKey: async () => undefined })
    await expect(none.fetch(q({}, RANGE, BOX), fakeGet({}).ctx)).rejects.toThrow(/free key/)
  })
  it('asks once per hour with a rounded point and keeps only PM2.5', async () => {
    const { ctx, urls } = fakeGet({ '/historical/': fx('wildfire-airnow-sample.json') })
    const r = await connector.fetch(q({}, RANGE, BOX), ctx)
    expect(urls).toHaveLength(2)
    expect(urls[0]).toContain('latitude=39.75&longitude=-121.8')
    expect(urls[0]).toContain('date=2018-11-09T12-0000')
    const points = JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array))
    expect(points).toEqual([
      { t: '2018-11-09T12:00:00Z', v: { Chico: 303 } },
      { t: '2018-11-09T13:00:00Z', v: { Chico: 303 } },
    ])
    expect(r.datasets[0]!.label).toMatch(/Chico, CA/)
    expect(r.datasets[0]!.label).toMatch(/preliminary/)
  })
  it('reports an unexpected shape, and an empty reply (no reporting area) leaves no point', async () => {
    await expect(
      connector.fetch(q({}, RANGE, BOX), fakeGet({ '/historical/': '{"x":1}' }).ctx),
    ).rejects.toThrow(/unexpected shape/)
    const r = await connector.fetch(q({}, RANGE, BOX), fakeGet({ '/historical/': '[]' }).ctx)
    expect(JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array))).toEqual([])
  })
  it('never lets the key appear in an error', async () => {
    const failing: FetchContext = {
      get: async (url) => {
        throw new Error(`${url} answered HTTP 401`)
      },
    }
    const err = await connector.fetch(q({}, RANGE, BOX), failing).catch((e: Error) => e)
    expect((err as Error).message).not.toContain(KEY)
  })
})

describe('registration', () => {
  it('registers with fixed public hosts', () => {
    clearConnectors()
    for (const c of [
      wfigsPerimetersConnector,
      createFirmsConnector(),
      hmsSmokeConnector,
      createAirNowConnector(),
    ])
      registerConnector(c)
    expect(connectorIds()).toEqual([
      'airnow-observations',
      'firms-hotspots',
      'hms-smoke',
      'wfigs-perimeters',
    ])
  })
})
