// The weather instrument figures other than radar: sounding (skew-T, hodograph), satellite,
// model panel, mesoanalysis, meteogram and ensemble plume. Sample data are the recorded
// sounding and hourly observations and analytic simulated fields (src/main/toolkits/weather).
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  sampleMesoanalysis,
  sampleMeteogram,
  sampleModelPanel,
  samplePlume,
  sampleSatellite,
} from '../../../toolkits/weather/figure-samples'
import { sampleSounding } from '../../../toolkits/weather/sounding-sample'
import { gridValues, packGrid } from './grid'
import { kinematics, lcl, moistLift, satVaporPressure, surfaceParcel, windProfile } from './thermo'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { renderFigure, listFigureKinds } = await import('../index')

describe('thermodynamics', () => {
  it('computes the saturation vapor pressure and the lifted condensation level', () => {
    expect(satVaporPressure(20)).toBeCloseTo(23.4, 0)
    const l = lcl(25, 15, 1000)
    expect(l.p).toBeGreaterThan(850)
    expect(l.p).toBeLessThan(880)
    expect(l.tK - 273.15).toBeCloseTo(13, 0)
  })

  it('cools a saturated parcel more slowly than a dry one', () => {
    const moist = moistLift(293.15, 900, 700)
    const dry = 293.15 * Math.pow(700 / 900, 0.2854)
    expect(moist).toBeGreaterThan(dry + 5)
    expect(moist).toBeLessThan(293.15)
  })

  it('finds CAPE in an unstable profile and none in a stable one', () => {
    const unstable = [
      { pressureHpa: 1000, heightM: 100, tempC: 30, dewpointC: 22 },
      { pressureHpa: 850, heightM: 1500, tempC: 20, dewpointC: 17 },
      { pressureHpa: 700, heightM: 3100, tempC: 10, dewpointC: -2 },
      { pressureHpa: 500, heightM: 5800, tempC: -12, dewpointC: -25 },
      { pressureHpa: 300, heightM: 9600, tempC: -42, dewpointC: -55 },
      { pressureHpa: 200, heightM: 12300, tempC: -58, dewpointC: -70 },
      { pressureHpa: 100, heightM: 16600, tempC: -62, dewpointC: -80 },
    ]
    const p = surfaceParcel(unstable)!
    expect(p.cape).toBeGreaterThan(1500)
    expect(p.cin).toBeLessThanOrEqual(0)
    expect(p.lfcHeightAglM).toBeDefined()
    expect(p.elHeightAglM!).toBeGreaterThan(8000)
    const stable = unstable.map((l, i) => ({ ...l, tempC: 30 - i * 3, dewpointC: 10 - i * 4 }))
    expect(surfaceParcel(stable)!.cape).toBe(0)
  })

  it('computes shear and helicity from a turning wind profile', () => {
    const levels = [0, 1000, 3000, 6000, 8000].map((z, i) => ({
      pressureHpa: 1000 - i * 150,
      heightM: z,
      tempC: 20 - i * 8,
      windDirDeg: 160 + i * 25,
      windSpeedKt: 10 + i * 12,
    }))
    const k = kinematics(levels)!
    expect(k.shear06Kt).toBeGreaterThan(35)
    expect(k.srh03).toBeGreaterThan(50)
    expect(windProfile(levels)).toHaveLength(5)
    expect(kinematics(levels.slice(0, 3))).toBeUndefined()
  })
})

describe('recorded sounding (KILN, 7 May 2024, 12Z)', () => {
  const lv = sampleSounding().levels
  it('has a moist surface layer, a low lifted condensation level and modest CAPE', () => {
    const p = surfaceParcel(lv)!
    expect(p.lclHeightAglM).toBeLessThan(500)
    expect(p.cape).toBeGreaterThan(0)
    expect(p.cape).toBeLessThan(1000)
  })
})

describe('figure kinds', () => {
  const specs: Record<string, () => { kind: string; data: unknown }> = {
    skew_t: () => ({ kind: 'skew_t', data: sampleSounding() }),
    hodograph: () => ({ kind: 'hodograph', data: sampleSounding() }),
    satellite: () => ({ kind: 'satellite', data: sampleSatellite('infrared') }),
    model_panel: () => ({ kind: 'model_panel', data: sampleModelPanel() }),
    mesoanalysis: () => ({ kind: 'mesoanalysis', data: sampleMesoanalysis() }),
    meteogram: () => ({ kind: 'meteogram', data: sampleMeteogram() }),
    ensemble_plume: () => ({ kind: 'ensemble_plume', data: samplePlume() }),
  }

  it('registers every kind', () => {
    expect(listFigureKinds()).toEqual(expect.arrayContaining(['radar', ...Object.keys(specs)]))
  })

  it.each(Object.keys(specs))(
    '%s draws an svg with a summary and a table, the same bytes twice',
    (k) => {
      const a = renderFigure(specs[k]!())
      const b = renderFigure(specs[k]!())
      expect(a.svg.startsWith('<svg')).toBe(true)
      expect(a.svg).toBe(b.svg)
      expect(a.summary.length).toBeGreaterThan(80)
      expect(a.table!.rows.length).toBeGreaterThan(1)
      expect(a.svg).toMatch(/Historical data|Simulated data/)
      expect(a.svg).toContain('exercise figure')
    },
  )

  it('the skew-T summary carries the indices and the hodograph the shear', () => {
    const t = renderFigure(specs.skew_t!())
    expect(t.summary).toMatch(/surface-based parcel has \d+ J\/kg of CAPE/)
    expect(t.summary).toMatch(/Bulk shear is [\d.]+ kt over 0 to 6 km/)
    expect(t.table!.rows.map((r) => r[0])).toContain('Lifted condensation level')
    const h = renderFigure(specs.hodograph!())
    expect(h.summary).toMatch(/Height marks are at 1, 3, 6 and 9 km/)
    expect(h.summary).toMatch(/storm-relative helicity is -?\d+ m2\/s2 over 0 to 3 km/)
  })

  it('the meteogram states extremes from the recorded observations', () => {
    const r = renderFigure(specs.meteogram!())
    expect(r.summary).toContain('Temperature ranges from 67 F at 12Z to 75 F')
    expect(r.summary).toContain('The highest gust is 21 kt at 21Z')
    expect(r.summary).toMatch(/Pressure falls 6\.5 mb/)
    expect(r.summary).toContain('Total precipitation is 0.19 in')
  })

  it('the plume counts members past a threshold', () => {
    const r = renderFigure(specs.ensemble_plume!())
    expect(r.summary).toMatch(
      /\d+ of 24 members \(\d+ percent\) reach Flash flood guidance, 2\.00 in/,
    )
    expect(r.table!.columns).toContain('Highest member')
  })

  it('the grid maps report the maximum, the area above a threshold and the values at places', () => {
    const r = renderFigure(specs.mesoanalysis!())
    expect(r.summary).toMatch(/The maximum is \d+ J\/kg near/)
    expect(r.summary).toMatch(/Values of 1000 J\/kg or more cover about \d+ km2/)
    expect(r.summary).toContain('Cincinnati')
    expect(r.svg).toContain('1000 to 2000')
    expect(renderFigure(specs.model_panel!()).svg).toContain('Exercise watch')
    expect(renderFigure(specs.satellite!()).summary).toContain('GOES-East')
  })

  it('refuses bad data', () => {
    const met = sampleMeteogram()
    expect(() =>
      renderFigure({ kind: 'meteogram', data: { ...met, tempF: met.tempF!.slice(1) } }),
    ).toThrow(/one per time/)
    const grid = sampleModelPanel()
    expect(() =>
      renderFigure({
        kind: 'model_panel',
        data: { ...grid, field: { ...grid.field, nx: grid.field.nx + 1 } },
      }),
    ).toThrow(/expected \d+ codes/)
    const plume = samplePlume()
    expect(() =>
      renderFigure({
        kind: 'ensemble_plume',
        data: { ...plume, members: [[1, 2], plume.members[1]!] },
      }),
    ).toThrow(/member 1/)
  })
})

describe('gridded field packing', () => {
  it('round-trips values within the 8-bit resolution and keeps missing cells', () => {
    const bounds = { west: -90, south: 30, east: -80, north: 40, nx: 3, ny: 2 }
    const g = packGrid(bounds, [0, 50, 100, null, 25, 75])
    const v = gridValues(g)
    expect(v[3]).toBeNull()
    expect(g.min).toBe(0)
    expect(g.max).toBe(100)
    ;[0, 50, 100, 25, 75].forEach((x, i) => {
      const got = v[[0, 1, 2, 4, 5][i]!]!
      expect(Math.abs(got - x)).toBeLessThan(0.3)
    })
  })
})
