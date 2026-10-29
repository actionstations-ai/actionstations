import { describe, expect, it } from 'vitest'
import { branchedScenario } from '@shared/branching/fixture'
import { branchMarks, decisionSummary, offPathRowIds } from './branch-ops'
import { draftFromScenario } from './model'

const draft = () => {
  const s = branchedScenario()
  return draftFromScenario({
    phases: [{ id: 'p1', index: 0, title: 'One', goal: '', startTime: '0:00', endTime: '4:00' }],
    msel: s.msel,
    branches: s.branches,
  })
}

describe('path filter', () => {
  it('dims nothing for "all"', () => {
    expect(offPathRowIds(draft(), 'all').size).toBe(0)
  })

  it('dims every branch row for "trunk"', () => {
    expect([...offPathRowIds(draft(), 'trunk')].sort()).toEqual([
      'I-11a',
      'I-11b',
      'I-11c',
      'I-12a',
      'I-12b',
      'I-14b',
    ])
  })

  it('dims the branches not on the default path', () => {
    expect([...offPathRowIds(draft(), 'default')].sort()).toEqual(['I-11a', 'I-12a', 'I-12b'])
  })

  it('keeps the trunk and a chosen branch with its parents', () => {
    expect([...offPathRowIds(draft(), 'branch:b3')].sort()).toEqual(['I-11a', 'I-12a'])
  })
})

describe('row marks and decision text', () => {
  it('marks branch rows with their chip and label', () => {
    const marks = branchMarks(draft())
    expect(marks.get('I-11a')).toEqual({ chip: 'B1', label: 'Pay' })
    expect(marks.has('I-16')).toBe(false)
  })

  it('summarises a decision for the grid', () => {
    const row = draft().rows.find((r) => r.row.id === 'I-10')!.row
    expect(decisionSummary(row.decision!)).toBe(
      'Pay → B1 · Rebuild → B2 · rule: majority · default Rebuild',
    )
  })
})
