// The pure format checks of the pharmacy toolkit (spec 0463 FR-4), apart from the rules that wrap them.
import { describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  checkConcentrationUnits,
  checkDaysOnHand,
  checkExcursionStats,
  checkLossDates,
  checkLotBalance,
  checkNoticeWording,
  checkQueueStatus,
  checkRangeLabel,
  checkTemperaturePairs,
  concentrationUnit,
  cToF,
  ndcMentions,
  ndcProblem,
  nextBusinessDay,
} from './lint'

describe('NDC shape', () => {
  it('accepts the three 10-digit shapes and the 11-digit shape', () => {
    for (const ndc of ['0002-1234-01', '12345-678-90', '12345-6789-0', '12345-6789-01'])
      expect(ndcProblem(ndc), ndc).toBeUndefined()
  })

  it('rejects missing hyphens and wrong segment lengths', () => {
    expect(ndcProblem('1234567890')).toMatch(/no hyphens/)
    expect(ndcProblem('123-4567-89')).toMatch(/not a valid shape/)
    expect(ndcProblem('12345-67-890')).toMatch(/not a valid shape/)
  })

  it('finds NDCs written in prose', () => {
    expect(ndcMentions('Product NDC 99998-0412-01 and NDC: 1234567890.')).toEqual([
      '99998-0412-01',
      '1234567890',
    ])
  })
})

describe('temperature pairs', () => {
  it('converts as the dossier does: 2 to 8 C is 36 to 46 F, and frozen is -50 to -15 C', () => {
    expect(cToF(2)).toBeCloseTo(35.6)
    expect(checkTemperaturePairs('Store at 2 to 8 °C (36 to 46 °F).')).toEqual([])
    expect(checkTemperaturePairs('Freezer range -50 to -15 °C (-58 to 5 °F).')).toEqual([])
    expect(checkTemperaturePairs('Peak 11.6 °C (52.9 °F) at 04:30.')).toEqual([])
  })

  it('flags a pair that does not convert', () => {
    const out = checkTemperaturePairs('Keep at 2 to 8 °C (35 to 50 °F).')
    expect(out).toHaveLength(1)
    expect(out[0]!.message).toMatch(/8 °C is 46 °F, not 50 °F/)
  })

  it('flags a range written in one scale against a single value in the other', () => {
    expect(checkTemperaturePairs('2 to 8 °C (46 °F)')).toHaveLength(1)
  })

  it('checks the range label against the numeric range', () => {
    expect(checkRangeLabel('2 to 8 °C (36 to 46 °F)', 2, 8)).toEqual([])
    expect(checkRangeLabel('2 to 8 °C (36 to 46 °F)', 2, 10)).toHaveLength(1)
  })
})

describe('excursion statistics', () => {
  const base = { lowC: 2, highC: 8, minC: 4.1, maxC: 11.6, minutesOutside: 205 }

  it('accepts statistics that agree with the readings', () => {
    expect(
      checkExcursionStats({
        ...base,
        readings: [
          { time: '22:00', tempC: 4.1, state: 'In range' },
          { time: '04:30', tempC: 11.6, state: 'Out of range' },
        ],
      }),
    ).toEqual([])
  })

  it('flags an excursion with no time outside the range, and the reverse', () => {
    expect(checkExcursionStats({ ...base, minutesOutside: 0 })).toHaveLength(1)
    expect(checkExcursionStats({ ...base, maxC: 7.5, minutesOutside: 30 })).toHaveLength(1)
  })

  it('flags a maximum that is not the highest reading and a wrongly marked reading', () => {
    const out = checkExcursionStats({
      ...base,
      readings: [
        { time: '01:00', tempC: 9, state: 'In range' },
        { time: '02:00', tempC: 10.2, state: 'Out of range' },
      ],
    })
    expect(out.map((p) => p.message).join('\n')).toMatch(/lowest reading listed is 9/)
    expect(out.map((p) => p.message).join('\n')).toMatch(/highest reading listed is 10.2/)
    expect(out.map((p) => p.message).join('\n')).toMatch(
      /01:00 is 9 °C, outside the range, but marked in range/,
    )
  })
})

describe('days on hand and queues', () => {
  it('requires days on hand to equal on hand over usage', () => {
    expect(checkDaysOnHand([{ drug: 'A', onHand: 1840, usagePerDay: 460, daysOnHand: 4 }])).toEqual(
      [],
    )
    expect(
      checkDaysOnHand([{ drug: 'B', onHand: 610, usagePerDay: 150, daysOnHand: 4.1 }]),
    ).toEqual([])
    const bad = checkDaysOnHand([{ drug: 'C', onHand: 1000, usagePerDay: 250, daysOnHand: 6 }])
    expect(bad[0]!.message).toMatch(/4 days, not 6/)
    expect(checkDaysOnHand([{ drug: 'D', onHand: 5, usagePerDay: 0, daysOnHand: 1 }])).toHaveLength(
      1,
    )
  })

  it('marks a queue over target exactly when its oldest item exceeds the target', () => {
    const row = { name: 'Claims', oldestMinutes: 95, targetMinutes: 30 }
    expect(checkQueueStatus([{ ...row, status: 'Over target' }])).toEqual([])
    expect(checkQueueStatus([{ ...row, status: 'Within target' }])).toHaveLength(1)
    expect(checkQueueStatus([{ ...row, oldestMinutes: 10, status: 'Over target' }])).toHaveLength(1)
  })
})

describe('substitution units and lots', () => {
  it('reads concentration units', () => {
    expect(concentrationUnit('0.9 mg/mL')).toBe('mg/mL')
    expect(concentrationUnit('154 mEq/L sodium')).toBe('mEq/L')
    expect(concentrationUnit('20 g per bag')).toBe('g/bag')
    expect(concentrationUnit('1,000 mL bag')).toBeUndefined()
  })

  it('requires both sides to be stated in the same unit', () => {
    expect(checkConcentrationUnits('154 mEq/L sodium', '130 mEq/L sodium')).toEqual([])
    expect(checkConcentrationUnits('1 mg/mL', '10 mg per vial')).toHaveLength(1)
    expect(checkConcentrationUnits('1 mg/mL', '100 units')).toHaveLength(1)
  })

  it('requires each lot to balance and quarantine to sit inside on hand', () => {
    const lot = { lot: 'EX-1', received: 600, dispensed: 412, onHand: 188, returned: 0 }
    expect(checkLotBalance([{ ...lot, quarantined: 188 }])).toEqual([])
    expect(checkLotBalance([{ ...lot, dispensed: 400 }])).toHaveLength(1)
    expect(checkLotBalance([{ ...lot, quarantined: 200 }])).toHaveLength(1)
  })
})

describe('controlled substance notice timing', () => {
  it('counts one business day and 45 calendar days from discovery', () => {
    expect(nextBusinessDay('2026-11-05')).toBe('2026-11-06')
    expect(nextBusinessDay('2026-11-06')).toBe('2026-11-09')
    expect(nextBusinessDay('2026-11-07')).toBe('2026-11-09')
    expect(addCalendarDays('2026-11-05', 45)).toBe('2026-12-20')
  })

  it('accepts the worked example and flags the wrong dates', () => {
    const ok = { discoveredOn: '2026-11-05', noticeDueBy: '2026-11-06', form106DueBy: '2026-12-20' }
    expect(checkLossDates(ok)).toEqual([])
    expect(checkLossDates({ ...ok, noticeDueBy: '2026-11-10' })).toHaveLength(1)
    expect(checkLossDates({ ...ok, form106DueBy: '2026-11-06' })).toHaveLength(1)
    expect(
      checkLossDates({
        discoveredOn: '2026-11-06',
        noticeDueBy: '2026-11-09',
        form106DueBy: '2026-12-21',
      }),
    ).toEqual([])
  })

  it('flags Form 106 given the one business day clock and the notice given 45 days', () => {
    expect(checkNoticeWording('Form 106 is due within one business day.')).toHaveLength(1)
    expect(checkNoticeWording('Notify the DEA Field Division within 45 days.')).toHaveLength(1)
    expect(
      checkNoticeWording(
        'Notify the DEA Field Division within one business day. File Form 106 electronically within 45 days.',
      ),
    ).toEqual([])
  })
})
