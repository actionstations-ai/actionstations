// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { VoteView } from '@shared/schemas/live'
import { PROJECT, mockTtx, renderAt } from '../documents/test-utils'
import { voteView } from '../facilitate/live/vote-fixtures'
import { projectKey } from '../../state/project'
import PresentVote from './PresentVote'

function open(initial: VoteView) {
  let current = initial
  const ttx = mockTtx({
    'live:votes': () => [current],
    'facilitator:close-present': () => undefined,
  })
  renderAt(
    `/present/${projectKey(PROJECT)}/S/vote/${initial.voteId}`,
    '/present/:projectKey/:scenarioId/vote/:voteId',
    PresentVote,
  )
  return { ttx, set: (v: VoteView) => (current = v) }
}

afterEach(() => cleanup())

describe('PresentVote', () => {
  it('shows the question, a bar per option with its count as text, and who has voted', async () => {
    open(
      voteView({
        rowId: 'I-14',
        voted: 5,
        eligible: 5,
        options: [
          { id: 'o1', label: 'Shut down now', count: 3 },
          { id: 'o2', label: 'Keep running', count: 1 },
          { id: 'o3', label: 'Shut down after the next bank', count: 1 },
        ],
      }),
    )
    expect(
      await screen.findByRole('heading', { name: /Shut down FIDS and go manual/ }),
    ).toBeTruthy()
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]!).getByText('3')).toBeTruthy()
    expect(within(rows[0]!).getByText('60 %')).toBeTruthy()
    expect(screen.getByTestId('present-vote-voted').textContent).toBe('5 of 5 voted')
    expect(screen.getByText('Decision I-14')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/^Open · /)
  })

  it('follows the tally when main says the votes changed, and shows Closed at the exercise time', async () => {
    const { ttx, set } = open(voteView({ voted: 1, eligible: 5 }))
    await screen.findByTestId('present-vote-voted')
    set(
      voteView({
        status: 'closed',
        closedClock: '2:14',
        voted: 4,
        eligible: 5,
        options: [
          { id: 'o1', label: 'Shut down now', count: 3 },
          { id: 'o2', label: 'Keep running', count: 1 },
        ],
      }),
    )
    act(() => ttx.emit('live:changed', { reason: 'votes', connected: 5 }))
    await waitFor(() =>
      expect(screen.getByTestId('present-vote-voted').textContent).toBe('4 of 5 voted'),
    )
    expect(screen.getByRole('status').textContent).toBe('Closed at 2:14')
    expect(screen.getByText('75 %')).toBeTruthy()
  })

  it('asks main to close the presentation on Escape', async () => {
    const { ttx } = open(voteView())
    await screen.findByTestId('present-vote-voted')
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(ttx.calls('facilitator:close-present')).toHaveLength(1))
  })
})
