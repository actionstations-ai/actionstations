// @vitest-environment happy-dom
// #115: an edit whose save is refused (CONFLICT, generation running) after its tab was left
// is kept per scenario + document, shown as "1 unsaved change pending", and saved when the
// job finishes — or taken back by the editor when the user returns.
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Scenario } from '@shared/schemas/scenario'
import { queryClient } from '../../lib/query'
import { PendingSavesNote } from './PendingSavesNote'
import { usePendingSaves } from './pending-saves'
import { RubricEditor } from './structured/RubricEditor'
import { FakeIpcError, PROJECT, SCENARIO, mockTtx } from './test-helpers'

function Harness(props: { editing: boolean }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PendingSavesNote scenarioId={SCENARIO.id} />
      {props.editing && <RubricEditor projectPath={PROJECT} scenario={SCENARIO} />}
    </QueryClientProvider>
  )
}

function setup() {
  const state = { generating: true }
  const ttx = mockTtx({
    'scenarios:get': () => SCENARIO,
    'scenarios:history': () => [],
    'scenarios:save': (req: { scenario: Scenario }) => {
      if (state.generating)
        throw new FakeIpcError('CONFLICT', 'Generation is running for this scenario')
      return req.scenario
    },
  })
  queryClient.clear()
  const view = render(<Harness editing />)
  return { ttx, state, view, user: userEvent.setup() }
}

const savedNames = (ttx: ReturnType<typeof mockTtx>) =>
  ttx
    .calls('scenarios:save')
    .map((c) => (c as { scenario: Scenario }).scenario.rubric!.metrics[1]!.name)

/** Rename metric 2, then leave the tab before the autosave fires. */
async function editAndLeave(s: ReturnType<typeof setup>) {
  const name = screen.getByRole('textbox', { name: 'Metric 2 name' })
  await s.user.clear(name)
  await s.user.type(name, 'Technical Analysis')
  s.view.rerender(<Harness editing={false} />)
  await screen.findByText('1 unsaved change pending')
}

beforeEach(() => usePendingSaves.setState({ entries: {} }))
afterEach(() => cleanup())

describe('pending saves (#115)', () => {
  it('keeps an edit refused after its tab was left and saves it when the job finishes', async () => {
    const s = setup()
    await editAndLeave(s)
    expect(
      screen.getByText(/\(Rubric\): saved automatically when generation finishes/),
    ).toBeTruthy()
    expect(savedNames(s.ttx)).toEqual(['Technical Analysis'])

    s.state.generating = false
    s.ttx.emit('job:done', { jobId: 'J1', kind: 'generate-scenario', status: 'done' })
    await waitFor(() =>
      expect(savedNames(s.ttx)).toEqual(['Technical Analysis', 'Technical Analysis']),
    )
    await waitFor(() => expect(screen.queryByText(/unsaved change pending/)).toBeNull())
  })

  it('stays pending while another job still holds the scenario', async () => {
    const s = setup()
    await editAndLeave(s)
    s.ttx.emit('job:done', { jobId: 'J1', kind: 'generate-scenario', status: 'done' })
    await waitFor(() => expect(savedNames(s.ttx)).toHaveLength(2))
    expect(screen.getByText('1 unsaved change pending')).toBeTruthy()
  })

  it('gives the edit back to the editor when the user returns, which then saves it', async () => {
    const s = setup()
    await editAndLeave(s)
    s.state.generating = false
    s.view.rerender(<Harness editing />)
    const name = screen.getByRole('textbox', { name: 'Metric 2 name' }) as HTMLInputElement
    expect(name.value).toBe('Technical Analysis')
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText(/unsaved change pending/)).toBeNull())
    await waitFor(() => expect(savedNames(s.ttx)).toHaveLength(2), { timeout: 3000 })
    expect(savedNames(s.ttx)[1]).toBe('Technical Analysis')
  })
})
