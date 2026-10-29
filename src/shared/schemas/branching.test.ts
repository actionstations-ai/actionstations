import { describe, expect, it } from 'vitest'
import { Decision, formatVersionFor, MselRow, Scenario, SCENARIO_FORMAT_VERSION } from './scenario'

const base = {
  id: 's1',
  projectId: 'p1',
  title: 'T',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  brief: {},
}

describe('branching schemas', () => {
  it('reads a version 1 scenario unchanged: no branches key appears', () => {
    const s = Scenario.parse(base)
    expect(s.formatVersion).toBe(1)
    expect('branches' in s).toBe(false)
    expect(formatVersionFor(s)).toBe(1)
  })

  it('writes version 2 once there is a branch', () => {
    const s = Scenario.parse({
      ...base,
      branches: [{ id: 'b1', label: 'Pay', decisionId: 'd1', optionId: 'pay' }],
    })
    expect(formatVersionFor(s)).toBe(2)
  })

  it('accepts version 2 and refuses a newer one', () => {
    expect(Scenario.safeParse({ ...base, formatVersion: 2 }).success).toBe(true)
    expect(SCENARIO_FORMAT_VERSION).toBe(2)
    expect(Scenario.safeParse({ ...base, formatVersion: 3 }).success).toBe(false)
  })

  it('reads a vote-only decision as a plurality decision with the first option as default', () => {
    const d = Decision.parse({
      question: 'Pay?',
      options: ['Pay it', 'Rebuild now'],
      mode: 'anonymous',
    })
    expect(d.options.map((o) => o.id)).toEqual(['pay-it', 'rebuild-now'])
    expect(d.defaultOptionId).toBe('pay-it')
    expect(d.rule).toEqual({ kind: 'plurality' })
  })

  it('needs two to eight options and a known rule', () => {
    const opt = (id: string) => ({ id, label: id })
    const d = { id: 'd', question: 'q', defaultOptionId: 'a' }
    expect(Decision.safeParse({ ...d, options: [opt('a')] }).success).toBe(false)
    expect(Decision.safeParse({ ...d, options: [opt('a'), opt('b')] }).success).toBe(true)
    expect(
      Decision.safeParse({ ...d, options: [opt('a'), opt('b')], rule: { kind: 'coinflip' } })
        .success,
    ).toBe(false)
  })

  it('leaves a row without branchId or decision on the trunk', () => {
    const row = MselRow.parse({
      id: 'I-01',
      phaseId: 'p',
      time: '0:10',
      from: 'x',
      event: 'e',
      expectedAction: 'a',
      purposeTag: 'NOISE',
    })
    expect(row.branchId).toBeUndefined()
    expect(row.decision).toBeUndefined()
  })
})
