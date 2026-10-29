// @vitest-environment happy-dom
// "Generate branch rows" (spec 0430 FR-11): the drafted rows are shown for review and only an
// explicit Apply changes the draft.
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { branchedScenario, mselRow } from '@shared/branching/fixture'
import type { BranchPlanResult } from '@shared/branching/proposal'
import type { Phase } from '@shared/schemas/scenario'
import { PROJECT, mockTtx, renderWithClient } from '../docs/test-helpers'
import { GenerateBranches } from './GenerateBranches'
import { draftFromScenario, draftMsel, type Draft } from './model'

afterEach(() => cleanup())

const phase: Phase = {
  id: 'p1',
  index: 0,
  title: 'One',
  goal: '',
  startTime: '0:00',
  endTime: '4:00',
}
const draft = (): Draft => {
  const s = branchedScenario()
  return draftFromScenario({ phases: [phase], msel: s.msel, branches: s.branches })
}

const PLAN: BranchPlanResult = {
  decisionRowId: 'I-10',
  branches: [
    {
      branchId: 'b1',
      label: 'Pay the ransom',
      rationale: 'Shows the cost.',
      rejoinRowId: 'I-16',
      rows: [mselRow('I-20a', '1:45', { branchId: 'b1', event: 'A key arrives.' })],
    },
  ],
  notes: ['Row I-21a moved from 3:50 to 2:00 to fit its branch window.'],
  warnings: [],
}

let jobs = 0
function setup(over: { dirty?: boolean } = {}) {
  jobs = 0
  const edit = vi.fn()
  const ttx = mockTtx({ 'generate:branch-plan': () => ({ jobId: `J${++jobs}` }) })
  renderWithClient(
    <GenerateBranches
      projectPath={PROJECT}
      scenarioId="s1"
      dirty={over.dirty ?? false}
      draft={draft()}
      edit={edit}
      decisionRowId="I-10"
    />,
  )
  return { ttx, edit, user: userEvent.setup() }
}

const finish = (ttx: ReturnType<typeof mockTtx>, result: unknown) =>
  ttx.emit('job:done', { jobId: `J${jobs}`, kind: 'generate-injects', status: 'done', result })

describe('GenerateBranches', () => {
  it('asks for the decision row, shows the drafted rows and applies them only on request', async () => {
    const { ttx, edit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Generate branch rows' }))
    expect(ttx.calls('generate:branch-plan')[0]).toEqual({
      projectPath: PROJECT,
      scenarioId: 's1',
      decisionRowId: 'I-10',
    })
    finish(ttx, PLAN)
    expect(await screen.findByText(/A key arrives\./)).toBeTruthy()
    expect(screen.getByText(/moved from 3:50 to 2:00/)).toBeTruthy()
    expect(edit).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Apply to the branches' }))
    const next = edit.mock.calls[0]![0] as Draft
    const ids = draftMsel(next).map((r) => r.id)
    expect(ids).toContain('I-20a')
    expect(ids).not.toContain('I-11a')
  })

  it('discards a draft without changing anything', async () => {
    const { ttx, edit, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Generate branch rows' }))
    finish(ttx, PLAN)
    await user.click(await screen.findByRole('button', { name: 'Discard' }))
    expect(edit).not.toHaveBeenCalled()
    expect(screen.queryByText(/A key arrives\./)).toBeNull()
  })

  it('waits for unsaved edits instead of drafting from an older scenario', () => {
    setup({ dirty: true })
    const button = screen.getByRole('button', { name: 'Generate branch rows' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Waiting for your edits to save.')).toBeTruthy()
  })

  it('says so when the model fails, and has no axe violations with a draft open', async () => {
    const { ttx, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Generate branch rows' }))
    ttx.emit('job:done', {
      jobId: `J${jobs}`,
      kind: 'generate-injects',
      status: 'error',
      error: 'No model',
    })
    expect((await screen.findByRole('alert')).textContent).toContain('No model')
    await user.click(screen.getByRole('button', { name: 'Generate branch rows' }))
    finish(ttx, PLAN)
    await screen.findByText(/A key arrives\./)
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    await waitFor(() => expect(result.violations.map((v) => v.id)).toEqual([]))
  })
})
