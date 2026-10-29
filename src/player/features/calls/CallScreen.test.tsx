// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebCryptoProvider } from '../../../shared/live/crypto/webcrypto'
import { MemoryKeyValue } from '../../../shared/live/transport'
import { DEFAULT_PREFS } from '../../app/prefs'
import { PlayerSession } from '../../app/session'
import { CallBanner, CallScreen } from './CallScreen'
import type { PlayerCall } from './calls'

const ID = 'CCCCCCCCCCCCCCCCCCCCCC'

const call = (over: Partial<PlayerCall> = {}): PlayerCall => ({
  callId: ID,
  turn: 1,
  persona: { name: 'Dana Whitlock', organization: 'Harbor Ledger' },
  transcript: 'Hello, Harbor Ledger here. Where is your statement?',
  canSpeak: false,
  targets: ['role:ops'],
  status: 'ringing',
  history: [{ who: 'them', text: 'Hello, Harbor Ledger here. Where is your statement?', turn: 1 }],
  openedAt: 1,
  ...over,
})

function setup(c: PlayerCall) {
  const announced: string[] = []
  const session = new PlayerSession({
    url: 'http://127.0.0.1/s/session-00000000000000#x',
    crypto: createWebCryptoProvider(),
    storage: new MemoryKeyValue(),
    connect: () => {
      throw new Error('not in this test')
    },
    announcer: { announce: (m: string) => void announced.push(m) },
    prefs: () => DEFAULT_PREFS,
    bundleVersion: 'test',
  })
  const enqueue = vi.fn(async () => undefined)
  Object.assign(session, { outbox: { enqueue } })
  session.store.set({
    phase: 'seated',
    connection: 'connected',
    clientId: 'playerA-00000000000000',
    seat: {
      kind: 'player',
      role: { id: 'ops', name: 'Operations', abbreviation: '', teamId: 'ops' },
    },
    calls: { [ID]: c },
  })
  return { session, enqueue, announced }
}

afterEach(() => cleanup())

describe('CallScreen', () => {
  it('shows who is calling and what they said as text', () => {
    const { session } = setup(call())
    render(<CallScreen session={session} callId={ID} onClose={() => {}} />)
    expect(
      screen.getByRole('heading', { level: 1, name: /Phone call: Dana Whitlock, Harbor Ledger/ }),
    ).toBeTruthy()
    expect(screen.getByText(/Where is your statement\?/)).toBeTruthy()
  })

  it('sends a typed answer for the open turn and then waits, saying it is not live', async () => {
    const { session, enqueue } = setup(call({ expectedWaitSec: 20 }))
    const user = userEvent.setup()
    render(<CallScreen session={session} callId={ID} onClose={() => {}} />)
    await user.type(screen.getByLabelText('Your answer'), 'Ops here. Statement at two.')
    await user.click(screen.getByRole('button', { name: 'Send answer' }))
    expect(enqueue).toHaveBeenCalledWith({
      id: `call:${ID}:1`,
      type: 'call.answer',
      to: 'controller',
      payload: { callId: ID, turn: 1, text: 'Ops here. Statement at two.' },
    })
    expect(session.state.calls[ID]!.status).toBe('answered')
    expect(await screen.findByText(/not a live conversation/)).toBeTruthy()
  })

  it('hides the talk button when the facilitator cannot transcribe speech', () => {
    const { session } = setup(call({ canSpeak: false }))
    render(<CallScreen session={session} callId={ID} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: /Tap to talk/ })).toBeNull()
  })

  it('hangs up with a player-side end', async () => {
    const { session, enqueue } = setup(call())
    const user = userEvent.setup()
    render(<CallScreen session={session} callId={ID} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Hang up' }))
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'call.end',
        payload: { callId: ID, turn: 1, reason: 'hangup', by: 'player' },
      }),
    )
    expect(await screen.findByText('You hung up.')).toBeTruthy()
  })

  it('offers the banner button for an open call and none once it ended', () => {
    const { session } = setup(call())
    const onOpen = vi.fn()
    const { rerender } = render(<CallBanner session={session} onOpen={onOpen} />)
    expect(screen.getByRole('button', { name: 'Incoming call from Dana Whitlock' })).toBeTruthy()
    session.store.set({ calls: { [ID]: call({ status: 'ended' }) } })
    rerender(<CallBanner session={session} onOpen={onOpen} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
