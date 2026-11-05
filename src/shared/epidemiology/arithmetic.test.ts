import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  HOUR_MS,
  association,
  attackRate,
  exposureWindowBeforeOnset,
  finalSize,
  infectiousWindow,
  monitoringWindowAfterExposure,
  pathogenById,
  r0FromFinalSize,
  windowWithin,
} from './arithmetic'

const T0 = Date.UTC(2026, 9, 18, 0, 0, 0)

describe('exposure and infectious windows', () => {
  it('computes the exposure window before a norovirus onset', () => {
    const w = exposureWindowBeforeOnset(T0, pathogenById('norovirus')!)
    expect(T0 - w.startMs).toBe(48 * HOUR_MS)
    expect(T0 - w.endMs).toBe(12 * HOUR_MS)
  })

  it('puts the measles infectious period 4 days either side of rash onset', () => {
    const w = infectiousWindow(T0, pathogenById('measles')!)!
    expect(T0 - w.startMs).toBe(4 * DAY_MS)
    expect(w.endMs - T0).toBe(4 * DAY_MS)
  })

  it('has no fixed infectious window for pertussis', () => {
    expect(infectiousWindow(T0, pathogenById('pertussis')!)).toBeNull()
  })

  it('monitors a measles contact from day 7 to day 21 after exposure', () => {
    const w = monitoringWindowAfterExposure(T0, pathogenById('measles')!)
    expect((w.startMs - T0) / DAY_MS).toBe(7)
    expect((w.endMs - T0) / DAY_MS).toBe(21)
    expect(windowWithin({ startMs: T0 + 8 * DAY_MS, endMs: T0 + 9 * DAY_MS }, w)).toBe(true)
  })

  it('cites a source for every pathogen fact', () => {
    for (const id of [
      'norovirus',
      'salmonella',
      'measles',
      'influenza',
      'sars_cov_2',
      'pertussis',
      'legionella',
    ])
      expect(pathogenById(id)?.source, id).toMatch(/CDC/)
  })
})

describe('attack rate and association', () => {
  it('divides ill by exposed', () => {
    expect(attackRate(30, 60)).toBe(0.5)
    expect(attackRate(0, 0)).toBeNull()
  })

  it('gives the textbook odds ratio and relative risk for a 2x2 table', () => {
    const a = association({ a: 40, b: 10, c: 5, d: 45 })
    expect(a.attackRateExposed).toBeCloseTo(0.8, 10)
    expect(a.attackRateUnexposed).toBeCloseTo(0.1, 10)
    expect(a.relativeRisk).toBeCloseTo(8, 10)
    expect(a.oddsRatio).toBeCloseTo(36, 10)
    const [lo, hi] = a.oddsRatioCi!
    expect(lo).toBeGreaterThan(1)
    expect(hi).toBeGreaterThan(36)
    expect(lo).toBeLessThan(36)
  })

  it('adds one half to every cell when a cell is empty', () => {
    const a = association({ a: 10, b: 0, c: 2, d: 8 })
    expect(a.oddsRatio).toBeCloseTo((10.5 * 8.5) / (0.5 * 2.5), 10)
  })

  it('has no odds ratio with nobody in one group', () => {
    expect(association({ a: 3, b: 4, c: 0, d: 0 }).oddsRatio).toBeNull()
  })
})

describe('final size relation', () => {
  it('matches the reference values of z = 1 - exp(-R0 z)', () => {
    // Reference values from solving the relation to six places.
    expect(finalSize(1.5)).toBeCloseTo(0.582812, 5)
    expect(finalSize(2)).toBeCloseTo(0.796812, 5)
    expect(finalSize(3)).toBeCloseTo(0.94048, 5)
    expect(finalSize(0.9)).toBe(0)
  })

  it('inverts to the reproduction number', () => {
    expect(r0FromFinalSize(finalSize(2.5))).toBeCloseTo(2.5, 6)
    expect(r0FromFinalSize(0)).toBeNull()
  })
})
