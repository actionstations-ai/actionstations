// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebCryptoProvider } from '../../../shared/live/crypto/webcrypto'
import type { BlobRef } from '../../../shared/live/schemas'
import { MemoryKeyValue } from '../../../shared/live/transport'
import type { Item } from '../../app/items'
import { DEFAULT_PREFS } from '../../app/prefs'
import { PlayerSession } from '../../app/session'
import { InjectDetail } from './InjectDetail'
import { MediaCache } from './media'

const RELEASE = 'AAAAAAAAAAAAAAAAAAAAAA'
const ref = (name: string, kind: BlobRef['kind'], id: string): BlobRef => ({
  blobId: id.padEnd(22, 'x'),
  kind,
  mime: kind === 'image' ? 'image/png' : kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
  bytes: 10,
  sha256: 'a'.repeat(64),
  k: 's1',
  n: 'AAAAAAAAAAAAAAAA',
  name,
})

function item(over: Partial<NonNullable<Item['inject']>> = {}, top: Partial<Item> = {}): Item {
  return {
    key: `inject:${RELEASE}`,
    kind: 'inject',
    type: 'inject.release',
    from: 'controller-00000000000',
    to: 'role:ops-director',
    seq: 1,
    ts: 1,
    atMin: 75,
    exerciseTime: '1:15',
    title: 'FIDS board',
    altText: 'FIDS board — Departures screen',
    sender: 'Gate agent',
    inject: {
      releaseId: RELEASE,
      injectType: 'FIDS board',
      text: 'Board: Departures\nRow 1: DL 1189 Miami B4',
      media: [ref('device', 'image', 'dev'), ref('original', 'image', 'orig')],
      expectsResponse: true,
      targets: ['role:ops-director'],
      ...over,
    },
    ...top,
  }
}

function setup(it: Item, seat: 'player' | 'evaluator' = 'player') {
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
  const revoked: string[] = []
  const media = new MediaCache({
    fetchBlob: async () => new Uint8Array([1]),
    createUrl: (_d, mime) => `blob:${mime}`,
    revokeUrl: (u) => void revoked.push(u),
  })
  const sendReceipt = vi.fn(async () => undefined)
  Object.assign(session, { media, sendReceipt })
  session.store.set({
    phase: 'seated',
    clientId: 'playerA-00000000000000',
    seat:
      seat === 'player'
        ? {
            kind: 'player',
            role: { id: 'ops-director', name: 'Ops', abbreviation: '', teamId: 'ops' },
          }
        : { kind: 'evaluator' },
  })
  const onBack = vi.fn()
  const view = render(
    <InjectDetail session={session} item={it} onBack={onBack} backLabel="Inbox" />,
  )
  return { session, sendReceipt, revoked, onBack, ...view }
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('InjectDetail', () => {
  it('shows the artifact with alt text and ties it to the collapsed text version', async () => {
    setup(item())
    const img = await screen.findByRole('img', { name: 'FIDS board — Departures screen' })
    expect(img.getAttribute('src')).toBe('blob:image/png')
    const text = document.getElementById(img.getAttribute('aria-describedby')!)!
    expect(text.textContent).toBe('Board: Departures\nRow 1: DL 1189 Miami B4')
    expect(text.closest('details')!.open).toBe(false)
    expect(screen.getByText('From:')).toBeTruthy()
  })

  it('sends a read receipt once the detail has been visible for a second, and not before', async () => {
    const { sendReceipt, session } = setup(item())
    await act(() => vi.advanceTimersByTimeAsync(900))
    expect(sendReceipt).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(sendReceipt).toHaveBeenCalledWith(RELEASE, 'read')
    expect(session.store.get().read.has(`inject:${RELEASE}`)).toBe(true)
  })

  it('sends no read receipt if the player leaves before a second', async () => {
    const { sendReceipt, unmount } = setup(item())
    await act(() => vi.advanceTimersByTimeAsync(500))
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(1_500))
    expect(sendReceipt).not.toHaveBeenCalled()
  })

  it('offers Mark as actioned only when a response is expected, and sends the receipt', async () => {
    const { sendReceipt } = setup(item())
    fireEvent.click(screen.getByRole('button', { name: 'Mark as actioned' }))
    expect(sendReceipt).toHaveBeenCalledWith(RELEASE, 'actioned')
    cleanup()
    setup(item({ expectsResponse: false }))
    expect(screen.queryByRole('button', { name: 'Mark as actioned' })).toBeNull()
  })

  it('tells an evaluator the item is not addressed to them and sends no receipts', async () => {
    const { sendReceipt } = setup(
      item({ targets: ['role:pio'] }, { to: 'role:evaluators' }),
      'evaluator',
    )
    expect(screen.getByText(/Not addressed to you/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark as actioned' })).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(1_500))
    expect(sendReceipt).not.toHaveBeenCalled()
  })

  it('opens the original in a dialog that traps focus, closes on Escape and restores focus', async () => {
    setup(item())
    const open = screen.getByRole('button', { name: 'Open full size' })
    open.focus()
    fireEvent.click(open)
    const dialog = await screen.findByRole('dialog', { name: 'Full-size image' })
    const close = screen.getByRole('button', { name: 'Close' })
    await waitFor(() => expect(document.activeElement).toBe(close))
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(open)
  })

  it('revokes its blob URLs when the detail closes', async () => {
    const { revoked, unmount } = setup(item())
    await screen.findByRole('img')
    unmount()
    await waitFor(() => expect(revoked).toContain('blob:image/png'))
  })

  it('lists the transcript for an audio inject and does not autoplay', async () => {
    setup(
      item({
        media: [ref('audio', 'audio', 'au')],
        captionsVtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nTower: Ground, hold position.',
      }),
    )
    expect(await screen.findByText('Tower: Ground, hold position.')).toBeTruthy()
    const audio = document.querySelector('audio')!
    expect(audio.hasAttribute('autoplay')).toBe(false)
    expect(audio.hasAttribute('controls')).toBe(true)
  })

  it('shows a withdrawn inject as withdrawn, without its media', () => {
    setup(item({}, { withdrawn: true }))
    expect(screen.getByText('Withdrawn by the facilitator')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('says so when a file cannot be loaded and offers a retry', async () => {
    const { session } = setup(item())
    cleanup()
    Object.assign(session, {
      media: new MediaCache({ fetchBlob: async () => Promise.reject(new Error('gone')) }),
    })
    render(<InjectDetail session={session} item={item()} onBack={() => {}} backLabel="Inbox" />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
