// The zone calculator (spec 0460 FR-6): distances, boundaries, designer overrides and merging.
import { describe, expect, it } from 'vitest'
import { HPAI_PLAN } from '@shared/animal-disease/plan-rules'
import { circleRing, fromLocalKm, haversineKm } from './geo'
import { computeZones, type PlacedPremises } from './zones'

const ORIGIN = { lat: 44.3, lon: -93.9 }
const at = (id: string, east: number, north = 0): PlacedPremises => ({
  id,
  ...fromLocalKm(ORIGIN, east, north),
})
const IP = at('IP-001', 0)
const zoneOf = (r: ReturnType<typeof computeZones>, id: string) =>
  r.placements.find((p) => p.id === id)!.zone

describe('distances', () => {
  it('measures kilometers and round-trips the local projection', () => {
    const p = fromLocalKm(ORIGIN, 3, 4)
    expect(haversineKm(ORIGIN, p)).toBeCloseTo(5, 2)
    expect(circleRing(ORIGIN, 10).length).toBe(49)
  })
})

describe('computeZones for HPAI', () => {
  const premises = [
    at('P-A', 2.9),
    at('P-B', 3.1),
    at('P-C', 9.9),
    at('P-D', 10.1),
    at('P-E', 19.9, 0),
    at('P-F', 20.1, 0),
  ]
  const r = computeZones({ plan: 'hpai', infected: [IP], premises })

  it('uses the plan minimums and records the basis', () => {
    expect(r.plan).toBe(HPAI_PLAN)
    expect(r.zones.map((z) => [z.kind, z.extentKm])).toEqual([
      ['infected zone', 3],
      ['buffer zone', 7],
      ['control area', 10],
      ['surveillance zone', 10],
    ])
    expect(r.zones[0]!.basis).toMatch(/plan minimum \(HPAI Red Book \(May 2017\)\)/)
    expect(r.warnings).toEqual([])
  })

  it('places premises on each side of every boundary', () => {
    expect(zoneOf(r, 'P-A')).toBe('infected zone')
    expect(zoneOf(r, 'P-B')).toBe('buffer zone')
    expect(zoneOf(r, 'P-C')).toBe('buffer zone')
    expect(zoneOf(r, 'P-D')).toBe('surveillance zone')
    expect(zoneOf(r, 'P-E')).toBe('surveillance zone')
    expect(zoneOf(r, 'P-F')).toBe('free area')
    expect(zoneOf(r, 'IP-001')).toBe('infected zone')
  })

  it('offers designations that fit the place, with monitored reached through at-risk', () => {
    const options = (id: string) => r.placements.find((p) => p.id === id)!.options
    expect(options('IP-001')).toEqual(['infected'])
    expect(options('P-B')).toEqual(['at-risk', 'free'])
    for (const p of r.placements) expect(p.options).not.toContain('monitored')
  })

  it('counts a premises exactly on the boundary as inside', () => {
    const edge = at('P-EDGE', 3)
    const d = haversineKm(IP, edge)
    const out = computeZones({
      plan: 'hpai',
      infected: [IP],
      premises: [edge],
      sizes: { infectedZoneKm: d },
      reason: 'test',
    })
    expect(zoneOf(out, 'P-EDGE')).toBe('infected zone')
  })

  it('draws three rings around each infected premises', () => {
    expect(r.rings.map((x) => [x.kind, x.radiusKm])).toEqual([
      ['infected zone', 3],
      ['control area', 10],
      ['surveillance zone', 20],
    ])
  })
})

describe('designer overrides', () => {
  it('records the reason and warns about a size under the plan minimum', () => {
    const r = computeZones({
      plan: 'hpai',
      infected: [IP],
      premises: [],
      sizes: { controlAreaKm: 8 },
      reason: 'River forms the western boundary',
    })
    expect(r.zones[2]!.basis).toMatch(/designer's sizes: River forms/)
    expect(r.warnings.join(' ')).toMatch(
      /controlAreaKm is 8 km, under the HPAI Red Book \(May 2017\) minimum of 10 km/,
    )
  })

  it('warns when sizes change with no reason, and allows larger sizes quietly otherwise', () => {
    const r = computeZones({
      plan: 'hpai',
      infected: [IP],
      premises: [],
      sizes: { controlAreaKm: 12 },
    })
    expect(r.warnings).toEqual(['The sizes were changed with no reason recorded.'])
  })

  it('needs the designer to state FMD sizes', () => {
    expect(() => computeZones({ plan: 'fmd', infected: [IP], premises: [] })).toThrow(
      /state all four sizes/,
    )
    const r = computeZones({
      plan: 'fmd',
      infected: [IP],
      premises: [at('P', 4)],
      sizes: { infectedZoneKm: 3, bufferZoneKm: 7, controlAreaKm: 10, surveillanceZoneKm: 10 },
      reason: 'from the state FMD plan',
    })
    expect(r.plan.id).toBe('fmd')
  })

  it('refuses a run with no infected premises', () => {
    expect(() => computeZones({ plan: 'hpai', infected: [], premises: [] })).toThrow(
      /infected premises/,
    )
  })
})

describe('merging control areas', () => {
  it('joins infected premises whose areas overlap and keeps distant ones apart', () => {
    const near = at('IP-002', 15)
    const far = at('IP-003', 60)
    const member = at('P-M', 8)
    const r = computeZones({ plan: 'hpai', infected: [IP, near, far], premises: [member] })
    expect(r.controlAreas).toHaveLength(2)
    const joined = r.controlAreas.find((g) => g.infected.includes('IP-001'))!
    expect(joined.infected.sort()).toEqual(['IP-001', 'IP-002'])
    expect(joined.premises).toContain('P-M')
    expect(r.controlAreas.find((g) => g.infected.includes('IP-003'))!.premises).toEqual([])
  })

  it('measures from the closest infected premises', () => {
    const r = computeZones({
      plan: 'hpai',
      infected: [IP, at('IP-002', 30)],
      premises: [at('P-X', 28)],
    })
    expect(r.placements.find((p) => p.id === 'P-X')!.distanceKm).toBeCloseTo(2, 1)
    expect(zoneOf(r, 'P-X')).toBe('infected zone')
  })
})
