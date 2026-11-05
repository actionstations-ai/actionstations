// The space weather connectors on recorded responses (__fixtures__/swpc-*, ncei-swpc-*,
// usgs-geomag-*, trimmed from the live services on 2026-11-05): estimates before any fetch, the
// data each fetch stores, refusal of shapes it does not know, and the fixed hosts. Live checks are
// opt-in (LIVE=1) in space-weather-connectors.live.test.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppError } from '../../lib/errors'
import { createCaseGet } from '../../case-data/http'
import { parseDailyIndices, parseIssued, parseSwpcMessage } from '../space_weather/archives'
import {
  ARCHIVE_FIRST_DAY,
  STORM_LIBRARY,
  findStorms,
  nearestObservatory,
  planStorm,
} from '../space_weather/storms'
import { nceiSwpcArchiveConnector, archiveDays } from './ncei-swpc-archive'
import { swpcRealtimeConnector } from './swpc-realtime'
import { usgsGeomagConnector } from './usgs-geomag'
import type { ConnectorQuery, FetchContext } from './registry'

const fx = (name: string): Buffer => readFileSync(join(__dirname, '__fixtures__', name))
const text = (name: string): string => fx(name).toString('utf8')

function fakeGet(routes: [string, Uint8Array | 404][]) {
  const asked: string[] = []
  const get: FetchContext['get'] = async (url) => {
    asked.push(url)
    const hit = routes.find(([part]) => url.includes(part))
    if (!hit || hit[1] === 404) throw new AppError('PROVIDER', `${url} answered HTTP 404`)
    return { status: 200, data: hit[1] }
  }
  return { get, asked }
}

const q = (
  range: ConnectorQuery['range'],
  options: ConnectorQuery['options'] = {},
): ConnectorQuery => ({
  range,
  area: { label: 'Planetary' },
  options,
})

describe('parsers', () => {
  it('reads the code, serial number and headline of a live message', () => {
    const alerts = JSON.parse(text('swpc-alerts.json')) as { message: string }[]
    expect(parseSwpcMessage(alerts[0]!.message)).toEqual({
      code: 'WATA20',
      serial: '1135',
      kind: 'WATCH',
      headline: 'Geomagnetic Storm Category G1 Predicted',
    })
    expect(parseSwpcMessage('no code here')).toBeUndefined()
  })
  it('reads the planetary Kp and flares of the May 2024 storm day', () => {
    const d = parseDailyIndices(text('ncei-swpc-dayind-20240511.txt'), '2024-05-11')!
    expect(d.kp.map((p) => p.v)).toEqual([9, 8.33, 8.67, 9, 8.67, 8.33, 7.33, 7.33])
    expect(d.kp[0]!.t).toBe('2024-05-11T00:00:00.000Z')
    expect(d.kp[7]!.t).toBe('2024-05-11T21:00:00.000Z')
    expect(d.ap).toBe(273)
    expect(d.flares).toEqual({ c: 4, m: 5, x: 2 })
  })
  it('returns nothing for a layout it does not know', () => {
    expect(parseDailyIndices(':Product: something else\n1 2 3', '2024-05-11')).toBeUndefined()
    expect(parseIssued(text('ncei-swpc-forecast-20240511.txt'))).toBe('2024-05-11T22:05:00.000Z')
  })
})

describe('swpc-realtime', () => {
  const range = { start: '2026-11-04T00:00:00Z', end: '2026-11-05T12:00:00Z' }
  const routes: [string, Uint8Array][] = [
    ['noaa-planetary-k-index', fx('swpc-kp.json')],
    ['xrays-1-day', fx('swpc-xray.json')],
    ['integral-protons-1-day', fx('swpc-proton.json')],
    ['magnetometers-1-day', fx('swpc-magnetometer.json')],
    ['alerts.json', fx('swpc-alerts.json')],
    ['rtsw_wind_1m', fx('swpc-wind.json')],
  ]
  it('estimates every dataset without a request and scales by the window', () => {
    const est = swpcRealtimeConnector.estimate(q(range))
    expect(est.items.map((i) => i.datasetId)).toEqual([
      'swpc-kp',
      'swpc-xray',
      'swpc-proton',
      'swpc-magnetometer',
      'swpc-messages',
    ])
    const week = swpcRealtimeConnector.estimate(q(range, { window: '7-day' }))
    expect(week.items.find((i) => i.datasetId === 'swpc-xray')!.bytes).toBe(
      7 * est.items.find((i) => i.datasetId === 'swpc-xray')!.bytes,
    )
    expect(swpcRealtimeConnector.hosts).toEqual(['services.swpc.noaa.gov'])
  })
  it('stores series cropped to the period, with the 0.1 to 0.8 nm band and 10 MeV protons only', async () => {
    const { get, asked } = fakeGet(routes)
    const r = await swpcRealtimeConnector.fetch(q(range), { get })
    expect(r.datasets.map((d) => d.id)).toEqual([
      'swpc-kp',
      'swpc-xray',
      'swpc-proton',
      'swpc-magnetometer',
      'swpc-messages',
      'swpc-events',
    ])
    const file = (n: string) => JSON.parse(String(r.files.find((f) => f.name === n)!.data))
    const xray = file('swpc-xray.json') as { t: string; v: number }[]
    expect(xray.length).toBe(30)
    expect(xray.every((p) => p.v > 0 && p.t.endsWith('Z'))).toBe(true)
    expect(file('swpc-kp.json').length).toBeGreaterThan(5)
    expect(asked.every((u) => u.startsWith('https://services.swpc.noaa.gov/'))).toBe(true)
    expect(r.citation).toMatch(/Space Weather Prediction Center/)
  })
  it('turns messages into reports and ground-truth events with code and serial number', async () => {
    const { get } = fakeGet(routes)
    const r = await swpcRealtimeConnector.fetch(q(range, { products: 'alerts' }), { get })
    const events = JSON.parse(
      String(r.files.find((f) => f.name === 'swpc-events.geojson')!.data),
    ).events
    expect(events[0]).toMatchObject({
      kind: 'swpc_message',
      attrs: { code: 'WATA20', productKind: 'WATCH', serial: '1135' },
    })
    const reports = JSON.parse(String(r.files.find((f) => f.name === 'swpc-messages.json')!.data))
    expect(reports[0].title).toBe('WATA20 serial 1135')
    expect(reports[0].text).toContain('Space Weather Message Code: WATA20')
  })
  it('thins solar wind to five-minute values', async () => {
    const { get } = fakeGet(routes)
    const r = await swpcRealtimeConnector.fetch(
      q({ start: '2026-11-05T07:00:00Z', end: '2026-11-05T08:00:00Z' }, { products: 'wind' }),
      { get },
    )
    const pts = JSON.parse(String(r.files[0]!.data)) as { t: string }[]
    expect(pts.length).toBeGreaterThan(2)
    expect(pts.every((p) => Date.parse(p.t) % 300_000 === 0)).toBe(true)
  })
  it('says the feeds hold only the recent past when nothing falls in the period', async () => {
    const { get } = fakeGet(routes)
    await expect(
      swpcRealtimeConnector.fetch(
        q({ start: '2024-05-10T00:00:00Z', end: '2024-05-12T00:00:00Z' }),
        { get },
      ),
    ).rejects.toThrow(/only about the last week/)
  })
  it('refuses a feed whose shape changed and an unknown product', async () => {
    const { get } = fakeGet([['noaa-planetary-k-index', new TextEncoder().encode('[[1,2,3]]')]])
    await expect(
      swpcRealtimeConnector.fetch(q(range, { products: 'kp' }), { get }),
    ).rejects.toThrow(/unexpected shape/)
    expect(() => swpcRealtimeConnector.estimate(q(range, { products: 'kp,tides' }))).toThrow(
      /not a product/,
    )
  })
})

describe('ncei-swpc-archive', () => {
  const range = { start: '2024-05-10T00:00:00Z', end: '2024-05-12T00:00:00Z' }
  const dayRoutes: [string, Uint8Array | 404][] = [
    ['20240510dayind', fx('ncei-swpc-dayind-20240510.txt')],
    ['20240511dayind', fx('ncei-swpc-dayind-20240511.txt')],
    ['20240510geomag_forecast', fx('ncei-swpc-forecast-20240510.txt')],
    ['20240511geomag_forecast', 404],
  ]
  it('lists the UTC days of a period and estimates before any request', () => {
    expect(archiveDays(range.start, range.end)).toEqual(['2024-05-10', '2024-05-11'])
    const est = nceiSwpcArchiveConnector.estimate(q(range))
    expect(est.requests).toBe(4)
    expect(est.items.map((i) => i.datasetId)).toEqual([
      'kp-archive',
      'flare-counts',
      'swpc-forecasts',
    ])
    expect(nceiSwpcArchiveConnector.hosts).toEqual(['www.ngdc.noaa.gov'])
  })
  it('stores Kp by interval and flare counts, and names the days that are not archived', async () => {
    const { get, asked } = fakeGet(dayRoutes)
    const r = await nceiSwpcArchiveConnector.fetch(q(range), { get })
    const kp = JSON.parse(String(r.files.find((f) => f.name === 'kp-archive.json')!.data)) as {
      v: number
    }[]
    expect(kp).toHaveLength(16)
    expect(Math.max(...kp.map((p) => p.v))).toBe(9)
    const forecasts = JSON.parse(
      String(r.files.find((f) => f.name === 'swpc-forecasts.json')!.data),
    )
    expect(forecasts).toHaveLength(1)
    expect(forecasts[0].text).toContain('NOAA Kp index forecast')
    expect(r.modified).toBe('Not archived, left out: forecast 2024-05-11')
    expect(asked[0]).toBe(
      'https://www.ngdc.noaa.gov/stp/space-weather/swpc-products/daily_reports/space_weather_indices/2024/05/20240510dayind.txt',
    )
  })
  it('crops Kp to the period and refuses a layout it does not read', async () => {
    const { get } = fakeGet(dayRoutes)
    const r = await nceiSwpcArchiveConnector.fetch(
      q({ start: '2024-05-11T12:00:00Z', end: '2024-05-12T00:00:00Z' }),
      { get },
    )
    const kp = JSON.parse(
      String(r.files.find((f) => f.name === 'kp-archive.json')!.data),
    ) as unknown[]
    expect(kp).toHaveLength(4)
    const bad = fakeGet([['dayind', new TextEncoder().encode('<html>changed</html>')]])
    await expect(nceiSwpcArchiveConnector.fetch(q(range), { get: bad.get })).rejects.toThrow(
      /not in the layout/,
    )
  })
  it('fails plainly when no day is archived and refuses a long period', async () => {
    const none = fakeGet([
      ['dayind', 404],
      ['geomag_forecast', 404],
    ])
    await expect(nceiSwpcArchiveConnector.fetch(q(range), { get: none.get })).rejects.toThrow(
      /no space weather files/,
    )
    expect(() =>
      nceiSwpcArchiveConnector.estimate(
        q({ start: '2024-05-01T00:00:00Z', end: '2024-06-01T00:00:00Z' }),
      ),
    ).toThrow(/the most is 14/)
  })
})

describe('usgs-geomag', () => {
  const range = { start: '2024-05-10T22:00:00Z', end: '2024-05-10T23:00:00Z' }
  const opts = { observatory: 'BOU' }
  it('estimates four components from the period and refuses an unknown observatory or long period', () => {
    const est = usgsGeomagConnector.estimate(q(range, opts))
    expect(est.items.map((i) => i.datasetId)).toEqual([
      'geomag-bou-h',
      'geomag-bou-d',
      'geomag-bou-z',
      'geomag-bou-f',
    ])
    expect(est.requests).toBe(1)
    expect(() => usgsGeomagConnector.estimate(q(range, { observatory: 'XYZ' }))).toThrow(
      /not a USGS observatory/,
    )
    expect(() =>
      usgsGeomagConnector.estimate(
        q({ start: '2024-05-01T00:00:00Z', end: '2024-05-20T00:00:00Z' }, opts),
      ),
    ).toThrow(/limited to 7 days/)
    expect(usgsGeomagConnector.hosts).toEqual(['geomag.usgs.gov'])
  })
  it('stores each component as a series with its unit and sends only the observatory and dates', async () => {
    const { get, asked } = fakeGet([['/ws/data/', fx('usgs-geomag-bou.json')]])
    const r = await usgsGeomagConnector.fetch(q(range, opts), { get })
    expect(r.datasets.map((d) => d.unit)).toEqual(['nT', 'arcmin', 'nT', 'nT'])
    const h = JSON.parse(String(r.files[0]!.data)) as { t: string; v: number }[]
    expect(h).toHaveLength(61)
    expect(h[0]).toEqual({ t: '2024-05-10T22:00:00.000Z', v: 20875.519 })
    expect(asked[0]).toBe(
      'https://geomag.usgs.gov/ws/data/?id=BOU&format=json&type=variation&elements=H,D,Z,F&sampling_period=60&starttime=2024-05-10T22:00:00Z&endtime=2024-05-10T23:00:00Z',
    )
  })
  it('leaves missing samples missing and refuses a response without a component', async () => {
    const body = JSON.parse(text('usgs-geomag-bou.json'))
    body.values[0].values[1] = null
    const { get } = fakeGet([['/ws/data/', new TextEncoder().encode(JSON.stringify(body))]])
    const r = await usgsGeomagConnector.fetch(q(range, opts), { get })
    expect(JSON.parse(String(r.files[0]!.data))).toHaveLength(60)
    body.values.pop()
    const short = fakeGet([['/ws/data/', new TextEncoder().encode(JSON.stringify(body))]])
    await expect(usgsGeomagConnector.fetch(q(range, opts), { get: short.get })).rejects.toThrow(
      /did not return the F component/,
    )
  })
})

describe('hosts', () => {
  it('refuse every host but their own', async () => {
    const get = createCaseGet({
      hosts: swpcRealtimeConnector.hosts,
      version: 'test',
      maxBytes: () => 1000,
      onResponse: () => undefined,
      fetchImpl: async () => new Response('x'),
    })
    await expect(get('https://geomag.usgs.gov/ws/data/')).rejects.toThrow(/not an archive/)
    await expect(get('http://services.swpc.noaa.gov/x')).rejects.toThrow(/https/)
  })
})

describe('event finder and storm library', () => {
  it('groups Kp intervals at G1 or above into storms with their peak', () => {
    const kp = [2, 5, 6, 8.67, 7, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5.33, 6, 2].map((v, i) => ({
      t: new Date(Date.UTC(2024, 4, 10, 0) + i * 3 * 3_600_000).toISOString(),
      v,
    }))
    const found = findStorms(kp)
    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ peakKp: 8.67, peakG: 4 })
    expect(found[1]!.peakG).toBe(2)
    expect(findStorms(kp, 3)).toHaveLength(1)
  })
  it('finds the May 2024 storm in the archive record of its two days', () => {
    const days = ['2024-05-10', '2024-05-11'].map((d) =>
      parseDailyIndices(text(`ncei-swpc-dayind-${d.replaceAll('-', '')}.txt`), d)!,
    )
    const [storm] = findStorms(
      days.flatMap((d) => d.kp),
      5,
    )
    expect(storm).toMatchObject({ peakKp: 9, peakG: 5 })
  })
  it('keeps pointers to dates with the peak read from the archive', () => {
    const may = STORM_LIBRARY.find((s) => s.id === 'may-2024')!
    expect(may).toMatchObject({ peakG: 5, firstDay: '2024-05-10' })
    for (const s of STORM_LIBRARY) {
      expect(s.firstDay >= ARCHIVE_FIRST_DAY).toBe(true)
      expect(s).not.toHaveProperty('data')
    }
  })
  it('plans the archive and the nearest observatory for a place, hourly when long', () => {
    const plan = planStorm(STORM_LIBRARY[0]!, { label: 'Fort Collins', lat: 40.6, lon: -105.1 })
    expect(plan.archive.range).toEqual({
      start: '2024-05-10T00:00:00Z',
      end: '2024-05-13T00:00:00.000Z',
    })
    expect(plan.geomag!.options).toEqual({ observatory: 'BOU', sampling: 'minute' })
    const long = planStorm(
      { firstDay: '2024-05-01', lastDay: '2024-05-12' },
      { label: 'x', lat: 64.8, lon: -147.7 },
    )
    expect(long.geomag!.options).toEqual({ observatory: 'CMO', sampling: 'hour' })
    expect(long.notes.join(' ')).toMatch(/limited to seven days/)
    expect(planStorm({ firstDay: '2003-10-29', lastDay: '2003-10-31' }).notes[0]).toMatch(
      /no daily files before/,
    )
    expect(nearestObservatory(21.3, -157.9).id).toBe('HON')
  })
})
