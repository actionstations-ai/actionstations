import { describe, expect, it } from 'vitest'
import { branchedScenario, mselRow } from '@shared/branching/fixture'
import { lintBranches } from '@shared/branching/lint'
import type { Phase } from '@shared/schemas/scenario'
import {
  addDecision,
  addOption,
  deleteBranchWithRows,
  flattenBranch,
  moveRowsToBranch,
  remapRejoins,
  renameOption,
  setRejoin,
  updateDecision,
} from './branch-ops'
import { draftFromScenario, draftMsel, type Draft } from './model'
import { mergeDraft } from './editor-state'

const phase: Phase = {
  id: 'p1',
  index: 0,
  title: 'One',
  goal: '',
  startTime: '0:00',
  endTime: '4:00',
}

const plainDraft = (): Draft =>
  draftFromScenario({
    phases: [phase],
    msel: [
      mselRow('START', '0:00', { purposeTag: 'STARTEX' }),
      mselRow('I-10', '1:30'),
      mselRow('I-16', '2:05'),
      mselRow('END', '2:30', { purposeTag: 'ENDEX' }),
    ],
  })

const branchedDraft = (): Draft => {
  const s = branchedScenario()
  return draftFromScenario({ phases: [phase], msel: s.msel, branches: s.branches })
}

const keyOf = (d: Draft, id: string) => d.rows.find((r) => r.row.id === id)!.key
const ids = (d: Draft) => draftMsel(d).map((r) => r.id)

describe('addDecision', () => {
  it('turns a row into a decision point with two branches and a starter row each', () => {
    const d0 = plainDraft()
    const d = addDecision(d0, keyOf(d0, 'I-10'))
    const row = draftMsel(d).find((r) => r.id === 'I-10')!
    expect(row.purposeTag).toBe('DECISION_POINT')
    expect(row.decision?.options).toHaveLength(2)
    expect(d.branches).toHaveLength(2)
    expect(draftMsel(d).filter((r) => r.branchId)).toHaveLength(2)
  })

  it('rejoins the next row on the same lane so the new branches lint clean', () => {
    const d0 = plainDraft()
    const d = addDecision(d0, keyOf(d0, 'I-10'))
    expect(d.branches!.map((b) => b.rejoinRowId)).toEqual(['I-16', 'I-16'])
    const warnings = lintBranches({ roles: [], msel: draftMsel(d), branches: d.branches })
    expect(warnings.filter((w) => w.severity === 'error')).toEqual([])
  })

  it('leaves a row that already holds a decision alone', () => {
    const d0 = branchedDraft()
    expect(addDecision(d0, keyOf(d0, 'I-10'))).toBe(d0)
  })
})

describe('decision edits', () => {
  it('changes the rule, default and timeout, and clears the timeout', () => {
    let d = updateDecision(branchedDraft(), 'd1', {
      rule: { kind: 'threshold', optionId: 'pay', minShare: 0.6 },
      defaultOptionId: 'pay',
      timeoutMin: 10,
    })
    const dec = () => draftMsel(d).find((r) => r.id === 'I-10')!.decision!
    expect(dec().rule).toEqual({ kind: 'threshold', optionId: 'pay', minShare: 0.6 })
    expect(dec().timeoutMin).toBe(10)
    d = updateDecision(d, 'd1', { timeoutMin: undefined })
    expect(dec()).not.toHaveProperty('timeoutMin')
  })

  it('renames an option and its branch together', () => {
    const d = renameOption(branchedDraft(), 'd1', 'pay', 'Pay quietly')
    expect(d.branches!.find((b) => b.id === 'b1')!.label).toBe('Pay quietly')
    expect(draftMsel(d).find((r) => r.id === 'I-10')!.decision!.options[0]!.label).toBe(
      'Pay quietly',
    )
  })

  it('adds an option with a branch up to six options', () => {
    let d = branchedDraft()
    for (let i = 0; i < 6; i++) d = addOption(d, 'd1')
    expect(draftMsel(d).find((r) => r.id === 'I-10')!.decision!.options).toHaveLength(6)
    expect(d.branches!.filter((b) => b.decisionId === 'd1')).toHaveLength(6)
  })
})

describe('branch moves', () => {
  it('moves rows into a branch and back to the trunk', () => {
    const d0 = branchedDraft()
    const d1 = moveRowsToBranch(d0, new Set([keyOf(d0, 'I-16')]), 'b1')
    expect(draftMsel(d1).find((r) => r.id === 'I-16')!.branchId).toBe('b1')
    const d2 = moveRowsToBranch(d1, new Set([keyOf(d1, 'I-16')]), undefined)
    expect(draftMsel(d2).find((r) => r.id === 'I-16')).not.toHaveProperty('branchId')
  })

  it('sets and clears a rejoin row', () => {
    const d = setRejoin(branchedDraft(), 'b1', 'END')
    expect(d.branches!.find((b) => b.id === 'b1')!.rejoinRowId).toBe('END')
    expect(setRejoin(d, 'b1', undefined).branches!.find((b) => b.id === 'b1')).not.toHaveProperty(
      'rejoinRowId',
    )
  })

  it('converts a branch to trunk: rows stay, branch and option link go', () => {
    const d = flattenBranch(branchedDraft(), 'b1')
    expect(d.branches!.map((b) => b.id)).toEqual(['b2', 'b3'])
    expect(draftMsel(d).find((r) => r.id === 'I-11a')).not.toHaveProperty('branchId')
    expect(draftMsel(d).find((r) => r.id === 'I-10')!.decision!.options[0]).not.toHaveProperty(
      'branchId',
    )
  })

  it('deletes a branch with its rows and the branches below it', () => {
    const d = deleteBranchWithRows(branchedDraft(), 'b2')
    expect(ids(d)).toEqual(['START', 'I-10', 'I-11a', 'I-12a', 'I-16', 'END'])
    expect(d.branches!.map((b) => b.id)).toEqual(['b1'])
  })

  it('drops the branches key when the last branch goes', () => {
    let d = deleteBranchWithRows(branchedDraft(), 'b1')
    d = deleteBranchWithRows(d, 'b2')
    expect(d.branches).toBeUndefined()
  })
})

describe('saving', () => {
  it('writes branches back with the MSEL and omits the key when there are none', () => {
    const base = { ...branchedScenario(), phases: [phase] } as never
    const withB = mergeDraft(base, branchedDraft(), {})
    expect(withB.branches).toHaveLength(3)
    const without = mergeDraft(base, plainDraft(), {})
    expect('branches' in without).toBe(false)
  })

  it('follows a renamed rejoin row', () => {
    const d = branchedDraft()
    const renamed = {
      ...d,
      rows: d.rows.map((r) => (r.row.id === 'I-16' ? { ...r, row: { ...r.row, id: 'I-20' } } : r)),
    }
    const saved = Object.fromEntries(d.rows.map((r) => [r.key, r.row.id]))
    expect(remapRejoins(renamed, saved)!.find((b) => b.id === 'b1')!.rejoinRowId).toBe('I-20')
  })
})
