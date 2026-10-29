// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebCryptoProvider } from '../../shared/live/crypto/webcrypto'
import { MemoryKeyValue } from '../../shared/live/transport'
import { PlayerSession, type PlayerState } from '../app/session'
import { DEFAULT_SEATS } from '../harness/controller'
import { JoinScreen, seatForHint } from './JoinScreen'

/** A session that never connects: the screen reads and writes its store directly. */
function sessionWith(state: Partial<PlayerState>): PlayerSession {
  const session = new PlayerSession({
    url: 'http://127.0.0.1/s/session-00000000000000#x',
    crypto: createWebCryptoProvider(),
    storage: new MemoryKeyValue(),
    connect: () => {
      throw new Error('not in this test')
    },
    announcer: { announce: () => {} },
    prefs: () => ({ theme: 'system', sound: false, vibration: true, textSize: 'normal' }),
    bundleVersion: '0.6.0-test',
  })
  session.store.set({
    phase: 'lobby',
    connection: 'connected',
    clientId: 'playerA-00000000000000',
    sessionId: 'session-00000000000000',
    linkKind: 'players',
    info: {
      sessionName: 'Spring rehearsal',
      scenarioTitle: 'Flight to Nowhere',
      attribution: 'role',
      features: { messages: true, votes: true, hotwash: true, surveys: true, eval: true },
      seats: DEFAULT_SEATS.map((s) => ({ ...s, taken: s.id === 'ops-director' ? 1 : 0 })),
    },
    ...state,
  })
  return session
}

const radio = (name: RegExp) => screen.getByRole('radio', { name }) as HTMLInputElement
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

afterEach(cleanup)

describe('JoinScreen', () => {
  it('lists the seats with team and capacity, disables full ones and staff seats on a players link', () => {
    render(<JoinScreen session={sessionWith({})} bundleVersion="0.6.0-test" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Flight to Nowhere')
    expect(screen.getByRole('group', { name: 'Pick your seat' })).toBeTruthy()
    expect(radio(/Operations Director/).disabled).toBe(true)
    expect(screen.getByText('1 of 1 seats taken · Full')).toBeTruthy()
    expect(radio(/Public Information Officer/).disabled).toBe(false)
    expect(screen.getByText('0 of 2 seats taken')).toBeTruthy()
    expect(radio(/Evaluator/).disabled).toBe(true)
    expect(screen.getByText('Needs the staff link')).toBeTruthy()
    expect(radio(/Observer/).disabled).toBe(false)
    expect(screen.getByText(/non-attributional/)).toBeTruthy()
    expect(screen.getByText('Page 0.6.0-test · protocol 1')).toBeTruthy()
  })

  it('joins with the chosen seat and name; the button stays off until a seat is picked', async () => {
    const session = sessionWith({})
    const choose = vi.spyOn(session, 'chooseSeat').mockResolvedValue()
    const user = userEvent.setup()
    render(<JoinScreen session={session} bundleVersion="t" />)
    expect(button('Join exercise').disabled).toBe(true)
    await user.click(radio(/IT Director/))
    await user.type(screen.getByLabelText('Display name (optional)'), 'Dana')
    expect(button('Join exercise').disabled).toBe(false)
    await user.click(button('Join exercise'))
    expect(choose).toHaveBeenCalledWith('it-director', 'Dana')
  })

  it('says names are recorded at the named attribution level', () => {
    const session = sessionWith({})
    session.store.set((s) => ({ info: { ...s.info!, attribution: 'named' } }))
    render(<JoinScreen session={session} bundleVersion="t" />)
    expect(screen.getByText('Names are recorded in this exercise.')).toBeTruthy()
  })

  it('shows a rejection as an alert and lets the player pick again', () => {
    render(<JoinScreen session={sessionWith({ joinError: 'full' })} bundleVersion="t" />)
    expect(screen.getByRole('alert').textContent).toBe('That seat is full. Pick another one.')
    expect(radio(/IT Director/).disabled).toBe(false)
  })

  it('a role hint preselects its seat; evaluator and observer hints pick by kind', () => {
    const seats = DEFAULT_SEATS.map((s) => ({ ...s, taken: 0 }))
    expect(seatForHint(seats, 'pio')?.id).toBe('pio')
    expect(seatForHint(seats, 'evaluator')?.id).toBe('evaluators')
    expect(seatForHint(seats, 'observer')?.id).toBe('observers')
    expect(seatForHint(seats, 'nope')).toBeUndefined()
    render(<JoinScreen session={sessionWith({ roleHint: 'pio' })} bundleVersion="t" />)
    expect(radio(/Public Information Officer/).checked).toBe(true)
    expect(button('Join exercise').disabled).toBe(false)
  })

  it('waits for the facilitator when no welcome has arrived yet', () => {
    render(<JoinScreen session={sessionWith({ info: undefined })} bundleVersion="t" />)
    expect(screen.getByText(/Waiting for the facilitator/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Join exercise' })).toBeNull()
  })

  it('the join button waits while the connection is down', () => {
    render(<JoinScreen session={sessionWith({ connection: 'reconnecting' })} bundleVersion="t" />)
    expect(button('Join exercise').disabled).toBe(true)
    expect(screen.getByText(/Reconnecting/)).toBeTruthy()
  })
})
