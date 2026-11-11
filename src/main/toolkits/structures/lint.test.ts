// The structures toolkit's pure format checks (spec 0471 FR-4), and the field rules that wrap them.
import { describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

import {
  checkAuthority,
  checkCraneWind,
  checkExcavationProse,
  checkExcavationRecord,
  checkOshaProse,
  checkOshaRecord,
  checkPlacardWords,
  oshaClockHours,
} from './lint'

const { fieldLintIssues, fieldLintRuleIds } = await import('../lint-rules')

describe('placard words', () => {
  it('accepts the three categories and refuses anything else', () => {
    for (const c of ['INSPECTED', 'RESTRICTED USE', 'UNSAFE'])
      expect(checkPlacardWords(c, [])).toEqual([])
    expect(checkPlacardWords('CAUTION', [])).toHaveLength(1)
  })

  it('flags a category paired with the wrong color, either order', () => {
    expect(
      checkPlacardWords(undefined, ['The building got an UNSAFE green placard.']),
    ).toHaveLength(1)
    expect(checkPlacardWords(undefined, ['A yellow card: INSPECTED.'])).toHaveLength(1)
    expect(checkPlacardWords(undefined, ['UNSAFE (red) and INSPECTED (green).'])).toEqual([])
  })

  it('flags a placard named by color alone', () => {
    expect(checkPlacardWords(undefined, ['Team 4 put a red tag on the annex.'])).toHaveLength(1)
    expect(checkPlacardWords(undefined, ['A red tag: UNSAFE.'])).toEqual([])
  })
})

describe('OSHA clocks', () => {
  it('maps event types to hours', () => {
    expect(oshaClockHours('Work-related fatality')).toBe(8)
    expect(oshaClockHours('Amputation')).toBe(24)
    expect(oshaClockHours('Near miss')).toBeUndefined()
  })

  it('checks the clock and the due time of a record', () => {
    const ok = {
      eventType: 'In-patient hospitalization',
      clockHours: '24',
      occurredAt: '2026-11-09 09:30',
      dueBy: '2026-11-10 09:30',
    }
    expect(checkOshaRecord(ok)).toEqual([])
    expect(checkOshaRecord({ ...ok, clockHours: '8' })).toHaveLength(1)
    expect(checkOshaRecord({ ...ok, dueBy: '2026-11-09 17:30' })).toHaveLength(1)
    expect(
      checkOshaRecord({ ...ok, eventType: 'Work-related fatality', clockHours: '8' }),
    ).toHaveLength(1)
  })

  it('flags prose that states the wrong clock', () => {
    expect(checkOshaProse(['A fatality must be reported within 24 hours.'])).toHaveLength(1)
    expect(checkOshaProse(['An amputation is reported within 8 hours.'])).toHaveLength(1)
    expect(
      checkOshaProse(['A fatality is reported within 8 hours; a hospitalization within 24 hours.']),
    ).toEqual([])
  })
})

describe('excavation rules', () => {
  it('accepts the 20-foot engineered-system rule and refuses any other depth', () => {
    expect(
      checkExcavationProse([
        'Trenches 20 feet deep or greater need a protective system designed by a registered professional engineer.',
      ]),
    ).toEqual([])
    expect(
      checkExcavationProse([
        'A trench 10 feet deep must have shoring designed by a professional engineer.',
      ]),
    ).toHaveLength(1)
    expect(
      checkExcavationProse([
        'Any trench over fifteen feet needs a system approved by a registered professional engineer.',
      ]),
    ).toHaveLength(1)
    expect(
      checkExcavationProse(['A registered professional engineer approves other designs.']),
    ).toEqual([])
  })

  it('wants a protective system from 5 feet unless in stable rock', () => {
    expect(checkExcavationRecord({ depthFt: '9', protectiveSystem: 'None' })).toHaveLength(1)
    expect(checkExcavationRecord({ depthFt: '9', protectiveSystem: 'Trench box' })).toEqual([])
    expect(
      checkExcavationRecord({ depthFt: '9', protectiveSystem: '', soilType: 'Stable rock' }),
    ).toEqual([])
    expect(checkExcavationRecord({ depthFt: '3', protectiveSystem: '' })).toEqual([])
  })
})

describe('authority', () => {
  it('lets only the building official declare a building unsafe', () => {
    expect(checkAuthority(['The superintendent declared the building unsafe.'])).toHaveLength(1)
    expect(checkAuthority(['The building official declared the building unsafe.'])).toEqual([])
    expect(checkAuthority(['The evaluator recommends UNSAFE.'])).toEqual([])
  })
})

describe('crane wind', () => {
  const log = (action: string, gust: string) => [
    { time: '08:40', avgMph: '15', gustMph: gust, action },
  ]
  it('stops a pick at the limit', () => {
    expect(checkCraneWind('20 sustained', log('Pick continues', '21'))).toHaveLength(1)
    expect(checkCraneWind('20 sustained', log('Pick held', '21'))).toEqual([])
    expect(checkCraneWind('20 sustained', log('Pick continues', '17'))).toEqual([])
    expect(checkCraneWind(undefined, log('Pick continues', '99'))).toEqual([])
  })
})

describe('the registered rules', () => {
  const ids = [
    'structures.placard_words',
    'structures.osha_clock',
    'structures.excavation_rules',
    'structures.authority',
    'structures.crane_wind',
  ]
  it('are registered under the ids the toolkit lists', () => {
    expect(fieldLintRuleIds()).toEqual(expect.arrayContaining(ids))
  })

  it('run on their inject types and accept a correct record', () => {
    expect(
      fieldLintIssues('osha_report_record', {
        eventType: 'Work-related fatality',
        clockHours: '24',
      }),
    ).toHaveLength(1)
    expect(
      fieldLintIssues('crane_lift_record', {
        windLimitMph: '20 sustained',
        windLog: [{ time: '09:00', avgMph: '22', gustMph: '28', action: 'Pick continues' }],
      }),
    ).toHaveLength(1)
    expect(fieldLintIssues('rapid_evaluation_form', { placard: 'UNSAFE', conditions: [] })).toEqual(
      [],
    )
    expect(fieldLintIssues('rapid_evaluation_form', { placard: 'DANGER' })).toHaveLength(1)
  })
})
