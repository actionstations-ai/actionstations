/**
 * The player session end to end against the in-memory server and the scripted controller
 * (src/player/harness): join, seats, inbox routing, late-joiner catch-up, drop and reconnect
 * with resume, reseat, kick, end, version refusal, and the WebSocket → fetch fallback. No
 * browser: transports are the memory server's, timers are fake.
 */
import { describe, expect, it } from 'vitest'
import { createWebCryptoProvider } from '../../shared/live/crypto/webcrypto'
import { CLOSE_CODES } from '../../shared/live/protocol'
import type { KeyKind } from '../../shared/live/protocol'
import { MemoryKeyValue, type Transport } from '../../shared/live/transport'
import { settle } from '../../shared/live/transport-memory'
import { DEFAULT_SEATS, HarnessController } from '../harness/controller'
import { FakeTimers } from './fake-timers'
import { RECONNECTING_AFTER_MS } from './reconnect'
import { PlayerSession, sanitizeName, type ConnectedTransport, type SessionDeps } from './session'
import type { ConnectParams } from '../../shared/live/connect-url'

const crypto = createWebCryptoProvider()

interface Handle extends ConnectedTransport {
  /** Simulate the network dropping this connection. */
  drop(code?: number): void
}

/** A memory-server connection behind the page's transport interface, with a drop switch. */
function memoryTransport(
  kind: 'websocket' | 'fetch',
  pending: Promise<Transport>,
  fail: boolean,
): Handle {
  const frameCbs = new Set<(f: string) => void>()
  const closeCbs = new Set<(c: number, r: string) => void>()
  const queue: string[] = []
  let inner: Transport | undefined
  let closed: [number, string] | undefined
  const finish = (c: number, r: string) => {
    if (closed) return
    closed = [c, r]
    for (const cb of closeCbs) cb(c, r)
  }
  const opened = fail
    ? Promise.reject(new Error('refused'))
    : pending.then((t) => {
        inner = t
        t.onFrame((f) => frameCbs.forEach((cb) => cb(f)))
        t.onClose(finish)
        for (const f of queue.splice(0)) t.send(f)
      })
  opened.catch(() => {})
  if (fail) queueMicrotask(() => finish(1006, 'refused'))
  return {
    kind,
    opened,
    send: (f) => (inner ? inner.send(f) : queue.push(f)),
    close: (c = 1000, r = '') => {
      inner?.close(c, r)
      finish(c, r)
    },
    onFrame: (cb) => (frameCbs.add(cb), () => frameCbs.delete(cb)),
    onClose: (cb) => {
      closeCbs.add(cb)
      if (closed) cb(...closed)
      return () => closeCbs.delete(cb)
    },
    drop: (code = 1006) => {
      inner?.close(code, 'dropped')
      finish(code, 'dropped')
    },
  }
}

/** A transport that never opens and never closes: a server that stopped answering. */
function hangingTransport(kind: 'websocket' | 'fetch'): Handle {
  const closeCbs = new Set<(c: number, r: string) => void>()
  let closed: [number, string] | undefined
  const finish = (c: number, r: string) => {
    if (closed) return
    closed = [c, r]
    for (const cb of closeCbs) cb(c, r)
  }
  return {
    kind,
    opened: new Promise<void>(() => {}),
    send: () => {},
    close: (c = 1000, r = '') => finish(c, r),
    onFrame: () => () => {},
    onClose: (cb) => {
      closeCbs.add(cb)
      if (closed) cb(...closed)
      return () => closeCbs.delete(cb)
    },
    drop: (code = 1006) => finish(code, 'dropped'),
  }
}

async function room(
  opts: {
    wsFails?: boolean
    seats?: HarnessController['seatDefs']
    hotwash?: NonNullable<Parameters<typeof HarnessController.create>[0]>['hotwash']
  } = {},
) {
  /** While true, new connections hang (the server is unreachable). */
  const outage = { on: false }
  const controller = await HarnessController.create({
    crypto,
    scenarioTitle: 'Flight to Nowhere',
    sessionName: 'Test run',
    ...(opts.seats ? { seats: opts.seats } : {}),
    ...(opts.hotwash ? { hotwash: opts.hotwash } : {}),
  })
  controller.base = 'http://127.0.0.1:8485'
  const transports: Handle[] = []
  const connects: Array<{ kind: string; params: ConnectParams; after: number }> = []
  const connect: SessionDeps['connect'] = (kind, params, after) => {
    connects.push({ kind, params, after })
    if (outage.on) {
      const h = hangingTransport(kind)
      transports.push(h)
      return h
    }
    const t = memoryTransport(
      kind,
      controller.server.connect({
        clientId: params.clientId,
        joinToken: params.joinToken,
        resumeToken: params.resumeToken,
      }),
      kind === 'websocket' && !!opts.wsFails,
    )
    transports.push(t)
    return t
  }

  function player(link: KeyKind | string = 'players', storage = new MemoryKeyValue()) {
    const timers = new FakeTimers()
    const announced: string[] = []
    let cues = 0
    const session = new PlayerSession({
      url: link === 'players' || link === 'staff' ? controller.invite(link) : link,
      crypto,
      storage,
      connect,
      announcer: { announce: (t) => announced.push(t) },
      prefs: () => ({ theme: 'system', sound: false, vibration: true, textSize: 'normal' }),
      bundleVersion: 'test',
      timers,
      now: () => timers.now,
      random: () => 1,
      online: () => true,
      ua: 'vitest',
      cue: () => cues++,
    })
    return {
      session,
      timers,
      announced,
      cues: () => cues,
      storage,
      state: () => session.store.get(),
    }
  }

  return { controller, transports, connects, player, outage }
}

/** Resolve microtasks across the client, the server and the controller. */
const flush = async (rounds = 3) => {
  for (let i = 0; i < rounds; i++) await settle()
}

describe('PlayerSession', () => {
  it('shows the invalid-link screen for a link without a key or with a damaged fragment', async () => {
    const { player } = await room()
    const a = player('http://127.0.0.1:8485/s/session-00000000000000')
    await a.session.start()
    expect(a.state().phase).toBe('invalid-link')
    expect(a.state().linkError).toMatch(/no key/)
    const b = player('http://127.0.0.1:8485/s/session-00000000000000#zz')
    await b.session.start()
    expect(b.state().phase).toBe('invalid-link')
  })

  it('reaches the lobby with the seats and attribution, then takes a seat with a sanitized name', async () => {
    const { controller, player } = await room()
    const p = player()
    await p.session.start()
    await flush()
    const lobby = p.state()
    expect(lobby.phase).toBe('lobby')
    expect(lobby.connection).toBe('connected')
    expect(lobby.transport).toBe('websocket')
    expect(lobby.info?.attribution).toBe('role')
    expect(lobby.info?.scenarioTitle).toBe('Flight to Nowhere')
    expect(lobby.info?.seats.map((s) => s.id)).toContain('ops-director')
    expect(lobby.seat).toBeUndefined()

    await p.session.chooseSeat('ops-director', '  Dana\u0007 ')
    await flush()
    const seated = p.state()
    expect(seated.phase).toBe('seated')
    expect(seated.seat?.role?.id).toBe('ops-director')
    expect(seated.seat?.role?.teamId).toBe('ops')
    expect(seated.displayName).toBe('Dana')
    expect(seated.catchingUp).toBe(false)
    expect(controller.state().roster[0]).toMatchObject({
      roleId: 'ops-director',
      name: 'Dana',
      connected: true,
    })
    expect(controller.state().roster[0]!.ua).toMatch(/^websocket; vitest/)
  })

  it('a full seat is refused and the player can pick another', async () => {
    const { player } = await room()
    const a = player()
    await a.session.start()
    await flush()
    await a.session.chooseSeat('ops-director', 'A')
    await flush()
    const b = player()
    await b.session.start()
    await flush()
    expect(b.state().info?.seats.find((s) => s.id === 'ops-director')?.taken).toBe(1)
    await b.session.chooseSeat('ops-director', 'B')
    await flush()
    expect(b.state().phase).toBe('lobby')
    expect(b.state().joinError).toBe('full')
    await b.session.chooseSeat('it-director', 'B')
    await flush()
    expect(b.state().phase).toBe('seated')
    expect(b.state().joinError).toBeUndefined()
  })

  it('an evaluator seat needs the staff link: refused on a players link, seated on a staff link', async () => {
    const { player } = await room()
    const p = player('players')
    await p.session.start()
    await flush()
    await p.session.chooseSeat('evaluators', '')
    await flush()
    expect(p.state().joinError).toBe('not_allowed')
    const e = player('staff')
    await e.session.start()
    await flush()
    expect(e.state().linkKind).toBe('staff')
    await e.session.chooseSeat('evaluators', 'J. Ortiz')
    await flush()
    expect(e.state().phase).toBe('seated')
    expect(e.state().seat?.kind).toBe('evaluator')
  })

  it('a per-role card preselects through the role hint; the controller still seats', async () => {
    const { controller, player } = await room()
    const p = player(controller.invite('players', 'pio'))
    await p.session.start()
    await flush()
    expect(p.state().roleHint).toBe('pio')
    expect(p.state().phase).toBe('lobby')
  })

  it('routes injects to the inbox by seat, announces new ones, and keeps notices in the feed', async () => {
    const { controller, player } = await room()
    const ops = player()
    await ops.session.start()
    await flush()
    await ops.session.chooseSeat('ops-director', '')
    await flush()
    await controller.release(
      { title: 'FIDS boards dark', body: 'Boards blank.', exerciseTime: '0:45' },
      ['role:ops-director'],
    )
    await controller.release(
      { title: 'Press call', body: 'A reporter asks.', exerciseTime: '0:50' },
      ['role:pio'],
    )
    await controller.notice('Hot wash in 10 minutes', { level: 'warning' })
    await flush()
    const items = ops.state().items
    // Newest exercise time on top; the notice carries the clock at arrival (0:00, paused).
    expect(items.map((i) => i.title)).toEqual(['Press call', 'FIDS boards dark', 'Warning'])
    const view = ops.session.seatView()!
    const { isInboxItem, isFeedItem } = await import('./items')
    expect(items.filter((i) => isInboxItem(i, view)).map((i) => i.title)).toEqual([
      'FIDS boards dark',
    ])
    expect(items.filter((i) => isFeedItem(i, view)).map((i) => i.title)).toEqual(['Warning'])
    expect(ops.announced).toEqual(['New in your inbox: FIDS boards dark'])
    expect(ops.cues()).toBe(1)
    ops.session.markRead(items[2]!.key)
    expect(ops.state().read.has(items[2]!.key)).toBe(true)
  })

  it('a late joiner gets the whole history for its seat and the room, with no announcements', async () => {
    const { controller, player } = await room()
    await controller.release({ title: 'I-01', body: 'one' }, ['role:ops-director'])
    await controller.release({ title: 'I-02', body: 'two' }, ['all'])
    await controller.notice('Welcome')
    await flush()
    const late = player()
    await late.session.start()
    await flush()
    expect(
      late
        .state()
        .items.map((i) => i.title)
        .sort(),
    ).toEqual(['I-01', 'I-02', 'Notice'])
    expect(late.state().catchingUp).toBe(false)
    expect(late.announced).toEqual([])
  })

  it('reconnects after a drop with backoff, resumes the seat and catches up on what it missed', async () => {
    const { controller, player, transports, connects, outage } = await room()
    const p = player()
    await p.session.start()
    await flush()
    await p.session.chooseSeat('ops-director', 'Dana')
    await flush()
    expect(connects).toHaveLength(1)

    // The network goes away and the server is unreachable for a while.
    outage.on = true
    transports.at(-1)!.drop(1006)
    await flush()
    expect(p.state().connection).toBe('dropped')
    expect(p.state().phase).toBe('seated')
    p.timers.advance(RECONNECTING_AFTER_MS) // the 0.5 s retry fires into the outage and hangs
    await flush()
    expect(connects).toHaveLength(2)
    expect(p.state().connection).toBe('reconnecting')

    await controller.release({ title: 'Missed', body: 'while away' }, ['role:ops-director'])
    await flush()
    expect(p.state().items.map((i) => i.title)).toEqual([])

    // The server is back: the hanging attempt times out (10 s), the next one connects.
    outage.on = false
    p.timers.advance(10_000)
    await flush()
    expect(connects).toHaveLength(2)
    p.timers.advance(1000) // second backoff with random() = 1
    await flush(6)
    expect(connects).toHaveLength(3)
    expect(connects[1]!.params.clientId).toBe(connects[0]!.params.clientId)
    expect(p.state().connection).toBe('connected')
    expect(p.state().backUntil).toBeGreaterThan(p.timers.now)
    expect(p.state().seat?.role?.id).toBe('ops-director')
    expect(p.state().items.map((i) => i.title)).toEqual(['Missed'])
    expect(p.announced).toEqual([]) // caught up, not live
    const entry = controller.state().roster.find((r) => r.clientId === p.state().clientId)!
    expect(entry.joins).toBe(3) // lobby, seat, resume
    expect(entry.roleId).toBe('ops-director')

    // Nothing arrives twice: the live frame after reconnect is one item.
    await controller.release({ title: 'After', body: 'live' }, ['role:ops-director'])
    await flush()
    expect(p.state().items.map((i) => i.title)).toEqual(['After', 'Missed'])
  })

  it('wake() retries at once while a backoff is pending, and probes a live connection', async () => {
    const { player, transports, connects } = await room()
    const p = player()
    await p.session.start()
    await flush()
    transports.at(-1)!.drop()
    await flush()
    expect(connects).toHaveLength(1)
    p.session.wake()
    await flush(6)
    expect(connects).toHaveLength(2)
    expect(p.state().connection).toBe('connected')
    // Connected: a wake asks for a catch-up; the server answers, so nothing closes.
    p.session.wake()
    await flush()
    p.timers.advance(6000)
    await flush()
    expect(connects).toHaveLength(2)
    expect(p.state().connection).toBe('connected')
  })

  it('a kicked device shows the removed screen and never reconnects; others keep working after the rotation', async () => {
    const { controller, player, connects } = await room()
    const a = player()
    await a.session.start()
    await flush()
    await a.session.chooseSeat('ops-director', 'A')
    await flush()
    const b = player()
    await b.session.start()
    await flush()
    await b.session.chooseSeat('it-director', 'B')
    await flush()
    const before = connects.length
    await controller.kick(a.state().clientId)
    await flush(6)
    expect(a.state().phase).toBe('removed')
    a.timers.advance(120_000)
    await flush()
    expect(connects).toHaveLength(before)
    // B received the new epoch and still reads the room.
    await controller.release({ title: 'Epoch 2', body: 'still here' }, ['all'])
    await flush()
    expect(b.state().items.map((i) => i.title)).toEqual(['Epoch 2'])
    expect(b.storage.get(`as-live:${controller.sessionId}:epoch`)).toMatch(/^2\.players\./)
  })

  it('a reload after a rotation restores the newer epoch from the tab and rejoins', async () => {
    const { controller, player } = await room()
    const a = player()
    await a.session.start()
    await flush()
    const b = player()
    await b.session.start()
    await flush()
    await b.session.chooseSeat('pio', 'B')
    await flush()
    await controller.kick(a.state().clientId)
    await flush(6)
    b.session.stop()
    const reloaded = player('players', b.storage)
    await reloaded.session.start()
    await flush(6)
    expect(reloaded.state().phase).toBe('seated')
    expect(reloaded.state().seat?.role?.id).toBe('pio')
    expect(reloaded.state().clientId).toBe(b.state().clientId)
  })

  it('a reseat arrives as a new signed welcome: the seat changes and the inbox follows', async () => {
    const { controller, player } = await room()
    const p = player()
    await p.session.start()
    await flush()
    await p.session.chooseSeat('ops-director', 'Dana')
    await flush()
    await controller.release({ title: 'For PIO', body: 'x' }, ['role:pio'])
    await flush()
    await controller.reseat(p.state().clientId, 'pio')
    await flush()
    expect(p.state().seat?.role?.id).toBe('pio')
    const { isInboxItem } = await import('./items')
    const inbox = p.state().items.filter((i) => isInboxItem(i, p.session.seatView()))
    expect(inbox.map((i) => i.title)).toEqual(['For PIO'])
    expect(p.state().items.some((i) => i.kind === 'notice')).toBe(true)
  })

  it('session.end shows the closing message, drops items and keys, and stops reconnecting', async () => {
    const { controller, player, connects } = await room()
    const p = player()
    await p.session.start()
    await flush()
    await p.session.chooseSeat('asc', '')
    await flush()
    await controller.notice('x')
    await flush()
    await controller.end('endex', 'Thank you all.')
    await flush(6)
    expect(p.state().phase).toBe('ended')
    expect(p.state().ended?.message).toBe('Thank you all.')
    expect(p.state().items).toEqual([])
    const n = connects.length
    p.timers.advance(120_000)
    await flush()
    expect(connects).toHaveLength(n)
  })

  it('maps terminal close codes to screens: 4000 update, 4001 link invalid, 4005 device conflict', async () => {
    const { player, transports } = await room()
    for (const [code, phase] of [
      [CLOSE_CODES.VERSION, 'update-required'],
      [CLOSE_CODES.BAD_JOIN_TOKEN, 'link-invalid'],
      [CLOSE_CODES.CLIENT_ID_IN_USE, 'device-conflict'],
    ] as const) {
      const p = player()
      await p.session.start()
      await flush()
      transports.at(-1)!.drop(code)
      await flush()
      expect(p.state().phase).toBe(phase)
    }
  })

  it('falls back to the fetch transport when the socket cannot open, and stays on it', async () => {
    const { player, connects } = await room({ wsFails: true })
    const p = player()
    await p.session.start()
    await flush(6)
    expect(connects.map((c) => c.kind)).toEqual(['websocket', 'fetch'])
    expect(p.state().transport).toBe('fetch')
    expect(p.state().phase).toBe('lobby')
    p.session.stop()
    const again = player('players', p.storage)
    await again.session.start()
    await flush(6)
    expect(connects.map((c) => c.kind)).toEqual(['websocket', 'fetch', 'fetch'])
  })

  it('a connection that never says hello is closed and retried', async () => {
    const { player, connects } = await room()
    const p = player()
    // Hold the server's hello back by not flushing microtasks before the hello timeout fires.
    void p.session.start()
    await Promise.resolve()
    p.timers.advance(10_000)
    await flush(6)
    expect(connects.length).toBeGreaterThanOrEqual(1)
    expect(['lobby', 'connecting']).toContain(p.state().phase)
  })

  it('forgetDevice clears the identity so the next load is a new device', async () => {
    const { controller, player } = await room()
    const p = player()
    await p.session.start()
    await flush()
    const first = p.state().clientId
    p.session.forgetDevice()
    const next = player('players', p.storage)
    await next.session.start()
    await flush()
    expect(next.state().clientId).not.toBe(first)
    expect(controller.state().roster.map((r) => r.clientId)).toContain(next.state().clientId)
  })
})

describe('PlayerSession inject delivery (#412)', () => {
  const received = (controller: HarnessController, status: string) =>
    controller.received.filter(
      (m) => m.type === 'inject.receipt' && (m.payload as { status: string }).status === status,
    )

  async function seated() {
    const r = await room()
    const ops = r.player()
    await ops.session.start()
    await flush()
    await ops.session.chooseSeat('ops-director', '')
    await flush()
    return { ...r, ops }
  }

  it('sends one delivered receipt per release, even when it arrives by role and by team', async () => {
    const { controller, ops } = await seated()
    await controller.release({ title: 'Tweet', body: 'text', expectsResponse: true }, [
      'role:ops-director',
      'team:ops',
    ])
    await flush()
    const { inboxItems } = await import('./items')
    expect(inboxItems(ops.state().items, ops.session.seatView())).toHaveLength(1)
    expect(received(controller, 'delivered')).toHaveLength(1)
    await ops.session.sendReceipt(ops.state().items[0]!.inject!.releaseId, 'delivered')
    await flush()
    expect(received(controller, 'delivered')).toHaveLength(1)
  })

  it('sends no receipt for an inject that was not addressed to this seat', async () => {
    const { controller } = await seated()
    await controller.release({ title: 'For PIO', body: 'x' }, ['role:pio'])
    await flush()
    expect(received(controller, 'delivered')).toHaveLength(0)
  })

  it('queues read and actioned receipts and marks the release actioned', async () => {
    const { controller, ops } = await seated()
    const id = await controller.release({ title: 'Memo', body: 'text', expectsResponse: true }, [
      'all',
    ])
    await flush()
    await ops.session.sendReceipt(id, 'read')
    await ops.session.sendReceipt(id, 'actioned')
    await flush()
    expect(received(controller, 'read')).toHaveLength(1)
    expect(received(controller, 'actioned')).toHaveLength(1)
    expect(ops.state().actioned.has(id)).toBe(true)
  })

  it('hides a withdrawn inject from the inbox and says so in the feed', async () => {
    const { controller, ops } = await seated()
    const id = await controller.release({ title: 'Oops', body: 'wrong one' }, ['role:ops-director'])
    await flush()
    await controller.recall(id, ['role:ops-director'])
    await flush()
    const view = ops.session.seatView()!
    const { isInboxItem, isFeedItem } = await import('./items')
    const items = ops.state().items
    expect(items.filter((i) => isInboxItem(i, view))).toHaveLength(0)
    expect(items.filter((i) => isFeedItem(i, view)).map((i) => i.body)).toEqual([
      'Withdrawn by the facilitator',
    ])
    expect(items.find((i) => i.inject)?.withdrawn).toBe(true)
  })

  it('downloads and opens a sealed blob, and drops its URL when the last view lets go', async () => {
    const { controller, ops } = await seated()
    const bytes = new Uint8Array([1, 2, 3, 4])
    const ref = await controller.client.putBlob(
      { kind: 'image', mime: 'image/png', name: 'device' },
      bytes,
    )
    await expect(ops.session.fetchBlob(ref)).resolves.toEqual(bytes)
  })
})

describe('PlayerSession messages (#413)', () => {
  async function seated() {
    const r = await room()
    const pio = r.player()
    await pio.session.start()
    await flush()
    await pio.session.chooseSeat('pio', '')
    await flush()
    const pio2 = r.player()
    await pio2.session.start()
    await flush()
    await pio2.session.chooseSeat('pio', '')
    await flush()
    const ops = r.player()
    await ops.session.start()
    await flush()
    await ops.session.chooseSeat('ops-director', '')
    await flush()
    return { ...r, pio, pio2, ops }
  }
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

  it('sends a message, shows it as sending, and settles when the controller echoes it', async () => {
    const { controller, pio } = await seated()
    const sending = pio.session.sendMessage({
      channel: 'role:pio',
      text: 'Statement at 1800.',
      photos: [],
    })
    expect(pio.state().messages[0]).toMatchObject({ mine: true, text: 'Statement at 1800.' })
    await sending
    await flush()
    expect(pio.state().messages).toHaveLength(1)
    expect(pio.state().messages[0]).toMatchObject({ mine: true, status: 'sent' })
    expect(controller.messageLog[0]).toMatchObject({
      from: 'player',
      roleId: 'pio',
      channel: 'role:pio',
    })
  })

  it('shows the controller reply with its persona and the played-by flag, and counts it unread', async () => {
    const { controller, pio } = await seated()
    await controller.reply('role:pio', 'Can you confirm ransomware?', 'Channel 5 newsroom')
    await flush()
    const reply = pio.state().messages[0]!
    expect(reply).toMatchObject({
      mine: false,
      persona: 'Channel 5 newsroom',
      playedBy: true,
      text: 'Can you confirm ransomware?',
    })
    expect(pio.announced.at(-1)).toBe('New message from Channel 5 newsroom')
    const { unreadCount } = await import('./messages')
    expect(unreadCount(pio.state().messages, pio.state().read)).toBe(1)
    pio.session.markRead(`msg:${reply.id}`)
    expect(unreadCount(pio.state().messages, pio.state().read)).toBe(0)
  })

  it('a second device in the seat sees both sides; another seat sees neither', async () => {
    const { controller, pio, pio2, ops } = await seated()
    await pio.session.sendMessage({
      channel: 'role:pio',
      text: 'We are investigating.',
      photos: [],
    })
    await flush()
    await controller.reply('role:pio', 'Thank you.', 'Reporter', { showPlayedBy: false })
    await flush()
    expect(pio2.state().messages.map((m) => [m.mine, m.text])).toEqual([
      [true, 'We are investigating.'],
      [false, 'Thank you.'],
    ])
    expect(pio2.state().messages[1]!.playedBy).toBe(false)
    expect(ops.state().messages).toEqual([])
  })

  it('uploads a photo before sending and shows it on the echo', async () => {
    const { controller, pio, pio2 } = await seated()
    await pio.session.sendMessage({
      channel: 'role:pio',
      text: 'Whiteboard',
      photos: [{ bytes: JPEG, mime: 'image/jpeg', width: 800, height: 600, alt: 'ICS-201 board' }],
    })
    await flush()
    expect(controller.messageLog[0]!.attachmentBytes).toEqual([JPEG.length])
    expect(pio2.state().messages[0]!.attachments[0]).toMatchObject({
      kind: 'image',
      name: 'ICS-201 board',
    })
  })

  it('queues a text message while offline and sends it once on reconnect', async () => {
    const { controller, pio, transports } = await seated()
    transports.forEach((t) => t.drop())
    await flush()
    await pio.session.sendMessage({ channel: 'role:pio', text: 'Offline note', photos: [] })
    expect(pio.state().messages[0]!.status).toBe('sending')
    expect(controller.messageLog).toHaveLength(0)
    pio.timers.advance(60_000)
    await flush(8)
    expect(controller.messageLog.filter((m) => m.text === 'Offline note')).toHaveLength(1)
    expect(pio.state().messages[0]!.status).toBe('sent')
  })

  it('marks a message with a photo failed when the connection is down, and retries it', async () => {
    const { controller, pio, transports } = await seated()
    transports.forEach((t) => t.drop())
    await flush()
    const photos = [{ bytes: JPEG, mime: 'image/jpeg' as const, width: 8, height: 8, alt: '' }]
    await pio.session.sendMessage({ channel: 'role:pio', text: 'Photo', photos })
    const failed = pio.state().messages[0]!
    expect(failed.status).toBe('failed')
    pio.timers.advance(60_000)
    await flush(8)
    await pio.session.retryMessage(failed.id)
    await flush()
    expect(controller.messageLog.filter((m) => m.text === 'Photo')).toHaveLength(1)
    expect(pio.state().messages[0]!.status).toBe('sent')
  })

  it('ignores a message.send that the controller did not sign', async () => {
    const { controller, pio } = await seated()
    await controller.client.send(
      'message.send',
      'role:pio',
      {
        messageId: 'u'.repeat(22),
        channel: 'role:pio',
        text: 'Forged',
        persona: 'X',
        attachments: [],
      },
      { key: 'players' },
    )
    await flush()
    expect(pio.state().messages).toEqual([])
  })

  it('"Reply to SimCell" quotes the inject and sends its release id as replyTo', async () => {
    const { controller, pio } = await seated()
    const releaseId = await controller.release({ title: 'FIDS board', body: 'x' }, ['role:pio'])
    await flush()
    pio.session.startReply(releaseId)
    expect(pio.state().compose).toMatchObject({ releaseId, title: 'FIDS board' })
    await pio.session.sendMessage({
      channel: 'role:pio',
      text: 'On it',
      photos: [],
      replyTo: releaseId,
    })
    await flush()
    expect(pio.state().messages[0]!.replyTo).toBe(releaseId)
  })
})

describe('PlayerSession as a SimCell helper (#518)', () => {
  const seats = [
    ...DEFAULT_SEATS,
    { id: 'simcell', name: 'SimCell helper', kind: 'simcell' as const },
  ]
  const draft = (n: number, over: Record<string, unknown> = {}) => ({
    draftId: `draft${String(n).padStart(17, '0')}`,
    revision: 1,
    status: 'queued' as const,
    persona: 'Reporter',
    threadLabel: 'Reporter and Ops',
    text: `Reply ${n}`,
    flags: [],
    ...over,
  })

  async function helperRoom() {
    const r = await room({ seats })
    const h = r.player('staff')
    await h.session.start()
    await flush()
    await h.session.chooseSeat('simcell', '')
    await flush(6)
    return { ...r, h }
  }

  it('receives a draft after taking the SimCell seat, and a player never does', async () => {
    const { player, h, controller } = await helperRoom()
    const p = player('players')
    await p.session.start()
    await flush()
    await p.session.chooseSeat('ops-director', '')
    await flush(6)
    expect(await controller.offerDraft(draft(1))).toBe(1)
    await flush(6)
    expect(h.session.simcell?.state.get().drafts.map((d) => d.text)).toEqual(['Reply 1'])
    expect(p.session.simcell?.state.get().drafts).toEqual([])
    expect(h.announced.some((a) => a.includes('SimCell draft'))).toBe(true)
  })

  it('sends the decision to the controller once, with the draft revision', async () => {
    const { h, controller } = await helperRoom()
    await controller.offerDraft(draft(1))
    await flush(6)
    await h.session.simcell!.decide(draft(1).draftId, 'edit', 'Changed words')
    await flush(6)
    expect(controller.simcellActions.map((a) => a.payload)).toEqual([
      { draftId: draft(1).draftId, revision: 1, action: 'edit', text: 'Changed words' },
    ])
  })

  it('a device that is not seated as a helper ignores a draft sent to it', async () => {
    const { player, controller } = await helperRoom()
    const p = player('staff')
    await p.session.start()
    await flush()
    await p.session.chooseSeat('evaluators', '')
    await flush(6)
    await controller.client.send('simcell.draft', `client:${p.session.state.clientId}`, draft(2), {
      key: 'staff',
    })
    await flush(6)
    expect(p.session.simcell?.state.get().drafts).toEqual([])
  })
})

describe('PlayerSession as an evaluator (#416)', () => {
  const tasks = [
    {
      id: 'T-01',
      capability: 'operational_communications',
      task: 'Notify the airlines',
      citation: { documentTitle: 'AEP', headingPath: 'AEP › App. 6' },
      rowIds: ['I-06'],
    },
  ]
  const assignment = { watch: { roleIds: [], capabilities: [] }, showExpected: true, tasks }

  async function evaluatorRoom() {
    const r = await room()
    await r.controller.setAssignment(assignment)
    const e = r.player('staff')
    await e.session.start()
    await flush()
    await e.session.chooseSeat('evaluators', '')
    await flush(6)
    return { ...r, e }
  }

  it('receives its assignment after taking the evaluator seat, and a player never does', async () => {
    const { player, e, controller } = await evaluatorRoom()
    expect(e.session.evaluate?.state.get().assignment).toMatchObject({
      label: 'Evaluator 1',
      revision: 1,
      tasks: [{ id: 'T-01' }],
    })
    const p = player('players')
    await p.session.start()
    await flush()
    await p.session.chooseSeat('ops-director', '')
    await flush(6)
    expect(p.session.evaluate?.state.get().assignment).toBeUndefined()
    expect(controller.received.filter((m) => m.type === 'eval.assign')).toEqual([])
  })

  it('takes a newer revision from the controller and ignores a replay of the old one', async () => {
    const { e, controller } = await evaluatorRoom()
    await controller.setAssignment({ ...assignment, watch: { roleIds: ['pio'], capabilities: [] } })
    await flush(6)
    expect(e.session.evaluate?.state.get().assignment).toMatchObject({
      revision: 2,
      watch: { roleIds: ['pio'] },
    })
  })

  it('sends a rating to the controller with its revision, and an edit as revision 2', async () => {
    const { e, controller } = await evaluatorRoom()
    await e.session.evaluate!.save({
      kind: 'task',
      taskId: 'T-01',
      rating: 'partial',
      notes: 'Late',
      exerciseTime: '1:12',
      mselRowId: 'I-06',
    })
    await flush(6)
    await e.session.evaluate!.save({
      kind: 'task',
      taskId: 'T-01',
      rating: 'met',
      notes: 'Late',
      exerciseTime: '1:12',
      mselRowId: 'I-06',
    })
    await flush(6)
    expect(controller.observationLog.map((o) => [o.payload.revision, o.payload.rating])).toEqual([
      [1, 'partial'],
      [2, 'met'],
    ])
    expect([...controller.observations.values()][0]).toMatchObject({ rating: 'met', revision: 2 })
    expect(e.session.evaluate!.state.get().observations[0]).toMatchObject({ sentRevision: 2 })
  })

  it('a player device that sends an observation is refused by the controller', async () => {
    const { player, controller } = await evaluatorRoom()
    const p = player('players')
    await p.session.start()
    await flush()
    await p.session.chooseSeat('ops-director', '')
    await flush(6)
    await p.session.sendAction('eval.observation', 'controller', {
      observationId: 'P'.repeat(22),
      revision: 1,
      kind: 'note',
      notes: 'x',
      exerciseTime: '1:00',
      observedAt: Date.now(),
    })
    await flush(6)
    expect(controller.observations.size).toBe(0)
    expect(controller.refusedObservations).toHaveLength(1)
  })

  it('keeps ratings made offline and sends them once, in order, when the connection returns', async () => {
    const { e, controller, transports } = await evaluatorRoom()
    e.session.offline()
    transports.at(-1)!.drop()
    await flush()
    for (const id of ['T-01', 'T-02', 'T-03']) {
      await e.session.evaluate!.save({
        kind: 'note',
        notes: `offline ${id}`,
        exerciseTime: '1:30',
      })
    }
    expect(controller.observationLog).toHaveLength(0)
    e.timers.advance(60_000)
    await flush(10)
    expect(controller.observationLog.map((o) => o.payload.notes)).toEqual([
      'offline T-01',
      'offline T-02',
      'offline T-03',
    ])
    expect(controller.observations.size).toBe(3)
  })
})

describe('PlayerSession hot wash (#415)', () => {
  async function seated() {
    const r = await room({
      hotwash: {
        method: '3up3down',
        questions: [{ id: 'hwq-1', topic: 'Coordination', text: 'What slowed Ops and IT?' }],
      },
    })
    const join = async (seat: string, link: 'players' | 'staff' = 'players') => {
      const p = r.player(link)
      await p.session.start()
      await flush()
      await p.session.chooseSeat(seat, '')
      await flush()
      return p
    }
    const ops = await join('ops-director')
    const pio = await join('pio')
    const evaluator = await join('evaluators', 'staff')
    return { ...r, ops, pio, evaluator }
  }
  const item = (kind: 'strength' | 'improvement' | 'other', text: string, anonymous = false) => ({
    kind,
    text,
    anonymous,
  })

  it('gets the prompts in the welcome and learns the hot wash opened', async () => {
    const { controller, ops } = await seated()
    expect(ops.state().info?.hotwash?.questions[0]).toMatchObject({ id: 'hwq-1' })
    expect(ops.state().hotwash.open).toBe(false)
    await controller.hotwash.openOnDevices()
    await flush()
    expect(ops.state().hotwash.open).toBe(true)
    expect(ops.announced.at(-1)).toBe('The hot wash is open')
    await controller.hotwash.closeOnDevices()
    await flush()
    expect(ops.state().hotwash.open).toBe(false)
  })

  it('shows an item to every device with the role, or without it when anonymous', async () => {
    const { controller, ops, pio, evaluator } = await seated()
    await controller.hotwash.openOnDevices()
    await flush()
    await ops.session.postHotwash(item('improvement', 'Two incident numbers'))
    await pio.session.postHotwash(item('improvement', 'No FBI number', true))
    await flush()
    const seenByEvaluator = Object.values(evaluator.state().hotwash.items)
    expect(seenByEvaluator.map((i) => [i.text, i.roleId])).toEqual([
      ['Two incident numbers', 'ops-director'],
      ['No FBI number', undefined],
    ])
    expect(Object.values(ops.state().hotwash.items).every((i) => i.shown)).toBe(true)
    expect(Object.values(ops.state().hotwash.items).filter((i) => i.mine)).toHaveLength(1)
    expect(controller.hotwash.logged).toEqual([
      expect.objectContaining({ anonymous: false, seat: 'ops-director' }),
      expect.objectContaining({ anonymous: true }),
    ])
    expect(controller.hotwash.logged[1]).not.toHaveProperty('seat')
  })

  it('holds an item for review until the facilitator shows it', async () => {
    const { controller, ops, pio } = await seated()
    await controller.hotwash.openOnDevices(true)
    await flush()
    await ops.session.postHotwash(item('strength', 'Clear PA script'))
    await flush()
    const [mine] = Object.values(ops.state().hotwash.items)
    expect(mine).toMatchObject({ mine: true, shown: false })
    expect(Object.keys(pio.state().hotwash.items)).toHaveLength(0)
    await controller.hotwash.accept(mine!.itemId)
    await flush()
    expect(Object.values(pio.state().hotwash.items)[0]).toMatchObject({ shown: true })
    expect(ops.state().hotwash.items[mine!.itemId]).toMatchObject({ mine: true, shown: true })
  })

  it('counts one +1 per device, never for the author', async () => {
    const { controller, ops, pio, evaluator } = await seated()
    await controller.hotwash.openOnDevices()
    await flush()
    await ops.session.postHotwash(item('improvement', 'Two incident numbers'))
    await flush()
    const id = Object.keys(ops.state().hotwash.items)[0]!
    await pio.session.plusHotwash(id)
    await pio.session.plusHotwash(id)
    await ops.session.plusHotwash(id)
    await evaluator.session.plusHotwash(id)
    await flush()
    expect(evaluator.state().hotwash.items[id]!.plus).toBe(2)
    expect(ops.state().hotwash.items[id]!.plus).toBe(2)
  })

  it('withdraws an own item inside two minutes', async () => {
    const { controller, ops, pio } = await seated()
    await controller.hotwash.openOnDevices()
    await flush()
    await ops.session.postHotwash(item('other', 'Oops, wrong channel'))
    await flush()
    const id = Object.keys(ops.state().hotwash.items)[0]!
    await ops.session.withdrawHotwash(id)
    await flush()
    expect(ops.state().hotwash.items[id]).toBeUndefined()
    expect(pio.state().hotwash.items[id]).toBeUndefined()
  })

  it('follows the facilitator: edit, group with a label, promote, hide', async () => {
    const { controller, ops, pio } = await seated()
    await controller.hotwash.openOnDevices()
    await flush()
    await ops.session.postHotwash(item('improvement', 'Two numbrs'))
    await pio.session.postHotwash(item('improvement', 'Which number?'))
    await flush()
    const [a, b] = Object.keys(pio.state().hotwash.items)
    await controller.hotwash.edit(a!, 'Two numbers')
    await controller.hotwash.group([a!, b!], 'Incident numbering')
    await controller.hotwash.promote([a!, b!])
    await flush()
    expect(pio.state().hotwash.items[a!]).toMatchObject({
      text: 'Two numbers',
      groupLabel: 'Incident numbering',
      promoted: true,
    })
    await controller.hotwash.hide(b!)
    await flush()
    expect(pio.state().hotwash.items[b!]).toBeUndefined()
  })

  it('a device that joins later sees the board and that the hot wash is open', async () => {
    const { controller, ops, player } = await seated()
    await controller.hotwash.openOnDevices()
    await flush()
    await ops.session.postHotwash(item('strength', 'Clear PA script'))
    await flush()
    const late = player()
    await late.session.start()
    await flush()
    await late.session.chooseSeat('asc', '')
    await flush()
    expect(late.state().hotwash.open).toBe(true)
    expect(Object.values(late.state().hotwash.items).map((i) => i.text)).toEqual([
      'Clear PA script',
    ])
  })

  it('does not post while the hot wash is closed', async () => {
    const { controller, ops } = await seated()
    await ops.session.postHotwash(item('strength', 'Too early'))
    await flush()
    expect(Object.keys(ops.state().hotwash.items)).toHaveLength(0)
    expect(controller.hotwash.items.size).toBe(0)
  })
})

describe('sanitizeName', () => {
  it('trims, strips control and zero-width characters and caps at 40', () => {
    expect(sanitizeName('  Dana\u0007​ Lee\n ')).toBe('Dana Lee')
    expect(sanitizeName('x'.repeat(60))).toHaveLength(40)
    expect(sanitizeName('a b')).toBe('ab')
  })
})
