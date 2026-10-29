// Date helpers for the health dashboard (#438). All UTC, none reads the clock: `now` is always
// passed in so the same inputs give the same report (NFR-5).
import type { Schedule } from '../schemas/program'

const DAY_MS = 24 * 3600 * 1000

/** "2026-Q2" for an ISO date or date-time. */
export function quarterOf(iso: string): string {
  const month = Number(iso.slice(5, 7))
  return `${iso.slice(0, 4)}-Q${Math.floor((month - 1) / 3) + 1}`
}

export function cycleQuarters(cycle: { startYear: number; years: number }): string[] {
  const out: string[] = []
  for (let y = cycle.startYear; y < cycle.startYear + cycle.years; y++)
    for (let q = 1; q <= 4; q++) out.push(`${y}-Q${q}`)
  return out
}

/** Whole days from `fromDay` to `toDay` (YYYY-MM-DD each); negative when `toDay` is earlier. */
export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round(
    (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS,
  )
}

/** The day `months` calendar months before `now`. */
export function monthsBefore(now: Date, months: number): string {
  const d = new Date(now.getTime())
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString().slice(0, 10)
}

/** "2026-Q2" for a planned exercise in the schedule. */
export function plannedQuarter(e: Schedule['exercises'][number]): string {
  return 'date' in e.when ? quarterOf(e.when.date) : `${e.when.year}-Q${e.when.quarter}`
}

/** The last day of a "2026-Q2" quarter. */
export function quarterEnd(quarter: string): string {
  const year = Number(quarter.slice(0, 4))
  const q = Number(quarter.slice(6))
  const ends = ['03-31', '06-30', '09-30', '12-31']
  return `${year}-${ends[q - 1]}`
}
