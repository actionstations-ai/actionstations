import { describe, expect, it } from 'vitest'
import { branchedScenario, record } from './fixture'
import {
  canonicalJson,
  replay,
  replayCheck,
  scenarioHash,
  stateHash,
  type ReplayEntry,
} from './replay'

const close = (i: number, optionId: string): ReplayEntry => ({
  i,
  kind: 'decision.close',
  data: { ...record('d1', optionId) },
})
const release = (i: number, rowId: string): ReplayEntry => ({
  i,
  kind: 'inject.release',
  ref: { rowId },
  data: {},
})

const LOG: ReplayEntry[] = [
  release(1, 'START'),
  release(2, 'I-10'),
  close(3, 'pay'),
  release(4, 'I-11a'),
]

describe('replay', () => {
  it('folds decisions and releases into the session state', () => {
    const state = replay(branchedScenario(), LOG)
    expect(state.delivered).toEqual(['START', 'I-10', 'I-11a'])
    expect(state.decisions.map((d) => d.optionId)).toEqual(['pay'])
    expect(state.path).toEqual(['START', 'I-10', 'I-11a', 'I-12a', 'I-16', 'END'])
    expect(state.openDecisionId).toBeNull()
  })

  it('applies an override over the earlier decision', () => {
    const state = replay(branchedScenario(), [
      ...LOG,
      { i: 5, kind: 'decision.override', data: { ...record('d1', 'rebuild', { by: 'override' }) } },
    ])
    expect(state.path).toContain('I-11b')
    expect(state.path).not.toContain('I-11a')
  })

  it('drops a retracted release and ignores malformed decision entries', () => {
    const state = replay(branchedScenario(), [
      ...LOG,
      { i: 5, kind: 'inject.retract', ref: { rowId: 'I-11a' }, data: {} },
      { i: 6, kind: 'decision.close', data: { decisionId: 'd2' } },
    ])
    expect(state.delivered).toEqual(['START', 'I-10'])
    expect(state.decisions).toHaveLength(1)
  })

  it('does not depend on the order entries arrive in', () => {
    const s = branchedScenario()
    expect(stateHash(replay(s, [...LOG].reverse()))).toBe(stateHash(replay(s, LOG)))
  })

  it('has a hash that survives re-serialising the log, over 500 seeded shuffles', () => {
    const s = branchedScenario()
    const expected = stateHash(replay(s, LOG))
    let seed = 11
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648)
    for (let n = 0; n < 500; n++) {
      const shuffled = [...LOG].sort(() => (next() % 3) - 1)
      const viaJson = JSON.parse(JSON.stringify(shuffled)) as ReplayEntry[]
      expect(stateHash(replay(s, viaJson))).toBe(expected)
    }
  })
})

describe('canonicalJson', () => {
  it('sorts keys and drops undefined values', () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[2,{"y":2,"z":1}]},"b":1}',
    )
  })
})

describe('replayCheck', () => {
  it('matches the hash written at the end of the run', () => {
    const s = branchedScenario()
    const hash = stateHash(replay(s, LOG))
    expect(replayCheck(s, LOG, hash)).toEqual({ status: 'matches', hash })
  })

  it('reports a mismatch when the scenario changed after the run', () => {
    const s = branchedScenario()
    const hash = stateHash(replay(s, LOG))
    s.msel = s.msel.filter((r) => r.id !== 'I-12a')
    expect(replayCheck(s, LOG, hash).status).toBe('mismatch')
  })

  it('points at a release of a row the decisions do not lead to', () => {
    const s = branchedScenario()
    const bad = [...LOG, release(5, 'I-11b')]
    const check = replayCheck(s, bad, 'deadbeef')
    expect(check.status === 'mismatch' && check.firstDivergence?.i).toBe(5)
  })

  it('says so when the log holds no decisions', () => {
    expect(replayCheck(branchedScenario(), [release(1, 'START')]).status).toBe('no_decisions')
  })
})

describe('scenarioHash', () => {
  it('ignores updatedAt, warnings and provenance only', () => {
    const base = { title: 'T', msel: [], updatedAt: 'a', warnings: [1], provenance: [2] }
    expect(scenarioHash({ ...base, updatedAt: 'b', warnings: [], provenance: [] })).toBe(
      scenarioHash(base),
    )
    expect(scenarioHash({ ...base, title: 'U' })).not.toBe(scenarioHash(base))
  })
})
