// Supply chain arithmetic (spec 0462): days of supply, projected stock-out dates, delivery slip
// and time out of a temperature range. Pure functions shared by the figure kinds, the
// simulator and the metrics, so a board, a chart and a score always agree.

export const DAY_MS = 86_400_000
export const MINUTE_MS = 60_000

/** On hand plus confirmed inbound, divided by average daily demand; null when nothing is demanded. */
export function daysOfSupply(onHand: number, inbound: number, dailyDemand: number): number | null {
  if (dailyDemand <= 0) return null
  return Math.max(0, onHand + inbound) / dailyDemand
}

/** The date stock runs out, as an ISO date (UTC), or null when demand is zero. */
export function stockOutDate(asOfMs: number, days: number | null): string | null {
  if (days === null) return null
  return new Date(asOfMs + days * DAY_MS).toISOString().slice(0, 10)
}

export type SupplyState = 'ok' | 'low' | 'critical' | 'out'

/** Out at zero, critical below the floor, low below the reorder point, otherwise ok. */
export function supplyState(
  days: number | null,
  reorderPointDays: number,
  floorDays: number,
): SupplyState {
  if (days === null) return 'ok'
  if (days <= 0) return 'out'
  if (days < floorDays) return 'critical'
  if (days < reorderPointDays) return 'low'
  return 'ok'
}

/** Days between a planned and a current arrival (positive means late), to one decimal. */
export function slipDays(plannedMs: number, currentMs: number): number {
  return Math.round(((currentMs - plannedMs) / DAY_MS) * 10) / 10
}

export interface Reading {
  tMs: number
  value: number
}

export interface ExcursionSummary {
  /** Minutes the temperature was outside [low, high], each interval counted by its first reading. */
  minutesOutside: number
  peak: number
  /** First reading outside the range, or null. */
  firstOutsideMs: number | null
  /** First reading back inside after the last excursion, or null when still outside or never out. */
  returnedMs: number | null
}

/** Summarize readings against an allowed range; readings are sorted by time first. */
export function excursionSummary(
  readings: readonly Reading[],
  low: number,
  high: number,
): ExcursionSummary {
  const rs = [...readings].sort((a, b) => a.tMs - b.tMs)
  const outside = (v: number): boolean => v < low || v > high
  let minutes = 0
  let first: number | null = null
  let lastOutIndex = -1
  let peak = -Infinity
  rs.forEach((r, i) => {
    peak = Math.max(peak, r.value)
    if (outside(r.value)) {
      if (first === null) first = r.tMs
      lastOutIndex = i
      const next = rs[i + 1]
      if (next) minutes += (next.tMs - r.tMs) / MINUTE_MS
    }
  })
  const back = lastOutIndex >= 0 ? rs[lastOutIndex + 1] : undefined
  return {
    minutesOutside: Math.round(minutes),
    peak: rs.length ? peak : 0,
    firstOutsideMs: first,
    returnedMs: back ? back.tMs : null,
  }
}
