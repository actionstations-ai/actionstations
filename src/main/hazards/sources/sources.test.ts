// Parsers and URL builders for each hazard source, against fixtures. No network.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCsv } from './csv'
import * as fx from './fixtures'
import { clampDays, firmsUrl, isValidMapKey, maskedFirmsUrl, parseFires } from './firms'
import { pointsFromCsv, pointsFromGeoJson, toLayer } from './infrastructure'
import { importLayerFile, runLayerWorker } from './layer-host'
import { alertsUrl, forecastUrlOf, parseAlerts, parseForecast } from './nws'
import { declarationsUrl, parseDeclarations } from './openfema'
import { clampQuery, historicalUrl, parseQuakes, recentUrl } from './usgs'
import { haversineKm, roundTo } from './util'

describe('rounding what leaves the computer', () => {
  it('rounds to 0.01 degrees by default', () => {
    expect(roundTo(41.87811, 0.01)).toBe(41.88)
    expect(roundTo(-87.62979, 0.01)).toBe(-87.63)
  })
  it('rounds to 0.1 degrees when asked', () => {
    expect(roundTo(41.87811, 0.1)).toBe(41.9)
    expect(roundTo(-87.62979, 0.1)).toBe(-87.6)
  })
  it('measures distance between two points', () => {
    expect(haversineKm(41.88, -87.63, 41.88, -87.63)).toBe(0)
    expect(haversineKm(41.88, -87.63, 42.88, -87.63)).toBeCloseTo(111.2, 0)
  })
})

describe('NWS', () => {
  it('builds the alerts URL from rounded coordinates', () => {
    expect(alertsUrl(41.88, -87.63)).toBe(
      'https://api.weather.gov/alerts/active?point=41.88,-87.63',
    )
  })
  it('keeps alerts that name an event and falls back to the event as headline', () => {
    const alerts = parseAlerts(JSON.stringify(fx.NWS_ALERTS))
    expect(alerts.map((a) => a.event)).toEqual(['Flood Watch', 'Wind Advisory'])
    expect(alerts[0]).toMatchObject({ severity: 'Moderate', urgency: 'Future' })
    expect(alerts[1]!.headline).toBe('Wind Advisory')
  })
  it('reads the forecast URL and the periods', () => {
    expect(forecastUrlOf(JSON.stringify(fx.NWS_POINTS))).toContain('/gridpoints/LOT/')
    const periods = parseForecast(JSON.stringify(fx.NWS_FORECAST))
    expect(periods[0]).toMatchObject({ name: 'Tonight', temperature: 44, unit: 'F' })
  })
  it('rejects a body that is not JSON without echoing it', () => {
    expect(() => parseAlerts('<html>blocked</html>')).toThrow(/valid JSON/)
  })
  it('cuts long text and removes control characters', () => {
    const long = 'x'.repeat(900) + '\u0007'
    const [a] = parseAlerts(JSON.stringify({ features: [{ properties: { event: long } }] }))
    expect(a!.event.length).toBe(120)
  })
})

describe('USGS', () => {
  const lat = 41.88
  const lon = -87.63
  it('asks for the past 30 days at 2.5 and 250 km by default', () => {
    const url = new URL(
      recentUrl(lat, lon, { radiusKm: 250, minMagnitude: 2.5 }, new Date('2026-10-29T00:00:00Z')),
    )
    expect(url.host).toBe('earthquake.usgs.gov')
    expect(url.searchParams.get('starttime')).toBe('2026-09-29')
    expect(url.searchParams.get('maxradiuskm')).toBe('250')
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.get('latitude')).toBe('41.88')
  })
  it('asks for the 50 largest since 1975 for the historical query', () => {
    const url = new URL(historicalUrl(lat, lon, { radiusKm: 150, minMagnitude: 4.5 }))
    expect(url.searchParams.get('starttime')).toBe('1975-01-01')
    expect(url.searchParams.get('orderby')).toBe('magnitude')
    expect(url.searchParams.get('limit')).toBe('50')
  })
  it('keeps radius within 10-500 km', () => {
    expect(clampQuery({ radiusKm: 5000, minMagnitude: 2 }).radiusKm).toBe(500)
    expect(clampQuery({ radiusKm: 1, minMagnitude: 2 }).radiusKm).toBe(10)
  })
  it('parses quakes, computes distance and skips broken features', () => {
    const quakes = parseQuakes(JSON.stringify(fx.USGS_QUAKES), lat, lon, 100)
    expect(quakes).toHaveLength(2)
    expect(quakes[0]).toMatchObject({ id: 'us7000abcd', mag: 3.1, depthKm: 8.4 })
    expect(quakes[0]!.distanceKm).toBeGreaterThan(5)
    expect(quakes[1]!.depthKm).toBeUndefined()
    expect(quakes[0]!.time).toMatch(/^2025-/)
  })
})

describe('FIRMS', () => {
  const KEY = 'firmskeyfortests0001'
  it('accepts only letters and digits in a map key', () => {
    expect(isValidMapKey(KEY)).toBe(true)
    expect(isValidMapKey('short')).toBe(false)
    expect(isValidMapKey('firmskeyfortests0001/../../x')).toBe(false)
  })
  it('puts the key in the path and a box of +-0.5 degrees around the point', () => {
    expect(firmsUrl(KEY, 41.88, -87.63, 3)).toBe(
      `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${KEY}/VIIRS_SNPP_NRT/-88.13,41.38,-87.13,42.38/3`,
    )
  })
  it('stores the URL with <MAP_KEY> instead of the key', () => {
    expect(maskedFirmsUrl(41.88, -87.63, 3)).toContain('/<MAP_KEY>/')
    expect(maskedFirmsUrl(41.88, -87.63, 3)).not.toContain(KEY)
  })
  it('keeps days within 1-5', () => {
    expect(clampDays(0)).toBe(1)
    expect(clampDays(30)).toBe(5)
  })
  it('counts detections and reports the nearest', () => {
    const fires = parseFires(fx.FIRMS_CSV, 41.88, -87.63, 3)
    expect(fires.count).toBe(2)
    expect(fires.nearestKm).toBeLessThan(5)
    expect(fires.detections[0]).toMatchObject({ acqDate: '2026-10-28', confidence: 'n', frp: 3.4 })
  })
  it('treats an empty answer as no detections', () => {
    expect(parseFires('', 41.88, -87.63, 3).count).toBe(0)
  })
  it('refuses an error text in place of data', () => {
    expect(() => parseFires('Invalid MAP_KEY.', 41.88, -87.63, 3)).toThrow(/map key/)
  })
})

describe('OpenFEMA', () => {
  it('builds the filter from validated FIPS digits', () => {
    const url = declarationsUrl('17', '031')
    expect(decodeURIComponent(url)).toContain("fipsStateCode eq '17' and fipsCountyCode eq '031'")
    expect(url).toContain('$top=200')
  })
  it('uses the state alone when there is no county', () => {
    expect(decodeURIComponent(declarationsUrl('17'))).not.toContain('fipsCountyCode')
  })
  it('refuses anything but digits (no OData injection)', () => {
    expect(() => declarationsUrl("17' or 1 eq 1 or '", '031')).toThrow()
    expect(() => declarationsUrl('17', "0'1")).toThrow()
  })
  it('keeps one row per disaster number, newest first as returned', () => {
    const rows = parseDeclarations(JSON.stringify(fx.OPENFEMA))
    expect(rows.map((r) => r.disasterNumber)).toEqual([4749, 3500])
    expect(rows[0]).toMatchObject({ incidentType: 'Flood', declarationType: 'DR' })
  })
})

describe('layer import', () => {
  it('reads GeoJSON points and CSV rows with quoted commas', () => {
    expect(pointsFromGeoJson(JSON.stringify(fx.LAYER_GEOJSON))).toHaveLength(2)
    expect(pointsFromCsv(fx.LAYER_CSV)[0]).toMatchObject({
      name: 'Harbor, North',
      type: 'Pump station',
    })
    expect(parseCsv('a,b\r\n"x""y",2\r\n')).toEqual([
      ['a', 'b'],
      ['x"y', '2'],
    ])
  })
  it('refuses a file that is not a FeatureCollection', () => {
    expect(() => pointsFromGeoJson('{"type":"Point"}')).toThrow(/FeatureCollection/)
  })
  it('keeps features inside the radius, nearest first, with coordinates at 0.01 degrees', () => {
    const layer = toLayer(
      pointsFromGeoJson(JSON.stringify(fx.LAYER_GEOJSON)),
      { lat: 41.88, lon: -87.63 },
      {
        layer: 'Hospitals',
        source: 'HIFLD archive, Hospitals',
        radiusKm: 50,
      },
    )
    expect(layer.features).toHaveLength(1)
    expect(layer.features[0]).toMatchObject({ name: 'Lakeside General', lat: 41.88, lon: -87.63 })
    expect(layer.source).toBe('HIFLD archive, Hospitals')
  })
  it('imports a file from disk and skips rows with bad coordinates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-layer-'))
    const file = join(dir, 'pumps.csv')
    writeFileSync(file, fx.LAYER_CSV + 'Bad,Pump station,999,-87.6\n')
    const layer = await importLayerFile(
      file,
      { lat: 41.88, lon: -87.63 },
      { layer: 'Pumps', source: 'x', radiusKm: 50 },
    )
    expect(layer.features.map((f) => f.name)).toEqual(['Harbor, North'])
  })
})

describe('layer worker host', () => {
  const request = {
    file: 'x.csv',
    where: { lat: 41.88, lon: -87.63 },
    input: { layer: 'Pumps', source: 'x', radiusKm: 50 },
  }
  const script = (body: string): string => {
    const file = join(mkdtempSync(join(tmpdir(), 'ttx-layer-worker-')), 'w.mjs')
    writeFileSync(file, body)
    return file
  }

  it('returns the layer a worker posts', async () => {
    const layer = { layer: 'Pumps', source: 'x', features: [] }
    const file = script(
      `import { parentPort } from 'node:worker_threads'\nparentPort.postMessage({ ok: true, layer: ${JSON.stringify(layer)} })`,
    )
    await expect(runLayerWorker(file, request)).resolves.toEqual(layer)
  })
  it('turns a worker error reply into an AppError with its code', async () => {
    const file = script(
      `import { parentPort } from 'node:worker_threads'\nparentPort.postMessage({ ok: false, code: 'VALIDATION', message: 'bad file' })`,
    )
    await expect(runLayerWorker(file, request)).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'bad file',
    })
  })
  it('stops a worker that never answers', async () => {
    const file = script('setInterval(() => {}, 1000)')
    await expect(runLayerWorker(file, request, 200)).rejects.toThrow(/took too long/)
  })
  it('reports a worker that crashes', async () => {
    const file = script('throw new Error("boom")')
    await expect(runLayerWorker(file, request)).rejects.toThrow(/crashed/)
  })
})
