// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import type { DecisionRecord } from '@shared/ipc/facilitator'
import type { Decision } from '@shared/schemas/scenario'
import { chosenLine } from './decision-text'
import { DecisionCard } from './PresentDecision'

afterEach(cleanup)

const decision = {
  id: 'd1',
  question: 'Pay the ransom or rebuild?',
  options: [
    { id: 'pay', label: 'Pay' },
    { id: 'rebuild', label: 'Rebuild' },
  ],
  mode: 'anonymous',
  rule: { kind: 'majority' },
  defaultOptionId: 'rebuild',
  votingRoleIds: [],
} as unknown as Decision

const record = (over: Partial<DecisionRecord> = {}): DecisionRecord => ({
  decisionId: 'd1',
  optionId: 'rebuild',
  by: 'vote',
  rule: { kind: 'majority' },
  input: { tally: { rebuild: 7, pay: 4 }, cast: 11 },
  at: '2026-10-29T10:00:00.000Z',
  exerciseTime: '1:20',
  note: '',
  ...over,
})

describe('decision on the screen', () => {
  it('says the room is deciding before a choice', () => {
    render(<DecisionCard decision={decision} />)
    expect(screen.getByRole('heading', { name: 'Pay the ransom or rebuild?' })).toBeTruthy()
    expect(screen.getByTestId('present-decision-status').textContent).toBe('The room is deciding.')
  })

  it('announces the chosen option and the rule with the count', () => {
    render(<DecisionCard decision={decision} record={record()} />)
    expect(screen.getByTestId('present-decision-status').textContent).toBe(
      'Chosen by majority: 7 of 11. Rebuild.',
    )
    expect(screen.getByText(/^Rebuild/, { selector: 'li' }).getAttribute('aria-current')).toBe(
      'true',
    )
  })

  it('words controller and timeout choices without a count', () => {
    expect(chosenLine(record({ by: 'controller' }))).toBe('Chosen by the controller')
    expect(chosenLine(record({ by: 'timeout' }))).toMatch(/time ran out/)
  })

  it('has no axe violations', async () => {
    render(<DecisionCard decision={decision} record={record()} />)
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations).toEqual([])
  })
})
