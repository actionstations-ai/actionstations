// Slot extractors (#423, FR-10.1): one statement each extractor must find and one it must not,
// plus how statements compare (same subject, different values).
import { describe, expect, it } from 'vitest'
import {
  durationMinutes,
  extractStatements,
  sameSubject,
  slotLabel,
  valuesDiffer,
  type SlotId,
} from './slots'

const CASES: { slot: SlotId; hit: string; subject: string; value: string; miss: string }[] = [
  {
    slot: 'release_approver',
    hit: 'All public releases must be approved by the Director of Water Operations.',
    subject: 'public releases',
    value: 'Director of Water Operations',
    miss: 'The Director reviews public releases each week.',
  },
  {
    slot: 'approver',
    hit: 'Only the Plant Superintendent may authorize a return to automatic control.',
    subject: 'return to automatic control',
    value: 'Plant Superintendent',
    miss: 'The Plant Superintendent is told when control returns to automatic.',
  },
  {
    slot: 'notify_deadline',
    hit: 'The Duty Manager must notify the State EPA within two hours of a confirmed exceedance.',
    subject: 'State EPA',
    value: 'two hours',
    miss: 'The Duty Manager keeps the State EPA informed during the event.',
  },
  {
    slot: 'report_deadline',
    hit: 'The TAC reports the incident to the State Police within 24 hours.',
    subject: 'State Police',
    value: '24 hours',
    miss: 'The TAC keeps a report of every incident for the State Police.',
  },
  {
    slot: 'contact_phone',
    hit: '| Water Quality Manager | Dana Pell | 555-0142 |',
    subject: 'Water Quality Manager',
    value: '555-0142',
    miss: '| Water Quality Manager | Dana Pell | on call |',
  },
  {
    slot: 'activation_level',
    hit: 'The Emergency Operations Center is activated at Level 2 when two zones lose pressure.',
    subject: 'Emergency Operations Center',
    value: 'Level 2',
    miss: 'The Emergency Operations Center has two levels of staffing.',
  },
  {
    slot: 'lead',
    hit: 'The County Fire Department is the lead agency for hazardous materials releases.',
    subject: 'hazardous materials releases',
    value: 'County Fire Department',
    miss: 'The County Fire Department supports hazardous materials releases.',
  },
]

describe('slot extractors', () => {
  it.each(CASES)('finds a $slot statement', ({ slot, hit, subject, value }) => {
    const found = extractStatements(hit).filter((s) => s.slot === slot)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ subject, value })
    expect(found[0]!.span.length).toBeGreaterThan(10)
  })

  it.each(CASES)('ignores a sentence without a $slot statement', ({ slot, miss }) => {
    expect(extractStatements(miss).filter((s) => s.slot === slot)).toEqual([])
  })

  it('does not run a role name on into the next sentence', () => {
    const [s] = extractStatements(
      'All public releases must be approved by the General Manager. The PIO drafts them.',
    )
    expect(s?.value).toBe('General Manager')
  })

  it('labels each slot in plain words', () => {
    expect(slotLabel('release_approver', 'x')).toBe('Who approves public releases')
    expect(slotLabel('notify_deadline', 'State EPA')).toBe('How soon State EPA must be notified')
    expect(slotLabel('contact_phone', 'Duty Manager')).toBe('Phone number for Duty Manager')
  })
})

describe('comparing statements', () => {
  const one = (text: string) => extractStatements(text)[0]!

  it('reads durations in minutes, words included', () => {
    expect(durationMinutes('within one hour')).toBe(60)
    expect(durationMinutes('2 hrs')).toBe(120)
    expect(durationMinutes('90 minutes')).toBe(90)
    expect(durationMinutes('soon')).toBeUndefined()
  })

  it('treats 60 minutes and one hour as the same value', () => {
    const a = one('The Duty Manager must notify the Sheriff within 60 minutes of an intrusion.')
    const b = one('The Duty Manager must notify the Sheriff within one hour of an intrusion.')
    expect(sameSubject(a, b, 0.5)).toBe(true)
    expect(valuesDiffer(a, b)).toBe(false)
  })

  it('does not pair two different agencies', () => {
    const a = one(
      'The Duty Manager must notify the State EPA within 1 hour of a loss of treatment.',
    )
    const b = one('The Duty Manager must notify the State Drinking Water Program within 2 hours.')
    expect(sameSubject(a, b, 0.5)).toBe(false)
  })

  it('treats a short and a full name of one office as the same approver', () => {
    const a = one('All public releases must be approved by the Director.')
    const b = one('All public releases must be approved by the Director of Water Operations.')
    expect(valuesDiffer(a, b)).toBe(false)
  })
})
