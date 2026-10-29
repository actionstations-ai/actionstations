// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebCryptoProvider } from '../../../shared/live/crypto/webcrypto'
import { MemoryKeyValue } from '../../../shared/live/transport'
import { DEFAULT_PREFS } from '../../app/prefs'
import { PlayerSession } from '../../app/session'
import { VoteBanner } from './VoteBanner'
import { VoteScreen } from './VoteScreen'
import type { PlayerVote } from './votes'

const ID = 'AAAAAAAAAAAAAAAAAAAAAA'

const vote = (over: Partial<PlayerVote> = {}): PlayerVote => ({
  voteId: ID,
  question: 'Shut down FIDS and go manual, or keep it running?',
  options: [
    { id: 'o1', label: 'Shut down now' },
    { id: 'o2', label: 'Keep running' },
    { id: 'o3', label: 'Shut down after the next bank' },
  ],
  anonymous: true,
  allowChange: true,
  targets: ['all'],
  status: 'open',
  ballotSent: true,
  late: false,
  openedAt: 1,
  ...over,
})

function setup(v: PlayerVote, kind: 'player' | 'evaluator' = 'player') {
  const session = new PlayerSession({
    url: 'http://127.0.0.1/s/session-00000000000000#x',
    crypto: createWebCryptoProvider(),
    storage: new MemoryKeyValue(),
    connect: () => {
      throw new Error('not in this test')
    },
    announcer: { announce: () => {} },
    prefs: () => DEFAULT_PREFS,
    bundleVersion: 'test',
  })
  const enqueue = vi.fn(async () => undefined)
  Object.assign(session, { outbox: { enqueue } })
  session.store.set({
    phase: 'seated',
    connection: 'connected',
    clientId: 'playerA-00000000000000',
    seat:
      kind === 'player'
        ? {
            kind: 'player',
            role: { id: 'ops', name: 'Operations', abbreviation: '', teamId: 'ops' },
          }
        : { kind: 'evaluator' },
    votes: { [ID]: v },
  })
  const onBack = vi.fn()
  render(<VoteScreen session={session} voteId={ID} onBack={onBack} />)
  return { session, enqueue, onBack }
}

afterEach(() => cleanup())

describe('VoteScreen', () => {
  it('shows the options as a radio group and casts the chosen one', async () => {
    const { enqueue, session } = setup(vote())
    const user = userEvent.setup()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    const cast = screen.getByRole('button', { name: 'Cast vote' })
    expect(cast.hasAttribute('disabled')).toBe(true)
    await user.click(screen.getByRole('radio', { name: 'Keep running' }))
    await user.click(cast)
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'vote.cast',
        to: 'controller',
        payload: { voteId: ID, optionId: 'o2' },
      }),
    )
    expect(session.state.votes[ID]).toMatchObject({ mine: 'o2' })
    expect(screen.getByRole('button', { name: 'Change vote' })).toBeTruthy()
    expect(
      screen.getByText('You can change your vote until it closes. Your vote is anonymous.'),
    ).toBeTruthy()
  })

  it('says the vote is recorded once the ballot went out, and queued while it did not', () => {
    cleanup()
    setup(vote({ mine: 'o1', ballotSent: false }))
    expect(screen.getByText('Your vote will be sent when you are back online')).toBeTruthy()
    cleanup()
    setup(vote({ mine: 'o1', ballotSent: true }))
    expect(screen.getByText('Your vote is recorded')).toBeTruthy()
  })

  it('sends the reason with the ballot when the vote asks for one', async () => {
    const { enqueue } = setup(vote({ rationalePrompt: 'Why? (optional, anonymous)' }))
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Shut down now' }))
    await user.type(screen.getByLabelText('Why? (optional, anonymous)'), 'Safer for passengers')
    await user.click(screen.getByRole('button', { name: 'Cast vote' }))
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { voteId: ID, optionId: 'o1', rationale: 'Safer for passengers' },
      }),
    )
  })

  it('locks the choice when changing is off', () => {
    setup(vote({ mine: 'o1', allowChange: false }))
    expect(screen.queryByRole('button', { name: /vote$/ })).toBeNull()
    expect(screen.getByText(/You cannot change your vote/)).toBeTruthy()
  })

  it('shows the result with counts and percents as text, and marks this device choice', () => {
    setup(
      vote({
        status: 'closed',
        mine: 'o1',
        result: {
          results: [
            { optionId: 'o1', count: 7 },
            { optionId: 'o2', count: 3 },
            { optionId: 'o3', count: 2 },
          ],
          voted: 12,
          eligible: 14,
          revealed: true,
        },
      }),
    )
    const result = screen.getByRole('region', { name: 'Result' })
    expect(within(result).getByText('7 votes, 58 percent')).toBeTruthy()
    expect(within(result).getByText('2 votes, 17 percent')).toBeTruthy()
    expect(within(result).getByText('(Your choice)')).toBeTruthy()
    expect(within(result).getByText('12 of 14 voted')).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('tells a player whose ballot arrived too late that it was not counted', () => {
    setup(
      vote({
        status: 'closed',
        mine: 'o1',
        late: true,
        result: { results: [], voted: 0, eligible: 4, revealed: false },
      }),
    )
    expect(screen.getByRole('alert').textContent).toContain('closed before your ballot arrived')
    expect(screen.getByText(/show the result on the main screen/)).toBeTruthy()
  })

  it('gives an evaluator no ballot', () => {
    setup(vote(), 'evaluator')
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByText(/Not your vote/)).toBeTruthy()
  })

  it('announces the countdown at thirty and ten seconds in one live region', () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    try {
      vi.setSystemTime(1_000_000)
      setup(vote({ closesAt: 1_000_000 + 29_000 }))
      const live = document.querySelector('.sr-only[aria-live="polite"]')!
      expect(live.textContent).toBe('Thirty seconds left to vote')
      expect(screen.getByText('Vote closes in 0:29').closest('[aria-live]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('VoteBanner', () => {
  it('offers Vote now to a player and only a notice to an evaluator', async () => {
    const session = setup(vote()).session
    cleanup()
    const onOpen = vi.fn()
    render(<VoteBanner session={session} onOpen={onOpen} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /^Vote now: Shut down FIDS/ }))
    expect(onOpen).toHaveBeenCalledWith(ID)
    cleanup()
    session.store.set({ seat: { kind: 'evaluator' } })
    render(<VoteBanner session={session} onOpen={onOpen} />)
    expect(screen.getByRole('status').textContent).toBe('Vote in progress')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
