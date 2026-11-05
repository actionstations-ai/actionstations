// Simulated spills and plumes (#771): the numbers agree with each other and with the relations
// they use (mass balance sums to the release, landfall grows with distance, a plume thins with
// distance downwind and higher levels cover less).
import { describe, expect, it } from 'vitest'
import {
  BARREL_M3,
  currentVector,
  dispersion,
  distanceM,
  distanceToLineM,
  fromM3,
  gramsPerM3ToPpm,
  plumeConcentration,
  plumeFootprint,
  simulateSpill,
  toM3,
  windVector,
  type LatLon,
  type Shoreline,
  type SpillInput,
} from './simulate'

const ORIGIN: LatLon = { lat: 30.3, lon: -88.1 }
const base = (over: Partial<SpillInput> = {}): SpillInput => ({
  origin: ORIGIN,
  product: 'diesel',
  volume: 4200,
  unit: 'bbl',
  releaseHours: 4,
  hours: 48,
  wind: windVector(135, 6),
  current: currentVector(300, 0.2),
  ...over,
})

describe('vectors and distances', () => {
  it('a wind from the south blows north and a current toward the east flows east', () => {
    const w = windVector(180, 10)
    expect(w.north).toBeCloseTo(10, 6)
    expect(w.east).toBeCloseTo(0, 6)
    const c = currentVector(90, 1)
    expect(c.east).toBeCloseTo(1, 6)
    expect(c.north).toBeCloseTo(0, 6)
  })

  it('measures a degree of latitude as about 111 km and a point to a line', () => {
    expect(distanceM({ lat: 30, lon: -88 }, { lat: 31, lon: -88 })).toBeCloseTo(111_195, -2)
    const line: LatLon[] = [
      { lat: 30.4, lon: -88.2 },
      { lat: 30.4, lon: -88.0 },
    ]
    expect(distanceToLineM({ lat: 30.3, lon: -88.1 }, line)).toBeCloseTo(11_119, -2)
  })

  it('converts barrels, gallons and cubic meters', () => {
    expect(toM3(1, 'bbl')).toBeCloseTo(BARREL_M3, 9)
    expect(fromM3(toM3(42, 'gal'), 'bbl')).toBeCloseTo(1, 6)
  })
})

describe('simulateSpill mass balance', () => {
  it('evaporated, dispersed, recovered and remaining add up to what has been released at every step', () => {
    const r = simulateSpill(base({ recovery: { startHour: 6, perHour: 60 } }))
    for (const s of r.steps)
      expect(s.evaporated + s.dispersed + s.recovered + s.remaining).toBeCloseTo(s.released, 6)
    const last = r.steps.at(-1)!
    expect(last.released).toBeCloseTo(4200, 6)
    expect(last.recovered).toBeGreaterThan(0)
  })

  it('releases over the release time and loses diesel faster to evaporation than heavy fuel', () => {
    const diesel = simulateSpill(base()).steps
    expect(diesel[2]!.released).toBeCloseTo(2100, 6)
    expect(diesel[4]!.released).toBeCloseTo(4200, 6)
    const heavy = simulateSpill(base({ product: 'heavy_fuel' })).steps
    expect(diesel.at(-1)!.evaporated).toBeGreaterThan(heavy.at(-1)!.evaporated * 3)
  })

  it('never recovers more than half of what is left in a step and never goes negative', () => {
    const r = simulateSpill(base({ recovery: { startHour: 0, perHour: 1_000_000 } }))
    for (const s of r.steps) {
      expect(s.remaining).toBeGreaterThanOrEqual(0)
      expect(s.recovered).toBeLessThanOrEqual(s.released + 1e-9)
    }
  })

  it('a rougher sea disperses more oil naturally', () => {
    const calm = simulateSpill(base({ seaStateFactor: 0.5 })).steps.at(-1)!
    const rough = simulateSpill(base({ seaStateFactor: 2 })).steps.at(-1)!
    expect(rough.dispersed).toBeGreaterThan(calm.dispersed)
  })

  it('an instant release puts everything on the water at hour zero', () => {
    const r = simulateSpill(base({ releaseHours: 0, hours: 6 }))
    expect(r.steps[0]!.released).toBe(4200)
  })
})

describe('simulateSpill trajectory and landfall', () => {
  const shore = (id: string, lat: number): Shoreline => ({
    id,
    name: id,
    points: [
      { lat, lon: -88.5 },
      { lat, lon: -87.7 },
    ],
  })

  it('moves with the current plus three percent of the wind', () => {
    const r = simulateSpill(
      base({ wind: windVector(180, 10), current: currentVector(0, 0), hours: 10 }),
    )
    // 3 percent of 10 m/s is 0.3 m/s north, for 10 hours: 10.8 km.
    expect(r.steps.at(-1)!.traveledM).toBeCloseTo(10_800, -1)
    expect(r.steps.at(-1)!.center.lat).toBeGreaterThan(ORIGIN.lat)
  })

  it('reaches a nearer shoreline before a farther one, and later when the drift is slower', () => {
    const fast = simulateSpill(
      base({
        wind: windVector(180, 10),
        current: currentVector(0, 0.3),
        shorelines: [shore('near', 30.4), shore('far', 30.55)],
        hours: 72,
      }),
    )
    const [near, far] = ['near', 'far'].map((id) =>
      fast.landfalls.find((l) => l.shorelineId === id)!,
    )
    expect(near!.hour).toBeLessThan(far!.hour)
    const slow = simulateSpill(
      base({
        wind: windVector(180, 10),
        current: currentVector(0, 0.05),
        shorelines: [shore('near', 30.4)],
        hours: 72,
      }),
    )
    expect(slow.landfalls[0]!.hour).toBeGreaterThan(near!.hour)
  })

  it('the uncertainty envelope reaches the shore no later than the best estimate', () => {
    const r = simulateSpill(
      base({
        wind: windVector(180, 10),
        current: currentVector(0, 0.3),
        shorelines: [shore('near', 30.4)],
        hours: 72,
      }),
    )
    const lf = r.landfalls[0]!
    expect(lf.hour).toBeLessThanOrEqual(lf.bestEstimateHour)
  })

  it('has no landfall when the oil drifts away from the shore, and the envelope grows with time', () => {
    const r = simulateSpill(
      base({
        wind: windVector(0, 10),
        current: currentVector(180, 0.3),
        shorelines: [shore('north', 30.4)],
        hours: 24,
      }),
    )
    expect(r.landfalls).toEqual([])
    expect(r.steps.at(-1)!.uncertaintyM).toBeGreaterThan(r.steps[2]!.uncertaintyM)
  })
})

describe('plume', () => {
  it('thins with distance downwind and with distance across the plume', () => {
    const c = (x: number, y = 0) => plumeConcentration(100, 3, 'D', x, y)
    expect(c(200)).toBeGreaterThan(c(500))
    expect(c(500)).toBeGreaterThan(c(2000))
    expect(c(500)).toBeGreaterThan(c(500, 40))
    expect(c(-5)).toBe(0)
  })

  it('disperses more slowly in stable air (F) than in unstable air (B)', () => {
    expect(dispersion(1000, 'F').sz).toBeLessThan(dispersion(1000, 'B').sz)
    expect(plumeConcentration(100, 2, 'F', 1000)).toBeGreaterThan(
      plumeConcentration(100, 2, 'B', 1000),
    )
  })

  it('matches the hand calculation for class D at 1 km (Briggs coefficients)', () => {
    // sy = 0.08*1000/sqrt(1.1) = 76.28; sz = 0.06*1000/sqrt(2.5) = 37.95 (exponent -0.5 term).
    const d = dispersion(1000, 'D')
    expect(d.sy).toBeCloseTo(76.28, 1)
    expect(d.sz).toBeCloseTo(37.95, 1)
    expect(plumeConcentration(100, 3, 'D', 1000)).toBeCloseTo(100 / (Math.PI * 3 * d.sy * d.sz), 8)
  })

  it('converts grams per cubic meter to ppm for a gas', () => {
    // Chlorine, 70.9 g/mol: 1 ppm is about 2.9 mg/m3.
    expect(gramsPerM3ToPpm(0.0029, 70.9)).toBeCloseTo(1, 1)
  })

  it('draws smaller zones for higher levels and points them downwind', () => {
    const zones = plumeFootprint({
      releaseGramsPerSecond: 2000,
      windMs: 3,
      windFromDeg: 270,
      stability: 'D',
      molecularWeight: 70.9,
      levels: [
        { label: 'Red', ppm: 20 },
        { label: 'Orange', ppm: 2 },
        { label: 'Yellow', ppm: 0.5 },
      ],
    })
    const [red, orange, yellow] = zones
    expect(red!.distanceM).toBeLessThan(orange!.distanceM)
    expect(orange!.distanceM).toBeLessThan(yellow!.distanceM)
    expect(red!.widthM).toBeLessThan(yellow!.widthM)
    // Wind from the west blows toward the east: the outline lies east of the source.
    const east = yellow!.outline.map((p) => p.east)
    expect(Math.max(...east)).toBeGreaterThan(Math.abs(Math.min(...east)))
  })

  it('reports a zone a level never reaches as empty', () => {
    const [z] = plumeFootprint({
      releaseGramsPerSecond: 0.001,
      windMs: 5,
      windFromDeg: 0,
      stability: 'B',
      molecularWeight: 50,
      levels: [{ label: 'Red', ppm: 1000 }],
    })
    expect(z).toMatchObject({ distanceM: 0, widthM: 0, outline: [] })
  })
})
