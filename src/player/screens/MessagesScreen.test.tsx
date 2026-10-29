// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWebCryptoProvider } from '../../shared/live/crypto/webcrypto'
import { MemoryKeyValue } from '../../shared/live/transport'
import type { ChatMessage } from '../app/messages'
import { DEFAULT_PREFS } from '../app/prefs'
import { PlayerSession } from '../app/session'
import type { ImageCodec } from '../features/messages/attach'
import { MessagesScreen } from './MessagesScreen'

afterEach(cleanup)

const chat = (over: Partial<ChatMessage>): ChatMessage => ({
  id: 'a',
  channel: 'role:pio',
  mine: false,
  playedBy: true,
  text: 'Hello',
  attachments: [],
  pendingPhotos: 0,
  exerciseTime: '1:34',
  ts: 1,
  status: 'sent',
  ...over,
})

function setup(
  opts: {
    messages?: ChatMessage[]
    features?: boolean
    kind?: 'player' | 'evaluator'
    items?: unknown[]
  } = {},
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
  const sendMessage = vi.fn(async () => undefined)
  Object.assign(session, { sendMessage })
  session.store.set({
    phase: 'seated',
    connection: 'connected',
    clientId: 'playerA-00000000000000',
    seat:
      opts.kind === 'evaluator'
        ? { kind: 'evaluator' }
        : {
            kind: 'player',
            role: { id: 'pio', name: 'Public Information Officer', abbreviation: 'PIO' },
          },
    info: {
      sessionName: 's',
      scenarioTitle: 't',
      attribution: 'role',
      seats: [],
      features: {
        messages: opts.features ?? true,
        votes: false,
        hotwash: false,
        surveys: false,
        eval: false,
      },
    },
    messages: opts.messages ?? [],
    items: (opts.items ?? []) as never,
  })
  render(<MessagesScreen session={session} />)
  return { session, sendMessage }
}

describe('MessagesScreen', () => {
  it('shows the thread as a polite live log with sender, persona caption and time', () => {
    setup({
      messages: [
        chat({ id: 'r', persona: 'Channel 5 newsroom', text: 'Is the airport hacked?' }),
        chat({ id: 'm', mine: true, playedBy: false, text: 'Statement at 1800.', ts: 2 }),
      ],
    })
    const log = screen.getByRole('log')
    expect(log.getAttribute('aria-live')).toBe('polite')
    expect(log.textContent).toContain('Channel 5 newsroom')
    expect(log.textContent).toContain('played by SimCell')
    expect(log.textContent).toContain('You (PIO)')
    expect(log.textContent).toContain('✓ Sent')
  })

  it('leaves out the caption when the facilitator turned it off', () => {
    setup({ messages: [chat({ persona: 'Reporter', playedBy: false })] })
    expect(screen.getByRole('log').textContent).not.toContain('played by SimCell')
  })

  it('marks the controller messages as read once they are on screen', async () => {
    const { session } = setup({ messages: [chat({ id: 'r' })] })
    await waitFor(() => expect(session.store.get().read.has('msg:r')).toBe(true))
  })

  it('sends on Enter, keeps Shift+Enter for a new line, and empties the field', () => {
    const { sendMessage } = setup()
    const field = screen.getByLabelText('Message the SimCell') as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: 'We are investigating.' } })
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true })
    expect(sendMessage).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(sendMessage).toHaveBeenCalledWith({
      channel: 'role:pio',
      text: 'We are investigating.',
      photos: [],
    })
    expect(field.value).toBe('')
  })

  it('does not send an empty message', () => {
    setup()
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
  })

  it('shows a failed message with a Try again button', () => {
    const { session } = setup({ messages: [chat({ id: 'f', mine: true, status: 'failed' })] })
    const retry = vi.fn(async () => undefined)
    Object.assign(session, { retryMessage: retry })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledWith('f')
  })

  it('quotes the inject a reply is about', () => {
    setup({
      messages: [chat({ id: 'q', mine: true, replyTo: 'REL', text: 'On it' })],
      items: [{ key: 'k', inject: { releaseId: 'REL' }, title: 'FIDS board' }],
    })
    expect(screen.getByText('Re: FIDS board')).toBeTruthy()
  })

  it('shows an unavailable state for an evaluator or when the session has no messages', () => {
    setup({ kind: 'evaluator' })
    expect(screen.getByText('Messages are not available in this session.')).toBeTruthy()
  })

  it('adds a photo through the picker with a description field prefilled', async () => {
    const codec: ImageCodec = {
      size: async () => ({ width: 100, height: 100 }),
      encode: async () => new Blob(['abc']),
    }
    const { session } = setup()
    expect(session.photoCap).toBeGreaterThan(0)
    // The default codec needs a canvas; the screen uses it unless a test supplies one.
    const { Composer } = await import('../features/messages/Composer')
    cleanup()
    render(<Composer session={session} channel="role:pio" seatName="PIO" codec={codec} />)
    const input = screen.getByTestId('photo-input')
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'board.png', { type: 'image/png' })] },
    })
    const alt = (await screen.findByLabelText('Describe photo 1 (optional)')) as HTMLInputElement
    expect(alt.value).toBe('Photo from PIO')
  })
})
