// Business-day calendars for regulatory clocks (#426, spec 0426 FR-5). Pure and offline: US
// federal holidays are computed by rule (5 U.S.C. 6103), with the observed-day rule (a Saturday
// holiday is observed on the Friday before, a Sunday holiday on the Monday after).
//
// Dates here are "floating" calendar dates: a Date whose UTC fields are the scenario's local
// date and time (scenario-time.ts). No time zone is involved.
import type { BusinessCalendar } from '../schemas/compliance'

const DAY_MS = 86_400_000

/** "2026-10-28" for a floating date. */
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10)

const utc = (y: number, m: number, day: number): Date => new Date(Date.UTC(y, m - 1, day))

/** The nth (1-based) weekday (0 = Sunday) of a month; n = -1 is the last one. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  if (n < 0) {
    const last = utc(year, month + 1, 0)
    const back = (last.getUTCDay() - weekday + 7) % 7
    return new Date(last.getTime() - back * DAY_MS)
  }
  const first = utc(year, month, 1)
  const ahead = (weekday - first.getUTCDay() + 7) % 7
  return utc(year, month, 1 + ahead + (n - 1) * 7)
}

/** A fixed-date holiday moved to the weekday it is observed on. */
function observed(d: Date): Date {
  const wd = d.getUTCDay()
  if (wd === 6) return new Date(d.getTime() - DAY_MS)
  if (wd === 0) return new Date(d.getTime() + DAY_MS)
  return d
}

export interface Holiday {
  /** The observed date, "YYYY-MM-DD" (may fall in the previous year for New Year's Day). */
  date: string
  name: string
}

/** The eleven US federal holidays of a year, on their observed dates. */
export function usFederalHolidays(year: number): Holiday[] {
  const list: [string, Date][] = [
    ["New Year's Day", observed(utc(year, 1, 1))],
    ['Birthday of Martin Luther King, Jr.', nthWeekday(year, 1, 1, 3)],
    ["Washington's Birthday", nthWeekday(year, 2, 1, 3)],
    ['Memorial Day', nthWeekday(year, 5, 1, -1)],
    ['Juneteenth National Independence Day', observed(utc(year, 6, 19))],
    ['Independence Day', observed(utc(year, 7, 4))],
    ['Labor Day', nthWeekday(year, 9, 1, 1)],
    ['Columbus Day', nthWeekday(year, 10, 1, 2)],
    ['Veterans Day', observed(utc(year, 11, 11))],
    ['Thanksgiving Day', nthWeekday(year, 11, 4, 4)],
    ['Christmas Day', observed(utc(year, 12, 25))],
  ]
  return list.map(([name, d]) => ({ name, date: isoDay(d) }))
}

const holidayCache = new Map<number, Set<string>>()

/** Observed holiday dates that fall in `year` (next year's New Year's Day can, too). */
function holidaysIn(year: number): Set<string> {
  let set = holidayCache.get(year)
  if (!set) {
    set = new Set(
      [...usFederalHolidays(year), ...usFederalHolidays(year + 1)]
        .map((h) => h.date)
        .filter((d) => d.startsWith(`${year}-`)),
    )
    holidayCache.set(year, set)
  }
  return set
}

export const isWeekend = (d: Date): boolean => d.getUTCDay() === 0 || d.getUTCDay() === 6

/**
 * Whether a date counts as a business day. `none` has no holiday list, so it counts weekdays
 * like `weekdays` (a regulation that uses business days names its calendar).
 */
export function isBusinessDay(d: Date, calendar: BusinessCalendar): boolean {
  if (isWeekend(d)) return false
  if (calendar !== 'us_federal') return true
  return !holidaysIn(d.getUTCFullYear()).has(isoDay(d))
}

/**
 * The same time of day on the nth business day after `from` (the trigger's own day does not
 * count). 4 business days from Thursday 10:40 is the next Wednesday 10:40.
 */
export function addBusinessDays(from: Date, n: number, calendar: BusinessCalendar): Date {
  let d = from
  let left = Math.max(0, Math.floor(n))
  while (left > 0) {
    d = new Date(d.getTime() + DAY_MS)
    if (isBusinessDay(d, calendar)) left--
  }
  return d
}

/** Calendar-month addition, clamped to the last day of the target month (Jan 31 + 1 → Feb 28). */
export function addMonths(from: Date, n: number): Date {
  const y = from.getUTCFullYear()
  const m = from.getUTCMonth() + Math.floor(n)
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const day = Math.min(from.getUTCDate(), lastDay)
  const out = new Date(from.getTime())
  out.setUTCFullYear(y, m, day)
  return out
}
