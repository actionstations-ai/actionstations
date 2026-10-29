// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveSessionStatus, VoteView } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { queryClient } from '../../../lib/query'
import { mockTtx, PROJECT } from '../../documents/test-utils'
import { VotePanel } from './VotePanel'
import { voteView } from './vote-fixtures'

const SESSION: LiveSessionStatus = {
  session: {
    id: 'c2Vzc2lvbi1pZC0wMDAwMDA',
    scenarioId: 'scn-1',
    name: 'FIDS',
    startedAt: '2026-10-28T10:00:00.000Z',
    connection: { kind: 'lan', address: '192.168.4.20', tls: 'self-signed' },
    joinUrlPublic: 'https://192.168.4.20:8485/s/x',
    attribution: 'role',
    protocolVersion: 1,
    lastIndex: 0,
  },
  connected: 5,
}

const scenario = {
  id: 'scn-1',
  title: 'FIDS failure',
  roles: [
    { id: 'ops', name: 'Operations', team: 'Airport Ops' },
    { id: 'pio', name: 'PIO', team: 'Comms' },
  ],
  msel: [
    {
      id: 'I-14',
      phaseId: 'p1',
      time: '1:00',
      from: 'SimCell',
      event: 'FIDS goes dark',
      expectedAction: 'Decide',
      purposeTag: 'DECISION_POINT',
      decision: {
        id: 'd1',
        question: 'Shut down FIDS?',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
        mode: 'anonymous',
        rule: { kind: 'plurality' },
        defaultOptionId: 'yes',
        votingRoleIds: [],
      },
    },
  ],
} as unknown as Scenario

function mount(
  votes: VoteView[],
  extra: Record<string, (r: never) => unknown> = {},
  session: LiveSessionStatus = SESSION,
) {
  const ttx = mockTtx({
    'live:session-status': () => session,
    'live:votes': () => votes,
    'live:vote-scope': () => ({
      eligible: 5,
      smallRoles: [{ roleId: 'pio', label: 'PIO', devices: 2 }],
    }),
    ...extra,
  } as never)
  queryClient.clear()
  const update = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <VotePanel projectPath={PROJECT} scenario={scenario} update={update} />
    </QueryClientProvider>,
  )
  return { ttx, update }
}

afterEach(() => cleanup())

describe('VotePanel', () => {
  it('asks for a live session first', async () => {
    mount([], {}, { connected: 0 })
    expect(await screen.findByText(/Start a live session in the Live tab/)).toBeTruthy()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('fills the form from an MSEL decision row and opens the vote with the row id', async () => {
    const { ttx } = mount([])
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Start from'), 'I-14')
    expect((screen.getByLabelText('Question') as HTMLInputElement).value).toBe('Shut down FIDS?')
    await user.click(screen.getByRole('button', { name: 'Open vote' }))
    await waitFor(() => expect(ttx.calls('live:vote-open')).toHaveLength(1))
    expect(ttx.calls('live:vote-open')[0]).toMatchObject({
      rowId: 'I-14',
      definition: {
        question: 'Shut down FIDS?',
        options: ['Yes', 'No'],
        optionIds: ['yes', 'no'],
        decisionId: 'd1',
        anonymous: true,
        k: 3,
      },
    })
  })

  it('opens an ad hoc vote with a countdown, a reason prompt and live results', async () => {
    const { ttx } = mount([])
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Question'), 'Evacuate the concourse?')
    await user.type(screen.getByLabelText(/Options, one per line/), 'Yes{enter}No')
    await user.selectOptions(screen.getByLabelText('Countdown'), '120')
    await user.click(screen.getByLabelText(/Ask why/))
    await user.click(screen.getByLabelText('Show live results on devices'))
    await user.click(screen.getByRole('button', { name: 'Open vote' }))
    await waitFor(() => expect(ttx.calls('live:vote-open')).toHaveLength(1))
    expect(ttx.calls('live:vote-open')[0]).toMatchObject({
      definition: {
        question: 'Evacuate the concourse?',
        options: ['Yes', 'No'],
        durationSec: 120,
        rationalePrompt: 'Why? (optional, anonymous)',
        liveResults: true,
      },
    })
  })

  it('keeps Open vote off until there are two options, and while a vote is open', async () => {
    mount([voteView()])
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Question'), 'Q?')
    await user.type(screen.getByLabelText(/Options, one per line/), 'Only one')
    const open = screen.getByRole('button', { name: 'Open vote' })
    expect(open.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('A vote is open. Close it to open another.')).toBeTruthy()
  })

  it('warns before a by-role vote when a role has too few devices', async () => {
    mount([])
    const user = userEvent.setup()
    await user.click(await screen.findByLabelText(/By role/))
    const warning = await screen.findByText(/appear as Other: PIO \(2 devices\)/)
    expect(warning.getAttribute('role')).toBe('status')
  })

  it('shows the tally, closes the open vote after confirming, and shows it on the screen', async () => {
    const confirm = vi.fn(() => true)
    window.confirm = confirm
    const { ttx } = mount([voteView({ rowId: 'I-14' })], {
      'live:vote-close': () => voteView({ status: 'closed' }),
      'live:vote-present': () => undefined,
    })
    const user = userEvent.setup()
    const card = await screen.findByRole('article', { name: /Vote: Shut down FIDS/ })
    expect(within(card).getByText(/open · 12 of 14 voted/)).toBeTruthy()
    expect(within(card).getByText('58 %')).toBeTruthy()
    await user.click(within(card).getByRole('button', { name: 'Show on screen' }))
    await waitFor(() => expect(ttx.calls('live:vote-present')).toHaveLength(1))
    await user.click(within(card).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(ttx.calls('live:vote-close')).toHaveLength(1))
    expect(confirm).toHaveBeenCalled()
  })

  it('records a closed vote as a decision in the facilitator log', async () => {
    const decision = {
      id: 'dec-1',
      at: '2026-10-28T10:05:00.000Z',
      exerciseTime: '2:14',
      rowId: 'I-14',
      text: 'Shut down now (7 of 12), vote at 2:14',
    }
    const { update } = mount([voteView({ status: 'closed', rowId: 'I-14', closedClock: '2:14' })], {
      'live:vote-record': () => decision,
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Record as decision on I-14' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const next = update.mock.calls[0]![0]({ decisions: [] })
    expect(next.decisions).toEqual([decision])
  })

  it('offers Reopen only while the window is open and lists reasons by option', async () => {
    mount([
      voteView({
        status: 'closed',
        canReopen: true,
        rationales: [{ optionId: 'o1', text: 'Safer for passengers' }],
      }),
    ])
    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeTruthy()
    const reasons = screen.getByText('Reasons given')
    fireEvent.click(reasons)
    expect(screen.getByText('Safer for passengers')).toBeTruthy()
  })
})
