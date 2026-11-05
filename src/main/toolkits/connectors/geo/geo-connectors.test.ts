// The earth science replay connectors (spec 0450 FR-9, FR-10) against recorded responses: the
// fixtures are real responses from each service, trimmed. Covered: the queries they build, what
// they refuse, the datasets they hand back and the manners the spec asks for (FDSN: at most three
// requests in flight; every fetch cites its source). The live test runs only with LIVE=1.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { SeriesFile, TextFile } from '@shared/schemas/case-data'
import { comcat, catalogUrl, detailUrl, gridFromCoverage } from './comcat'
import { FDSN_MAX_CONCURRENT, dataselectUrl, fdsnWaveforms, parseWaveformQuery } from './fdsn'
import { faultsUrl, landslideAssessments, quaternaryFaults, thresholdLines } from './hazard-layers'
import { scenarioShakemaps } from './scenario-shakemaps'
import { eventsUrl, runupFeatures, tsunamiEvents } from './tsunami-events'
import { selectNotices, volcanoNotices } from './volcano-notices'
import { coopsTides, coopsUrl, dartUrl, ndbcDart, parseDart } from './water-level'
import type { ConnectorQuery, FetchContext } from '../registry'

const dir = join(__dirname, '..', '__fixtures__')
const fx = (name: string): string => readFileSync(join(dir, name), 'utf8')
const bytes = (s: string | Uint8Array): Uint8Array =>
  typeof s === 'string' ? new TextEncoder().encode(s) : s
const decode = (d: Uint8Array | string): string =>
  typeof d === 'string' ? d : new TextDecoder().decode(d)

/** A `get` that answers from fixtures by address and records every address it was asked for. */
function recorded(routes: [RegExp, () => string | Uint8Array][]): {
  ctx: FetchContext
  urls: string[]
} {
  const urls: string[] = []
  return {
    urls,
    ctx: {
      async get(url) {
        urls.push(url)
        const hit = routes.find(([re]) => re.test(url))
        if (!hit) return { status: 404, data: bytes('') }
        return { status: 200, data: bytes(hit[1]()) }
      },
    },
  }
}

const q = (over: Partial<ConnectorQuery> = {}): ConnectorQuery => ({
  range: { start: '2001-02-28T00:00:00Z', end: '2001-03-02T00:00:00Z' },
  area: { label: 'Puget Sound', bbox: [-125, 45, -120, 49] },
  options: {},
  ...over,
})

const nisquallyRoutes = (): [RegExp, () => string][] => [
  [/eventid=uw10530748/, () => fx('comcat-detail-nisqually.json')],
  [/coverage_mmi_low_res/, () => fx('shakemap-mmi-low.covjson')],
  [/cont_mmi\.json/, () => fx('shakemap-cont-mmi.json')],
  [/dyfi_geo_10km/, () => fx('dyfi-10km.geojson')],
]

describe('comcat', () => {
  it('builds a catalog query for one period, area and magnitude floor', () => {
    const u = new URL(catalogUrl(q({ options: { minMagnitude: 6 } })))
    expect(u.host).toBe('earthquake.usgs.gov')
    expect(u.searchParams.get('minmagnitude')).toBe('6')
    expect(u.searchParams.get('minlongitude')).toBe('-125')
    expect(u.searchParams.get('starttime')).toBe('2001-02-28T00:00:00')
    expect(new URL(detailUrl('uw10530748')).searchParams.get('eventid')).toBe('uw10530748')
  })

  it('refuses a bad event id, product list, magnitude and a period over a year', () => {
    expect(() => comcat.estimate(q({ options: { eventId: 'x; DROP' } }))).toThrow(/event id/)
    expect(() =>
      comcat.estimate(q({ options: { eventId: 'uw10530748', products: 'shakemap,evil' } })),
    ).toThrow(/product/)
    expect(() => catalogUrl(q({ options: { minMagnitude: 99 } }))).toThrow(/minMagnitude/)
    expect(() =>
      catalogUrl(q({ range: { start: '2001-01-01T00:00:00Z', end: '2003-01-01T00:00:00Z' } })),
    ).toThrow(/at most 366 days/)
  })

  it('estimates without a request: a catalog list, or an event with its products', () => {
    expect(comcat.estimate(q()).items.map((i) => i.datasetId)).toEqual(['comcat-events'])
    const e = comcat.estimate(q({ options: { eventId: 'uw10530748' } }))
    expect(e.items.map((i) => i.datasetId)).toEqual([
      'comcat-events',
      'shakemap-grid',
      'shakemap-contours',
      'dyfi-communities',
      'pager-estimate',
    ])
    expect(e.requests).toBe(7)
  })

  it('returns catalog events as point features', async () => {
    const { ctx, urls } = recorded([[/fdsnws\/event\/1\/query\?/, () => fx('comcat-events.json')]])
    const r = await comcat.fetch(q(), ctx)
    expect(urls).toHaveLength(1)
    const features = JSON.parse(r.files[0]!.data as string).features
    expect(features[0].properties.name).toMatch(/Nisqually/)
    expect(features[0].properties.magnitude).toBe(6.8)
    expect(features[0].properties.time).toBe('2001-02-28T18:54:32.830Z')
    expect(r.datasets[0]!.kind).toBe('features')
    expect(r.citation).toMatch(/ComCat/)
  })

  it('fetches an event with its ShakeMap grid (north row first), contours and community intensity', async () => {
    const { ctx, urls } = recorded(nisquallyRoutes())
    const r = await comcat.fetch(
      q({ options: { eventId: 'uw10530748', products: 'shakemap,dyfi' } }),
      ctx,
    )
    expect(r.datasets.map((d) => d.id)).toEqual([
      'comcat-events',
      'shakemap-grid',
      'shakemap-contours',
      'dyfi-communities',
    ])
    expect(urls.every((u) => new URL(u).host === 'earthquake.usgs.gov')).toBe(true)
    const gridFile = JSON.parse(
      r.files.find((f) => f.name === 'shakemap-grid.geojson')!.data as string,
    )
    const g = gridFile.features[0].properties.grid
    expect(g.cols).toBeLessThanOrEqual(100)
    expect(g.values).toHaveLength(g.cols * g.rows)
    // The strongest cell sits near the epicenter (47.15 N, 122.73 W): proves the row order.
    const at = g.values.indexOf(Math.max(...g.values))
    const lat = g.north - ((Math.floor(at / g.cols) + 0.5) * (g.north - g.south)) / g.rows
    const lon = g.west + (((at % g.cols) + 0.5) * (g.east - g.west)) / g.cols
    expect(Math.abs(lat - 47.15)).toBeLessThan(0.6)
    expect(Math.abs(lon + 122.73)).toBeLessThan(0.6)
    expect(r.citation).toContain('uw10530748')
  })

  it('averages a big grid down and keeps every cell', () => {
    const cols = 250
    const rows = 40
    const { grid, resampled } = gridFromCoverage({
      domain: {
        axes: { x: { start: 0, stop: 5, num: cols }, y: { start: 40, stop: 41, num: rows } },
      },
      ranges: {
        MMI: { values: Array.from({ length: cols * rows }, (_, i) => (i % cols < 125 ? 3 : 7)) },
      },
    })
    expect(resampled).toBe(true)
    expect(grid.cols).toBeLessThanOrEqual(100)
    expect(grid.values[0]).toBe(3)
    expect(grid.values[grid.cols - 1]).toBe(7)
    expect(() => gridFromCoverage({ domain: { axes: {} }, ranges: {} })).toThrow(/unexpected shape/)
  })

  it('turns a PAGER product into one text entry for the PAGER alert', async () => {
    const { ctx } = recorded([
      [/eventid=ci38457511/, () => fx('comcat-detail-ridgecrest.json')],
      [/alerts\.json/, () => fx('pager-alerts.json')],
      [/exposures\.json/, () => fx('pager-exposures.json')],
      [/comments\.json/, () => fx('pager-comments.json')],
    ])
    const r = await comcat.fetch(q({ options: { eventId: 'ci38457511', products: 'pager' } }), ctx)
    const entries = TextFile.parse(
      JSON.parse(r.files.find((f) => f.name === 'pager-estimate.json')!.data as string),
    )
    expect(entries[0]!.text).toContain('PAGER alert level yellow')
    expect(entries[0]!.text).toContain('Fatalities: green alert')
    expect(entries[0]!.text).toMatch(/MMI 4: 21545813 people/)
  })
})

describe('scenario-shakemaps', () => {
  it('labels everything as a scenario and asks by magnitude, not by date', async () => {
    const { ctx, urls } = recorded([
      [/fdsnws\/scenario\/1\/query\?/, () => fx('comcat-scenario-list.json')],
    ])
    const r = await scenarioShakemaps.fetch(q({ options: { minMagnitude: 8 } }), ctx)
    expect(urls[0]).toContain('/fdsnws/scenario/1/query')
    expect(urls[0]).not.toContain('starttime')
    expect(r.datasets[0]!.label).toMatch(/^SCENARIO \(not a real earthquake\)/)
    expect(r.datasets[0]!.range).toBeUndefined()
    expect(scenarioShakemaps.source).toMatch(/not real earthquakes/)
    expect(r.citation).toMatch(/not real earthquakes/)
  })

  it('reads the scenario products under their scenario names', async () => {
    const { ctx } = recorded([
      [/eventid=adhocshakeout2_mainshock_se/, () => fx('comcat-detail-scenario.json')],
      [/coverage_mmi_low_res/, () => fx('shakemap-mmi-low.covjson')],
      [/cont_mmi\.json/, () => fx('shakemap-cont-mmi.json')],
    ])
    const r = await scenarioShakemaps.fetch(
      q({ options: { eventId: 'adhocshakeout2_mainshock_se', products: 'shakemap' } }),
      ctx,
    )
    expect(r.datasets.map((d) => d.id)).toEqual([
      'comcat-events',
      'shakemap-grid',
      'shakemap-contours',
    ])
    expect(r.datasets.every((d) => d.label.startsWith('SCENARIO'))).toBe(true)
  })
})

describe('fdsn-waveforms', () => {
  const wq = (options: Record<string, string | number> = {}): ConnectorQuery =>
    q({
      range: { start: '2001-02-28T18:54:00Z', end: '2001-02-28T18:57:00Z' },
      options: { network: 'IU', stations: 'COR', channel: 'BHZ', location: '00', ...options },
    })
  const mseed = (): Uint8Array =>
    new Uint8Array(Buffer.from(fx('iu-cor-bhz-nisqually.mseed.b64'), 'base64'))

  it('builds one dataselect request per station on the chosen data center', () => {
    const r = parseWaveformQuery(wq({ stations: 'COR,HLID', center: 'scedc' }))
    expect(r.stations).toEqual(['COR', 'HLID'])
    const u = new URL(dataselectUrl(r, 'COR', wq({ center: 'scedc' })))
    expect(u.host).toBe('service.scedc.caltech.edu')
    expect(u.searchParams.get('format')).toBe('miniseed')
    expect(u.searchParams.get('net')).toBe('IU')
  })

  it('refuses unnamed stations, more than six, odd codes, a long window and an unknown center', () => {
    expect(() => parseWaveformQuery({ ...wq(), options: {} })).toThrow(
      /network and up to six stations/,
    )
    expect(() => parseWaveformQuery(wq({ stations: 'A,B,C,D,E,F,G' }))).toThrow(/station list/)
    expect(() => parseWaveformQuery(wq({ stations: 'COR;DROP' }))).toThrow(/station list/)
    expect(() => parseWaveformQuery(wq({ center: 'evil' }))).toThrow(/center must be/)
    expect(() =>
      parseWaveformQuery({
        ...wq(),
        range: { start: '2001-02-28T18:00:00Z', end: '2001-02-28T19:00:00Z' },
      }),
    ).toThrow(/up to 30 minutes/)
  })

  it('never has more than three requests in flight', async () => {
    let flying = 0
    let peak = 0
    const ctx: FetchContext = {
      async get() {
        flying++
        peak = Math.max(peak, flying)
        await new Promise((r) => setTimeout(r, 5))
        flying--
        return { status: 200, data: mseed() }
      },
    }
    await fdsnWaveforms.fetch(wq({ stations: 'COR,AAA,BBB,CCC,DDD,EEE' }), ctx)
    expect(FDSN_MAX_CONCURRENT).toBe(3)
    expect(peak).toBe(3)
  })

  it('decodes the miniSEED into a series with the network and data center cited', async () => {
    const { ctx } = recorded([[/dataselect/, mseed]])
    const r = await fdsnWaveforms.fetch(wq(), ctx)
    expect(r.datasets[0]!.id).toBe('wf-iu-cor-00-bhz')
    const points = SeriesFile.parse(JSON.parse(r.files[0]!.data as string))
    expect(points.length).toBeGreaterThan(500)
    expect(r.citation).toMatch(/Network IU/)
    expect(r.citation).toMatch(/EarthScope/)
    expect(fdsnWaveforms.hosts).toEqual([
      'service.earthscope.org',
      'service.scedc.caltech.edu',
      'service.ncedc.org',
    ])
  })

  it('says so when the data center has nothing', async () => {
    const ctx: FetchContext = { get: async () => ({ status: 204, data: new Uint8Array() }) }
    await expect(fdsnWaveforms.fetch(wq(), ctx)).rejects.toThrow(/no waveform data/)
  })
})

describe('volcano-notices', () => {
  const vq = (options: Record<string, string> = {}): ConnectorQuery =>
    q({ range: { start: '2026-10-01T00:00:00Z', end: '2026-11-30T00:00:00Z' }, options })

  it('selects notices in the period, optionally for one volcano, oldest first', () => {
    const all = JSON.parse(fx('hans-vonas.json'))
    const picked = selectNotices(all, vq())
    expect(picked.length).toBeGreaterThan(0)
    const times = picked.map((n) => n.sent_utc)
    expect([...times].sort()).toEqual(times)
    expect(
      selectNotices(all, vq({ volcano: 'Kilauea' })).every((n) => n.volcano_name === 'Kilauea'),
    ).toBe(true)
    expect(
      selectNotices(
        all,
        q({ range: { start: '2001-01-01T00:00:00Z', end: '2001-02-01T00:00:00Z' } }),
      ),
    ).toEqual([])
    expect(() => selectNotices({}, vq())).toThrow(/list of notices/)
  })

  it('brings the notice text and an alert level series', async () => {
    const { ctx, urls } = recorded([
      [/getVonasWithinLastYear/, () => fx('hans-vonas.json')],
      [/getNoticeFormatted/, () => fx('hans-vona.txt')],
    ])
    const r = await volcanoNotices.fetch(vq({ volcano: 'Kilauea' }), ctx)
    expect(urls[0]).toContain('/hans-public/api/notice/getVonasWithinLastYear')
    const entries = TextFile.parse(JSON.parse(r.files[0]!.data as string))
    expect(entries[0]!.text).toContain('VOLCANO OBSERVATORY NOTICE FOR AVIATION')
    expect(r.datasets.map((d) => d.id)).toEqual(['volcano-notices', 'vona-alert-levels'])
  })

  it('says so when no notice fits', async () => {
    const { ctx } = recorded([[/getVonasWithinLastYear/, () => '[]']])
    await expect(volcanoNotices.fetch(vq(), ctx)).rejects.toThrow(/past year/)
  })
})

describe('tsunami-events', () => {
  const tq = q({
    range: { start: '2011-01-01T00:00:00Z', end: '2011-12-31T00:00:00Z' },
    area: { label: '' },
    options: { minMagnitude: 9, eventId: '5413', country: 'USA' },
  })

  it('builds the event and runup queries', () => {
    const u = new URL(eventsUrl(tq))
    expect(u.searchParams.get('minYear')).toBe('2011')
    expect(u.searchParams.get('minEqMagnitude')).toBe('9')
    expect(() => tsunamiEvents.estimate({ ...tq, options: { eventId: '1; x' } })).toThrow(
      /event id/,
    )
    expect(() => tsunamiEvents.estimate({ ...tq, options: { country: 'usa' } })).toThrow(/country/)
  })

  it('returns events and runups with travel time in minutes', async () => {
    const { ctx } = recorded([
      [/tsunamis\/events/, () => fx('ncei-tsunami-events.json')],
      [/tsunamis\/runups/, () => fx('ncei-tsunami-runups.json')],
    ])
    const r = await tsunamiEvents.fetch(tq, ctx)
    const events = JSON.parse(r.files[0]!.data as string).features
    expect(events[0].properties.name).toMatch(/M 9.1 HONSHU ISLAND, JAPAN 2011/)
    expect(events[0].properties.time).toBe('2011-03-11T05:46:24.000Z')
    const runups = JSON.parse(r.files[1]!.data as string).features
    const nawiliwili = runups.find((f: { properties: { name: string } }) =>
      /NAWILIWILI/.test(f.properties.name),
    )
    expect(nawiliwili.properties.travelMinutes).toBe(430)
    expect(runupFeatures([{ latitude: 1, longitude: 2, locationName: 'X' }])).toHaveLength(1)
    expect(r.citation).toMatch(/National Centers for Environmental Information/)
  })
})

describe('coops-tides and ndbc-dart', () => {
  const tide = q({
    range: { start: '2011-03-11T00:00:00Z', end: '2011-03-11T23:59:00Z' },
    options: { station: '9414290' },
  })

  it('builds a station query in meters, GMT and MLLW and refuses odd stations and long periods', () => {
    const u = new URL(coopsUrl(tide, 'water_level'))
    expect(u.searchParams.get('units')).toBe('metric')
    expect(u.searchParams.get('time_zone')).toBe('gmt')
    expect(u.searchParams.get('begin_date')).toBe('20110311')
    expect(() => coopsUrl({ ...tide, options: { station: '94142;' } }, 'water_level')).toThrow(
      /station/,
    )
    expect(() =>
      coopsUrl(
        { ...tide, range: { start: '2011-01-01T00:00:00Z', end: '2011-04-01T00:00:00Z' } },
        'water_level',
      ),
    ).toThrow(/31 days/)
  })

  it('returns the observed water level and the predicted tide as series', async () => {
    const { ctx } = recorded([
      [/product=water_level/, () => fx('coops-water-level.json')],
      [/product=predictions/, () => fx('coops-predictions.json')],
    ])
    const r = await coopsTides.fetch(tide, ctx)
    expect(r.datasets.map((d) => d.id)).toEqual(['tide-9414290-observed', 'tide-9414290-predicted'])
    const observed = SeriesFile.parse(JSON.parse(r.files[0]!.data as string))
    expect(observed[0]!.t).toBe('2011-03-11T00:00:00.000Z')
    expect(observed.length).toBeGreaterThan(200)
  })

  it('reports a CO-OPS error plainly', async () => {
    const { ctx } = recorded([[/datagetter/, () => '{"error":{"message":"No data was found."}}']])
    await expect(coopsTides.fetch(tide, ctx)).rejects.toThrow(/No data was found/)
  })

  it('reads a DART year file, keeps the period and skips missing readings', async () => {
    const dq = q({
      range: { start: '2011-03-11T05:00:00Z', end: '2011-03-11T12:00:00Z' },
      options: { station: '46404' },
    })
    expect(dartUrl('46404', 2011)).toBe(
      'https://www.ndbc.noaa.gov/data/historical/dart/46404t2011.txt.gz',
    )
    const gz = gzipSync(Buffer.from(fx('ndbc-dart-46404-2011.txt')))
    const { ctx } = recorded([[/dart\/46404t2011/, () => new Uint8Array(gz)]])
    const r = await ndbcDart.fetch(dq, ctx)
    const pts = SeriesFile.parse(JSON.parse(r.files[0]!.data as string))
    expect(pts.length).toBeGreaterThan(10)
    expect(
      pts.every((p) => p.t >= '2011-03-11T05:00:00.000Z' && p.t <= '2011-03-11T12:00:00.000Z'),
    ).toBe(true)
    expect(
      parseDart('2011 03 11 05 00 00 1 9999.000\n2011 03 11 05 15 00 1 2736.5\n', dq.range),
    ).toHaveLength(1)
    expect(() => ndbcDart.estimate({ ...dq, options: { station: 'abc' } })).toThrow(/DART buoy/)
  })
})

describe('quaternary-faults and landslide-assessments', () => {
  it('limits the fault area and names faults', async () => {
    expect(() => faultsUrl([-130, 40, -120, 49])).toThrow(/6 degrees/)
    expect(() => quaternaryFaults.estimate(q({ area: { label: '' } }))).toThrow(/area/)
    const { ctx } = recorded([[/Qfaults\/MapServer\/21\/query/, () => fx('qfaults.geojson')]])
    const r = await quaternaryFaults.fetch(
      q({ area: { label: 'x', bbox: [-123, 46.8, -122, 47.5] } }),
      ctx,
    )
    const features = JSON.parse(r.files[0]!.data as string).features
    expect(features.length).toBeGreaterThan(5)
    expect(features[0].properties.name).toBeTruthy()
  })

  it('reads the thresholds of a post-fire assessment as plain lines', () => {
    const lines = thresholdLines(fx('sciencebase-thresholds.csv'))
    expect(lines[0]).toMatch(
      /^Segments: 15 minutes: 7\.6 mm \(50% likelihood of a debris flow\), 9\.9 mm \(75%\); 30 minutes: 11\.9 mm/,
    )
    expect(lines).toHaveLength(2)
  })

  it('finds the assessment, brings its summary and thresholds and links the shapefiles', async () => {
    const { ctx } = recorded([
      [/catalog\/items\?/, () => fx('sciencebase-search.json')],
      [/catalog\/item\/[0-9a-f]{24}/, () => fx('sciencebase-item.json')],
      [/catalog\/file\/get/, () => fx('sciencebase-thresholds.csv')],
    ])
    const r = await landslideAssessments.fetch(q({ options: { fire: 'Lava' } }), ctx)
    const text = TextFile.parse(JSON.parse(r.files[0]!.data as string))[0]!.text
    expect(text).toContain('Median rainfall accumulation thresholds')
    expect(text).toContain('Hazard polygons are in the item')
    expect(() => landslideAssessments.estimate(q({ options: { fire: "x'; drop" } }))).toThrow(
      /fire name/,
    )
    expect(decode(bytes('ok'))).toBe('ok')
  })
})

describe.skipIf(process.env.LIVE !== '1')('live (opt-in, LIVE=1; never in CI)', () => {
  it('finds the 2001 Nisqually earthquake in the real catalog', async () => {
    const res = await fetch(catalogUrl(q({ options: { minMagnitude: 6 } })))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { features: { id: string }[] }
    expect(body.features.map((f) => f.id)).toContain('uw10530748')
  })
})
