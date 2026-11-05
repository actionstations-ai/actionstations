// Outbreak-at-sea lint checks (spec 0470 FR-4): percentages, cumulative counts, report timing,
// no medical advice in letters, and the isolation letter. First the pure checks, then the rules
// as they run on injects.
import { describe, expect, it } from 'vitest'
import { fieldLintIssues } from '../lint-rules'
import {
  checkCumulative,
  checkIsolationLetter,
  checkNoMedicalAdvice,
  checkPercents,
  checkReportTiming,
  percentOf,
} from './lint'

describe('percentages', () => {
  it('computes cases over persons on board to one decimal', () => {
    expect(percentOf(61, 2410)).toBe(2.5)
    expect(percentOf(14, 980)).toBe(1.4)
    expect(percentOf(0, 0)).toBe(0)
  })

  it('flags a printed percentage that is not cases over persons', () => {
    const bad = checkPercents([{ group: 'passengers', onBoard: 2410, cases: 61, printed: '3.1%' }])
    expect(bad).toHaveLength(1)
    expect(bad[0]!.message).toMatch(/61 of 2410 is 2\.5%/)
    expect(checkPercents([{ group: 'crew', onBoard: 980, cases: 14, printed: '1.4%' }])).toEqual([])
  })

  it('flags more cases than people', () => {
    expect(
      checkPercents([{ group: 'crew', onBoard: 10, cases: 11, printed: '110.0%' }]).length,
    ).toBe(1)
  })
})

describe('cumulative counts', () => {
  it('accepts equal or higher counts and flags a drop', () => {
    expect(checkCumulative({ passengers: 61, crew: 14 }, { passengers: 38, crew: 14 })).toEqual([])
    const p = checkCumulative({ passengers: 30, crew: 14 }, { passengers: 38, crew: 9 })
    expect(p).toHaveLength(1)
    expect(p[0]!.message).toMatch(/fell from 38 to 30/)
  })
})

describe('report timing', () => {
  const base = { passengerPercent: 2.5, crewPercent: 1.4 }
  it('puts the 24-hour report 24 to 36 hours before arrival', () => {
    expect(checkReportTiming({ type: '24-hour report', hoursBeforeArrival: 30, ...base })).toEqual(
      [],
    )
    expect(
      checkReportTiming({ type: '24-hour report', hoursBeforeArrival: 20, ...base }),
    ).toHaveLength(1)
    expect(
      checkReportTiming({ type: '24-hour report', hoursBeforeArrival: 40, ...base }),
    ).toHaveLength(1)
  })

  it('puts the update at least 4 hours before arrival', () => {
    expect(
      checkReportTiming({ type: '4-hour update report', hoursBeforeArrival: 4, ...base }),
    ).toEqual([])
    expect(
      checkReportTiming({ type: '4-hour update report', hoursBeforeArrival: 3, ...base }),
    ).toHaveLength(1)
  })

  it('sends special reports only at their level', () => {
    expect(
      checkReportTiming({ type: 'Special report, 2 percent', hoursBeforeArrival: 50, ...base }),
    ).toEqual([])
    expect(
      checkReportTiming({ type: 'Special report, 3 percent', hoursBeforeArrival: 50, ...base }),
    ).toHaveLength(1)
    expect(
      checkReportTiming({
        type: 'Special report, 3 percent',
        hoursBeforeArrival: 50,
        passengerPercent: 1,
        crewPercent: 3.2,
      }),
    ).toEqual([])
  })

  it('keeps a zero report at zero', () => {
    expect(
      checkReportTiming({
        type: 'Zero report',
        hoursBeforeArrival: 25,
        passengerPercent: 0,
        crewPercent: 0,
      }),
    ).toEqual([])
    expect(
      checkReportTiming({ type: 'Zero report', hoursBeforeArrival: 25, ...base }),
    ).toHaveLength(1)
  })
})

describe('letters', () => {
  it('flags drugs and doses and accepts hygiene steps', () => {
    expect(checkNoMedicalAdvice(['Take 2 mg of loperamide every four hours.'])).toHaveLength(1)
    expect(checkNoMedicalAdvice(['Wash your hands with soap and water.'])).toEqual([])
  })

  it('needs the 24 hours after symptoms end in an isolation letter', () => {
    expect(checkIsolationLetter(['Stay in your cabin.'])).toHaveLength(1)
    expect(
      checkIsolationLetter(['Stay in your cabin until 24 hours after your symptoms end.']),
    ).toEqual([])
  })
})

describe('rules on injects', () => {
  const report = (over: Record<string, unknown> = {}) => ({
    reportType: '24-hour report',
    hoursBeforeArrival: 24.5,
    passengersOnBoard: 2410,
    crewOnBoard: 980,
    passengerCases: 61,
    crewCases: 14,
    passengerPercent: '2.5%',
    crewPercent: '1.4%',
    previousReport: { passengerCases: 38, crewCases: 9 },
    ...over,
  })

  it('accepts a correct report', () => {
    expect(fieldLintIssues('age_cumulative_report', report())).toEqual([])
  })

  it('flags each fault by rule', () => {
    const msgs = (o: Record<string, unknown>) =>
      fieldLintIssues('age_cumulative_report', report(o))
        .map((i) => i.message)
        .join(' | ')
    expect(msgs({ passengerPercent: '5.0%' })).toMatch(/2\.5%/)
    expect(msgs({ passengerCases: 20 })).toMatch(/never go down/)
    expect(msgs({ hoursBeforeArrival: 10 })).toMatch(/24 to 36 hours/)
  })

  it('reports nothing when the structured fields are absent', () => {
    expect(fieldLintIssues('age_cumulative_report', { headline: 'x' })).toEqual([])
    expect(fieldLintIssues('guest_letter', { letterKind: 'Cabin isolation' }).length).toBe(1)
    expect(fieldLintIssues('guest_letter', { letterKind: 'Itinerary change' })).toEqual([])
  })

  it('checks a letter for medical advice', () => {
    const issues = fieldLintIssues('guest_letter', {
      letterKind: 'Illness notice',
      body: ['You may take ibuprofen for the fever.'],
    })
    expect(issues.map((i) => i.message).join(' ')).toMatch(/medical advice/)
  })
})
