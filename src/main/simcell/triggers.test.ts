import { describe, expect, it } from 'vitest'
import { dueTriggers, type TriggerState } from './triggers'
import { reporter } from './test-fixtures'

const state = (over: Partial<TriggerState> = {}): TriggerState => ({
  clockMinutes: 0,
  releasedRowIds: new Set(),
  threads: new Map(),
  fired: new Set(),
  nowMs: 0,
  ...over,
})

describe('persona triggers', () => {
  it('fires nothing before any deadline or rule is due', () => {
    expect(dueTriggers([reporter], state({ clockMinutes: 30 }))).toEqual([])
  })

  it('fires a deadline once the exercise clock reaches it', () => {
    const due = dueTriggers([reporter], state({ clockMinutes: 90 }))
    expect(due.map((d) => d.key)).toEqual(['p1-reporter:deadline:d1'])
    expect(due[0]!.why).toContain('A written statement')
  })

  it('does not fire again once the key is recorded', () => {
    const fired = new Set(['p1-reporter:deadline:d1'])
    expect(dueTriggers([reporter], state({ clockMinutes: 120, fired }))).toEqual([])
  })

  it('fires a row rule when the row is released', () => {
    const due = dueTriggers([reporter], state({ releasedRowIds: new Set(['I-05']) }))
    expect(due.map((d) => d.key)).toEqual(['p1-reporter:rule:r2'])
  })

  it('fires a no-reply rule when the persona spoke last and the players stayed quiet', () => {
    const threads = new Map([
      [
        'p1-reporter',
        [{ who: 'persona' as const, text: 'Any word?', exerciseTime: '0:10', at: 0 }],
      ],
    ])
    expect(dueTriggers([reporter], state({ threads, nowMs: 9 * 60_000 }))).toEqual([])
    const due = dueTriggers([reporter], state({ threads, nowMs: 10 * 60_000 }))
    expect(due.map((d) => d.key)).toEqual(['p1-reporter:rule:r1'])
  })

  it('never fires a rule that depends on what the players say', () => {
    const card = {
      ...reporter,
      deadlines: [],
      escalationRules: [
        { id: 'r9', when: { kind: 'player_says' as const, text: 'denies' }, then: 'Escalates.' },
      ],
    }
    expect(dueTriggers([card], state({ clockMinutes: 999 }))).toEqual([])
  })

  it('skips a persona that has no goal yet', () => {
    expect(dueTriggers([{ ...reporter, goals: [] }], state({ clockMinutes: 999 }))).toEqual([])
  })
})
