import { describe, expect, it } from 'vitest'
import { activePath } from './active-path'
import { defaultDecisions } from './default-path'
import { branchedScenario, record } from './fixture'
import { ancestors, buildGraph, pathOrder, subtree } from './graph'

const ids = (rows: { id: string }[]) => rows.map((r) => r.id)
describe('buildGraph', () => {
  it('splits the MSEL into a trunk and one lane per branch', () => {
    const g = buildGraph(branchedScenario())
    expect(ids(g.trunk)).toEqual(['START', 'I-10', 'I-16', 'END'])
    expect(ids(g.branches.get('b2')!.rows)).toEqual(['I-11b', 'I-11c', 'I-14b'])
    expect([...g.decisions.keys()].sort()).toEqual(['d1', 'd2'])
  })

  it('finds a nested branch parent and its ancestors', () => {
    const g = buildGraph(branchedScenario())
    expect(g.branches.get('b3')!.parent).toBe('b2')
    expect(ancestors(g, 'b3')).toEqual(['b2'])
    expect(ancestors(g, 'b1')).toEqual([])
    expect([...subtree(g, 'b2')].sort()).toEqual(['b2', 'b3'])
  })

  it('treats a scenario without branches as all trunk', () => {
    const s = branchedScenario()
    const g = buildGraph({ msel: s.msel.filter((r) => !r.branchId) })
    expect(g.branches.size).toBe(0)
    expect(g.trunk).toHaveLength(4)
  })
})

describe('pathOrder', () => {
  it('follows the default option of every decision', () => {
    const s = branchedScenario()
    expect(ids(pathOrder(s, defaultDecisions(s)))).toEqual([
      'START',
      'I-10',
      'I-11b',
      'I-11c',
      'I-14b',
      'I-16',
      'END',
    ])
  })

  it('plays the pay branch and rejoins the trunk', () => {
    expect(ids(pathOrder(branchedScenario(), new Map([['d1', 'pay']])))).toEqual([
      'START',
      'I-10',
      'I-11a',
      'I-12a',
      'I-16',
      'END',
    ])
  })

  it('plays a nested branch and rejoins its parent', () => {
    const chosen = new Map([
      ['d1', 'rebuild'],
      ['d2', 'now'],
    ])
    expect(ids(pathOrder(branchedScenario(), chosen))).toEqual([
      'START',
      'I-10',
      'I-11b',
      'I-11c',
      'I-12b',
      'I-14b',
      'I-16',
      'END',
    ])
  })

  it('ends the exercise when a branch has no rejoin row', () => {
    const s = branchedScenario()
    s.branches[0] = { ...s.branches[0]!, rejoinRowId: undefined }
    expect(ids(pathOrder(s, new Map([['d1', 'pay']])))).toEqual(['START', 'I-10', 'I-11a', 'I-12a'])
  })

  it('skips trunk rows between the decision and the rejoin row', () => {
    const s = branchedScenario()
    s.msel.splice(2, 0, { ...s.msel[0]!, id: 'T-1', time: '1:35', purposeTag: 'CORE_NARRATIVE' })
    const path = ids(pathOrder(s, new Map([['d1', 'pay']])))
    expect(path).not.toContain('T-1')
    expect(path).toContain('I-16')
  })

  it('terminates on a rejoin cycle', () => {
    const s = branchedScenario()
    s.branches[0] = { ...s.branches[0]!, rejoinRowId: 'I-10' }
    expect(pathOrder(s, new Map([['d1', 'pay']])).length).toBeLessThan(20)
  })
})

describe('activePath', () => {
  it('cuts the path after an open decision', () => {
    const a = activePath(branchedScenario(), [])
    expect(ids(a.rows)).toEqual(['START', 'I-10'])
    expect(a.openDecision?.id).toBe('d1')
    expect(a.skipped.size).toBe(0)
  })

  it('marks the branch not taken as skipped once the decision is made', () => {
    const a = activePath(branchedScenario(), [record('d1', 'pay')])
    expect(ids(a.rows)).toEqual(['START', 'I-10', 'I-11a', 'I-12a', 'I-16', 'END'])
    expect([...a.skipped].sort()).toEqual(['I-11b', 'I-11c', 'I-12b', 'I-14b'])
    expect(a.openDecision).toBeUndefined()
  })

  it('stops at a nested open decision', () => {
    const a = activePath(branchedScenario(), [record('d1', 'rebuild')])
    expect(ids(a.rows)).toEqual(['START', 'I-10', 'I-11b', 'I-11c'])
    expect(a.openDecision?.id).toBe('d2')
  })

  it('uses the latest record for a decision (override)', () => {
    const a = activePath(branchedScenario(), [
      record('d1', 'pay'),
      record('d1', 'rebuild', { by: 'override', supersedes: 'd1', note: 'Room asked for it' }),
    ])
    expect(ids(a.rows)).toContain('I-11b')
    expect(ids(a.rows)).not.toContain('I-11a')
  })

  it('is the whole trunk for a scenario without branches', () => {
    const msel = branchedScenario().msel.filter((r) => !r.branchId && !r.decision)
    expect(ids(activePath({ msel }, []).rows)).toEqual(['START', 'I-16', 'END'])
  })
})
