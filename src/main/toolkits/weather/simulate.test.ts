// The simulated weather events (#662): the same parameters give the same data, the data agree with
// each other (the warning covers the tornado, the sounding fits the storm mode, the radar shows
// the rotation and the debris), every frame draws in its figure, and the framework labels it all
// simulated.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { GroundTruthEvent, ModeledSeries } from '@shared/schemas/metrics'
import { surfaceParcel } from '../../render/figures/weather/thermo'
import { generateConvective, ConvectiveParams, countyName } from './simulate'
import { generateTropical, TropicalParams, TS_FORCE_KT, windAtRadius } from './simulate-tropical'
import { simulatedLevels, soundingIndices } from './simulate-env'
import { kinematics } from '../../render/figures/weather/thermo'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1',
    isPackaged: false,
    getAppPath: () => resolve('.'),
    getPath: () => tmpdir(),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')
const { renderFigure } = await import('../../render/figures')
const { runGenerator, generatorIds } = await import('../../case-data/generators')
const { caseDir, readManifest } = await import('../../case-data/store')

const params = (over: Record<string, unknown> = {}) =>
  ConvectiveParams.parse({
    start: '2026-05-12T19:00:00Z',
    durationMin: 120,
    stepMin: 10,
    radar: { lat: 39.42, lon: -83.82, id: 'KSIM' },
    extentKm: 120,
    storm: {
      mode: 'supercell',
      startBearingDeg: 250,
      startRangeKm: 90,
      motionFromDeg: 280,
      speedKt: 30,
      tornado: { startMin: 60, endMin: 80, rating: 'EF2' },
    },
    ...over,
  })

const byId = (d: ReturnType<typeof generateConvective>, id: string) => d.find((x) => x.id === id)!
const frames = (d: ReturnType<typeof generateConvective>, id: string) =>
  (
    byId(d, id).data as {
      features: { properties: { start: string; end: string; data: unknown } }[]
    }
  ).features

describe('simulated convective event', () => {
  const data = generateConvective(params())

  it('is deterministic', () => {
    expect(JSON.stringify(generateConvective(params()))).toBe(JSON.stringify(data))
  })

  it('makes radar frames for three products, chained across the period', () => {
    expect(data.map((d) => d.id)).toEqual([
      'radar-ksim-ref',
      'radar-ksim-vel',
      'radar-ksim-cc',
      'storm-reports',
      'warnings',
      'soundings-sim',
      'meso-cape',
      'meso-shear',
      'model-temp',
      'observations-sim',
    ])
    const f = frames(data, 'radar-ksim-ref')
    expect(f).toHaveLength(13)
    expect(f[0]!.properties.end).toBe(f[1]!.properties.start)
    expect(f[12]!.properties.end).toBe('2026-05-12T21:00:00.000Z')
  })

  it('draws reflectivity that follows the storm and peaks near the set value', () => {
    const early = renderFigure({
      kind: 'radar',
      data: frames(data, 'radar-ksim-ref')[0]!.properties.data,
    })
    expect(early.summary).toMatch(/Reflectivity from radar KSIM .* simulated data/)
    const peak = /Peak reflectivity is (\d+) dBZ/.exec(early.summary)!
    expect(Number(peak[1])).toBeGreaterThanOrEqual(58)
    expect(Number(peak[1])).toBeLessThanOrEqual(68)
    expect(early.summary).toMatch(/Echoes of 50 dBZ or more cover about \d+ km2/)
  })

  it('shows a strong change in velocity across the mesocyclone during the tornado and less before it', () => {
    const f = frames(data, 'radar-ksim-vel')
    const change = (i: number): number => {
      const s = renderFigure({ kind: 'radar', data: f[i]!.properties.data }).summary
      return Number(/Velocity changes by (\d+) kt/.exec(s)?.[1] ?? 0)
    }
    expect(change(7)).toBeGreaterThanOrEqual(60)
    expect(change(7)).toBeGreaterThan(change(0))
  })

  it('shows a debris signature in correlation coefficient only while the tornado is on the ground', () => {
    const f = frames(data, 'radar-ksim-cc')
    const low = (i: number) => {
      const s = renderFigure({ kind: 'radar', data: f[i]!.properties.data }).summary
      return Number(/lowest correlation coefficient is (0\.\d+)/.exec(s)![1])
    }
    expect(low(7)).toBeLessThan(0.8)
    expect(low(2)).toBeGreaterThan(0.85)
  })

  it('reports the tornado along the track, as events with county areas', () => {
    const reports = byId(data, 'storm-reports').data as { events: unknown[]; features: unknown[] }
    const events = reports.events.map((e) => GroundTruthEvent.parse(e))
    const tornadoes = events.filter((e) => e.kind === 'tornado')
    expect(tornadoes).toHaveLength(3)
    expect(
      tornadoes.every(
        (e) => e.time >= '2026-05-12T20:00:00.000Z' && e.time <= '2026-05-12T20:30:00.000Z',
      ),
    ).toBe(true)
    expect(tornadoes[0]!.attrs.magnitude).toBe('EF2')
    expect(tornadoes[0]!.area).toMatch(/^County [A-Z]\d+$/)
    expect(reports.features).toHaveLength(events.length)
    expect(events.some((e) => e.kind === 'hail')).toBe(true)
  })

  it('issues a tornado warning that leads the tornado and covers its reports', () => {
    const w = (
      byId(data, 'warnings').data as {
        features: {
          geometry: { coordinates: number[][][] }
          properties: { start: string; end: string; phenomena: string }
        }[]
      }
    ).features
    expect(w).toHaveLength(1)
    expect(w[0]!.properties.phenomena).toBe('TO')
    expect(w[0]!.properties.start).toBe('2026-05-12T19:48:00.000Z')
    const reports = (
      byId(data, 'storm-reports').data as {
        events: { kind: string; attrs: { lat: number; lon: number } }[]
      }
    ).events.filter((e) => e.kind === 'tornado')
    const ring = w[0]!.geometry.coordinates[0]!
    const inside = (lon: number, lat: number): boolean => {
      let c = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!
        const [xj, yj] = ring[j]!
        if (yi! > lat !== yj! > lat && lon < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) c = !c
      }
      return c
    }
    expect(reports.every((r) => inside(r.attrs.lon, r.attrs.lat))).toBe(true)
  })

  it('draws a severe thunderstorm warning for a storm without a tornado, and none for a weak one', () => {
    const hail = generateConvective(params({ storm: { ...params().storm, tornado: undefined } }))
    expect(
      (byId(hail, 'warnings').data as { features: { properties: { phenomena: string } }[] })
        .features[0]!.properties.phenomena,
    ).toBe('SV')
    const weak = generateConvective(
      params({ storm: { ...params().storm, tornado: undefined, peakDbz: 50 } }),
    )
    expect((byId(weak, 'warnings').data as { features: unknown[] }).features).toHaveLength(0)
    expect(frames(weak, 'radar-ksim-ref')).toHaveLength(13)
  })

  it('makes a sounding and grids that fit the storm mode', () => {
    expect(soundingIndices('supercell').cape).toBeGreaterThan(2000)
    expect(soundingIndices('supercell').shear06Kt).toBeGreaterThan(40)
    expect(soundingIndices('supercell').srh03).toBeGreaterThan(200)
    expect(soundingIndices('multicell').shear06Kt).toBeLessThan(30)
    expect(soundingIndices('line').shear06Kt).toBeGreaterThan(
      soundingIndices('multicell').shear06Kt,
    )
    expect(surfaceParcel(simulatedLevels('line'))!.cape).toBeGreaterThan(1000)
    expect(kinematics(simulatedLevels('supercell'))!.srh01).toBeGreaterThan(50)
    const sounding = renderFigure({
      kind: 'skew_t',
      data: frames(data, 'soundings-sim')[0]!.properties.data,
    })
    expect(sounding.summary).toMatch(/simulated data/)
    const meso = renderFigure({
      kind: 'mesoanalysis',
      data: frames(data, 'meso-cape')[1]!.properties.data,
    })
    expect(meso.summary).toMatch(/The maximum is \d+ J\/kg/)
    expect(frames(data, 'meso-cape')).toHaveLength(3)
    expect(
      renderFigure({ kind: 'model_panel', data: frames(data, 'model-temp')[2]!.properties.data })
        .summary,
    ).toMatch(/forecast hour 2/)
  })

  it('makes observations with a wind and pressure signature at the passage', () => {
    const obs = renderFigure({
      kind: 'meteogram',
      data: frames(data, 'observations-sim')[0]!.properties.data,
    })
    expect(obs.summary).toMatch(/The highest gust is \d+ kt/)
    expect(obs.summary).toMatch(/Temperature ranges from/)
  })

  it('names counties on a 25 km grid', () => {
    expect(countyName(0, 0)).toBe('County N13')
    expect(countyName(30, 0)).toBe('County O13')
  })

  it('refuses too many frames and a tornado that ends before it starts', () => {
    expect(() => generateConvective(params({ durationMin: 360, stepMin: 2 }))).toThrow(
      /most is 144/,
    )
    expect(() =>
      params({ storm: { ...params().storm, tornado: { startMin: 50, endMin: 40 } } }),
    ).toThrow(/end after it starts/)
  })

  it('runs through the generator registry and is labeled simulated', async () => {
    expect(generatorIds()).toEqual(
      expect.arrayContaining(['weather-convective', 'weather-tropical-cyclone']),
    )
    const root = mkdtempSync(join(tmpdir(), 'ttx-wx-sim-'))
    const manifest = await runGenerator(
      root,
      'scn-1',
      'weather-convective',
      params({ durationMin: 60, stepMin: 15 }),
      { maxMbPerScenario: 500 },
    )
    expect(manifest.datasets).toHaveLength(10)
    expect(
      manifest.datasets.every(
        (d) =>
          d.provenance.origin === 'simulated' && d.provenance.generator === 'weather-convective',
      ),
    ).toBe(true)
    expect(readFileSync(join(caseDir(root, 'scn-1'), 'warnings.geojson'), 'utf8')).toContain(
      'Tornado Warning',
    )
    expect(
      (await readManifest(root, 'scn-1'))!.datasets.reduce((n, d) => n + d.bytes, 0),
    ).toBeLessThan(20_000_000)
  })
})

describe('simulated tropical cyclone', () => {
  const tp = TropicalParams.parse({
    start: '2026-09-10T00:00:00Z',
    hours: 72,
    track: { startLat: 24, startLon: -90, landfallLat: 29.4, landfallLon: -89.2, landfallHour: 48 },
    intensity: { startKt: 50, peakKt: 115, peakHour: 40 },
    rmaxKm: 35,
    places: [
      { name: 'Coastal Zone A', lat: 29.2, lon: -89.5 },
      { name: 'Inland Zone B', lat: 31.2, lon: -89.0 },
      { name: 'Far Zone C', lat: 33.9, lon: -85.0 },
    ],
  })
  const out = generateTropical(tp)

  it('is deterministic and makes a track and the wind at places', () => {
    expect(JSON.stringify(generateTropical(tp))).toBe(JSON.stringify(out))
    expect(out.map((d) => d.id)).toEqual(['track-marlena-sim', 'wind-at-places'])
    const f = (
      out[0]!.data as {
        features: { geometry: { type: string }; properties: { status?: string } }[]
      }
    ).features
    expect(f[0]!.geometry.type).toBe('LineString')
    expect(f).toHaveLength(1 + 25)
    expect(f.some((x) => x.properties.status === 'HU')).toBe(true)
  })

  it('has winds that peak where the storm passes and ground-truth arrival events that validate', () => {
    const wind = out[1]!.data as { series: unknown[]; events: unknown[] }
    const series = wind.series.map((s) => ModeledSeries.parse(s))
    const peak = (zone: string) =>
      Math.max(...series.find((s) => s.zone === zone)!.points.map((p) => p.value))
    expect(peak('Coastal Zone A')).toBeGreaterThan(90)
    expect(peak('Coastal Zone A')).toBeGreaterThan(peak('Inland Zone B'))
    expect(peak('Inland Zone B')).toBeGreaterThan(peak('Far Zone C'))
    const events = wind.events.map((e) => GroundTruthEvent.parse(e))
    const a = events.find((e) => e.area === 'Coastal Zone A')!
    expect(a.kind).toBe('tropical_storm_wind_arrival')
    expect(a.attrs.thresholdKt).toBe(TS_FORCE_KT)
    const series0 = series.find((s) => s.zone === 'Coastal Zone A')!.points
    const before = series0.filter((p) => p.time < a.time).at(-1)!
    expect(before.value).toBeLessThan(TS_FORCE_KT)
    expect(series0.find((p) => p.time === a.time)!.value).toBeGreaterThanOrEqual(TS_FORCE_KT)
  })

  it('uses a wind profile that rises to the radius of maximum wind and decays beyond it', () => {
    expect(windAtRadius(100, 40, 20)).toBe(50)
    expect(windAtRadius(100, 40, 40)).toBe(100)
    expect(windAtRadius(100, 40, 160)).toBeLessThan(45)
  })

  it('refuses an impossible storm', () => {
    expect(() =>
      TropicalParams.parse({ ...tp, intensity: { ...tp.intensity, peakHour: 60 } }),
    ).toThrow(/peaks at or before landfall/)
    expect(() => TropicalParams.parse({ ...tp, hours: 40 })).toThrow(/run past landfall/)
  })
})
