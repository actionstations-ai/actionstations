// The simulated wildfire and power shutoff data (spec 0461 FR-10, FR-11): deterministic, labeled
// simulated, spreading with the wind, with arrival times that grow with distance and datasets
// the timing measures can read.
import { describe, expect, it } from 'vitest'
import { GroundTruthEvent, ModeledSeries } from '@shared/schemas/metrics'
import { crossingTime } from '../../evaluation/metrics/threshold-timing'
import { FireEventParams, generateFire, simulateFire } from './simulate/events'
import { aqiFromPm25, pm25At } from './simulate/smoke'
import { lengthToBreadth } from './simulate/spread'
import { makeCircuits, ShutoffEventParams, generateShutoff } from './simulate/shutoff'
import { SAMPLE_FIRE, SAMPLE_SHUTOFF } from './samples'

const fire = FireEventParams.parse(SAMPLE_FIRE)
const byId = (ds: ReturnType<typeof generateFire>, id: string) => ds.find((d) => d.id === id)!

describe('spread relation', () => {
  it('uses the Anderson length-to-breadth ratio', () => {
    expect(lengthToBreadth(0)).toBeCloseTo(1, 1)
    expect(lengthToBreadth(8)).toBeCloseTo(
      0.936 * Math.exp(0.2566 * 8) + 0.461 * Math.exp(-0.1548 * 8) - 0.397,
      6,
    )
    expect(lengthToBreadth(8)).toBeGreaterThan(lengthToBreadth(4))
  })
})

describe('simulated fire', () => {
  it('is deterministic and says simulated in every label', () => {
    const a = generateFire(fire)
    expect(JSON.stringify(generateFire(fire))).toBe(JSON.stringify(a))
    for (const d of a) expect(d.label.toLowerCase(), d.id).toMatch(/simulated|simulation/)
    expect(byId(a, 'sim-fire-perimeters').label).toMatch(/not a fire behavior prediction/)
  })
  it('grows and spreads downwind of the northeast wind', () => {
    const sim = simulateFire(fire)
    const acres = sim.steps.map((s) => s.acres)
    for (let i = 1; i < acres.length; i++) expect(acres[i]).toBeGreaterThanOrEqual(acres[i - 1]!)
    const c1 = sim.arrivals.find((a) => a.id === 'C-1')!
    const north = sim.arrivals.find((a) => a.id === 'N-1')!
    expect(c1.arrivalMs).not.toBeNull()
    expect(north.arrivalMs === null || north.arrivalMs > c1.arrivalMs!).toBe(true)
  })
  it('reaches downwind zones in order of distance, each later than the one before', () => {
    const sim = simulateFire(fire)
    const times = ['C-1', 'C-2', 'C-3', 'C-4'].map(
      (id) => sim.arrivals.find((a) => a.id === id)!.arrivalMs,
    )
    for (const t of times) expect(t).not.toBeNull()
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThan(times[i - 1]!)
  })
  it('moves the head faster in grass than in timber and slows with suppression', () => {
    const acresAt = (p: Partial<FireEventParams>) => {
      const s = simulateFire(
        FireEventParams.parse({ ...SAMPLE_FIRE, suppression: undefined, ...p }),
      )
      return s.steps[s.steps.length - 1]!.acres
    }
    expect(acresAt({ fuel: 'grass' })).toBeGreaterThan(acresAt({ fuel: 'timber' }))
    expect(acresAt({ suppression: { startHour: 2, reduction: 0.8 } })).toBeLessThan(acresAt({}))
  })
  it('writes the latest order time as arrival less clearance, and the deadline series crosses there', () => {
    const data = generateFire(fire)
    const events = byId(data, 'sim-fire-arrivals').data as unknown[]
    const parsed = events.map((e) => GroundTruthEvent.parse(e))
    const c3 = parsed.find((e) => e.kind === 'fire_arrival' && e.area === 'C-3')!
    expect(Date.parse(String(c3.attrs.latestOrderTime))).toBe(Date.parse(c3.time) - 90 * 60_000)
    const series = (byId(data, 'sim-fire-order-deadline').data as unknown[]).map((s) =>
      ModeledSeries.parse(s),
    )
    const s3 = series.find((s) => s.zone === 'C-3')!
    const crossing = crossingTime(s3, 0)!
    expect(Math.abs(crossing - Date.parse(String(c3.attrs.latestOrderTime)))).toBeLessThan(2000)
  })
  it('leaves a zone the fire never reaches below zero', () => {
    const data = generateFire(
      FireEventParams.parse({ ...SAMPLE_FIRE, durationHours: 2, suppression: undefined }),
    )
    const series = (byId(data, 'sim-fire-order-deadline').data as unknown[]).map((s) =>
      ModeledSeries.parse(s),
    )
    expect(
      crossingTime(
        series.find((s) => s.zone === 'C-5')!,
        0,
      ),
    ).toBeNull()
  })
  it('writes hotspots, plumes in three densities and an acres series', () => {
    const data = generateFire(fire)
    const smoke = byId(data, 'sim-fire-smoke').data as {
      features: { properties: { density: string } }[]
    }
    expect(new Set(smoke.features.map((f) => f.properties.density))).toEqual(
      new Set(['light', 'medium', 'heavy']),
    )
    expect(
      (byId(data, 'sim-fire-hotspots').data as { features: unknown[] }).features.length,
    ).toBeGreaterThan(20)
    expect((byId(data, 'sim-fire-acres').data as unknown[]).length).toBe(fire.durationHours + 1)
  })
  it('refuses duplicate zone ids', () => {
    expect(() =>
      FireEventParams.parse({
        ...SAMPLE_FIRE,
        zones: [SAMPLE_FIRE.zones[0], SAMPLE_FIRE.zones[0]],
      }),
    ).toThrow(/unique/)
  })
})

describe('smoke and AQI', () => {
  it('is worse downwind of the fire than upwind and rises with size', () => {
    const src = { lon: -121.05, lat: 39.2 }
    const down = { lon: -121.1, lat: 39.15 }
    const up = { lon: -121.0, lat: 39.25 }
    expect(pm25At(down, src, 225, 3000)).toBeGreaterThan(pm25At(up, src, 225, 3000))
    expect(pm25At(down, src, 225, 6000)).toBeGreaterThan(pm25At(down, src, 225, 1000))
  })
  it('converts PM2.5 to the AQI at the 2024 breakpoints', () => {
    expect(
      [0, 9, 9.1, 35.4, 35.5, 55.4, 55.5, 125.4, 125.5, 225.4, 225.5].map(aqiFromPm25),
    ).toEqual([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301])
  })
  it('writes the AQI at each place in step with its PM2.5', () => {
    const data = generateFire(fire)
    const aqi = byId(data, 'sim-fire-aqi').data as { t: string; v: Record<string, number> }[]
    const names = Object.keys(aqi[0]!.v)
    expect(names).toEqual(['Calloway Falls Elementary', 'Calloway Regional Hospital'])
    const peak = Math.max(...aqi.flatMap((p) => Object.values(p.v)))
    expect(peak).toBeGreaterThan(100)
  })
})

describe('simulated power shutoff', () => {
  const params = ShutoffEventParams.parse(SAMPLE_SHUTOFF)
  it('is deterministic, fictional and labeled simulated', () => {
    const a = generateShutoff(params)
    expect(JSON.stringify(generateShutoff(params))).toBe(JSON.stringify(a))
    for (const d of a) expect(d.label.toLowerCase(), d.id).toMatch(/simulated/)
    expect(a.find((d) => d.id === 'sim-psps-circuits')!.label).toMatch(/fictional/)
  })
  it('makes the same circuits from the same seed and different ones from another', () => {
    expect(makeCircuits(4, 9)).toEqual(makeCircuits(4, 9))
    expect(makeCircuits(4, 9)).not.toEqual(makeCircuits(4, 10))
  })
  it('writes circuits whose customers add up and a medical baseline group for each', () => {
    const events = (
      generateShutoff(params).find((d) => d.id === 'sim-psps-circuits')!.data as unknown[]
    ).map((e) => GroundTruthEvent.parse(e))
    const circuits = events.filter((e) => e.kind === 'circuit')
    expect(circuits).toHaveLength(5)
    for (const c of circuits) {
      const a = c.attrs as Record<string, number>
      expect(a.customers).toBe(a.residential! + a.commercial! + a.agricultural!)
      const group = events.find((e) => e.kind === 'medical_baseline_group' && e.area === c.area)!
      expect(group.attrs.customers).toBe(a.medicalBaseline)
      const restored = events.find((e) => e.kind === 'circuit_restored' && e.area === c.area)!
      expect(Date.parse(restored.time)).toBeGreaterThan(Date.parse(c.time))
    }
  })
  it('writes the four notification windows relative to de-energization', () => {
    const events = (
      generateShutoff(params).find((d) => d.id === 'sim-psps-windows')!.data as unknown[]
    ).map((e) => GroundTruthEvent.parse(e))
    expect(events.map((e) => String(e.attrs.label))).toEqual([
      '48-72 hours before',
      '24-48 hours before',
      '1-4 hours before',
      'At de-energization',
    ])
    const at = Date.parse(String(events[0]!.attrs.deenergizeAt))
    expect(Date.parse(events[0]!.time)).toBe(at - 48 * 3_600_000)
    expect(Date.parse(String(events[0]!.attrs.earliest))).toBe(at - 72 * 3_600_000)
  })
  it('writes a gust margin series that crosses 0 when winds reach the threshold', () => {
    const series = (
      generateShutoff(params).find((d) => d.id === 'sim-psps-gust-margin')!.data as unknown[]
    ).map((s) => ModeledSeries.parse(s))
    expect(series).toHaveLength(5)
    for (const s of series) expect(crossingTime(s, 0)).not.toBeNull()
  })
})
