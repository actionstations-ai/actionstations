import { describe, expect, it } from 'vitest'
import { addBusinessDays, addMonths, isBusinessDay, isoDay, usFederalHolidays } from './calendars'
import { parseLocal } from './scenario-time'

const day = (s: string) => parseLocal(`${s}T12:00`)

// Observed dates as published by OPM (opm.gov/policy-data-oversight/pay-leave/federal-holidays).
const OPM: Record<number, string[]> = {
  2024: [
    '2024-01-01',
    '2024-01-15',
    '2024-02-19',
    '2024-05-27',
    '2024-06-19',
    '2024-07-04',
    '2024-09-02',
    '2024-10-14',
    '2024-11-11',
    '2024-11-28',
    '2024-12-25',
  ],
  2026: [
    '2026-01-01',
    '2026-01-19',
    '2026-02-16',
    '2026-05-25',
    '2026-06-19',
    '2026-07-03',
    '2026-09-07',
    '2026-10-12',
    '2026-11-11',
    '2026-11-26',
    '2026-12-25',
  ],
  2027: [
    '2027-01-01',
    '2027-01-18',
    '2027-02-15',
    '2027-05-31',
    '2027-06-18',
    '2027-07-05',
    '2027-09-06',
    '2027-10-11',
    '2027-11-11',
    '2027-11-25',
    '2027-12-24',
  ],
  2028: [
    '2027-12-31',
    '2028-01-17',
    '2028-02-21',
    '2028-05-29',
    '2028-06-19',
    '2028-07-04',
    '2028-09-04',
    '2028-10-09',
    '2028-11-10',
    '2028-11-23',
    '2028-12-25',
  ],
}

describe('US federal holidays', () => {
  it.each(Object.entries(OPM))('match the OPM list for %s', (year, dates) => {
    expect(usFederalHolidays(Number(year)).map((h) => h.date)).toEqual(dates)
  })

  it('lists eleven holidays every year from 2024 to 2030, all on weekdays', () => {
    for (let y = 2024; y <= 2030; y++) {
      const list = usFederalHolidays(y)
      expect(list).toHaveLength(11)
      for (const h of list) expect([0, 6]).not.toContain(day(h.date).getUTCDay())
    }
  })

  it('observes a Saturday Juneteenth on Friday and a Sunday Independence Day on Monday', () => {
    expect(isBusinessDay(day('2027-06-18'), 'us_federal')).toBe(false)
    expect(isBusinessDay(day('2027-07-05'), 'us_federal')).toBe(false)
  })

  it("counts the observed New Year's Day in the previous December", () => {
    expect(isBusinessDay(day('2027-12-31'), 'us_federal')).toBe(false)
    expect(isBusinessDay(day('2027-12-31'), 'weekdays')).toBe(true)
  })
})

describe('business days', () => {
  it('4 business days from Thursday 10:40 is the next Wednesday 10:40', () => {
    const due = addBusinessDays(parseLocal('2026-03-12T10:40'), 4, 'us_federal')
    expect(due.toISOString().slice(0, 16)).toBe('2026-03-18T10:40')
  })

  it('skips a Monday federal holiday (Labor Day 2026)', () => {
    const due = addBusinessDays(parseLocal('2026-09-03T10:40'), 4, 'us_federal')
    expect(due.toISOString().slice(0, 16)).toBe('2026-09-10T10:40')
  })

  it('the weekdays calendar ignores holidays', () => {
    const due = addBusinessDays(parseLocal('2026-09-03T10:40'), 4, 'weekdays')
    expect(isoDay(due)).toBe('2026-09-09')
  })

  it('a trigger on a Saturday counts from the Monday', () => {
    expect(isoDay(addBusinessDays(parseLocal('2026-03-14T09:00'), 1, 'us_federal'))).toBe(
      '2026-03-16',
    )
  })
})

describe('calendar months', () => {
  it.each([
    ['2026-01-31T09:00', 1, '2026-02-28T09:00'],
    ['2028-01-31T09:00', 1, '2028-02-29T09:00'],
    ['2026-03-15T14:30', 1, '2026-04-15T14:30'],
    ['2026-12-20T08:00', 1, '2027-01-20T08:00'],
    ['2026-08-31T08:00', 3, '2026-11-30T08:00'],
  ])('%s + %i month(s) is %s', (from, n, want) => {
    expect(addMonths(parseLocal(from), n).toISOString().slice(0, 16)).toBe(want)
  })
})
