// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { branchedScenario } from '@shared/branching/fixture'
import { FacilitatorState } from '@shared/ipc/facilitator'
import { Scenario } from '@shared/schemas/scenario'
import { mockTtx } from '../documents/test-utils'
import { DecisionPanel } from './DecisionPanel'

beforeEach(() => mockTtx({}))
afterEach(() => cleanup())

const scenario = (rule?: Scenario['msel'][number]['decision']) => {
  const b = branchedScenario()
  const msel = b.msel.map((r) => (r.id === 'I-10' && rule ? { ...r, decision: rule } : r))
  return Scenario.parse({
    id: 's1',
    projectId: 'p1',
    title: 'Fork',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    brief: {},
    msel,
    branches: b.branches,
  })
}

const stamp = { at: '2026-03-01T10:00:00.000Z', exerciseTime: '1:30' }

function Harness(props: {
  scenario: Scenario
  initial?: Partial<FacilitatorState>
  onLog?: (e: unknown) => void
}) {
  const [state, setState] = useState(
    FacilitatorState.parse({ delivered: { START: stamp, 'I-10': stamp }, ...props.initial }),
  )
  return (
    <>
      <DecisionPanel
        projectPath="/p"
        scenario={props.scenario}
        state={state}
        update={(fn) => setState(fn)}
        minutes={92}
        onLog={props.onLog ?? vi.fn()}
        onAnnounce={vi.fn()}
      />
      <output data-testid="decisions">
        {state.branching?.decisions.map((d) => `${d.decisionId}:${d.optionId}:${d.by}`).join(',')}
      </output>
    </>
  )
}

describe('DecisionPanel', () => {
  it('disables "Decide by rule" until a tally exists for a majority rule', async () => {
    render(<Harness scenario={scenario()} />)
    expect(screen.getByRole('button', { name: 'Decide by rule' })).toHaveProperty('disabled', true)
    await userEvent.clear(screen.getByLabelText('Pay'))
    await userEvent.type(screen.getByLabelText('Pay'), '7')
    expect(screen.getByRole('button', { name: 'Decide by rule' })).toHaveProperty('disabled', false)
  })

  it('enables "Decide by rule" for the controller rule with no votes', () => {
    const b = branchedScenario()
    const decision = { ...b.msel[1]!.decision!, rule: { kind: 'controller' as const } }
    render(<Harness scenario={scenario(decision)} />)
    expect(screen.getByRole('button', { name: 'Decide by rule' })).toHaveProperty('disabled', false)
  })

  it('closes the decision by the rule from a hand-entered tally and logs it', async () => {
    const onLog = vi.fn()
    render(<Harness scenario={scenario()} onLog={onLog} />)
    await userEvent.clear(screen.getByLabelText('Pay'))
    await userEvent.type(screen.getByLabelText('Pay'), '7')
    await userEvent.clear(screen.getByLabelText('Rebuild'))
    await userEvent.type(screen.getByLabelText('Rebuild'), '4')
    await userEvent.click(screen.getByRole('button', { name: 'Decide by rule' }))
    expect(screen.getByTestId('decisions').textContent).toBe('d1:pay:vote')
    expect(onLog.mock.calls[0]![0][0]).toMatchObject({ kind: 'decision.close', ex: '1:32' })
  })

  it('lets the controller choose an option', async () => {
    render(<Harness scenario={scenario()} />)
    await userEvent.click(screen.getByRole('button', { name: /Controller chooses: Rebuild/ }))
    expect(screen.getByTestId('decisions').textContent).toBe('d1:rebuild:controller')
  })

  it('needs a note to override, and keeps the earlier record', async () => {
    render(<Harness scenario={scenario()} />)
    await userEvent.click(screen.getByRole('button', { name: /Controller chooses: Pay/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Override…' }))
    await userEvent.selectOptions(screen.getByLabelText('Change to'), 'rebuild')
    expect(screen.getByRole('button', { name: 'Override decision' })).toHaveProperty(
      'disabled',
      true,
    )
    await userEvent.type(screen.getByLabelText('Why (required)'), 'Room asked for it')
    await userEvent.click(screen.getByRole('button', { name: 'Override decision' }))
    expect(screen.getByTestId('decisions').textContent).toBe(
      'd1:pay:controller,d1:rebuild:override',
    )
  })

  it('offers no override once a row of the chosen branch is delivered', async () => {
    render(<Harness scenario={scenario()} />)
    await userEvent.click(screen.getByRole('button', { name: /Controller chooses: Pay/ }))
    expect(screen.getByRole('button', { name: 'Override…' })).toBeTruthy()
    cleanup()
    const decided = FacilitatorState.parse({
      delivered: { START: stamp, 'I-10': stamp, 'I-11a': stamp },
      branching: {
        decisions: [
          {
            decisionId: 'd1',
            optionId: 'pay',
            by: 'controller',
            rule: { kind: 'majority' },
            input: { tally: {}, cast: 0 },
            at: stamp.at,
            exerciseTime: '1:30',
            note: '',
          },
        ],
      },
    })
    render(<Harness scenario={scenario()} initial={decided} />)
    expect(screen.queryByRole('button', { name: 'Override…' })).toBeNull()
  })

  it('shows what the replay check found', async () => {
    mockTtx({
      'facilitator:branching-replay': () => ({
        status: 'matches',
        message: 'Replay matches the recorded run.',
      }),
    })
    render(<Harness scenario={scenario()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Replay check' }))
    expect(await screen.findByText('Replay matches the recorded run.')).toBeTruthy()
  })
})
