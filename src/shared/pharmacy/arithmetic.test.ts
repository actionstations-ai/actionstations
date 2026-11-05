// Pharmacy arithmetic (spec 0463 FR-8): days on hand, the stock projection under an allocation and
// the time spent outside a temperature range.
import { describe, expect, it } from 'vitest'
import {
  cToF,
  daysOnHand,
  excursionSpans,
  fToC,
  minutesOutsideRange,
  projectStock,
} from './arithmetic'

describe('days on hand', () => {
  it('is on hand divided by usage per day', () => {
    expect(daysOnHand(1840, 460)).toBe(4)
    expect(daysOnHand(10, 0)).toBeUndefined()
  })
})

describe('stock projection', () => {
  const base = { onHand: 1840, usagePerDay: 460, horizonDays: 10 }

  it('runs out on day on-hand over usage without an allocation', () => {
    const p = projectStock({ ...base, allocationPercent: 100 })
    expect(p.stockoutDay).toBe(4)
    expect(p.stock.slice(0, 5)).toEqual([1840, 1380, 920, 460, 0])
    expect(p.stock.at(-1)).toBe(0)
  })

  it('moves the stockout date later when the allocation lowers usage', () => {
    expect(projectStock({ ...base, allocationPercent: 50 }).stockoutDay).toBe(8)
    expect(projectStock({ ...base, allocationPercent: 25 }).stockoutDay).toBeUndefined()
  })

  it('counts deliveries and never falls below zero', () => {
    const p = projectStock({ ...base, allocationPercent: 100, deliveriesPerDay: 460 })
    expect(p.stockoutDay).toBeUndefined()
    expect(p.stock.every((x) => x === 1840)).toBe(true)
    expect(projectStock({ ...base, allocationPercent: 100 }).stock.every((x) => x >= 0)).toBe(true)
  })
})

describe('temperature excursions', () => {
  const rise = [
    { x: 0, tempC: 4 },
    { x: 60, tempC: 10 },
    { x: 120, tempC: 4 },
  ]

  it('finds the crossing times by straight lines between readings', () => {
    // 4 to 10 over 60 minutes crosses 8 at minute 40; the way down crosses at minute 80.
    expect(excursionSpans(rise, 2, 8)).toEqual([{ from: 40, to: 80 }])
    expect(minutesOutsideRange(rise, 2, 8)).toBe(40)
  })

  it('reports no time outside a range the series stays within', () => {
    expect(minutesOutsideRange(rise, 2, 12)).toBe(0)
  })

  it('counts a below-range span too and merges touching spans', () => {
    const cold = [
      { x: 0, tempC: 5 },
      { x: 30, tempC: -1 },
      { x: 60, tempC: 5 },
    ]
    expect(minutesOutsideRange(cold, 2, 8)).toBeGreaterThan(0)
    expect(excursionSpans(cold, 2, 8)).toHaveLength(1)
  })

  it('converts scales as the CDC ranges do', () => {
    expect(Math.round(cToF(2))).toBe(36)
    expect(Math.round(cToF(8))).toBe(46)
    expect(Math.round(cToF(-50))).toBe(-58)
    expect(Math.round(fToC(5))).toBe(-15)
  })
})
