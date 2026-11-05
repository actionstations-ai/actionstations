// The weather connectors on recorded responses (tests/fixtures/weather): estimates, the data
// each fetch stores, the byte range asked of the radar archive, and the frame data a figure can
// draw. Live checks against the real archives are opt-in (LIVE=1) in weather-connectors.live.test.ts.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../../lib/errors'
import { createCaseGet } from '../../case-data/http'
import {
  findStorms,
  nearestRadarSites,
  parseHurdat2,
  parseSpcReports,
  summarizeReports,
  latestHurdatFile,
} from '../weather/archives'
import { registerWeatherToolkit } from '../weather'
import { getConnector, listConnectors, type ConnectorQuery, type FetchContext } from './registry'
import { chooseVolumes, parseListing, RANGE_BYTES } from './nexrad'
import { convectiveDays } from './spc'
import { launchTimes } from './iem'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { computeFigures, renderFigure } = await import('../../render/figures')
registerWeatherToolkit()

const fx = (name: string): Buffer =>
  readFileSync(join(__dirname, '../../../../tests/fixtures/weather', name))
const text = (name: string): string => fx(name).toString('utf8')

/** A `get` answering from a table of URL substrings, recording what was asked. */
function fakeGet(routes: [string, Uint8Array][]) {
  const asked: { url: string; range?: readonly [number, number] | undefined }[] = []
  const get: FetchContext['get'] = async (url, init) => {
    asked.push({ url, range: init?.range })
    const hit = routes.find(([part]) => url.includes(part))
    if (!hit) throw new AppError('PROVIDER', `no recorded response for ${url}`)
    return { status: 200, data: hit[1] }
  }
  return { get, asked }
}

const query = (over: Partial<ConnectorQuery> & Pick<ConnectorQuery, 'range'>): ConnectorQuery => ({
  area: { label: 'Southwest Ohio', bbox: [-85.5, 38.5, -82.5, 40.5] },
  options: {},
  ...over,
})

describe('archives', () => {
  it('finds the radar sites nearest a place', () => {
    const near = nearestRadarSites(39.4, -83.8, 3)
    expect(near[0]).toMatchObject({ icao: 'KILN', state: 'OH' })
    expect(near.map((s) => s.icao)).toHaveLength(3)
    expect(near[0]!.distanceKm).toBeLessThan(10)
  })

  it('parses SPC reports by section and puts early-morning times on the next date', () => {
    const reports = parseSpcReports(text('spc-240507.csv'), '2024-05-07')
    expect(summarizeReports(reports)).toEqual({ tornado: 7, wind: 7, hail: 7 })
    expect(reports[0]).toMatchObject({
      kind: 'wind',
      time: '2024-05-07T12:00:00.000Z',
      state: 'IL',
    })
    expect(reports.some((r) => r.time.startsWith('2024-05-08T'))).toBe(false)
    const tor = reports.find((r) => r.kind === 'tornado')!
    expect(tor).toMatchObject({ county: 'Randolph', state: 'MO', lat: 39.39, lon: -92.6 })
    expect(tor.remarks).toContain('County Road 2160')
  })

  it('parses HURDAT2 tracks and finds a storm by name and year', () => {
    const storms = parseHurdat2(text('hurdat2-sample.txt'))
    expect(storms.map((s) => s.id)).toEqual(['AL122005', 'AL092022'])
    const katrina = findStorms(storms, { name: 'katrina' })[0]!
    expect(katrina).toMatchObject({ name: 'KATRINA', year: 2005 })
    expect(katrina.points).toHaveLength(34)
    expect(katrina.points[0]).toMatchObject({
      time: '2005-08-23T18:00:00Z',
      lat: 23.1,
      lon: -75.1,
      windKt: 30,
    })
    expect(findStorms(storms, { name: 'Ian', year: 2021 })).toEqual([])
  })

  it('picks the most recently modified file from the NHC listing', () => {
    expect(latestHurdatFile(text('nhc-listing.html'), 'atlantic')).toBe(
      'hurdat2-1851-2025-092326.txt',
    )
    expect(latestHurdatFile(text('nhc-listing.html'), 'east_pacific')).toBe(
      'hurdat2-nepac-1949-2025-091426.txt',
    )
  })
})

describe('registry', () => {
  it('lists the weather connectors with fixed public hosts', () => {
    const ids = listConnectors().map((c) => c.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'nexrad-level2',
        'spc-storm-reports',
        'iem-warnings',
        'iem-soundings',
        'nhc-hurdat2',
      ]),
    )
    expect(getConnector('nexrad-level2').hosts).toEqual(['unidata-nexrad-level2.s3.amazonaws.com'])
    expect(getConnector('spc-storm-reports').hosts).toEqual(['www.spc.noaa.gov'])
  })

  it('sends a byte range and only to the connector hosts', async () => {
    const seen: { url: string; range: string | null }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, range: new Headers(init.headers).get('range') })
      return new Response(new Uint8Array([1, 2, 3]), { status: 206 })
    }) as unknown as typeof fetch
    const get = createCaseGet({
      hosts: ['unidata-nexrad-level2.s3.amazonaws.com'],
      version: '0',
      maxBytes: () => 1000,
      onResponse: () => undefined,
      fetchImpl,
    })
    await get('https://unidata-nexrad-level2.s3.amazonaws.com/x', { range: [0, 99] })
    expect(seen[0]!.range).toBe('bytes=0-99')
    await expect(get('https://example.com/x')).rejects.toThrow(/not an archive/)
  })
})

describe('spc-storm-reports', () => {
  const spc = getConnector('spc-storm-reports')
  const range = { start: '2024-05-07T12:00:00Z', end: '2024-05-08T12:00:00Z' }

  it('names the convective days of a period', () => {
    expect(convectiveDays('2024-05-07T18:00:00Z', '2024-05-08T06:00:00Z')).toEqual(['2024-05-07'])
    expect(convectiveDays('2024-05-07T18:00:00Z', '2024-05-08T18:00:00Z')).toEqual([
      '2024-05-07',
      '2024-05-08',
    ])
  })

  it('estimates one file per day and refuses a long period', () => {
    expect(spc.estimate(query({ range })).requests).toBe(1)
    expect(() =>
      spc.estimate(
        query({ range: { start: '2024-05-01T00:00:00Z', end: '2024-05-20T00:00:00Z' } }),
      ),
    ).toThrow(/most is 7/)
  })

  it('stores the reports as points that appear when reported, and as ground-truth events', async () => {
    const { get, asked } = fakeGet([['240507_rpts.csv', fx('spc-240507.csv')]])
    const r = await spc.fetch(query({ range, area: { label: 'Test' } }), { get })
    expect(asked[0]!.url).toBe('https://www.spc.noaa.gov/climo/reports/240507_rpts.csv')
    expect(r.datasets[0]).toMatchObject({ id: 'storm-reports', kind: 'features' })
    const file = JSON.parse(r.files[0]!.data as string)
    expect(file.features).toHaveLength(21)
    expect(file.features[0].properties).toMatchObject({
      start: '2024-05-07T12:00:00.000Z',
      end: '2024-05-08T12:00:00.000Z',
      kind: 'wind',
    })
    expect(file.events).toHaveLength(21)
    expect(file.events[0]).toMatchObject({
      id: 'wind-001',
      kind: 'wind',
      area: expect.stringMatching(/, IL$/),
    })
  })

  it('filters to the area and to the kinds asked for', async () => {
    const { get } = fakeGet([['240507_rpts.csv', fx('spc-240507.csv')]])
    const r = await spc.fetch(
      query({
        range,
        options: { kinds: 'tornado' },
        area: { label: 'Michigan', bbox: [-87, 41, -84, 43] },
      }),
      { get },
    )
    const file = JSON.parse(r.files[0]!.data as string)
    expect(
      file.events.every(
        (e: { kind: string; attrs: { lat: number } }) => e.kind === 'tornado' && e.attrs.lat > 41,
      ),
    ).toBe(true)
    expect(file.events.length).toBeGreaterThan(0)
    expect(r.modified).toMatch(/Filtered/)
  })
})

describe('nexrad-level2', () => {
  const nexrad = getConnector('nexrad-level2')
  const range = { start: '2024-05-07T20:00:00Z', end: '2024-05-07T20:15:00Z' }

  it('reads the volume listing and picks the volume nearest each frame', () => {
    const list = parseListing(text('nexrad-list.xml'))
    expect(list.map((v) => v.key.slice(-13))).toEqual(
      ['200303_V06', '200753_V06', '201245_V06', '201737_V06', '202203_V06', '202654_V06'].map(
        (t) => `0507_${t}`.slice(-13),
      ),
    )
    const picked = chooseVolumes(list, Date.parse(range.start), 4, 300_000)
    expect(picked.map((v) => new Date(v.timeMs).toISOString().slice(11, 16))).toEqual([
      '20:03',
      '20:07',
      '20:12',
    ])
  })

  it('estimates frames, stored bytes and the archive download', () => {
    const e = nexrad.estimate(query({ range, options: { site: 'KILN' } }))
    expect(e.items.map((i) => i.datasetId)).toEqual([
      'radar-kiln-ref',
      'radar-kiln-vel',
      'radar-kiln-cc',
      'radar-download',
    ])
    expect(e.items[3]!.bytes).toBe(4 * RANGE_BYTES)
    expect(e.requests).toBeGreaterThanOrEqual(4)
  })

  it('picks the nearest radar from the area when no site is given', () => {
    const e = nexrad.estimate(query({ range: { start: range.start, end: '2024-05-07T20:01:00Z' } }))
    expect(e.items[0]!.datasetId).toBe('radar-kiln-ref')
  })

  it('refuses an unknown site and too many frames', () => {
    expect(() => nexrad.estimate(query({ range, options: { site: 'KZZZ' } }))).toThrow(
      /not a NEXRAD site/,
    )
    expect(() =>
      nexrad.estimate(
        query({
          range: { start: '2024-05-07T00:00:00Z', end: '2024-05-08T12:00:00Z' },
          options: { site: 'KILN' },
        }),
      ),
    ).toThrow(/most is 144/)
  })

  it('fetches only the start of each volume and stores frames a radar figure can draw', async () => {
    const { get, asked } = fakeGet([
      ['list-type=2', fx('nexrad-list.xml')],
      ['KILN20240507_', fx('KILN20240507_200303_V06.part')],
    ])
    const r = await nexrad.fetch(query({ range, options: { site: 'KILN', extentKm: 120 } }), {
      get,
    })
    const volumes = asked.filter((a) => a.url.includes('KILN20240507_'))
    expect(volumes.length).toBe(3)
    expect(volumes.every((a) => a.range?.[0] === 0 && a.range[1] === RANGE_BYTES - 1)).toBe(true)
    expect(r.datasets.map((d) => d.id)).toEqual([
      'radar-kiln-ref',
      'radar-kiln-vel',
      'radar-kiln-cc',
    ])
    expect(r.modified).toMatch(/Cropped to 120 km/)
    const frames = JSON.parse(r.files[0]!.data as string).features
    expect(frames).toHaveLength(3)
    expect(frames[0].properties.end).toBe(frames[1].properties.start)
    expect(frames[2].properties.end).toBe('2024-05-07T20:15:00.000Z')
    const figure = renderFigure({ kind: 'radar', data: frames[0].properties.data })
    expect(figure.summary).toContain('Reflectivity from radar KILN')
    expect(figure.summary).toContain('historical data')
  })

  it('is read by a figure that points at the dataset', async () => {
    const { get } = fakeGet([
      ['list-type=2', fx('nexrad-list.xml')],
      ['KILN20240507_', fx('KILN20240507_200303_V06.part')],
    ])
    const r = await nexrad.fetch(
      query({ range, options: { site: 'KILN', products: 'velocity' } }),
      { get },
    )
    const frames = JSON.parse(r.files[0]!.data as string).features
    const out = computeFigures(
      { figures: { main: { kind: 'radar', data: 'KILN radial velocity 20:03Z' } } },
      { 'figures.main.data': { value: [frames[0]] } },
    )
    expect(out.main!.summary).toContain('Radial velocity from radar KILN')
    expect(() =>
      computeFigures(
        { figures: { main: { kind: 'radar', data: 'x' } } },
        { 'figures.main.data': { value: [] } },
      ),
    ).toThrow(/no figure for this time/)
  })

  it('refuses an archive with no volumes for the period', async () => {
    const { get } = fakeGet([
      ['list-type=2', new TextEncoder().encode('<ListBucketResult></ListBucketResult>')],
    ])
    await expect(
      nexrad.fetch(query({ range, options: { site: 'KILN' } }), { get }),
    ).rejects.toThrow(/no KILN volumes/)
  })
})

describe('iem connectors', () => {
  it('stores warning polygons active from issue to the end of the polygon', async () => {
    const iem = getConnector('iem-warnings')
    const { get, asked } = fakeGet([['sbw.py', fx('iem-sbw-iln.json')]])
    const r = await iem.fetch(
      query({
        range: { start: '2024-05-07T18:00:00Z', end: '2024-05-07T21:00:00Z' },
        options: { wfo: 'iln' },
      }),
      { get },
    )
    expect(asked[0]!.url).toContain('wfo=ILN')
    const f = JSON.parse(r.files[0]!.data as string).features
    expect(f).toHaveLength(1)
    expect(f[0].properties).toMatchObject({
      name: 'Severe Thunderstorm Warning 71 (ILN)',
      start: '2024-05-07T18:21:00Z',
      end: '2024-05-07T18:44:00Z',
    })
  })

  it('stores soundings as frames for the skew-T and hodograph', async () => {
    const iem = getConnector('iem-soundings')
    expect(
      launchTimes('2024-05-07T14:00:00Z', '2024-05-08T02:00:00Z').map((t) =>
        new Date(t).toISOString().slice(5, 13),
      ),
    ).toEqual(['05-07T12', '05-08T00'])
    const { get, asked } = fakeGet([['raob.py', fx('KILN_20240507_12Z_raob.json')]])
    const r = await iem.fetch(
      query({
        range: { start: '2024-05-07T14:00:00Z', end: '2024-05-07T23:00:00Z' },
        options: { station: 'kiln', name: 'Wilmington OH' },
      }),
      { get },
    )
    expect(asked[0]!.url).toContain('station=KILN')
    expect(asked[0]!.url).toContain('ts=202405071200')
    const frames = JSON.parse(r.files[0]!.data as string).features
    expect(frames).toHaveLength(1)
    expect(renderFigure({ kind: 'skew_t', data: frames[0].properties.data }).summary).toMatch(
      /CAPE/,
    )
  })

  it('says so when a station has no sounding', async () => {
    const iem = getConnector('iem-soundings')
    const { get } = fakeGet([['raob.py', new TextEncoder().encode('{"profiles": []}')]])
    await expect(
      iem.fetch(
        query({
          range: { start: '2024-05-07T12:00:00Z', end: '2024-05-07T13:00:00Z' },
          options: { station: 'KXXX' },
        }),
        { get },
      ),
    ).rejects.toThrow(/no soundings/)
  })
})

describe('nhc-hurdat2', () => {
  it('stores the whole track as a line and each fix as a point active until the next', async () => {
    const nhc = getConnector('nhc-hurdat2')
    const range = { start: '2005-08-23T00:00:00Z', end: '2005-09-01T00:00:00Z' }
    expect(
      nhc.estimate(query({ range, options: { name: 'Katrina', year: 2005 } })).items[0]!.bytes,
    ).toBeGreaterThan(6_000_000)
    const { get, asked } = fakeGet([
      ['hurdat2-1851-2025-092326.txt', fx('hurdat2-sample.txt')],
      ['/data/hurdat/', fx('nhc-listing.html')],
    ])
    const r = await nhc.fetch(query({ range, options: { name: 'Katrina', year: 2005 } }), { get })
    expect(asked.map((a) => a.url.split('/').pop())).toEqual(['', 'hurdat2-1851-2025-092326.txt'])
    const f = JSON.parse(r.files[0]!.data as string).features
    expect(f).toHaveLength(35)
    expect(f[0].geometry.type).toBe('LineString')
    expect(f[1].properties).toMatchObject({
      start: '2005-08-23T18:00:00Z',
      end: '2005-08-24T00:00:00Z',
      windKt: 30,
    })
    expect(r.datasets[0]!.id).toBe('track-katrina-2005')
    await expect(
      nhc.fetch(query({ range, options: { name: 'Nobody', year: 2005 } }), { get }),
    ).rejects.toThrow(/no storm named Nobody/)
  })
})
