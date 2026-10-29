/**
 * `SessionHub` on `MemoryStore`: the conformance suite, then what only a real server has and
 * `MemoryServer` does not: tokens, rate limits, the stored-envelope cap, the reconnect cap,
 * restoring connections after a hibernation, and a log that never carries a frame.
 */
import { describe, expect, it } from 'vitest'
import { toBase64Url } from '@shared/live/bytes'
import { SessionKeys } from '@shared/live/crypto/keys'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { IDS } from '@shared/live/fixtures/payloads'
import { CLOSE_CODES } from '@shared/live/protocol'
import { SessionHub, type LogEvent } from '../src/hub'
import { HUB_LIMITS, type HubLimits } from '../src/limits'
import { MemoryStore } from '../src/store'
import { randomBytes, randomId } from '../src/tokens'
import { describeServerConformance, frame, Inbox, waitFor } from './conformance'
import { connectionPair, hubFactory } from './harness'

const crypto = createWebCryptoProvider()

describeServerConformance('SessionHub on MemoryStore', hubFactory())

interface Room {
  hub: SessionHub
  store: MemoryStore
  controllerToken: string
  joinToken: string
  clock: { now: number }
  log: LogEvent[]
  connect(
    clientId: string,
    over?: { controllerToken?: string; joinToken?: string; resumeToken?: string },
  ): Promise<Inbox>
}

async function room(
  limits: Partial<HubLimits> = {},
  kind: 'relay' | 'lan' = 'relay',
): Promise<Room> {
  const store = new MemoryStore()
  const clock = { now: 1_700_000_000_000 }
  const log: LogEvent[] = []
  const hub = new SessionHub({
    sessionId: randomId(),
    store,
    kind,
    limits: { ...HUB_LIMITS[kind], ...limits },
    now: () => clock.now,
    log: (e) => log.push(e),
    version: '1.2.3',
  })
  const { controllerToken } = await hub.create()
  const keys = await SessionKeys.create(crypto, hub.sessionId)
  hub.setJoinTokenHash(await keys.joinTokenHash())
  const joinToken = toBase64Url(await keys.joinToken())
  return {
    hub,
    store,
    controllerToken,
    joinToken,
    clock,
    log,
    async connect(clientId, over = {}) {
      const controller = over.controllerToken !== undefined
      const { transport, conn } = connectionPair(
        clientId,
        controller,
        (c, f) => hub.onFrame(c, f),
        (c, code) => hub.onClose(c, code),
      )
      await hub.accept(
        conn,
        controller
          ? { clientId, controllerToken: over.controllerToken }
          : {
              clientId,
              joinToken: over.joinToken ?? joinToken,
              resumeToken: over.resumeToken ?? toBase64Url(randomBytes(16)),
            },
      )
      return new Inbox(transport)
    },
  }
}

describe('SessionHub: tokens', () => {
  it('mints a controller token once and admits only connections that present it', async () => {
    const r = await room()
    expect(r.controllerToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(r.hub.meta!.controllerTokenHashes).toHaveLength(1)
    expect(r.hub.meta!.controllerTokenHashes[0]).not.toContain(r.controllerToken.slice(0, 10))
    const good = await r.connect(IDS.controller, { controllerToken: r.controllerToken })
    await good.nextOfType('relay.hello')
    const bad = await r.connect(IDS.evaluator, { controllerToken: 'x'.repeat(43) })
    await bad.error('BAD_JOIN_TOKEN')
    expect(await bad.closeCode()).toBe(CLOSE_CODES.BAD_JOIN_TOKEN)
    expect(await r.hub.isControllerToken(r.controllerToken)).toBe(true)
    expect(await r.hub.isControllerToken('x'.repeat(43))).toBe(false)
    expect(await r.hub.isControllerToken(undefined)).toBe(false)
  })

  it('a co-controller token (#440) is a controller connection too', async () => {
    const r = await room()
    const second = await r.hub.addController()
    expect(second).not.toBe(r.controllerToken)
    const co = await r.connect(IDS.evaluator, { controllerToken: second })
    const [hello] = await co.nextOfType('relay.hello')
    expect(hello!.payload.clients).toBeDefined()
    expect(await r.hub.isControllerToken(second)).toBe(true)
  })

  it('cannot be created twice and admits no participant before a join-token hash is set', async () => {
    const hub = new SessionHub({ sessionId: randomId(), store: new MemoryStore(), kind: 'relay' })
    await hub.create()
    await expect(hub.create()).rejects.toThrow('already exists')
    const { transport, conn } = connectionPair(
      IDS.playerA,
      false,
      (c, f) => hub.onFrame(c, f),
      (c) => hub.onClose(c),
    )
    const result = await hub.accept(conn, {
      clientId: IDS.playerA,
      joinToken: toBase64Url(randomBytes(16)),
      resumeToken: toBase64Url(randomBytes(16)),
    })
    expect(result).toMatchObject({ ok: false, error: 'BAD_JOIN_TOKEN' })
    const inbox = new Inbox(transport)
    expect(await inbox.closeCode()).toBe(CLOSE_CODES.BAD_JOIN_TOKEN)
  })

  it('refuses a connection to a session that does not exist or has ended', async () => {
    const hub = new SessionHub({ sessionId: randomId(), store: new MemoryStore(), kind: 'relay' })
    const { conn } = connectionPair(
      IDS.playerA,
      false,
      () => {},
      () => {},
    )
    expect(await hub.accept(conn, { clientId: IDS.playerA })).toMatchObject({
      ok: false,
      error: 'SESSION_ENDED',
      code: 4002,
    })
    const r = await room()
    r.hub.end()
    expect(r.hub.ended).toBe(true)
    expect(r.hub.tombstoneExpiresAt).toBe(r.clock.now + 3600_000)
    const late = await r.connect(IDS.playerA)
    expect(await late.closeCode()).toBe(CLOSE_CODES.SESSION_ENDED)
    expect(r.hub.meta).toBeDefined()
    expect(r.store.count()).toBe(0)
  })

  it('reports the retention deadline from creation', async () => {
    const r = await room()
    expect(r.hub.expiresAt).toBe(r.clock.now + 72 * 3600_000)
    expect(r.hub.exists).toBe(true)
  })
})

describe('SessionHub: caps the relay enforces', () => {
  it('rate-limits a participant: RATE_LIMITED with retryAfterMs, then 4008 past the burst', async () => {
    const r = await room({
      rates: { ...HUB_LIMITS.relay.rates, clientPerMinute: 60, clientBurst: 3 },
    })
    const a = await r.connect(IDS.playerA)
    await a.nextOfType('relay.hello')
    const send = (seq: number) =>
      a.send(
        frame({
          session: r.hub.sessionId,
          from: IDS.playerA,
          to: 'controller',
          type: 'vote.cast',
          seq,
        }),
      )
    for (let seq = 1; seq <= 4; seq++) send(seq)
    const err = await a.error('RATE_LIMITED')
    expect(err.payload.retryAfterMs).toBe(1000)
    expect(r.store.count()).toBe(3)
    r.clock.now += 1000 // one token back
    send(5)
    await waitFor(() => r.store.count() === 4, 'frame after refill stored')
    for (let seq = 6; seq <= 10; seq++) send(seq)
    expect(await a.closeCode()).toBe(CLOSE_CODES.RATE_LIMITED)
    expect(r.log.filter((e) => e.event === 'rate_limited').length).toBeGreaterThanOrEqual(4)
  })

  it('rate-limits the whole session as well as each connection', async () => {
    const r = await room({
      rates: { ...HUB_LIMITS.lan.rates, sessionPerMinute: 60, sessionBurst: 2 },
    })
    const a = await r.connect(IDS.playerA)
    const b = await r.connect(IDS.playerB)
    await b.nextOfType('relay.hello')
    a.send(
      frame({
        session: r.hub.sessionId,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 1,
      }),
    )
    b.send(
      frame({
        session: r.hub.sessionId,
        from: IDS.playerB,
        to: 'controller',
        type: 'vote.cast',
        seq: 1,
      }),
    )
    a.send(
      frame({
        session: r.hub.sessionId,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 2,
      }),
    )
    await a.error('RATE_LIMITED')
    expect(r.store.count()).toBe(2)
  })

  it('refuses participant frames past the stored-envelope cap with STORE_FULL but still stores the controller’s', async () => {
    const r = await room({ storedEnvelopes: 2 })
    const ctl = await r.connect(IDS.controller, { controllerToken: r.controllerToken })
    const a = await r.connect(IDS.playerA)
    await a.nextOfType('relay.hello')
    const s = r.hub.sessionId
    a.send(frame({ session: s, from: IDS.playerA, to: 'controller', type: 'vote.cast', seq: 1 }))
    a.send(frame({ session: s, from: IDS.playerA, to: 'controller', type: 'vote.cast', seq: 2 }))
    a.send(frame({ session: s, from: IDS.playerA, to: 'controller', type: 'vote.cast', seq: 3 }))
    await a.error('STORE_FULL')
    expect(r.store.count()).toBe(2)
    await waitFor(() => ctl.routed.length === 2, 'controller got the two stored frames')
    ctl.send(frame({ session: s, from: IDS.controller, to: 'all', type: 'session.end', seq: 1 }))
    await a.until((e) => e.type === 'session.end', 'end still fans out')
    expect(r.store.count()).toBe(3)
    expect(r.log.some((e) => e.event === 'store_full')).toBe(true)
  })

  it('caps reconnects per client id per hour', async () => {
    const r = await room({ rates: { ...HUB_LIMITS.lan.rates, reconnectsPerHour: 2 } })
    const token = toBase64Url(randomBytes(16))
    await (await r.connect(IDS.playerA, { resumeToken: token })).nextOfType('relay.hello')
    await (await r.connect(IDS.playerA, { resumeToken: token })).nextOfType('relay.hello')
    const third = await r.connect(IDS.playerA, { resumeToken: token })
    await third.error('RATE_LIMITED')
    expect(await third.closeCode()).toBe(CLOSE_CODES.RATE_LIMITED)
    r.clock.now += 3600_000 + 1
    const later = await r.connect(IDS.playerA, { resumeToken: token })
    await later.nextOfType('relay.hello')
  })
})

describe('SessionHub: memory loss', () => {
  it('a new hub on the same store continues the session: seqs, identities, frames and blobs survive', async () => {
    const r = await room()
    const token = toBase64Url(randomBytes(16))
    const a = await r.connect(IDS.playerA, { resumeToken: token })
    await a.nextOfType('relay.hello')
    a.send(
      frame({
        session: r.hub.sessionId,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 3,
      }),
    )
    await waitFor(() => r.store.count() === 1, 'stored')

    const woke = new SessionHub({ sessionId: r.hub.sessionId, store: r.store, kind: 'relay' })
    expect(woke.exists).toBe(true)
    // The adapter rebuilds the connection objects from what it kept with the sockets.
    const { transport, conn } = connectionPair(
      IDS.playerA,
      false,
      (c, f) => woke.onFrame(c, f),
      (c) => woke.onClose(c),
    )
    woke.attach(conn)
    const inbox = new Inbox(transport)
    inbox.send(
      frame({
        session: woke.sessionId,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 3,
      }),
    ) // replay: dropped
    inbox.send(
      frame({
        session: woke.sessionId,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 4,
      }),
    )
    await waitFor(() => r.store.count() === 2, 'the new frame stored, the replay not')
    expect(inbox.frames).toHaveLength(0) // no hello, no error: attach is silent

    const thief = connectionPair(
      IDS.playerA,
      false,
      (c, f) => woke.onFrame(c, f),
      (c) => woke.onClose(c),
    )
    const refused = await woke.accept(thief.conn, {
      clientId: IDS.playerA,
      joinToken: r.joinToken,
      resumeToken: toBase64Url(randomBytes(16)),
    })
    expect(refused).toMatchObject({ ok: false, error: 'BAD_RESUME_TOKEN' })
    const ctl = connectionPair(
      IDS.controller,
      true,
      (c, f) => woke.onFrame(c, f),
      (c) => woke.onClose(c),
    )
    expect(
      await woke.accept(ctl.conn, { clientId: IDS.controller, controllerToken: r.controllerToken }),
    ).toMatchObject({ ok: true })
  })
})

describe('SessionHub: what the log says', () => {
  it('logs connection events with ids and codes and never a frame, token or key', async () => {
    const r = await room()
    const ctl = await r.connect(IDS.controller, { controllerToken: r.controllerToken })
    const a = await r.connect(IDS.playerA)
    await a.nextOfType('relay.hello')
    const text = frame({
      session: r.hub.sessionId,
      from: IDS.playerA,
      to: 'controller',
      type: 'vote.cast',
      seq: 1,
      payload: { k: 's1', n: 'AAAAAAAAAAAAAAAA', c: 'SECRETPAYLOAD' },
    })
    a.send(text)
    await ctl.until((e) => e.type === 'vote.cast', 'routed')
    const bad = await r.connect(IDS.playerB, { joinToken: toBase64Url(randomBytes(16)) })
    await bad.closeCode()
    r.hub.kick(IDS.playerA)
    r.hub.end()
    const events = r.log.map((e) => e.event)
    expect(events).toEqual(expect.arrayContaining(['accept', 'refuse', 'kick', 'end']))
    const dump = JSON.stringify(r.log)
    expect(dump).not.toContain('SECRETPAYLOAD')
    expect(dump).not.toContain(r.controllerToken)
    expect(dump).not.toContain(r.joinToken)
    expect(dump).not.toContain('payload')
    expect(r.log.find((e) => e.event === 'refuse')).toMatchObject({
      client: IDS.playerB,
      code: 4001,
      error: 'BAD_JOIN_TOKEN',
    })
  })
})
