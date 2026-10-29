import { describe, expect, it } from 'vitest'
import type { Decision } from '../schemas/scenario'
import { decide, votesCast } from './decide'
import { D1 } from './fixture'

const withRule = (rule: Decision['rule']): Decision => ({ ...D1, rule })
const tally = (pay: number, rebuild: number) => ({ tally: { pay, rebuild } })

describe('decide', () => {
  it('plurality picks the option with the most votes', () => {
    expect(decide(withRule({ kind: 'plurality' }), tally(5, 3))).toEqual({
      optionId: 'pay',
      by: 'vote',
    })
  })

  it('plurality falls back to the default on a tie', () => {
    expect(decide(withRule({ kind: 'plurality' }), tally(4, 4)).optionId).toBe('rebuild')
  })

  it('every rule falls back to the default when nobody voted', () => {
    for (const kind of ['plurality', 'majority', 'unanimous'] as const)
      expect(decide(withRule({ kind }), tally(0, 0)).optionId).toBe('rebuild')
    const threshold = withRule({ kind: 'threshold', optionId: 'pay', minShare: 0 })
    expect(decide(threshold, tally(0, 0)).optionId).toBe('rebuild')
  })

  it('majority needs more than half of the votes cast', () => {
    const m = withRule({ kind: 'majority' })
    expect(decide(m, tally(3, 2)).optionId).toBe('pay')
    expect(decide({ ...m, defaultOptionId: 'rebuild' }, tally(2, 2)).optionId).toBe('rebuild')
    const three: Decision = {
      ...m,
      options: [...m.options, { id: 'third', label: 'Third', description: '' }],
    }
    // 4 of 9 is a plurality but not a majority
    expect(decide(three, { tally: { pay: 4, rebuild: 3, third: 2 } }).optionId).toBe('rebuild')
  })

  it('threshold accepts the named option at exactly the minimum share', () => {
    const t = withRule({ kind: 'threshold', optionId: 'pay', minShare: 0.4 })
    expect(decide(t, tally(4, 6)).optionId).toBe('pay')
    expect(decide(t, tally(39, 61)).optionId).toBe('rebuild')
  })

  it('unanimous needs every cast vote on one option', () => {
    const u = withRule({ kind: 'unanimous' })
    expect(decide(u, tally(6, 0)).optionId).toBe('pay')
    expect(decide(u, tally(6, 1)).optionId).toBe('rebuild')
  })

  it('ignores votes for options the decision does not have', () => {
    const d = withRule({ kind: 'plurality' })
    expect(decide(d, { tally: { ghost: 50, pay: 1 } }).optionId).toBe('pay')
    expect(votesCast(d, { ghost: 50, pay: 1 })).toBe(1)
  })

  it('ignores negative, fractional and non-finite counts', () => {
    const d = withRule({ kind: 'plurality' })
    expect(votesCast(d, { pay: -3, rebuild: Number.NaN })).toBe(0)
    expect(votesCast(d, { pay: 2.9 })).toBe(2)
  })

  it('lets the controller pick under any rule, and reports it', () => {
    expect(decide(withRule({ kind: 'majority' }), tally(9, 0), 'rebuild')).toEqual({
      optionId: 'rebuild',
      by: 'controller',
    })
  })

  it('treats the vote as advisory under the controller rule', () => {
    const c = withRule({ kind: 'controller' })
    expect(decide(c, tally(9, 0))).toEqual({ optionId: 'rebuild', by: 'controller' })
    expect(decide(c, tally(9, 0), 'pay').optionId).toBe('pay')
  })

  it('ignores a controller choice that is not an option', () => {
    expect(decide(withRule({ kind: 'plurality' }), tally(2, 1), 'ghost').optionId).toBe('pay')
  })

  it('is deterministic: the same inputs give the same answer over 500 seeded cases', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) >> 4) % 12
    for (let n = 0; n < 500; n++) {
      const t = tally(rnd(), rnd())
      const a = decide(withRule({ kind: 'majority' }), t)
      expect(decide(withRule({ kind: 'majority' }), { tally: { ...t.tally } })).toEqual(a)
      expect(['pay', 'rebuild']).toContain(a.optionId)
    }
  })
})
