// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { createWebCryptoProvider } from '../../shared/live/crypto/webcrypto'
import { MemoryKeyValue } from '../../shared/live/transport'
import type { Item } from '../app/items'
import { DEFAULT_PREFS, type Prefs } from '../app/prefs'
import { PlayerSession, type PlayerState } from '../app/session'
import { Store } from '../app/store'
import { RoomShell } from './RoomShell'

const ME = 'playerA-00000000000000'

const item = (over: Partial<Item> & { key: string; title: string }): Item => ({
  kind: 'inject',
  type: 'inject.release',
  from: 'controller-00000000000',
  to: 'role:ops-director',
  seq: 1,
  ts: 1,
  atMin: 45,
  exerciseTime: '0:45',
  body: 'Body text',
  ...over,
})

function seated(state: Partial<PlayerState> = {}) {
  const session = new PlayerSession({
    url: 'http://127.0.0.1/s/session-00000000000000#x',
    crypto: createWebCryptoProvider(),
    storage: new MemoryKeyValue(),
    connect: () => {
      throw new Error('not in this test')
    },
    announcer: { announce: () => {} },
    prefs: () => DEFAULT_PREFS,
    bundleVersion: '0.6.0-test',
  })
  session.store.set({
    phase: 'seated',
    connection: 'connected',
    clientId: ME,
    sessionId: 'session-00000000000000',
    info: {
      sessionName: 'Spring rehearsal',
      scenarioTitle: 'Flight to Nowhere',
      attribution: 'role',
      features: { messages: true, votes: true, hotwash: false, surveys: true, eval: true },
      seats: [],
    },
    seat: {
      kind: 'player',
      role: { id: 'ops-director', name: 'Operations Director', abbreviation: 'OPS', teamId: 'ops' },
    },
    clock: { elapsedMin: 75, rate: 1 },
    items: [
      item({ key: 'c:1', title: 'FIDS boards dark', seq: 1 }),
      item({ key: 'c:2', title: 'Press call', to: 'role:pio', seq: 2 }),
      item({
        key: 'c:3',
        title: 'Warning',
        kind: 'notice',
        type: 'controller.notice',
        to: 'all',
        level: 'warning',
        dismissible: true,
        seq: 3,
        atMin: 50,
        exerciseTime: '0:50',
      }),
      item({
        key: 'c:4',
        title: 'Time jump to 2:00',
        kind: 'clock',
        type: 'clock.state',
        to: 'all',
        seq: 4,
        atMin: 120,
        exerciseTime: '2:00',
        body: undefined,
      }),
    ],
    ...state,
  })
  const prefsStore = new Store<Prefs>(DEFAULT_PREFS)
  render(<RoomShell session={session} prefsStore={prefsStore} bundleVersion="0.6.0-test" />)
  return { session, prefsStore }
}

/** The text of the elements an `aria-describedby` points to. */
function describedBy(el: HTMLElement): string {
  return (el.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

const headings = (root: HTMLElement) =>
  within(root)
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent?.replace(/\s*\(Unread\)$/, ''))

afterEach(cleanup)

describe('RoomShell', () => {
  it('shows the clock, title, seat and connection in the header', () => {
    seated()
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Exercise clock 1:15, paused')
    expect(screen.getByText('Flight to Nowhere')).toBeTruthy()
    expect(screen.getByText('Operations Director (OPS)')).toBeTruthy()
    expect(screen.getByText('Connected')).toBeTruthy()
  })

  it('the inbox holds only my role items, unread with a count; the feed holds the room', async () => {
    const { session } = seated()
    const user = userEvent.setup()
    const inbox = screen.getByRole('list', { name: 'Inbox' })
    expect(within(inbox).getAllByRole('article')).toHaveLength(1)
    expect(headings(inbox)).toEqual(['FIDS boards dark'])
    expect(screen.getByText('1 new', { selector: '.pill' })).toBeTruthy()
    await user.click(within(inbox).getByRole('button', { name: 'Mark as read' }))
    expect(session.state.read.has('c:1')).toBe(true)
    expect(screen.queryByText('1 new')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Feed' }))
    const feed = screen.getByRole('list', { name: 'Feed' })
    // Store order (the session sorts on insert; see items.test.ts).
    expect(headings(feed)).toEqual(['Warning', 'Time jump to 2:00'])
    await user.click(within(feed).getByRole('button', { name: 'Dismiss' }))
    expect(headings(feed)).toEqual(['Time jump to 2:00'])
  })

  it('Messages opens the SimCell conversation; More explains every disabled entry', async () => {
    seated()
    const user = userEvent.setup()
    const messages = screen.getByRole('button', { name: /Messages/ })
    expect(messages.getAttribute('aria-disabled')).toBeNull()
    await user.click(messages)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('SimCell')
    expect(screen.getByRole('log')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('More')
    expect(describedBy(screen.getByRole('button', { name: /Hot wash/ }))).toBe(
      'Not used in this exercise.',
    )
    expect(describedBy(screen.getByRole('button', { name: /^Votes/ }))).toBe('')
    expect(describedBy(screen.getByRole('button', { name: /Surveys/ }))).toBe(
      'Comes with a later update.',
    )
    expect(describedBy(screen.getByRole('button', { name: /Evaluate/ }))).toBe('For evaluators.')
  })

  it('Settings persists theme, text size and the cue switches; About says what is recorded', async () => {
    const { prefsStore } = seated()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: /Settings/ }))
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(prefsStore.get().theme).toBe('dark')
    await user.click(screen.getByRole('radio', { name: 'Large' }))
    expect(prefsStore.get().textSize).toBe('large')
    const sound = screen.getByRole('switch', { name: 'Sound on new inbox item' })
    expect(sound.getAttribute('aria-checked')).toBe('false')
    await user.click(sound)
    expect(prefsStore.get().sound).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: /About/ }))
    expect(screen.getByText('0.6.0-test')).toBeTruthy()
    expect(screen.getByText(/Your display name is not recorded/)).toBeTruthy()
    expect(screen.getByText(ME)).toBeTruthy()
  })

  it('shows the reconnecting and offline banners and the catch-up line', () => {
    const { session } = seated({ connection: 'reconnecting' })
    expect(screen.getByText('Connection lost. Reconnecting…')).toBeTruthy()
    expect(screen.getByText('Reconnecting…')).toBeTruthy()
    act(() => session.store.set({ connection: 'offline' }))
    expect(screen.getByText(/You are offline/)).toBeTruthy()
    act(() => session.store.set({ connection: 'connected', catchingUp: true }))
    expect(screen.getByText('Catching up on what you missed…')).toBeTruthy()
    // The first two seconds after a drop still read as connected (FR-7).
    act(() => session.store.set({ connection: 'dropped', catchingUp: false }))
    expect(screen.getByText('Connected')).toBeTruthy()
  })

  it('shows empty states when nothing has arrived', () => {
    seated({ items: [] })
    expect(screen.getByText('Nothing for your seat yet.')).toBeTruthy()
  })
})
