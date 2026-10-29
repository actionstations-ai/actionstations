// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { branchedScenario, mselRow } from '@shared/branching/fixture'
import type { Phase } from '@shared/schemas/scenario'
import { BranchesPanel } from './BranchesPanel'
import { draftFromScenario, draftMsel, type Draft } from './model'

const phase: Phase = {
  id: 'p1',
  index: 0,
  title: 'One',
  goal: '',
  startTime: '0:00',
  endTime: '4:00',
}

afterEach(() => cleanup())

function setup(draft: Draft, selected: string[] = []) {
  const edit = vi.fn()
  const onFilter = vi.fn()
  render(
    <BranchesPanel
      draft={draft}
      edit={edit}
      selected={new Set(selected)}
      filter="all"
      onFilter={onFilter}
      onJump={vi.fn()}
    />,
  )
  return { edit, onFilter }
}

const branched = (): Draft => {
  const s = branchedScenario()
  return draftFromScenario({ phases: [phase], msel: s.msel, branches: s.branches })
}

describe('BranchesPanel', () => {
  it('is collapsed until opened and counts the branches', async () => {
    setup(branched())
    expect(screen.queryByLabelText('Rule')).toBeNull()
    expect(screen.getByRole('button', { name: /Branches/ }).getAttribute('aria-expanded')).toBe(
      'false',
    )
    await userEvent.click(screen.getByRole('button', { name: /Branches/ }))
    expect(screen.getAllByLabelText('Rule')).toHaveLength(2)
  })

  it('changes a decision rule through the editor', async () => {
    const { edit } = setup(branched())
    await userEvent.click(screen.getByRole('button', { name: /Branches/ }))
    await userEvent.selectOptions(screen.getAllByLabelText('Rule')[0]!, 'unanimous')
    const next = edit.mock.calls[0]![0] as Draft
    expect(draftMsel(next).find((r) => r.id === 'I-10')!.decision!.rule).toEqual({
      kind: 'unanimous',
    })
  })

  it('sets where a branch rejoins', async () => {
    const { edit } = setup(branched())
    await userEvent.click(screen.getByRole('button', { name: /Branches/ }))
    const rejoin = screen.getAllByLabelText('Rejoins at')[0]!
    await userEvent.selectOptions(rejoin, 'END')
    const next = edit.mock.calls[0]![0] as Draft
    expect(next.branches!.find((b) => b.id === 'b1')!.rejoinRowId).toBe('END')
  })

  it('offers "Branch this decision" for a decision point without a decision', async () => {
    const draft = draftFromScenario({
      phases: [phase],
      msel: [mselRow('I-10', '1:30', { purposeTag: 'DECISION_POINT' }), mselRow('I-16', '2:05')],
    })
    const { edit } = setup(draft)
    await userEvent.click(screen.getByRole('button', { name: /Branches/ }))
    await userEvent.click(screen.getByRole('button', { name: /Branch this decision/ }))
    const next = edit.mock.calls[0]![0] as Draft
    expect(next.branches).toHaveLength(2)
  })

  it('moves the selected rows into a branch', async () => {
    const d = branched()
    const key = d.rows.find((r) => r.row.id === 'I-16')!.key
    const { edit } = setup(d, [key])
    await userEvent.click(screen.getByRole('button', { name: /Branches/ }))
    await userEvent.selectOptions(screen.getByLabelText(/Move 1 selected row to/), 'b1')
    await userEvent.click(screen.getByRole('button', { name: 'Move rows' }))
    const next = edit.mock.calls[0]![0] as Draft
    expect(draftMsel(next).find((r) => r.id === 'I-16')!.branchId).toBe('b1')
  })

  it('asks before deleting a branch with its rows', async () => {
    const { edit } = setup(branched())
    await userEvent.click(screen.getByRole('button', { name: /Branches/ }))
    await userEvent.click(screen.getAllByRole('button', { name: /Delete branch…/ })[0]!)
    expect(edit).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Delete branch and its rows/ }))
    expect((edit.mock.calls[0]![0] as Draft).branches!.map((b) => b.id)).not.toContain('b1')
  })

  it('reports the path filter choice', async () => {
    const { onFilter } = setup(branched())
    await userEvent.selectOptions(screen.getByLabelText('Show path'), 'default')
    expect(onFilter).toHaveBeenCalledWith('default')
  })
})
