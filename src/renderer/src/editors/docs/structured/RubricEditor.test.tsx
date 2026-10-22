// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { Scenario } from '@shared/schemas/scenario'
import { FakeIpcError, PROJECT, SCENARIO, mockTtx, renderWithClient } from '../test-helpers'
import { RubricEditor } from './RubricEditor'

afterEach(() => cleanup())

function setup(handlers: Parameters<typeof mockTtx>[0] = {}) {
  const ttx = mockTtx({
    'scenarios:get': () => SCENARIO,
    'scenarios:save': (req: { scenario: Scenario }) => req.scenario,
    'scenarios:history': () => [],
    ...handlers,
  })
  renderWithClient(<RubricEditor projectPath={PROJECT} scenario={SCENARIO} />)
  return { ttx, user: userEvent.setup() }
}

const table = () => screen.getByRole('table', { name: 'Evaluation rubric' })

describe('RubricEditor', () => {
  it('shows the metrics with a total of 100 and no warning', () => {
    setup()
    expect(screen.getByDisplayValue('Operational Coordination')).toBeTruthy()
    expect(within(table()).getByText('100 / 100')).toBeTruthy()
    expect(screen.queryByText(/Points add up to/)).toBeNull()
  })

  it('warns when the points no longer add up to 100', async () => {
    const { user } = setup()
    const points = screen.getByRole('textbox', { name: 'Metric 1 points' })
    await user.clear(points)
    await user.type(points, '25')
    expect(within(table()).getByText('95 / 100')).toBeTruthy()
    expect(screen.getByText('Points add up to 95, not 100 (5 short).')).toBeTruthy()
    await user.clear(points)
    await user.type(points, 'x')
    expect(points.getAttribute('aria-invalid')).toBe('true')
  })

  it('links injects by MSEL id and rejects ids that are not in the MSEL', async () => {
    const { user } = setup()
    const add = screen.getByRole('combobox', { name: 'Add inject to Metric 1 linked injects' })
    await user.type(add, 'I-99{Enter}')
    expect(screen.getByRole('alert').textContent).toBe('I-99 is not an inject in the MSEL.')
    await user.clear(add)
    await user.type(add, 'i-05b{Enter}')
    const chips = screen.getByRole('list', { name: 'Metric 1 linked injects' })
    expect(within(chips).getByText('I-05b')).toBeTruthy()
    await user.click(within(chips).getByRole('button', { name: 'Remove I-09' }))
    expect(within(chips).queryByText('I-09')).toBeNull()
  })

  it('flags stored links to injects that no longer exist', () => {
    const broken: Scenario = {
      ...SCENARIO,
      rubric: {
        metrics: SCENARIO.rubric!.metrics.map((m, i) =>
          i === 0 ? { ...m, linkedInjectIds: ['I-09', 'I-77'] } : m,
        ),
      },
    }
    mockTtx({ 'scenarios:history': () => [] })
    renderWithClient(<RubricEditor projectPath={PROJECT} scenario={broken} />)
    expect(screen.getByText('Not in the MSEL: I-77')).toBeTruthy()
  })

  it('saves only the rubric onto the latest scenario', async () => {
    const latest = { ...SCENARIO, title: 'Renamed elsewhere' }
    const { ttx, user } = setup({ 'scenarios:get': () => latest })
    const name = screen.getByRole('textbox', { name: 'Metric 2 name' })
    await user.clear(name)
    await user.type(name, 'Technical Analysis')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(ttx.calls('scenarios:save')).toHaveLength(1))
    const saved = ttx.calls('scenarios:save')[0] as { scenario: Scenario; note: string }
    expect(saved.note).toBe('Edited rubric')
    expect(saved.scenario.title).toBe('Renamed elsewhere')
    expect(saved.scenario.rubric!.metrics[1]!.name).toBe('Technical Analysis')
    expect(await screen.findByText('All changes saved')).toBeTruthy()
  })

  it('keeps edits and retries after a generation job finishes (CONFLICT)', async () => {
    let busy = true
    const { ttx, user } = setup({
      'scenarios:save': (req: { scenario: Scenario }) => {
        if (busy) throw new FakeIpcError('CONFLICT', 'Generation is running for this scenario')
        return req.scenario
      },
    })
    const name = screen.getByRole('textbox', { name: 'Metric 1 name' })
    await user.type(name, '!')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Generation is running/)
    expect(screen.getByDisplayValue('Operational Coordination!')).toBeTruthy()
    busy = false
    ttx.emit('job:done', { jobId: 'J1', kind: 'rerun-stage', status: 'done' })
    await waitFor(() => expect(ttx.calls('scenarios:save')).toHaveLength(2))
    expect(await screen.findByText('All changes saved')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
