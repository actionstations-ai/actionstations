// Structural repairs on a branched MSEL (#430): a branch's rows play between its decision row and
// its rejoin row, a branch that ends the exercise keeps its own ENDEX last, and a branch ENDEX is
// never dropped as an extra ENDEX of the trunk.
import { describe, expect, it } from 'vitest'
import { branchedScenario, mselRow } from '@shared/branching/fixture'
import type { Scenario } from '@shared/schemas'
import { repairStructure } from './mappers-structure'

function scenarioOf(extra: ReturnType<typeof mselRow>[] = []): Scenario {
  const b = branchedScenario()
  return {
    phases: [{ id: 'p1', index: 0, title: 'One', goal: 'g', startTime: '0:00', endTime: '4:00' }],
    msel: [...b.msel, ...extra],
    branches: b.branches,
    roles: [],
    brief: {},
  } as unknown as Scenario
}

const timeOf = (s: Scenario, id: string) => s.msel.find((r) => r.id === id)!.time

describe('repairStructure on branches', () => {
  it('moves a branch row timed before its decision or after its rejoin row into the window', () => {
    const s = scenarioOf([
      mselRow('I-09b', '0:20', { branchId: 'b1' }),
      mselRow('I-18a', '3:30', { branchId: 'b1' }),
    ])
    const fix = repairStructure(s)
    expect(fix.retimed.map((r) => r.rowId).sort()).toEqual(['I-09b', 'I-18a'])
    for (const id of ['I-09b', 'I-18a']) {
      const t = timeOf(s, id)
      expect(t >= '1:30' && t <= '2:05').toBe(true)
    }
  })

  it('leaves rows inside the window and locked rows alone', () => {
    const s = scenarioOf([mselRow('I-18a', '3:30', { branchId: 'b1', locked: true })])
    const fix = repairStructure(s)
    expect(fix.retimed).toEqual([])
    expect(timeOf(s, 'I-18a')).toBe('3:30')
  })

  it('keeps the ENDEX of a branch that ends the exercise, and puts it last in its branch', () => {
    const s = scenarioOf([
      mselRow('I-30c', '2:00', { branchId: 'b3', purposeTag: 'ENDEX' }),
      mselRow('I-31c', '2:20', { branchId: 'b3' }),
    ])
    s.branches = s.branches!.map((b) => {
      if (b.id !== 'b3') return b
      const { rejoinRowId: _drop, ...rest } = b
      return rest
    })
    const fix = repairStructure(s)
    expect(fix.extraEndex).toEqual([])
    expect(s.msel.some((r) => r.id === 'I-30c')).toBe(true)
    expect(timeOf(s, 'I-30c')).toBe('2:20')
  })

  it('does not count branch rows against the trunk ENDEX', () => {
    const s = scenarioOf([mselRow('I-40b', '3:50', { branchId: 'b2' })])
    repairStructure(s)
    expect(timeOf(s, 'END')).toBe('2:30')
  })
})
