// Guest emergency lint checks (spec 0470 FR-5): accounting totals reconcile and crime reports use
// role codes. The pure checks first, then the rules as they run on injects.
import { describe, expect, it } from 'vitest'
import { fieldLintIssues } from '../lint-rules'
import { checkAccountingReconciles, checkCrimeReportRoles } from './guest-lint'

describe('accounting', () => {
  it('accepts rows whose parts add up and flags the one that does not', () => {
    expect(
      checkAccountingReconciles([
        { label: 'Passengers', total: 2410, accounted: 2388, unaccounted: 22 },
      ]),
    ).toEqual([])
    const bad = checkAccountingReconciles([
      { label: 'Crew', total: 980, accounted: 971, unaccounted: 5 },
    ])
    expect(bad).toHaveLength(1)
    expect(bad[0]!.message).toMatch(/Crew: 980 expected but 971 accounted for plus 5/)
  })
})

describe('crime report roles', () => {
  it('flags a titled personal name and accepts role codes', () => {
    expect(checkCrimeReportRoles(['Mr. Alvarez was last seen at the rail.'])).toHaveLength(1)
    expect(checkCrimeReportRoles(['Guest A was last seen at the rail.'])).toEqual([])
  })
})

describe('rules on injects', () => {
  it('checks a muster report and a floor status', () => {
    const muster = {
      groups: [
        { group: 'Passengers', expected: 100, mustered: 90, unaccounted: 10 },
        { group: 'Crew', expected: 50, mustered: 40, unaccounted: 5 },
      ],
    }
    const issues = fieldLintIssues('muster_accounting_report', muster)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(/^Crew/)
    const floors = { floors: [{ floor: '14', registered: 62, accounted: 41, unaccounted: 20 }] }
    expect(fieldLintIssues('floor_evacuation_status', floors)[0]!.message).toMatch(/floor 14|14/)
  })

  it('reports nothing without the structured rows', () => {
    expect(fieldLintIssues('muster_accounting_report', { event: 'x' })).toEqual([])
  })

  it('checks a crime report for personal names', () => {
    const issues = fieldLintIssues('alleged_crime_report', { summary: 'Ms. Okafor reported it.' })
    expect(issues).toHaveLength(1)
  })
})
