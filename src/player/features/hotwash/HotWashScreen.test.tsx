// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebCryptoProvider } from '../../../shared/live/crypto/webcrypto'
import { MemoryKeyValue } from '../../../shared/live/transport'
import { DEFAULT_PREFS } from '../../app/prefs'
import { PlayerSession } from '../../app/session'
import { EMPTY_HOTWASH, addOwn, applyUpdate, setOpen, type HotwashState } from './hotwash'
import { HotWashScreen } from './HotWashScreen'

afterEach(cleanup)

const id = (n: number) => String(n).padStart(22, 'A')

function setup(
  opts: { open?: boolean; attribution?: 'role' | 'named'; board?: HotwashState } = {},
) {
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
  const postHotwash = vi.fn(async () => undefined)
  const plusHotwash = vi.fn(async () => undefined)
  const withdrawHotwash = vi.fn(async () => undefined)
  Object.assign(session, { postHotwash, plusHotwash, withdrawHotwash })
  session.store.set({
    phase: 'seated',
    connection: 'connected',
    clientId: 'playerA-00000000000000',
    seat: { kind: 'player', role: { id: 'ops', name: 'Ops Director' } },
    info: {
      sessionName: 's',
      scenarioTitle: 't',
      attribution: opts.attribution ?? 'role',
      seats: [
        { id: 'ops', name: 'Ops Director', taken: 1, kind: 'player' },
        { id: 'pio', name: 'PIO', taken: 1, kind: 'player' },
      ],
      features: { messages: true, votes: false, hotwash: true, surveys: false, eval: false },
      hotwash: {
        method: '3up3down',
        questions: [{ id: 'hwq-1', topic: 'Coordination', text: 'What slowed Ops and IT?' }],
      },
    },
    hotwash: setOpen(opts.board ?? EMPTY_HOTWASH, opts.open ?? true),
  } as never)
  render(<HotWashScreen session={session} onBack={() => {}} />)
  return { session, postHotwash, plusHotwash, withdrawHotwash }
}

const board = (): HotwashState => {
  let s = applyUpdate(EMPTY_HOTWASH, {
    itemId: id(1),
    action: 'accept',
    text: 'Two incident numbers',
    kind: 'improvement',
    roleId: 'pio',
  })
  s = applyUpdate(s, { itemId: id(1), action: 'tag', plus: 6 })
  s = applyUpdate(s, {
    itemId: id(2),
    action: 'accept',
    text: 'No FBI number',
    kind: 'improvement',
  })
  return s
}

describe('HotWashScreen', () => {
  it('tells the player the hot wash has not opened yet and offers no composer', () => {
    setup({ open: false })
    expect(screen.getByText('The facilitator has not opened the hot wash yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Post' })).toBeNull()
  })

  it('shows the questions and the composer when open', () => {
    setup()
    expect(screen.getByText('What slowed Ops and IT?')).toBeTruthy()
    expect(screen.getByLabelText('Your item')).toBeTruthy()
    expect(screen.getByLabelText('Post without my role')).toBeTruthy()
    expect(screen.getByText(/Your role \(Ops Director\) is shown with your post/)).toBeTruthy()
  })

  it('says exactly what is shown in a named session', () => {
    setup({ attribution: 'named' })
    expect(screen.getByLabelText('Post anonymously')).toBeTruthy()
    expect(screen.getByText(/The facilitator also sees your name/)).toBeTruthy()
  })

  it('posts a strength with the role and clears the field', async () => {
    const { postHotwash } = setup()
    fireEvent.change(screen.getByLabelText('Your item'), { target: { value: 'Clear PA script' } })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() =>
      expect(postHotwash).toHaveBeenCalledWith({
        kind: 'strength',
        text: 'Clear PA script',
        anonymous: false,
      }),
    )
    expect((screen.getByLabelText('Your item') as HTMLTextAreaElement).value).toBe('')
  })

  it('posts anonymously as an answer to a question', async () => {
    const { postHotwash } = setup()
    fireEvent.click(screen.getByLabelText('Answer to a question'))
    fireEvent.click(screen.getByLabelText('Post without my role'))
    expect(screen.getByText('Your post is shown as anonymous.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Your item'), {
      target: { value: 'Ops called IT late' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() =>
      expect(postHotwash).toHaveBeenCalledWith({
        kind: 'other',
        text: 'Ops called IT late',
        anonymous: true,
        questionId: 'hwq-1',
      }),
    )
  })

  it('does not post an empty item', () => {
    setup()
    expect((screen.getByRole('button', { name: 'Post' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('lists the board most-agreed first, with roles and anonymous marks', () => {
    setup({ board: board() })
    const list = screen.getByRole('heading', { name: 'Board · 2 items' }).parentElement!
    const rows = within(list).getAllByRole('listitem')
    expect(rows[0]!.textContent).toContain('Two incident numbers')
    expect(rows[0]!.textContent).toContain('PIO')
    expect(rows[1]!.textContent).toContain('anonymous')
  })

  it('sends a +1 once', async () => {
    const { plusHotwash } = setup({ board: board() })
    fireEvent.click(screen.getByRole('button', { name: 'Agree, 6 so far' }))
    expect(plusHotwash).toHaveBeenCalledWith(id(1))
  })

  it('shows own item as waiting and offers to withdraw it', () => {
    const own = addOwn(
      EMPTY_HOTWASH,
      { itemId: id(3), kind: 'strength', text: 'Mine', anonymous: false, roleId: 'ops' },
      Date.now(),
    )
    const { withdrawHotwash } = setup({ board: own })
    expect(screen.getByText('Waiting for the facilitator to show it')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    expect(withdrawHotwash).toHaveBeenCalledWith(id(3))
  })

  it('marks promoted items and groups', () => {
    let s = board()
    s = applyUpdate(s, { itemId: id(1), action: 'group', groupId: id(8), groupLabel: 'Numbering' })
    s = applyUpdate(s, { itemId: id(2), action: 'group', groupId: id(8) })
    s = applyUpdate(s, { itemId: id(1), action: 'promote' })
    setup({ board: s })
    expect(screen.getByText(/Numbering \(2 items\)/)).toBeTruthy()
    expect(screen.getAllByText(/Promoted to the report/).length).toBeGreaterThan(0)
  })

  it('keeps the board readable but read-only after the hot wash closes', () => {
    setup({ open: false, board: board() })
    expect(screen.getByText('The hot wash is closed. You can read the board.')).toBeTruthy()
    expect(screen.queryByLabelText('Your item')).toBeNull()
  })
})
