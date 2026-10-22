// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RegenerateButton, type RegenerateProps } from './RegenerateButton'
import { FakeIpcError, PROJECT, mockTtx, renderWithClient } from './test-helpers'

afterEach(() => cleanup())

function setup(over: Partial<RegenerateProps> = {}, rerun?: () => { jobId: string }) {
  const order: string[] = []
  const ttx = mockTtx({
    'generate:rerun-stage': () => {
      order.push('rerun')
      return rerun ? rerun() : { jobId: 'JOB1' }
    },
  })
  const snapshot = vi.fn(async () => {
    order.push('snapshot')
    return true
  })
  const onJob = vi.fn()
  renderWithClient(
    <RegenerateButton
      projectPath={PROJECT}
      scenarioId="scenario-3"
      stage="rubric"
      label="rubric"
      hasContent
      edited
      snapshot={snapshot}
      onJob={onJob}
      {...over}
    />,
  )
  return { ttx, snapshot, onJob, order, user: userEvent.setup() }
}

describe('RegenerateButton', () => {
  it('warns about edits, keeps a snapshot first, then re-runs with instructions', async () => {
    const { ttx, order, onJob, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Regenerate rubric' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(/You have edited the rubric since it was generated/),
    ).toBeTruthy()
    const keep = within(dialog).getByRole('checkbox', { name: /Keep a history snapshot/ })
    expect((keep as HTMLInputElement).checked).toBe(true)
    await user.type(within(dialog).getByRole('textbox'), 'Weight doctrine higher')
    await user.click(within(dialog).getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(order).toEqual(['snapshot', 'rerun']))
    expect(ttx.calls('generate:rerun-stage')[0]).toEqual({
      projectPath: PROJECT,
      scenarioId: 'scenario-3',
      stage: 'rubric',
      instructions: 'Weight doctrine higher',
    })
    expect(onJob).toHaveBeenCalledWith('JOB1')
    ttx.emit('job:progress', {
      jobId: 'JOB1',
      kind: 'rerun-stage',
      status: 'running',
      progress: 0.5,
      message: 'Writing rubric',
    })
    expect(await screen.findByText('Writing rubric')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Regenerating rubric' })).toBeTruthy()
    ttx.emit('job:done', { jobId: 'JOB1', kind: 'rerun-stage', status: 'done' })
    expect(await screen.findByText('Regenerated.')).toBeTruthy()
  })

  it('skips the snapshot when unticked, and does nothing on cancel', async () => {
    const { snapshot, order, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Regenerate rubric' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    expect(order).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Regenerate rubric' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(order).toEqual(['rerun']))
    expect(snapshot).not.toHaveBeenCalled()
  })

  it('does not regenerate when the snapshot could not be saved', async () => {
    const { order, user } = setup({ snapshot: async () => false })
    await user.click(screen.getByRole('button', { name: 'Regenerate rubric' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Regenerate' }),
    )
    expect((await screen.findByRole('alert')).textContent).toMatch(/nothing was regenerated/)
    expect(order).toEqual([])
  })

  it('explains a CONFLICT when another generation is running', async () => {
    const { user } = setup({ hasContent: false }, () => {
      throw new FakeIpcError('CONFLICT', 'busy')
    })
    await user.click(screen.getByRole('button', { name: 'Regenerate rubric' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Regenerate' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/already running/)
  })
})
