// Pharmacy arithmetic shared by the figures, the simulation models and the metrics (spec 0463):
// days on hand, the stock projection under an allocation, and the time a temperature series
// spends outside a range. Pure and deterministic. Exercise content, not guidance.

export const cToF = (c: number): number => (c * 9) / 5 + 32
export const fToC = (f: number): number => ((f - 32) * 5) / 9

/** On hand divided by usage per day; undefined when nothing is used. */
export function daysOnHand(onHand: number, usagePerDay: number): number | undefined {
  return usagePerDay > 0 ? onHand / usagePerDay : undefined
}

export interface ProjectionInput {
  onHand: number
  /** Containers used per day before any allocation. */
  usagePerDay: number
  /** Percent of that usage the pharmacy serves under the allocation (100 means no allocation). */
  allocationPercent: number
  /** Containers received per day. */
  deliveriesPerDay?: number
  horizonDays: number
}

export interface Projection {
  /** Stock at the start of each whole day, 0 to the horizon, never below zero. */
  stock: number[]
  /** Containers used per day under the allocation. */
  servedPerDay: number
  /** Net loss per day (served minus deliveries); zero or less means the stock does not fall. */
  netPerDay: number
  /** The day, counted from 0 with fractions, on which the stock reaches zero; undefined when it does not within the horizon. */
  stockoutDay: number | undefined
}

/** The stock under an allocation: an allocation percentage lowers what is served, so it moves the stockout date. */
export function projectStock(i: ProjectionInput): Projection {
  const servedPerDay = (i.usagePerDay * Math.min(100, Math.max(0, i.allocationPercent))) / 100
  const netPerDay = servedPerDay - (i.deliveriesPerDay ?? 0)
  const stock: number[] = []
  for (let d = 0; d <= i.horizonDays; d++) stock.push(Math.max(0, i.onHand - netPerDay * d))
  const stockoutDay =
    netPerDay > 0 && i.onHand / netPerDay <= i.horizonDays ? i.onHand / netPerDay : undefined
  return { stock, servedPerDay, netPerDay, stockoutDay }
}

export interface TempPoint {
  /** Minutes from the start of the series. */
  x: number
  tempC: number
}

/** Minutes spent outside [lowC, highC], with the crossing times found by straight lines between readings. */
export function minutesOutsideRange(
  points: readonly TempPoint[],
  lowC: number,
  highC: number,
): number {
  return excursionSpans(points, lowC, highC).reduce((sum, s) => sum + (s.to - s.from), 0)
}

/** The spans (start and end minute) in which the series is outside the range, for shading. */
export function excursionSpans(
  points: readonly TempPoint[],
  lowC: number,
  highC: number,
): { from: number; to: number }[] {
  const pts = [...points].sort((a, b) => a.x - b.x)
  const spans: { from: number; to: number }[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const span = b.x - a.x
    const dy = b.tempC - a.tempC
    const cuts = [0, 1]
    if (dy !== 0)
      for (const limit of [lowC, highC]) {
        const t = (limit - a.tempC) / dy
        if (t > 0 && t < 1) cuts.push(t)
      }
    cuts.sort((p, q) => p - q)
    for (let k = 1; k < cuts.length; k++) {
      const mid = a.tempC + dy * ((cuts[k - 1]! + cuts[k]!) / 2)
      if (mid >= lowC && mid <= highC) continue
      const from = a.x + cuts[k - 1]! * span
      const to = a.x + cuts[k]! * span
      const last = spans.at(-1)
      if (last && Math.abs(last.to - from) < 1e-9) last.to = to
      else spans.push({ from, to })
    }
  }
  return spans
}

// ---- controlled substance notice dates -------------------------------------------------------

const DAY_MS = 86_400_000
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const parseDay = (s: string): number => Date.parse(`${s}T00:00:00Z`)

/** The next weekday after `day` (YYYY-MM-DD); weekends are skipped, federal holidays are not known here. */
export function nextBusinessDay(day: string): string {
  let ms = parseDay(day) + DAY_MS
  while ([0, 6].includes(new Date(ms).getUTCDay())) ms += DAY_MS
  return isoDay(ms)
}

export const addCalendarDays = (day: string, days: number): string =>
  isoDay(parseDay(day) + days * DAY_MS)
