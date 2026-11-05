// The simulated earth science events (spec 0450 FR-11, testing section): intensities fall with
// distance, the aftershock sequence agrees with the forecast's expected numbers, early warning is
// late near the epicenter, unrest ends in an eruption or does not, tsunami times grow with
// distance, debris flows follow the rainfall threshold, every generator runs through the real
// case-data pipeline (labeled simulated), and the datasets draw the figures.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    isPackaged: false,
    getAppPath: () => resolve('.'),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const models = await import('./models')
const gens = await import('./generators')
const { runGenerator, generatorIds } = await import('../../../case-data/generators')
const { caseDir } = await import('../../../case-data/store')
const { registerGeoscienceToolkits } = await import('../../geoscience/register')
const { renderFigure } = await import('../../../render/figures')
const data = await import('../figure-data')
const { readGroundTruth, readModeledSeries } = await import('../../../evaluation/metrics/inputs')
const { runMetric } = await import('../../../evaluation/metrics/registry')

const ORIGIN = '2026-11-05T14:22:07Z'
const quakeParams = gens.EarthquakeParams.parse({
  name: 'Haldane',
  epicenter: { lon: -124.1, lat: 46.82 },
  magnitude: 6.8,
  depthKm: 18,
  originTime: ORIGIN,
  strikeDeg: 20,
  places: [
    { name: 'Near', lon: -124.12, lat: 46.9 },
    { name: 'Mid', lon: -123.6, lat: 46.9 },
    { name: 'Far', lon: -122.2, lat: 47.3 },
  ],
})
const byId = (sets: ReturnType<typeof gens.simulateEarthquake>, id: string) =>
  sets.find((d) => d.id === id)!.data as {
    features: { geometry: { coordinates: number[] }; properties: Record<string, number | string> }[]
  }

describe('models', () => {
  it('gives the rupture length of Wells and Coppersmith (1994)', () => {
    expect(models.ruptureLengthKm(6.8)).toBeCloseTo(10 ** (-2.44 + 0.59 * 6.8), 6)
    expect(models.ruptureLengthKm(6.8)).toBeGreaterThan(30)
    expect(models.ruptureLengthKm(6.8)).toBeLessThan(45)
  })

  it('lowers intensity with distance and raises it with magnitude', () => {
    let last = 11
    for (const d of [0, 10, 30, 70, 150, 300, 600]) {
      const i = models.intensityAt(6.8, d)
      expect(i).toBeLessThanOrEqual(last)
      last = i
    }
    expect(models.intensityAt(7.8, 50)).toBeGreaterThan(models.intensityAt(6.8, 50))
    expect(models.intensityAt(6.8, 10)).toBeGreaterThanOrEqual(7.5)
    expect(models.intensityAt(6.8, 150)).toBeLessThanOrEqual(5.5)
  })

  it('integrates the Omori rate exactly', () => {
    const [m, min] = [7, 4]
    let sum = 0
    const steps = 200_000
    const dt = 10 / steps
    for (let i = 0; i < steps; i++)
      sum +=
        10 ** (models.GENERIC_AFTERSHOCKS.a + models.GENERIC_AFTERSHOCKS.b * (m - min)) *
        (i * dt + dt / 2 + models.GENERIC_AFTERSHOCKS.c) ** -models.GENERIC_AFTERSHOCKS.p *
        dt
    expect(models.expectedAftershocks(m, min, 0, 10)).toBeCloseTo(sum, 1)
  })

  it('forecasts more chance for longer windows and smaller aftershocks', () => {
    const f = models.aftershockForecast(7, 0.25)
    for (const w of f)
      for (let i = 1; i < w.rows.length; i++)
        expect(w.rows[i]!.chance).toBeLessThanOrEqual(w.rows[i - 1]!.chance)
    for (let w = 1; w < f.length; w++)
      for (let i = 0; i < f[w]!.rows.length; i++)
        expect(f[w]!.rows[i]!.chance).toBeGreaterThanOrEqual(f[w - 1]!.rows[i]!.chance)
    expect(models.percentText(0.999)).toBe('>99%')
    expect(models.percentText(0.004)).toBe('<1%')
    expect(models.percentText(0.126)).toBe('13%')
    expect(models.expectedRangeText(0)).toBe('0')
  })

  it('draws a sequence whose counts agree with the forecast numbers', () => {
    const mainMag = 7.9
    const events = models.sampleAftershocks(mainMag, 3, 30, 42)
    const within = (a: number, b: number, m: number): number =>
      events.filter((e) => e.t >= a && e.t < b && e.magnitude >= m).length
    for (const [a, b, m] of [
      [0, 30, 3],
      [0, 1, 3],
      [1, 7, 3],
      [7, 30, 3],
      [0, 30, 5],
    ] as const) {
      const expected = models.expectedAftershocks(mainMag, m, a, b)
      const observed = within(a, b, m)
      // Poisson noise, four standard deviations, plus rounding of magnitudes to 0.1.
      expect(
        Math.abs(observed - expected),
        `${a}-${b} M${m}: ${observed} vs ${expected.toFixed(1)}`,
      ).toBeLessThanOrEqual(4 * Math.sqrt(expected) + 0.05 * expected + 2)
    }
    expect(Math.max(...events.map((e) => e.magnitude))).toBeLessThan(mainMag)
    expect(models.sampleAftershocks(mainMag, 3, 30, 42)).toEqual(events)
    expect(models.sampleAftershocks(mainMag, 3, 30, 43)).not.toEqual(events)
  })

  it('handles an Omori exponent of exactly one', () => {
    const e = models.sampleAftershocks(6.5, 3, 10, 5, { a: -1.67, b: 0.91, p: 1, c: 0.05 })
    expect(e.length).toBeGreaterThan(0)
    expect(e.every((x) => x.t >= 0 && x.t <= 10.01)).toBe(true)
  })

  it('times early warning from the shear wave and the alert delay', () => {
    const near = models.eewTimes('Near', 8, 15)
    const far = models.eewTimes('Far', 200, 15)
    expect(near.warningSec).toBeLessThan(0)
    expect(far.warningSec).toBeGreaterThan(40)
    expect(far.shakingSec).toBeCloseTo(Math.hypot(200, 15) / 3.5, 0)
  })

  it('times tsunami arrival from distance and depth', () => {
    expect(models.tsunamiMinutes(700, 4000)).toBeGreaterThan(models.tsunamiMinutes(350, 4000))
    expect(models.tsunamiMinutes(700, 1000)).toBeGreaterThan(models.tsunamiMinutes(700, 4000))
    expect(models.tsunamiSpeedKmS(4000)).toBeCloseTo(0.198, 2)
  })
})

describe('simulated earthquake', () => {
  const sets = gens.simulateEarthquake(quakeParams)

  it('produces the seven datasets', () => {
    expect(sets.map((d) => d.id)).toEqual([
      'sim-quake-event',
      'sim-shakemap-grid',
      'sim-places-shaking',
      'sim-quake-events',
      'sim-shaking-series',
      'sim-aftershocks',
      'sim-aftershock-forecast',
    ])
  })

  it('has intensity falling with distance from the rupture, in the grid and at places', () => {
    const places = byId(sets, 'sim-places-shaking').features.map((f) => f.properties)
    const mmi = (n: string): number => Number(places.find((p) => p.name === n)!.mmi)
    expect(mmi('Near')).toBeGreaterThan(mmi('Mid'))
    expect(mmi('Mid')).toBeGreaterThan(mmi('Far'))
    const grid = (
      byId(sets, 'sim-shakemap-grid').features[0]!.properties as unknown as {
        grid: { values: number[]; cols: number; rows: number }
      }
    ).grid
    expect(grid.values).toHaveLength(grid.cols * grid.rows)
    expect(Math.max(...grid.values)).toBeGreaterThanOrEqual(8)
    expect(Math.min(...grid.values)).toBeLessThan(5)
  })

  it('has early warning late near the epicenter and in time far away', () => {
    const p = byId(sets, 'sim-places-shaking').features.map((f) => f.properties)
    expect(Number(p.find((x) => x.name === 'Near')!.warningSec)).toBeLessThan(0)
    expect(Number(p.find((x) => x.name === 'Far')!.warningSec)).toBeGreaterThan(20)
  })

  it('gives a forecast text and a sequence that agree', () => {
    const forecast = (
      sets.find((d) => d.id === 'sim-aftershock-forecast')!.data as { text: string }[]
    )[0]!.text
    expect(forecast).toContain('Next 1 Day')
    expect(forecast).toContain('chances, not predictions')
    const events = byId(sets, 'sim-aftershocks').features
    const m3 = events.filter((e) => Number(e.properties.magnitude) >= 3).length
    const expected = models.expectedAftershocks(6.8, 3, 0, 30)
    expect(Math.abs(m3 - expected)).toBeLessThanOrEqual(4 * Math.sqrt(expected) + 3)
  })

  it('is the same for the same seed', () => {
    expect(JSON.stringify(gens.simulateEarthquake(quakeParams))).toBe(JSON.stringify(sets))
  })
})

describe('simulated volcanic unrest', () => {
  const p = gens.UnrestParams.parse({
    volcano: { name: 'Mount Hollis', lon: -121.76, lat: 46.87 },
    startTime: '2026-10-22T00:00:00Z',
    days: 30,
    eruptionDay: 24,
  })
  const levels = (sets: ReturnType<typeof gens.simulateUnrest>) =>
    (
      sets.find((d) => d.id === 'sim-unrest-alert-level')!.data as {
        t: string
        v: { level: number }
      }[]
    ).map((x) => x.v.level)

  it('rises to an eruption: level 0 at the start, 3 at onset, ground deformation grows', () => {
    const sets = gens.simulateUnrest(p)
    const l = levels(sets)
    expect(l[0]).toBe(0)
    expect(Math.max(...l)).toBe(3)
    const onsetIndex = 24 * 4
    expect(l[onsetIndex]).toBe(3)
    expect(l.slice(0, onsetIndex).every((x) => x < 3)).toBe(true)
    const gps = sets.find((d) => d.id === 'sim-unrest-gps')!.data as { v: number }[]
    expect(gps[gps.length - 1]!.v).toBeGreaterThan(gps[0]!.v + 3)
    const eruption = sets.find((d) => d.id === 'sim-unrest-eruption')!.data as {
      features: { properties: { time: string } }[]
    }
    expect(eruption.features[0]!.properties.time).toBe('2026-11-15T00:00:00.000Z')
  })

  it('can also fail to erupt: the level never reaches warning and no eruption is recorded', () => {
    const sets = gens.simulateUnrest({ ...p, eruptionDay: undefined })
    expect(Math.max(...levels(sets))).toBeLessThan(3)
    expect(
      (sets.find((d) => d.id === 'sim-unrest-eruption')!.data as { features: unknown[] }).features,
    ).toEqual([])
  })

  it('refuses an eruption after the last day', () => {
    expect(() => gens.simulateUnrest({ ...p, eruptionDay: 40 })).toThrow(/after the last day/)
  })

  it('pairs each level with the documented rule', () => {
    expect(gens.alertLevelFor(1, false)).toBe(0)
    expect(gens.alertLevelFor(3.5, false)).toBe(1)
    expect(gens.alertLevelFor(9, false)).toBe(2)
    expect(gens.alertLevelFor(1, true)).toBe(3)
  })
})

describe('simulated tsunami', () => {
  const p = gens.TsunamiParams.parse({
    source: { name: 'Offshore source', lon: -126.8, lat: 46.2 },
    magnitude: 8.6,
    originTime: ORIGIN,
    places: [
      { name: 'Cape Hollis', lon: -124.6, lat: 46.5 },
      { name: 'Harbor Point', lon: -123.9, lat: 45.9 },
      { name: 'Far Island', lon: -150, lat: 21 },
    ],
    gaugePlace: 'Cape Hollis',
  })
  const sets = gens.simulateTsunami(p)
  const features = (
    sets[0]!.data as { features: { properties: Record<string, string | number> }[] }
  ).features.filter((f) => f.properties.kind !== 'source')

  it('grows arrival times with distance and names local and distant sources', () => {
    const t = (n: string): number =>
      Number(features.find((f) => f.properties.name === n)!.properties.travelMinutes)
    expect(t('Cape Hollis')).toBeLessThan(t('Harbor Point'))
    expect(t('Harbor Point')).toBeLessThan(t('Far Island'))
    expect(
      features.find((f) => f.properties.name === 'Cape Hollis')!.properties.sourceKind,
    ).toMatch(/local/)
    expect(features.find((f) => f.properties.name === 'Far Island')!.properties.sourceKind).toMatch(
      /distant/,
    )
  })

  it('records a gauge that is quiet before the first wave and moves after it', () => {
    const series = sets[1]!.data as { t: string; v: number }[]
    const arrival = Date.parse(
      String(features.find((f) => f.properties.name === 'Cape Hollis')!.properties.arrivalTime),
    )
    const tide = (ms: number): number =>
      p.tideAmplitudeM * Math.sin((2 * Math.PI * ((ms - Date.parse(ORIGIN)) / 3_600_000)) / 12.42)
    const resid = series.map((s) => ({ ms: Date.parse(s.t), r: s.v - tide(Date.parse(s.t)) }))
    expect(Math.max(...resid.filter((x) => x.ms < arrival).map((x) => Math.abs(x.r)))).toBeLessThan(
      0.02,
    )
    expect(
      Math.max(...resid.filter((x) => x.ms >= arrival).map((x) => Math.abs(x.r))),
    ).toBeGreaterThan(0.5)
  })
})

describe('simulated debris flows', () => {
  const base = {
    fire: 'Cedar Ridge Fire',
    startTime: '2026-11-05T18:00:00Z',
    durationMin: 180,
    basins: [
      { name: 'Basin A', lon: -118.7, lat: 46.35, thresholdMm15: 4 },
      { name: 'Basin B', lon: -118.6, lat: 46.35, thresholdMm15: 9 },
      { name: 'Basin C', lon: -118.5, lat: 46.35 },
    ],
  }
  const run = (peak: number) =>
    gens.simulateDebrisFlows(gens.DebrisFlowParams.parse({ ...base, peakIntensityMmHr: peak }))
  const flows = (sets: ReturnType<typeof run>) =>
    (
      sets.find((d) => d.id === 'sim-debris-flows')!.data as {
        features: { properties: Record<string, string | number> }[]
      }
    ).features

  it('triggers flows where the 15-minute rain crosses the basin threshold, earlier for lower thresholds', () => {
    const f = flows(run(60))
    expect(f.map((x) => x.properties.basin)).toEqual(['Basin A', 'Basin B', 'Basin C'])
    const time = (b: string): number =>
      Date.parse(String(f.find((x) => x.properties.basin === b)!.properties.time))
    expect(time('Basin A')).toBeLessThan(time('Basin B'))
    expect(f[0]!.properties.volumeClass).toMatch(/large|medium|small/)
  })

  it('makes no flow when the rain stays under every threshold', () => {
    expect(flows(run(5))).toEqual([])
  })

  it('reports the 15-minute accumulation in millimeters', () => {
    const roll = run(60).find((d) => d.id === 'sim-rain-15min')!.data as { v: number }[]
    const peak = Math.max(...roll.map((r) => r.v))
    // 60 mm per hour for 15 minutes is 15 mm; the storm peak is a little narrower than that.
    expect(peak).toBeGreaterThan(14)
    expect(peak).toBeLessThanOrEqual(15)
  })
})

describe('registration and the case-data pipeline', () => {
  it('registers five generators', () => {
    registerGeoscienceToolkits()
    expect(generatorIds()).toEqual(
      expect.arrayContaining([
        'sim-earthquake',
        'sim-volcanic-unrest',
        'sim-tsunami',
        'sim-debris-flow',
        'sim-lahar',
      ]),
    )
  })

  it('runs each through the real pipeline: valid data, labeled simulated, no retrieval date', async () => {
    registerGeoscienceToolkits()
    const cases: [string, unknown][] = [
      ['sim-earthquake', { ...quakeParams }],
      [
        'sim-volcanic-unrest',
        {
          volcano: { name: 'Mount Hollis', lon: -121.76, lat: 46.87 },
          startTime: '2026-10-22T00:00:00Z',
          days: 20,
          eruptionDay: 15,
        },
      ],
      [
        'sim-tsunami',
        {
          source: { name: 'S', lon: -126.8, lat: 46.2 },
          magnitude: 8,
          originTime: ORIGIN,
          places: [{ name: 'A', lon: -124.6, lat: 46.5 }],
        },
      ],
      [
        'sim-lahar',
        {
          source: { name: 'Detection site', lon: -121.78, lat: 46.84 },
          detectedAt: ORIGIN,
          communities: [{ name: 'Riverbend School', lon: -122.14, lat: 47.04, minutes: 38 }],
        },
      ],
      [
        'sim-debris-flow',
        {
          fire: 'X Fire',
          startTime: ORIGIN,
          peakIntensityMmHr: 40,
          basins: [{ name: 'B', lon: -118.7, lat: 46.35 }],
        },
      ],
    ]
    for (const [id, params] of cases) {
      const root = mkdtempSync(join(tmpdir(), `ttx-geo-${id}-`))
      const manifest = await runGenerator(root, 'scn', id, params, { maxMbPerScenario: 500 })
      expect(manifest.datasets.length, id).toBeGreaterThan(0)
      for (const d of manifest.datasets) {
        expect(d.provenance.origin).toBe('simulated')
        expect(d.provenance.generator).toBe(id)
        expect(d.provenance.retrieved).toBeUndefined()
        expect(readFileSync(join(caseDir(root, 'scn'), d.file!), 'utf8').length).toBeGreaterThan(2)
      }
    }
  })
})

describe('the simulated datasets draw the figures', () => {
  it('feeds the ShakeMap, epicenter, aftershock, early warning, monitoring and gauge figures', () => {
    const q = gens.simulateEarthquake(quakeParams)
    const get = (id: string) => q.find((d) => d.id === id)!.data as never
    const shake = renderFigure({
      kind: 'shakemap_intensity',
      data: data.shakemapFigureData(get('sim-shakemap-grid'), {
        places: get('sim-places-shaking'),
        quake: get('sim-quake-event'),
        faults: get('sim-quake-event'),
      }),
    })
    expect(shake.summary).toMatch(/Highest intensity (VIII|IX|X)/)
    const epi = renderFigure({
      kind: 'epicenter_map',
      data: data.epicenterFigureData(get('sim-quake-event'), get('sim-aftershocks')),
    })
    expect(epi.summary).toContain('M 6.8 mainshock')
    const aft = renderFigure({
      kind: 'aftershock_plot',
      data: data.aftershockPlotData(get('sim-aftershocks'), 6.8),
    })
    expect(aft.summary).toMatch(/aftershocks of M 2.5 or larger/)
    const eew = renderFigure({
      kind: 'eew_timeline',
      data: data.eewTimelineData(get('sim-places-shaking'), ORIGIN),
    })
    expect(eew.summary).toMatch(/Near .*alert .* seconds after shaking began/)

    const u = gens.simulateUnrest(
      gens.UnrestParams.parse({
        volcano: { name: 'Mount Hollis', lon: -121.76, lat: 46.87 },
        startTime: '2026-10-22T00:00:00Z',
        days: 30,
        eruptionDay: 24,
      }),
    )
    const s = (id: string) => u.find((d) => d.id === id)!.data as never
    const mon = renderFigure({
      kind: 'monitoring_series',
      data: data.monitoringFigureData([
        { label: 'Earthquakes per day', unit: 'per day', series: s('sim-unrest-seismicity') },
        { label: 'GPS uplift', unit: 'cm', series: s('sim-unrest-gps') },
      ]),
    })
    expect(mon.summary).toContain('2 stacked panels')

    const t = gens.simulateTsunami(
      gens.TsunamiParams.parse({
        source: { name: 'S', lon: -126.8, lat: 46.2 },
        magnitude: 8.6,
        originTime: ORIGIN,
        places: [{ name: 'Cape Hollis', lon: -124.6, lat: 46.5 }],
      }),
    )
    const gauge = renderFigure({
      kind: 'gauge_record',
      data: data.gaugeRecordFigureData('Cape Hollis', t[1]!.data as never),
    })
    expect(gauge.summary).toContain('Highest observed level')
    const wf = data.seismogramFigureData(
      [
        { t: '2026-11-05T14:22:00.000Z', v: 1 },
        { t: '2026-11-05T14:22:00.050Z', v: -4 },
        { t: '2026-11-05T14:22:00.100Z', v: 2 },
      ],
      { station: 'ABC' },
    )
    expect(wf.sampleRateHz).toBe(20)
    expect(renderFigure({ kind: 'seismogram', data: wf }).summary).toContain('Peak amplitude -4')
  })
})

describe('the timing measures read the simulated data', () => {
  const written = async (id: string, params: unknown) => {
    registerGeoscienceToolkits()
    const root = mkdtempSync(join(tmpdir(), `ttx-geo-gt-${id}-`))
    await runGenerator(root, 'scn', id, params, { maxMbPerScenario: 500 })
    return caseDir(root, 'scn')
  }
  const decision = (time: string, kind: string, area?: string) => ({
    id: `d-${kind}`,
    time,
    kind,
    ...(area ? { area } : {}),
    fields: {},
  })

  it('scores a protective action against the arrival of strong shaking, place by place', async () => {
    const dir = await written('sim-earthquake', quakeParams)
    const series = await readModeledSeries(dir, 'sim-shaking-series.json')
    const events = await readGroundTruth(dir, 'sim-quake-events.json')
    expect(series.map((x) => x.zone).sort()).toEqual(['Far', 'Mid', 'Near'])
    expect(events.filter((e) => e.kind === 'shaking_arrival')).toHaveLength(3)
    const far = events.find((e) => e.area === 'Far')!
    // Taking the action 20 s before the shaking reaches Far is on time; no action at Near is reported.
    const early = new Date(Date.parse(far.time) - 20_000).toISOString()
    const r = runMetric(
      {
        id: 'threshold_timing',
        config: { actionKind: 'early_warning_action', threshold: 4, clearanceMin: 0 },
      },
      { series, decisions: [decision(early, 'early_warning_action', 'Far')] },
    )
    const rows = r.tables[0]!.rows.map((x) => x.join('|'))
    expect(rows.find((x) => x.startsWith('Far'))).toMatch(/On time/)
    expect(rows.find((x) => x.startsWith('Near'))).toMatch(/No action taken/)
  })

  it('scores a tsunami evacuation against the first wave, and an upgrade against the observed waves', async () => {
    const dir = await written('sim-tsunami', {
      source: { name: 'S', lon: -126.8, lat: 46.2 },
      magnitude: 8.6,
      originTime: ORIGIN,
      places: [{ name: 'Cape Hollis', lon: -124.6, lat: 46.5 }],
    })
    const series = await readModeledSeries(dir, 'sim-tsunami-wave-series.json')
    const events = await readGroundTruth(dir, 'sim-tsunami-events.json')
    const wave = events[0]!
    const late = new Date(Date.parse(wave.time) + 5 * 60_000).toISOString()
    const evac = runMetric(
      {
        id: 'threshold_timing',
        config: { actionKind: 'order_evacuation', threshold: 1, clearanceMin: 15 },
      },
      { series, decisions: [decision(late, 'order_evacuation', 'Cape Hollis')] },
    )
    expect(evac.tables[0]!.rows[0]!.join('|')).toMatch(/Late/)
    const before = new Date(Date.parse(wave.time) - 30 * 60_000).toISOString()
    const timing = runMetric(
      {
        id: 'decision_timing',
        config: {
          decisionKinds: ['issue_tsunami_message'],
          eventKinds: ['first_wave_observed'],
          leadWindowMin: 120,
          graceWindowMin: 10,
          matchArea: true,
        },
      },
      { events, decisions: [decision(before, 'issue_tsunami_message', 'Cape Hollis')] },
    )
    expect(
      timing.summary.find((x) => /hit/i.test(x.label))?.value ?? JSON.stringify(timing.summary),
    ).toMatch(/1/)
  })

  it('reads an eruption onset and a lahar arrival time for each community', async () => {
    const volcano = await written('sim-volcanic-unrest', {
      volcano: { name: 'Mount Hollis', lon: -121.76, lat: 46.87 },
      startTime: '2026-10-22T00:00:00Z',
      days: 20,
      eruptionDay: 15,
    })
    const onset = await readGroundTruth(volcano, 'sim-unrest-events.json')
    expect(onset).toHaveLength(1)
    expect(onset[0]!.kind).toBe('eruption_onset')
    const noEruption = await written('sim-volcanic-unrest', {
      volcano: { name: 'Mount Hollis', lon: -121.76, lat: 46.87 },
      startTime: '2026-10-22T00:00:00Z',
      days: 20,
    })
    expect(await readGroundTruth(noEruption, 'sim-unrest-events.json')).toEqual([])
    const lahar = await written('sim-lahar', {
      source: { name: 'Detection site', lon: -121.78, lat: 46.84 },
      detectedAt: ORIGIN,
      communities: [
        { name: 'Upper campground', lon: -121.9, lat: 46.91, minutes: 12 },
        { name: 'Riverbend School', lon: -122.14, lat: 47.04, minutes: 38 },
      ],
    })
    const events = await readGroundTruth(lahar, 'sim-lahar-events.json')
    const series = await readModeledSeries(lahar, 'sim-lahar-series.json')
    expect(events.map((e) => e.area)).toEqual(['Upper campground', 'Riverbend School'])
    const school = events.find((e) => e.area === 'Riverbend School')!
    expect(Date.parse(school.time) - Date.parse(ORIGIN)).toBe(38 * 60_000)
    // Evacuating at minute 10 with a 20 minute clearance beats the school's 38 minute deadline (18 minutes to spare).
    const atTen = new Date(Date.parse(ORIGIN) + 10 * 60_000).toISOString()
    const r = runMetric(
      {
        id: 'threshold_timing',
        config: { actionKind: 'order_evacuation', threshold: 1, clearanceMin: 20 },
      },
      { series, decisions: [decision(atTen, 'order_evacuation', 'Riverbend School')] },
    )
    expect(r.tables[0]!.rows.find((x) => x[0] === 'Riverbend School')!.join('|')).toMatch(/On time/)
    expect(r.tables[0]!.rows.find((x) => x[0] === 'Upper campground')!.join('|')).toMatch(
      /No action taken/,
    )
  })

  it('scores a road closure against the rain threshold of each basin', async () => {
    const dir = await written('sim-debris-flow', {
      fire: 'Cedar Ridge Fire',
      startTime: ORIGIN,
      peakIntensityMmHr: 60,
      durationMin: 180,
      basins: [
        { name: 'Basin A', lon: -118.7, lat: 46.35, thresholdMm15: 4 },
        { name: 'Basin B', lon: -118.6, lat: 46.35, thresholdMm15: 9 },
      ],
    })
    const series = await readModeledSeries(dir, 'sim-debris-series.json')
    const events = await readGroundTruth(dir, 'sim-debris-events.json')
    expect(events.map((e) => e.area)).toEqual(['Basin A', 'Basin B'])
    const early = new Date(Date.parse(ORIGIN) + 5 * 60_000).toISOString()
    const r = runMetric(
      {
        id: 'threshold_timing',
        config: { actionKind: 'close_road', threshold: 1, clearanceMin: 30 },
      },
      { series, decisions: [decision(early, 'close_road')] },
    )
    expect(r.tables[0]!.rows.every((x) => /On time/.test(x.join('|')))).toBe(true)
  })
})

describe('the toolkits point their measures at datasets the generators write', () => {
  it('names a ground-truth and a series dataset that a generator produces', () => {
    const produced = new Set<string>([
      ...gens.simulateEarthquake(quakeParams).map((d) => d.id),
      ...gens
        .simulateUnrest(
          gens.UnrestParams.parse({
            volcano: { name: 'V', lon: -121, lat: 46 },
            startTime: '2026-10-22T00:00:00Z',
            eruptionDay: 10,
          }),
        )
        .map((d) => d.id),
      ...gens
        .simulateTsunami(
          gens.TsunamiParams.parse({
            source: { name: 'S', lon: -126, lat: 46 },
            magnitude: 8,
            originTime: ORIGIN,
            places: [{ name: 'A', lon: -124, lat: 46 }],
          }),
        )
        .map((d) => d.id),
      ...gens
        .simulateDebrisFlows(
          gens.DebrisFlowParams.parse({
            fire: 'F',
            startTime: ORIGIN,
            peakIntensityMmHr: 40,
            basins: [{ name: 'B', lon: -118, lat: 46 }],
          }),
        )
        .map((d) => d.id),
      ...gens
        .simulateLahar(
          gens.LaharParams.parse({
            source: { name: 'D', lon: -121, lat: 46 },
            detectedAt: ORIGIN,
            communities: [{ name: 'C', lon: -122, lat: 47, minutes: 20 }],
          }),
        )
        .map((d) => d.id),
    ])
    let named = 0
    for (const id of ['seismic', 'volcanic', 'tsunami', 'debris_flow']) {
      const t = JSON.parse(readFileSync(join(resolve('packs/toolkits'), `${id}.json`), 'utf8')) as {
        metrics: { id: string; groundTruth?: string; series?: string }[]
      }
      for (const m of t.metrics)
        for (const ref of [m.groundTruth, m.series]) {
          if (!ref) continue
          named++
          expect(produced.has(ref), `${id}: ${m.id} reads ${ref}`).toBe(true)
        }
    }
    expect(named).toBe(6)
  })
})
