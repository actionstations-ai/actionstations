import { describe, expect, it } from 'vitest'
import { branchedScenario, mselRow } from './fixture'
import { lintBranches } from './lint'

const codes = (s: ReturnType<typeof branchedScenario>) => lintBranches(s).map((w) => w.code)

describe('lintBranches', () => {
  it('has nothing to say about a scenario without branches or decisions', () => {
    const s = branchedScenario()
    expect(
      lintBranches({ roles: [], msel: s.msel.filter((r) => !r.branchId && !r.decision) }),
    ).toEqual([])
  })

  it('accepts the well-formed example', () => {
    expect(codes(branchedScenario())).toEqual([])
  })

  it('reports a branch no option leads to as unreachable', () => {
    const s = branchedScenario()
    s.msel[1]!.decision = {
      ...s.msel[1]!.decision!,
      options: s.msel[1]!.decision!.options.map((o) => ({ ...o, branchId: undefined })),
    }
    expect(codes(s)).toContain('BRANCH_UNREACHABLE')
  })

  it('reports a branch hanging off an unreachable branch as unreachable', () => {
    const s = branchedScenario()
    s.msel[1]!.decision!.options[1]!.branchId = undefined
    const unreachable = lintBranches(s).filter((w) => w.code === 'BRANCH_UNREACHABLE')
    expect(unreachable.length).toBe(2)
  })

  it('reports a branch with no rejoin and no end card as a dead end', () => {
    const s = branchedScenario()
    s.branches[0] = { ...s.branches[0]!, rejoinRowId: undefined }
    expect(codes(s)).toContain('BRANCH_DEAD_END')
  })

  it('accepts a branch that ends with an end card', () => {
    const s = branchedScenario()
    s.branches[0] = { ...s.branches[0]!, rejoinRowId: undefined }
    s.msel.push(mselRow('I-13a', '2:00', { branchId: 'b1', purposeTag: 'ENDEX' }))
    expect(codes(s)).not.toContain('BRANCH_DEAD_END')
  })

  it('reports a rejoin row that does not exist', () => {
    const s = branchedScenario()
    s.branches[0] = { ...s.branches[0]!, rejoinRowId: 'NOPE' }
    expect(codes(s)).toContain('BRANCH_DEAD_END')
  })

  it('reports a rejoin earlier than the branch last row', () => {
    const s = branchedScenario()
    s.branches[0] = { ...s.branches[0]!, rejoinRowId: 'I-10' }
    expect(codes(s)).toContain('BRANCH_REJOIN_BACKWARD')
  })

  it('reports a rejoin on a sibling branch', () => {
    const s = branchedScenario()
    s.branches[0] = { ...s.branches[0]!, rejoinRowId: 'I-14b' }
    expect(codes(s)).toContain('BRANCH_REJOIN_BACKWARD')
  })

  it('reports rejoin pointers that lead back to the branch', () => {
    const s = branchedScenario()
    // b3 rejoins I-14b on b2; make b2 rejoin a row on b3
    s.branches[1] = { ...s.branches[1]!, rejoinRowId: 'I-12b' }
    expect(codes(s)).toContain('BRANCH_CYCLE')
  })

  it('reports a decision whose default is not an option', () => {
    const s = branchedScenario()
    s.msel[1]!.decision!.defaultOptionId = 'ghost'
    expect(codes(s)).toContain('DECISION_NO_DEFAULT')
  })

  it('reports an option that names a missing branch', () => {
    const s = branchedScenario()
    s.msel[1]!.decision!.options[0]!.branchId = 'ghost'
    expect(codes(s)).toContain('DECISION_OPTION_ORPHAN')
  })

  it('reports a decision on a row that is not a decision point', () => {
    const s = branchedScenario()
    s.msel[1]!.purposeTag = 'NOISE'
    expect(codes(s)).toContain('DECISION_NOT_DECISION_POINT')
  })

  it('notes a branch with no rows as info', () => {
    const s = branchedScenario()
    const empty = lintBranches({ ...s, msel: s.msel.filter((r) => r.branchId !== 'b1') })
    expect(empty.find((w) => w.code === 'BRANCH_EMPTY')?.severity).toBe('info')
  })

  it('reports rows timed before the decision or after the rejoin', () => {
    const s = branchedScenario()
    s.msel.push(mselRow('I-09a', '1:00', { branchId: 'b1' }))
    s.msel.push(mselRow('I-17a', '2:20', { branchId: 'b1' }))
    const times = lintBranches(s).filter((w) => w.code === 'BRANCH_TIME_ORDER')
    expect(times.map((w) => w.rowId).sort()).toEqual(['I-09a', 'I-17a'])
  })

  it('reports a role that receives nothing for more than 30 minutes of a branch', () => {
    const s = branchedScenario()
    s.roles = [{ id: 'pio', name: 'PIO' }] as never
    s.msel.find((r) => r.id === 'I-11a')!.toRoleIds = ['pio']
    s.msel.push(mselRow('I-13a', '2:30', { branchId: 'b1' }))
    const gap = lintBranches(s).find((w) => w.code === 'BRANCH_ROLE_GAP')
    expect(gap?.severity).toBe('warning')
    expect(gap?.message).toContain('PIO')
  })

  it('lints a large scenario quickly', () => {
    const s = branchedScenario()
    for (let i = 0; i < 100; i++) s.msel.push(mselRow(`X-${i}`, '1:45', { branchId: 'b1' }))
    const t0 = performance.now()
    lintBranches(s)
    expect(performance.now() - t0).toBeLessThan(50)
  })
})
