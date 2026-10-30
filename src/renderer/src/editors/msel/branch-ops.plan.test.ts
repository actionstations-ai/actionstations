import { describe, expect, it } from 'vitest'
import { branchedScenario, mselRow } from '@shared/branching/fixture'
import type { Phase } from '@shared/schemas/scenario'
import { applyBranchPlan } from './branch-ops'
import { draftFromScenario, draftMsel, type Draft } from './model'

const phase: Phase = {
  id: 'p1',
  index: 0,
  title: 'One',
  goal: '',
  startTime: '0:00',
  endTime: '4:00',
}

const branchedDraft = (): Draft => {
  const s = branchedScenario()
  return draftFromScenario({ phases: [phase], msel: s.msel, branches: s.branches })
}
const ids = (d: Draft) => draftMsel(d).map((r) => r.id)

const plan = (rows: ReturnType<typeof mselRow>[]) => ({
  decisionRowId: 'I-10',
  branches: [{ branchId: 'b1', label: 'Pay now', rationale: 'Cost.', rows }],
  notes: [],
  warnings: [],
})

describe('applyBranchPlan (#430)', () => {
  it('leaves an unlocked row owned by another organization unchanged (#497)', () => {
    const base = branchedDraft()
    const owned = {
      ...base,
      rows: base.rows.map((r) =>
        r.row.id === 'I-12a' ? { ...r, row: { ...r.row, owner: 'partner' } } : r,
      ),
    }
    const regional = { thisOrg: 'me', orgs: new Map() }
    const d = applyBranchPlan(owned, plan([mselRow('I-20a', '1:45', { branchId: 'b1' })]), regional)
    const kept = draftMsel(d).find((r) => r.id === 'I-12a')
    expect(kept).toEqual(draftMsel(owned).find((r) => r.id === 'I-12a'))
    expect(ids(d)).toContain('I-20a')
    expect(ids(d)).not.toContain('I-11a')
  })

  it('replaces the unlocked rows of the planned branch and keeps every other row', () => {
    const d = applyBranchPlan(branchedDraft(), plan([mselRow('I-20a', '1:45', { branchId: 'b1' })]))
    expect(ids(d)).toContain('I-20a')
    expect(ids(d)).not.toContain('I-11a')
    expect(ids(d)).toContain('I-11b')
    expect(d.branches!.find((b) => b.id === 'b1')).toMatchObject({
      label: 'Pay now',
      rationale: 'Cost.',
      rejoinRowId: 'I-16',
    })
  })

  it('keeps a locked row and gives a clashing id a new one', () => {
    const base = branchedDraft()
    const locked = {
      ...base,
      rows: base.rows.map((r) =>
        r.row.id === 'I-12a' ? { ...r, row: { ...r.row, locked: true } } : r,
      ),
    }
    const d = applyBranchPlan(locked, plan([mselRow('I-12a', '1:45', { branchId: 'b1' })]))
    const b1 = draftMsel(d).filter((r) => r.branchId === 'b1')
    expect(b1.map((r) => r.id).sort()).toEqual(['I-12a', 'I-12a-1'])
  })
})
