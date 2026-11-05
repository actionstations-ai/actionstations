// The shortage model (spec 0463 FR-8, FR-10): stock, usage, deliveries and an allocation
// percentage, one day at a time. Days on hand is on hand over usage, and an allocation lowers
// what is served, so it moves the projected stockout date and raises the doses that go unmet.
// Pure and deterministic; the metrics rerun it with the team's allocation decisions to compare
// what happened with what would have. All values are simulated.
import { z } from 'zod'
import { daysOnHand, projectStock } from '../../../../shared/pharmacy/arithmetic'

export const ShortageParams = z.object({
  startDate: z.iso.datetime().default('2026-11-05T08:00:00Z'),
  drug: z.string().min(1).max(100).default('Sodium chloride 0.9% injection, 1,000 mL bag'),
  unit: z.string().max(30).default('containers'),
  onHand: z.number().min(0).max(10_000_000).default(1840),
  usagePerDay: z.number().positive().max(1_000_000).default(460),
  horizonDays: z.number().int().min(2).max(60).default(14),
  /** Containers that arrive at the start of a day. */
  deliveries: z
    .array(z.object({ day: z.number().int().min(0).max(60), quantity: z.number().min(0) }))
    .max(60)
    .default([]),
  /** From `day` on, the pharmacy serves `percent` of usage (a set-allocation decision). */
  allocationChanges: z
    .array(z.object({ day: z.number().int().min(0).max(60), percent: z.number().min(0).max(100) }))
    .max(60)
    .default([]),
})
export type ShortageParams = z.output<typeof ShortageParams>

export interface ShortageDay {
  day: number
  /** Stock at the start of the day, after deliveries. */
  stock: number
  demand: number
  allocationPercent: number
  served: number
  unmet: number
  daysOnHand: number | undefined
  /** Projected stockout day (from day 0) if nothing changes from this day on. */
  projectedStockoutDay: number | undefined
}

export interface ShortageRun {
  days: ShortageDay[]
  /** First day on which demand went unmet because the stock was empty. */
  stockoutDay: number | undefined
  totalUnmet: number
  totalServed: number
}

const percentOn = (changes: ShortageParams['allocationChanges'], day: number): number => {
  let percent = 100
  let at = -1
  for (const c of changes) {
    if (c.day > day || c.day < at) continue
    percent = c.percent
    at = c.day
  }
  return percent
}

export function runShortage(p: ShortageParams): ShortageRun {
  const days: ShortageDay[] = []
  let stock = p.onHand
  let stockoutDay: number | undefined
  let totalUnmet = 0
  let totalServed = 0
  for (let day = 0; day <= p.horizonDays; day++) {
    stock += p.deliveries.filter((d) => d.day === day).reduce((n, d) => n + d.quantity, 0)
    const percent = percentOn(p.allocationChanges, day)
    const wanted = (p.usagePerDay * percent) / 100
    const served = Math.min(stock, wanted)
    const unmet = p.usagePerDay - served
    if (stockoutDay === undefined && stock < wanted) stockoutDay = day
    const projection = projectStock({
      onHand: stock,
      usagePerDay: p.usagePerDay,
      allocationPercent: percent,
      horizonDays: Math.max(1, p.horizonDays - day),
    })
    const dOH = daysOnHand(stock, p.usagePerDay)
    days.push({
      day,
      stock: Math.round(stock * 10) / 10,
      demand: p.usagePerDay,
      allocationPercent: percent,
      served: Math.round(served * 10) / 10,
      unmet: Math.round(unmet * 10) / 10,
      daysOnHand: dOH === undefined ? undefined : Math.round(dOH * 10) / 10,
      projectedStockoutDay:
        projection.stockoutDay === undefined
          ? undefined
          : Math.round((day + projection.stockoutDay) * 10) / 10,
    })
    totalUnmet += unmet
    totalServed += served
    stock -= served
  }
  return {
    days,
    stockoutDay,
    totalUnmet: Math.round(totalUnmet * 10) / 10,
    totalServed: Math.round(totalServed * 10) / 10,
  }
}
