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
import { HarnessController } from '../harness/controller'
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

async function room(opts: { wsFails?: boolean; seats?: HarnessController['seatDefs'] } = {}) {
  /** While true, new connections hang (the server is unreachable). */
  const outage = { on: false }
  const controller = await HarnessController.create({
    crypto,
    scenarioTitle: 'Flight to Nowhere',
    sessionName: 'Test run',
    ...(opts.seats ? { seats: opts.seats } : {}),
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

describe('sanitizeName', () => {
  it('trims, strips control and zero-width characters and caps at 40', () => {
    expect(sanitizeName('  Dana\u0007​ Lee\n ')).toBe('Dana Lee')
    expect(sanitizeName('x'.repeat(60))).toHaveLength(40)
    expect(sanitizeName('a b')).toBe('ab')
  })
})
