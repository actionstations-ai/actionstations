// Simulated flood events, the event finder and the hydrograph built from case data
// (spec 0454 FR-5, FR-9, FR-11).
import { mkdtempSync } from 'node:fs'
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

const {
  RiverEventParams,
  FlashEventParams,
  riverSeries,
  forecastSeries,
  extentSteps,
  exposureAt,
  crestHour,
  hydrographShape,
  flashSeries,
} = await import('./simulate')
const { replayForecasts } = await import('./generators')
const { registerFloodGenerators } = await import('./index')
const { runGenerator, generatorIds } = await import('../../case-data/generators')
const { readDatasetFile } = await import('../../case-data/store')
const { crestEvents, gaugeRecordFromFeatures, replayPlan, replayWindow } = await import('./events')
const { hydrographFromCase } = await import('./from-case')
const { renderFigure } = await import('../../render/figures')
const { categoryAtStage } = await import('./lint')

const CATS = { action: 12, flood: 14, minor: 14, moderate: 17, major: 21 }
const ring = (x: number, y: number, s: number): [number, number][] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
]

const river = RiverEventParams.parse({
  river: 'Cedar River',
  start: '2026-11-05T12:00:00Z',
  crestAtHour: 60,
  recessionHours: 48,
  gauges: [
    {
      id: 'MLFM7',
      name: 'Cedar River at Milford',
      mile: 0,
      baseStage: 6,
      crestStage: 16,
      categories: CATS,
    },
    {
      id: 'RBDM7',
      name: 'Cedar River at Riverbend',
      mile: 30,
      baseStage: 8,
      crestStage: 17.8,
      categories: CATS,
    },
    {
      id: 'MLWM7',
      name: 'Cedar River at Marlow Landing',
      mile: 75,
      baseStage: 9,
      crestStage: 18,
      categories: CATS,
    },
  ],
  issuances: [
    { atHour: 36, crestStage: 14.5, crestAtHour: 66 },
    { atHour: 54, crestStage: 16, crestAtHour: 60 },
  ],
  floodplain: [
    { stage: 14, ring: ring(-90.1, 38, 0.01) },
    { stage: 15.5, ring: ring(-90.1, 38, 0.02) },
  ],
  assets: [
    { id: 'a1', name: 'Mill Road crossing', kind: 'road', floodsAtStage: 14 },
    { id: 'a2', name: 'Water plant', kind: 'facility', floodsAtStage: 17 },
    { id: 'a3', name: 'East Bend homes', kind: 'population', floodsAtStage: 16, count: 340 },
  ],
})

describe('river event', () => {
  const series = riverSeries(river)
  const peak = (id: string) => {
    const s = series.find((x) => x.gaugeId === id)!.points
    return s.reduce((a, b) => (b.v > a.v ? b : a))
  }
  it('crests at the stage given, at the time given', () => {
    expect(peak('mlfm7').v).toBe(16)
    expect(peak('mlfm7').t).toBe('2026-11-08T00:00:00Z')
    expect(peak('rbdm7').v).toBe(17.8)
  })
  it('orders the crests of downstream gauges by travel time', () => {
    const t = (id: string) => Date.parse(peak(id).t)
    expect(t('mlfm7')).toBeLessThan(t('rbdm7'))
    expect(t('rbdm7')).toBeLessThan(t('mlwm7'))
    const g = river.gauges[1]!
    expect(crestHour(river, g)).toBe(60 + 10)
  })
  it('assigns categories from the point own table', () => {
    expect(categoryAtStage(river.gauges[1]!.categories, peak('rbdm7').v)).toBe('moderate')
    expect(categoryAtStage({ action: 12, moderate: 17 }, 15)).toBe('action')
  })
  it('is deterministic and starts and ends at the base stage', () => {
    expect(riverSeries(river)).toEqual(series)
    const first = series[0]!.points
    expect(first[0]!.v).toBe(6)
    expect(first.at(-1)!.v).toBe(6)
  })
  it('makes forecasts per issuance, one that changes category', () => {
    const f = forecastSeries(river)
    expect(f).toHaveLength(2 * 3)
    const crest = (n: number) =>
      f
        .filter((x) => x.gaugeId === 'rbdm7' && x.n === n)[0]!
        .points.reduce((a, b) => (b.v > a.v ? b : a)).v
    const cat = (v: number) => categoryAtStage(river.gauges[1]!.categories, v)
    expect(cat(crest(1))).toBe('minor')
    expect(cat(crest(2))).toBe('moderate')
    expect(f[0]!.issuedAt).toBe('2026-11-07T00:00:00Z')
  })
  it('starts a forecast from the reading at its issuance', () => {
    const f = forecastSeries(river).find((x) => x.gaugeId === 'mlfm7' && x.n === 1)!
    const obs = series[0]!.points.find((p) => p.t === f.issuedAt)!
    expect(f.points[0]!.v).toBe(obs.v)
  })
  it('steps the extent with the reference stage and counts what floods', () => {
    const steps = extentSteps(river)
    expect(steps[0]!.ring).toBeUndefined()
    const high = steps.find((s) => s.level === 15.5)
    expect(high).toBeDefined()
    expect(exposureAt(river.assets, 16)).toEqual({
      structure: 0,
      road: 1,
      facility: 0,
      population: 340,
    })
    expect(exposureAt(river.assets, 17.5)).toEqual({
      structure: 0,
      road: 1,
      facility: 1,
      population: 340,
    })
  })
  it('refuses inconsistent parameters', () => {
    const bad = (over: object) => RiverEventParams.safeParse({ ...river, ...over }).success
    expect(bad({ gauges: [...river.gauges].reverse() })).toBe(false)
    expect(bad({ floodplain: [...river.floodplain].reverse() })).toBe(false)
    expect(bad({ gauges: [{ ...river.gauges[0]!, crestStage: 1 }] })).toBe(false)
  })
  it('has the cosine shape: zero, one at the crest, zero after the recession', () => {
    expect(hydrographShape(-5, 10, 20)).toBe(0)
    expect(hydrographShape(10, 10, 20)).toBeCloseTo(1)
    expect(hydrographShape(30, 10, 20)).toBeCloseTo(0)
  })
})

describe('flash flood', () => {
  const p = FlashEventParams.parse({
    basin: 'Cedar Creek basin',
    gauge: {
      id: 'CCRM7',
      name: 'Cedar Creek at the camp road',
      baseStage: 1.2,
      peakStage: 11.4,
      categories: { action: 5, minor: 8, moderate: 10, major: 13 },
    },
    start: '2026-11-05T00:00:00Z',
    rainPeakHour: 3,
    rainDurationHours: 3,
    rainTotalInches: 4.5,
    warning: { issuedAtHour: 3.5, tag: 'considerable', ring: ring(-90.2, 38.1, 0.05) },
  })
  const { rain, stage } = flashSeries(p)
  it('conserves the rain total and peaks the stage at the value given, after the rain peak', () => {
    expect(rain.reduce((a, b) => a + b.v, 0)).toBeCloseTo(4.5, 1)
    const top = stage.reduce((a, b) => (b.v > a.v ? b : a))
    expect(top.v).toBe(11.4)
    expect(Date.parse(top.t)).toBeGreaterThanOrEqual(Date.parse('2026-11-05T03:00:00Z'))
    expect(Date.parse(top.t)).toBeLessThanOrEqual(Date.parse('2026-11-05T05:00:00Z'))
    expect(stage[0]!.v).toBe(1.2)
  })
})

describe('replayed events', () => {
  const observed = Array.from({ length: 40 }, (_, i) => ({
    t: new Date(Date.parse('2019-06-01T00:00:00Z') + i * 6 * 3_600_000)
      .toISOString()
      .replace('.000Z', 'Z'),
    v: 30 + 15 * Math.sin((Math.PI * i) / 39),
  }))
  it('builds forecasts from the observed rise with an error that fades after the crest', () => {
    const f = replayForecasts({
      gauge: { id: 'eadm7', name: 'Mississippi River at St. Louis' },
      observed,
      issuances: [
        { atHour: 24, crestBiasFt: -2 },
        { atHour: 96, crestBiasFt: 0 },
      ],
    })
    expect(f).toHaveLength(2)
    const crest = Math.max(...observed.map((o) => o.v))
    const first = Math.max(...f[0]!.points.map((p) => p.v))
    const second = Math.max(...f[1]!.points.map((p) => p.v))
    expect(first).toBeCloseTo(crest - 2, 0)
    expect(second).toBeCloseTo(crest, 0)
  })
})

describe('through the framework', () => {
  it('labels everything simulated and reads back as a hydrograph figure', async () => {
    registerFloodGenerators()
    registerFloodGenerators()
    expect(generatorIds()).toEqual(
      expect.arrayContaining(['flood-river-event', 'flood-flash-event', 'flood-replay-forecast']),
    )
    const root = mkdtempSync(join(tmpdir(), 'ttx-flood-sim-'))
    const manifest = await runGenerator(
      root,
      's1',
      'flood-river-event',
      { ...river },
      { maxMbPerScenario: 500 },
    )
    for (const d of manifest.datasets) {
      expect(d.provenance.origin).toBe('simulated')
      expect(d.provenance.retrieved).toBeUndefined()
    }
    const ids = manifest.datasets.map((d) => d.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'gauge-rbdm7',
        'stage-rbdm7',
        'forecast-rbdm7-1',
        'forecast-rbdm7-2',
        'inundation-extent',
        'exposure',
      ]),
    )
    const byId = (id: string) => manifest.datasets.find((d) => d.id === id)!
    const gauge = gaugeRecordFromFeatures(await readDatasetFile(root, 's1', byId('gauge-rbdm7')))
    const obs = (await readDatasetFile(root, 's1', byId('stage-rbdm7'))) as {
      t: string
      v: number
    }[]
    const forecasts = await Promise.all(
      [1, 2].map(async (n) => ({
        issuedAt: forecastSeries(river).find((f) => f.gaugeId === 'rbdm7' && f.n === n)!.issuedAt,
        points: (await readDatasetFile(root, 's1', byId(`forecast-rbdm7-${n}`))) as {
          t: string
          v: number
        }[],
      })),
    )
    const early = hydrographFromCase({
      gauge,
      observed: obs,
      forecasts,
      asOf: '2026-11-07T01:00:00Z',
    })
    expect(early.previousForecast).toHaveLength(0)
    const late = hydrographFromCase({
      gauge,
      observed: obs,
      forecasts,
      asOf: '2026-11-07T20:00:00Z',
    })
    expect(late.previousForecast.length).toBeGreaterThan(0)
    expect(late.observed.at(-1)!.time <= '2026-11-07T20:00:00Z').toBe(true)
    const fig = renderFigure({ kind: 'hydrograph', data: late })
    expect(fig.summary).toContain('moderate flooding')
    expect(fig.summary).toContain('the category changed to moderate flooding')
  })
  it('refuses a flash flood whose warning has no area', async () => {
    registerFloodGenerators()
    const root = mkdtempSync(join(tmpdir(), 'ttx-flood-sim-'))
    await expect(
      runGenerator(root, 's1', 'flood-flash-event', { basin: 'x' }, { maxMbPerScenario: 500 }),
    ).rejects.toThrow()
  })
})

describe('event finder', () => {
  const rec = {
    lid: 'EADM7',
    name: 'Mississippi River at St. Louis',
    usgsId: '07010000',
    categories: { action: 28, flood: 30, minor: 30, moderate: 35, major: 40 },
    historicCrests: [
      { date: '1993-08-01T00:00:00Z', stage: 49.58 },
      { date: '2019-06-09T02:30:00Z', stage: 46.02 },
      { date: '2013-06-04T14:30:00Z', stage: 40.52 },
      { date: '2016-01-01T09:00:00Z', stage: 42.52 },
    ],
  }
  it('lists past crests newest first within a range, with the point own category', () => {
    const all = crestEvents(rec)
    expect(all.map((c) => c.date.slice(0, 4))).toEqual(['2019', '2016', '2013', '1993'])
    expect(all[0]!.category).toBe('major')
    const some = crestEvents(rec, { start: '2010-01-01', end: '2017-01-01' })
    expect(some).toHaveLength(2)
  })
  it('plans a fetch window around a crest and states the forecast limit', () => {
    const w = replayWindow('2019-06-09T02:30:00Z')
    expect(w).toEqual({ start: '2019-06-02T00:00:00Z', end: '2019-06-13T00:00:00Z' })
    const plan = replayPlan(rec, crestEvents(rec)[0]!)
    expect(plan.usgs.options).toMatchObject({ sites: '07010000', interval: 'continuous' })
    expect(plan.notice).toMatch(/not available/)
    expect(replayPlan(rec, crestEvents(rec)[0]!, 20, 5).usgs.options.interval).toBe('daily')
    expect(() => replayPlan({ ...rec, usgsId: null }, crestEvents(rec)[0]!)).toThrow(/no USGS site/)
  })
  it('refuses a dataset that is not a gauge record', () => {
    expect(() =>
      gaugeRecordFromFeatures({
        type: 'FeatureCollection',
        features: [{ properties: { kind: 'x' } }],
      }),
    ).toThrow(/not a flood gauge/)
  })
})
