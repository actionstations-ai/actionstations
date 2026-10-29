import { describe, expect, it } from 'vitest'
import { branchedScenario, D1 } from '@shared/branching/fixture'
import { FacilitatorState } from '@shared/ipc/facilitator'
import {
  availability,
  branchRowDelivered,
  buildRecord,
  minutesLeft,
  pathFor,
  withRecord,
} from './branching'

const now = new Date('2026-03-01T10:00:00.000Z')
const base = () => FacilitatorState.parse({})
const close = (input: Record<string, number>, extra = {}) =>
  buildRecord({
    decision: D1,
    by: 'vote',
    input: { decisionId: 'd1', tally: input },
    now,
    exerciseTime: '1:32',
    ...extra,
  })

describe('buildRecord', () => {
  it('applies the decision rule to the tally and records what the rule saw', () => {
    const r = close({ pay: 7, rebuild: 4, ghost: 9 })
    expect(r).toMatchObject({
      decisionId: 'd1',
      optionId: 'pay',
      by: 'vote',
      rule: { kind: 'majority' },
      input: { tally: { pay: 7, rebuild: 4 }, cast: 11 },
      exerciseTime: '1:32',
    })
  })

  it('falls back to the default option when the rule finds no winner', () => {
    expect(close({ pay: 3, rebuild: 3 }).optionId).toBe('rebuild')
  })

  it('records a controller choice as by controller', () => {
    expect(close({}, { by: 'controller', choice: 'pay' })).toMatchObject({
      optionId: 'pay',
      by: 'controller',
    })
  })

  it('records a timeout and an override with the note and what it replaced', () => {
    expect(close({ pay: 5 }, { by: 'timeout' }).by).toBe('timeout')
    const o = close({}, { by: 'override', choice: 'pay', note: 'Room asked', supersedes: 'd1' })
    expect(o).toMatchObject({ by: 'override', note: 'Room asked', supersedes: 'd1' })
  })
})

describe('path in Facilitate', () => {
  it('has no path for a scenario without branches', () => {
    expect(pathFor({ msel: branchedScenario().msel }, base())).toBeUndefined()
    expect(availability(undefined, 'anything')).toBe('on_path')
  })

  it('waits at the open decision, then follows the chosen branch', () => {
    const s = branchedScenario()
    const open = pathFor(s, base())!
    expect(availability(open, 'I-10')).toBe('on_path')
    expect(availability(open, 'I-16')).toBe('waiting')
    const state = withRecord(base(), close({ pay: 9 }), 'seed-1')
    const path = pathFor(s, state)!
    expect(availability(path, 'I-11a')).toBe('on_path')
    expect(availability(path, 'I-11b')).toBe('not_taken')
    expect(availability(path, 'I-16')).toBe('on_path')
  })
})

describe('withRecord', () => {
  it('keeps the first seed and appends decisions in order', () => {
    const one = withRecord(base(), close({ pay: 9 }), 'seed-1')
    const two = withRecord(one, close({ rebuild: 9 }, { by: 'override' }), 'seed-2')
    expect(two.branching?.seed).toBe('seed-1')
    expect(two.branching?.decisions.map((d) => d.optionId)).toEqual(['pay', 'rebuild'])
  })
})

describe('override window and timeout', () => {
  it('closes the override window once a row of the chosen branch is delivered', () => {
    const s = branchedScenario()
    const stamp = { at: now.toISOString(), exerciseTime: '1:40' }
    expect(branchRowDelivered(s, D1, 'pay', {})).toBe(false)
    expect(branchRowDelivered(s, D1, 'pay', { 'I-11b': stamp })).toBe(false)
    expect(branchRowDelivered(s, D1, 'pay', { 'I-11a': stamp })).toBe(true)
  })

  it('counts minutes left from delivery, and has none without a timeout', () => {
    expect(minutesLeft(D1, '1:30', 100)).toBeUndefined()
    const timed = { ...D1, timeoutMin: 10 }
    expect(minutesLeft(timed, '1:30', 95)).toBe(5)
    expect(minutesLeft(timed, '1:30', 101)).toBe(-1)
    expect(minutesLeft(timed, undefined, 95)).toBeUndefined()
  })
})
