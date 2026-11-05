// The spill toolkit's connectors (spec 0455 FR-6, #768) against recorded responses: the
// estimate is pure, the request goes to the fixed host with the right parameters, the answer
// becomes valid case data, and a bad or empty answer is refused with a plain message. Nothing
// here touches the network; tests/live/spill-connectors.live.test.ts does (LIVE=1).
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeriesFile } from '@shared/schemas/case-data'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { clearConnectors, connectorIds, getConnector } = await import('./registry')
const { SPILL_CONNECTORS, registerSpillConnectors } = await import('./spill')
const { coopsUrl, toReading } = await import('./noaa-coops')
const { makeNdbc, parseStdmet, sourcesFor, ndbcUrl } = await import('./noaa-ndbc')
const { ESI_REGIONS, esiCode } = await import('./noaa-esi')
const { planFetch, runFetch, clearPendingFetches } = await import('../../case-data/acquire')
const { readManifest, caseDir } = await import('../../case-data/store')

const fx = (name: string): Buffer => readFileSync(resolve('tests/fixtures/connectors', name))

type Get = (url: string) => Promise<{ status: number; data: Uint8Array }>
const reply =
  (routes: [RegExp, Buffer | ((url: string) => Buffer)][], seen: string[] = []): Get =>
  async (url) => {
    seen.push(url)
    const hit = routes.find(([re]) => re.test(url))
    if (!hit) throw new Error(`unexpected request: ${url}`)
    const data = typeof hit[1] === 'function' ? hit[1](url) : hit[1]
    return { status: 200, data: new Uint8Array(data) }
  }

beforeEach(() => {
  clearConnectors()
  registerSpillConnectors()
})
afterEach(() => clearConnectors())

describe('registration', () => {
  it('registers once, each on one https host of a public archive', () => {
    registerSpillConnectors()
    expect(connectorIds()).toEqual(['noaa-coops', 'noaa-esi', 'noaa-ndbc'])
    expect(SPILL_CONNECTORS.flatMap((c) => c.hosts).sort()).toEqual([
      'api.tidesandcurrents.noaa.gov',
      'services2.arcgis.com',
      'www.ndbc.noaa.gov',
    ])
  })
})

describe('the spill_plume toolkit', () => {
  it('names only connectors the app registers', () => {
    const toolkit = JSON.parse(
      readFileSync(resolve('packs/toolkits/spill_plume.json'), 'utf8'),
    ) as { connectors: string[] }
    expect(toolkit.connectors.sort()).toEqual(connectorIds())
  })
})

describe('noaa-coops', () => {
  const q = {
    range: { start: '2024-09-01T00:00:00Z', end: '2024-09-01T01:00:00Z' },
    area: { label: 'Dauphin Island' },
    options: { station: '8735180', products: 'water_level,wind' },
  }

  it('estimates size and requests from the query alone', () => {
    const est = getConnector('noaa-coops').estimate({
      ...q,
      range: { start: '2024-09-01T00:00:00Z', end: '2024-10-15T00:00:00Z' },
    })
    expect(est.requests).toBe(4)
    expect(est.items.map((i) => i.datasetId)).toEqual([
      'coops-8735180-water-level',
      'coops-8735180-wind',
    ])
    expect(est.items[0]!.bytes).toBeGreaterThan(est.items[1]!.bytes * 0.5)
  })

  it('builds the documented request: gmt, metric, 6-minute data, the application name', () => {
    const url = new URL(
      coopsUrl('water_level', '8735180', Date.UTC(2024, 8, 1), Date.UTC(2024, 8, 2), 'MLLW'),
    )
    expect(url.origin).toBe('https://api.tidesandcurrents.noaa.gov')
    expect(url.pathname).toBe('/api/prod/datagetter')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      product: 'water_level',
      application: 'ActionStations',
      begin_date: '20240901 00:00',
      end_date: '20240902 00:00',
      station: '8735180',
      datum: 'MLLW',
      time_zone: 'gmt',
      units: 'metric',
      format: 'json',
    })
    expect(new URL(coopsUrl('wind', 'x1234', 0, 1, 'MLLW')).searchParams.has('datum')).toBe(false)
  })

  it('turns the recorded answers into valid series with the station place', async () => {
    const seen: string[] = []
    const out = await getConnector('noaa-coops').fetch(q, {
      get: reply(
        [
          [/product=water_level/, fx('coops-water-level.json')],
          [/product=wind/, fx('coops-wind.json')],
        ],
        seen,
      ),
    })
    expect(seen).toHaveLength(2)
    expect(out.datasets.map((d) => d.id)).toEqual([
      'coops-8735180-water-level',
      'coops-8735180-wind',
    ])
    const water = out.datasets[0]!
    expect(water).toMatchObject({ kind: 'series', unit: 'm' })
    expect(water.label).toContain('Dauphin Island')
    expect(water.label).toContain('MLLW')
    expect(water.area?.bbox).toEqual([-88.075, 30.25, -88.075, 30.25])
    const points = JSON.parse(String(out.files[0]!.data)) as { t: string; v: number }[]
    expect(SeriesFile.safeParse(points).success).toBe(true)
    expect(points[0]).toEqual({ t: '2024-09-01T00:00:00.000Z', v: 0.264 })
    const wind = JSON.parse(String(out.files[1]!.data)) as { v: Record<string, number> }[]
    expect(wind[0]!.v).toEqual({ 'speed m/s': 0.9, 'gust m/s': 1.3, 'direction deg': 107 })
    expect(out.citation).toContain('station 8735180')
  })

  it('reads currents in centimeters per second as meters per second', () => {
    expect(toReading('currents', { t: '2024-09-01 00:03', s: '46.4', d: '167', b: '15' })).toEqual({
      t: '2024-09-01T00:03:00.000Z',
      v: { 'speed m/s': 0.46, 'direction deg': 167 },
    })
    expect(toReading('wind', { t: '2024-09-01 00:00', s: '', d: '90' })).toBeUndefined()
  })

  it('refuses a station the archive does not know, an unknown product and a long period', async () => {
    const bad = { ...q, options: { station: '0000000', products: 'water_level' } }
    await expect(
      getConnector('noaa-coops').fetch(bad, { get: reply([[/./, fx('coops-error.json')]]) }),
    ).rejects.toThrow(/not a valid station/)
    expect(() =>
      getConnector('noaa-coops').estimate({
        ...q,
        options: { station: '8735180', products: 'salinity' },
      }),
    ).toThrow(/Choose from/)
    expect(() =>
      getConnector('noaa-coops').estimate({
        ...q,
        range: { start: '2024-01-01T00:00:00Z', end: '2024-12-31T00:00:00Z' },
      }),
    ).toThrow(/at most 90 days/)
  })

  it('says there is no data when the archive has none for the period', async () => {
    const none = Buffer.from(
      '{"error": {"message":"No data was found. This product may not be offered."}}',
    )
    await expect(
      getConnector('noaa-coops').fetch(q, { get: reply([[/./, none]]) }),
    ).rejects.toThrow(/no water_level or wind data/)
  })
})

describe('noaa-ndbc', () => {
  const NOW = Date.UTC(2026, 10, 5, 12)

  it('chooses the realtime file for the last 44 days and year files for past years', () => {
    expect(sourcesFor(NOW - 5 * 86_400_000, NOW - 86_400_000, NOW)).toEqual([{ kind: 'realtime' }])
    expect(sourcesFor(Date.UTC(2022, 11, 20), Date.UTC(2023, 0, 5), NOW)).toEqual([
      { kind: 'year', year: 2022 },
      { kind: 'year', year: 2023 },
    ])
    expect(() => sourcesFor(Date.UTC(2026, 0, 5), Date.UTC(2026, 0, 9), NOW)).toThrow(
      /month by month/,
    )
    expect(() => sourcesFor(Date.UTC(2018, 0, 1), Date.UTC(2023, 0, 9), NOW)).toThrow(/three years/)
  })

  it('names the fixed files on the fixed host', () => {
    expect(ndbcUrl('42012', { kind: 'year', year: 2023 })).toBe(
      'https://www.ndbc.noaa.gov/data/historical/stdmet/42012h2023.txt.gz',
    )
    expect(ndbcUrl('dpia1', { kind: 'realtime' })).toBe(
      'https://www.ndbc.noaa.gov/data/realtime2/DPIA1.txt',
    )
  })

  it('leaves missing readings out (99, 999 and MM) and reads both header styles', () => {
    const hist = parseStdmet(fx('ndbc-historical-42012-2023.txt').toString())
    expect(hist[0]).toMatchObject({ ms: Date.UTC(2023, 0, 1, 0, 0) })
    expect(hist[0]!.values).toMatchObject({ WDIR: 202, WSPD: 2.5, GST: 3.2, PRES: 1016.5 })
    expect(hist[0]!.values.WVHT).toBeUndefined()
    expect(hist[1]!.values.WVHT).toBe(0.9)
    const rt = parseStdmet(fx('ndbc-realtime-42012.txt').toString())
    expect(rt[0]!.values).toMatchObject({ WDIR: 200, WSPD: 6, PRES: 1012.1 })
    expect(rt[0]!.values.WVHT).toBeUndefined()
    expect(rt[1]!.values.WVHT).toBe(0.6)
  })

  it('fetches a past year, unpacks it and keeps the period asked for', async () => {
    const ndbc = makeNdbc(() => NOW)
    const gz = gzipSync(fx('ndbc-historical-42012-2023.txt'))
    const q = {
      range: { start: '2023-01-01T00:00:00Z', end: '2023-01-01T00:30:00Z' },
      area: { label: 'Orange Beach' },
      options: { station: '42012' },
    }
    const est = ndbc.estimate(q)
    expect(est.requests).toBe(1)
    expect(est.items.map((i) => i.datasetId)).toEqual([
      'ndbc-42012-wind',
      'ndbc-42012-pressure',
      'ndbc-42012-waves',
    ])
    const out = await ndbc.fetch(q, { get: reply([[/42012h2023\.txt\.gz$/, gz]]) })
    const wind = JSON.parse(String(out.files[0]!.data)) as {
      t: string
      v: Record<string, number>
    }[]
    expect(wind).toHaveLength(4)
    expect(wind[0]).toEqual({
      t: '2023-01-01T00:00:00.000Z',
      v: { 'direction deg': 202, 'speed m/s': 2.5, 'gust m/s': 3.2 },
    })
    for (const f of out.files)
      expect(SeriesFile.safeParse(JSON.parse(String(f.data))).success).toBe(true)
    const waves = JSON.parse(String(out.files[2]!.data)) as { v: number }[]
    expect(waves.map((p) => p.v)).toEqual([0.9])
    expect(out.datasets[2]).toMatchObject({ unit: 'm' })
  })

  it('refuses a file it cannot unpack and says when the station has nothing', async () => {
    const ndbc = makeNdbc(() => NOW)
    const q = {
      range: { start: '2023-01-01T00:00:00Z', end: '2023-01-02T00:00:00Z' },
      area: { label: '' },
      options: { station: '42012' },
    }
    await expect(ndbc.fetch(q, { get: reply([[/./, Buffer.from('not gzip')]]) })).rejects.toThrow(
      /could not unpack/,
    )
    const later = { ...q, range: { start: '2023-06-01T00:00:00Z', end: '2023-06-02T00:00:00Z' } }
    await expect(
      ndbc.fetch(later, { get: reply([[/./, gzipSync(fx('ndbc-historical-42012-2023.txt'))]]) }),
    ).rejects.toThrow(/no readings/)
    expect(() => ndbc.estimate({ ...q, options: { station: '../x' } })).toThrow(/not valid/)
  })
})

describe('noaa-esi', () => {
  const q = {
    range: { start: '2024-09-01T00:00:00Z', end: '2024-09-02T00:00:00Z' },
    area: {
      label: 'Dauphin Island',
      bbox: [-88.2, 30.2, -88, 30.35] as [number, number, number, number],
    },
    options: { region: 'alabama' },
  }

  it('lists only regions whose service was checked', () => {
    expect(Object.keys(ESI_REGIONS)).toContain('alabama')
    for (const [, [, service]] of Object.entries(ESI_REGIONS))
      expect(service).toMatch(/^[A-Za-z0-9_]+$/)
  })

  it('estimates from the size of the area and refuses a large or missing area', () => {
    const c = getConnector('noaa-esi')
    const small = c.estimate(q).items[0]!.bytes
    expect(small).toBeGreaterThan(500_000)
    expect(small).toBeLessThan(2_000_000)
    expect(() => c.estimate({ ...q, area: { label: '' } })).toThrow(/area/)
    expect(() => c.estimate({ ...q, area: { label: '', bbox: [-90, 29, -88, 31] } })).toThrow(
      /too large/,
    )
    expect(() => c.estimate({ ...q, options: { region: 'atlantis' } })).toThrow(
      /Unknown ESI region/,
    )
  })

  it('finds the shoreline layer by name, asks for the area and keeps the shore class', async () => {
    const seen: string[] = []
    const out = await getConnector('noaa-esi').fetch(q, {
      get: reply(
        [
          [/FeatureServer\?f=json$/, fx('esi-service.json')],
          [
            /FeatureServer\/20\?f=json$/,
            Buffer.from('{"fields":[{"name":"ESI"},{"name":"Landward_shoretype"},{"name":"X"}]}'),
          ],
          [
            /FeatureServer\/20\/query\?/,
            (u) =>
              u.includes('resultOffset=0')
                ? fx('esi-query.geojson')
                : Buffer.from('{"type":"FeatureCollection","features":[]}'),
          ],
        ],
        seen,
      ),
    })
    const query = new URL(seen.at(-1)!)
    expect(query.origin).toBe('https://services2.arcgis.com')
    expect(query.pathname).toBe(
      '/C8EMgrsFcRFL6LrL/ArcGIS/rest/services/Alabama_ESI_2007_test/FeatureServer/20/query',
    )
    expect(Object.fromEntries(query.searchParams)).toMatchObject({
      geometry: '-88.2,30.2,-88,30.35',
      inSR: '4326',
      outFields: 'ESI,Landward_shoretype',
      f: 'geojson',
    })
    expect(out.datasets[0]).toMatchObject({ id: 'noaa-esi-alabama', kind: 'features' })
    const fc = JSON.parse(String(out.files[0]!.data)) as {
      type: string
      features: { properties: { name: string; esi: string }; geometry: { type: string } }[]
    }
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(6)
    expect(fc.features[0]!.properties.name).toMatch(/^ESI /)
    expect(out.modified).toMatch(/Cropped to the area/)
    expect(out.modified).not.toMatch(/may be missing/)
    expect(seen.filter((u) => u.includes('/query?'))).toHaveLength(2)
  })

  it('tells the user when the service had more shoreline than the pages it fetches', async () => {
    const out = await getConnector('noaa-esi').fetch(q, {
      get: reply([
        [/FeatureServer\?f=json$/, fx('esi-service.json')],
        [/\/20\?f=json$/, Buffer.from('{"fields":[]}')],
        // The recorded page says there is more, every time: the fetch stops at its page limit.
        [/query\?/, fx('esi-query.geojson')],
      ]),
    })
    expect(out.modified).toMatch(/edge of the area may be missing/)
    expect(JSON.parse(String(out.files[0]!.data)).features).toHaveLength(48)
  })

  it('reads the class from the first field that has one', () => {
    expect(esiCode({ ESI: '10A', MOSTSENSIT: '6B' })).toBe('10A')
    expect(esiCode({ ESI: ' ', MOSTSENSIT: '6B' })).toBe('6B')
    expect(esiCode(null)).toBe('')
  })

  it('says so when a service has no shoreline layer or the area has no shoreline', async () => {
    const c = getConnector('noaa-esi')
    await expect(
      c.fetch(q, { get: reply([[/./, Buffer.from('{"layers":[{"id":1,"name":"nests"}]}')]]) }),
    ).rejects.toThrow(/no layer of ESI shoreline lines/)
    await expect(
      c.fetch(q, {
        get: reply([
          [/FeatureServer\?f=json$/, fx('esi-service.json')],
          [/\/20\?f=json$/, Buffer.from('{"fields":[]}')],
          [/query\?/, Buffer.from('{"type":"FeatureCollection","features":[]}')],
        ]),
      }),
    ).rejects.toThrow(/no shoreline in that area/)
  })
})

describe('through the consent flow', () => {
  it('plans, asks for consent, fetches from the fixed host only and stores valid case data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-spill-'))
    clearPendingFetches()
    const seen: string[] = []
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      seen.push(String(url))
      const u = String(url)
      if (u.includes('product=water_level')) return new Response(fx('coops-water-level.json'))
      return new Response(fx('coops-wind.json'))
    }) as unknown as typeof fetch
    const query = {
      range: { start: '2024-09-01T00:00:00Z', end: '2024-09-01T01:00:00Z' },
      area: { label: 'Dauphin Island' },
      options: { station: '8735180' },
    }
    const plan = await planFetch(dir, 's1', 'noaa-coops', query, { maxMbPerScenario: 50 })
    expect(plan.hosts).toEqual(['api.tidesandcurrents.noaa.gov'])
    await expect(
      runFetch(dir, 's1', plan.estimateId, false, {
        maxMbPerScenario: 50,
        version: '0.0.1',
        fetchImpl,
      }),
    ).rejects.toThrow(/consent/)
    expect(seen).toEqual([])
    const manifest = await runFetch(dir, 's1', plan.estimateId, true, {
      maxMbPerScenario: 50,
      version: '0.0.1',
      fetchImpl,
    })
    expect(seen.every((u) => u.startsWith('https://api.tidesandcurrents.noaa.gov/'))).toBe(true)
    expect(manifest.datasets.map((d) => d.id)).toEqual([
      'coops-8735180-water-level',
      'coops-8735180-wind',
    ])
    expect(manifest.datasets[0]!.provenance).toMatchObject({
      origin: 'historical',
      source: 'NOAA CO-OPS Tides and Currents',
    })
    expect((await readManifest(dir, 's1'))?.datasets).toHaveLength(2)
    expect(caseDir(dir, 's1')).toContain('s1')
  })
})
