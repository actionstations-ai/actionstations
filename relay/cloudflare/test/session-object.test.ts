/**
 * The Durable Object under the shim: the conformance suite, then what the object adds to the
 * hub: hibernation (connections rebuilt from attachments), the retention and tombstone alarms,
 * the HTTP actions and their checks, and a log that never holds a frame.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toBase64Url } from '@shared/live/bytes'
import { SessionKeys } from '@shared/live/crypto/keys'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { IDS } from '@shared/live/fixtures/payloads'
import { CLOSE_CODES } from '@shared/live/protocol'
import { randomBytes, RETENTION_MS, TOMBSTONE_MS } from '@actionstations/relay-core'
import { describeServerConformance, frame, Inbox, waitFor } from '../../core/test/conformance'
import { createRoom, sessionObjectFactory, START, type Room } from './do-harness'
import { socketOf, transportOf } from './shim'

vi.mock('../src/platform', async () => (await import('./shim')).platformShim)

const crypto = createWebCryptoProvider()

describeServerConformance('SessionObject (Durable Object, shim)', sessionObjectFactory)

async function roomWithKeys(): Promise<Room & { joinToken: Uint8Array }> {
  const room = await createRoom()
  const keys = await SessionKeys.create(crypto, room.sessionId)
  await room.action('join-token', { joinTokenHash: await keys.joinTokenHash() })
  return Object.assign(room, { joinToken: await keys.joinToken() })
}

async function open(room: Room, clientId: string, over: Record<string, unknown> = {}) {
  const res = await room.connect({ clientId, resumeToken: randomBytes(16), ...over })
  return new Inbox(transportOf(socketOf(res)))
}

describe('SessionObject: hibernation', () => {
  it('rebuilds connections from attachments: frames flow, seq continues and the roster is intact', async () => {
    const room = await roomWithKeys()
    const ctl = await open(room, IDS.controller, { controller: true })
    const token = randomBytes(16)
    const a = await open(room, IDS.playerA, { joinToken: room.joinToken, resumeToken: token })
    await a.nextOfType('relay.hello')
    a.send(
      frame({
        session: room.sessionId,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 2,
      }),
    )
    await ctl.until((e) => e.type === 'vote.cast', 'first frame')

    room.wake()
    a.send(
      frame({
        session: room.sessionId,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 2,
      }),
    ) // replay
    a.send(
      frame({
        session: room.sessionId,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 3,
      }),
    )
    await waitFor(() => ctl.routed.length === 2, 'the frame after waking')
    expect(ctl.routed.map((e) => e.seq)).toEqual([2, 3])
    expect(room.state.sql.count('envelopes')).toBe(2)

    const b = await open(room, IDS.playerB, { joinToken: room.joinToken })
    await b.nextOfType('relay.hello')
    const [presence] = await ctl.nextOfType('presence', 2)
    expect(presence!.payload.client).toBe(IDS.playerA)
    const ctl2 = await open(room, IDS.controller, { controller: true })
    const [hello] = await ctl2.nextOfType('relay.hello')
    const clients = (hello!.payload.clients as { client: string }[]).map((c) => c.client).sort()
    expect(clients).toEqual([IDS.controller, IDS.playerA, IDS.playerB].sort())
    expect(await ctl.closeCode()).toBe(1000)

    a.transport.close(1000, 'bye')
    await ctl2.until(
      (e) => e.type === 'presence' && e.payload.state === 'offline',
      'offline after close',
    )
  })
})

describe('SessionObject: retention', () => {
  it('sets the 72 h alarm at creation, ends the session when it fires, then forgets it an hour later', async () => {
    const room = await roomWithKeys()
    expect(room.state.alarm).toBe(START + RETENTION_MS)
    const a = await open(room, IDS.playerA, { joinToken: room.joinToken })
    await a.nextOfType('relay.hello')
    a.send(
      frame({
        session: room.sessionId,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 1,
      }),
    )
    await waitFor(() => room.state.sql.count('envelopes') === 1, 'stored')

    room.clock.now = START + RETENTION_MS - 1
    await room.object.alarm()
    expect(a.closed).toBeUndefined()
    expect(room.state.alarm).toBe(START + RETENTION_MS)

    room.clock.now = START + RETENTION_MS
    await room.object.alarm()
    expect(await a.closeCode()).toBe(CLOSE_CODES.SESSION_ENDED)
    expect(room.state.sql.count('envelopes')).toBe(0)
    expect(room.state.sql.count('meta')).toBe(1)
    expect(room.state.alarm).toBe(START + RETENTION_MS + TOMBSTONE_MS)
    const late = await open(room, IDS.playerB, { joinToken: room.joinToken })
    expect(await late.closeCode()).toBe(CLOSE_CODES.SESSION_ENDED)
    expect((await room.action('kick', { client: IDS.playerA })).status).toBe(410)

    room.clock.now = START + RETENTION_MS + TOMBSTONE_MS
    await room.object.alarm()
    expect(room.state.sql.count('meta')).toBe(0)
    expect(room.state.alarm).toBeNull()
    expect((await room.connect({ clientId: IDS.playerB, joinToken: room.joinToken })).status).toBe(
      404,
    )
  })

  it('end over HTTP closes everyone and schedules the tombstone alarm', async () => {
    const room = await roomWithKeys()
    const a = await open(room, IDS.playerA, { joinToken: room.joinToken })
    await a.nextOfType('relay.hello')
    room.clock.now = START + 60_000
    expect((await room.action('end')).status).toBe(204)
    expect(await a.closeCode()).toBe(CLOSE_CODES.SESSION_ENDED)
    expect(room.state.alarm).toBe(START + 60_000 + TOMBSTONE_MS)
    expect((await room.action('end')).status).toBe(410)
  })
})

describe('SessionObject: HTTP', () => {
  it('answers 404 for a session it does not hold and 409 for a second create', async () => {
    const room = await createRoom()
    const other = 'other-00000000000000000'.slice(0, 22)
    const res = await room.object.fetch(
      new Request(`https://relay/v1/sessions/${other}/ws`, { headers: { Upgrade: 'websocket' } }),
    )
    expect(res.status).toBe(404)
    const again = await room.object.fetch(
      new Request(`https://relay/v1/sessions/${room.sessionId}/create`, {
        method: 'POST',
        body: '{"v":1}',
      }),
    )
    expect(again.status).toBe(409)
    const bad = await room.object.fetch(
      new Request(`https://relay/v1/sessions/${'x'.repeat(22)}/create`, {
        method: 'POST',
        body: '{"v":2}',
      }),
    )
    expect(bad.status).toBe(400)
    expect((await room.object.fetch(new Request('https://relay/nothing'))).status).toBe(404)
  })

  it('refuses a non-upgrade on /ws with 426 and a missing client id with 400', async () => {
    const room = await createRoom()
    const plain = await room.object.fetch(
      new Request(`https://relay/v1/sessions/${room.sessionId}/ws`),
    )
    expect(plain.status).toBe(426)
    const noId = await room.object.fetch(
      new Request(`https://relay/v1/sessions/${room.sessionId}/ws?j=abc`, {
        headers: { Upgrade: 'websocket' },
      }),
    )
    expect(noId.status).toBe(400)
  })

  it('requires the controller token for actions, validates bodies, and mints co-controller tokens', async () => {
    const room = await roomWithKeys()
    expect((await room.action('kick', { client: IDS.playerA }, 'x'.repeat(43))).status).toBe(401)
    expect((await room.action('kick', { client: 'server' })).status).toBe(400)
    expect((await room.action('join-token', { joinTokenHash: 'nope' })).status).toBe(400)
    expect((await room.action('kick', { client: IDS.playerA })).status).toBe(204)
    const get = await room.object.fetch(
      new Request(`https://relay/v1/sessions/${room.sessionId}/kick`, {
        headers: { Authorization: `Bearer ${room.controllerToken}` },
      }),
    )
    expect(get.status).toBe(405)
    const co = await room.action('controllers')
    expect(co.status).toBe(201)
    const { controllerToken } = (await co.json()) as { controllerToken: string }
    expect(controllerToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect((await room.action('kick', { client: IDS.playerA }, controllerToken)).status).toBe(204)
    const asCo = await room.object.fetch(
      new Request(`https://relay/v1/sessions/${room.sessionId}/ws?c=${IDS.evaluator}`, {
        headers: { Upgrade: 'websocket', Authorization: `Bearer ${controllerToken}` },
      }),
    )
    const inbox = new Inbox(transportOf(socketOf(asCo)))
    const [hello] = await inbox.nextOfType('relay.hello')
    expect(hello!.payload.clients).toBeDefined()
  })

  it('create reports the relay caps, the retention deadline and a one-time controller token', async () => {
    const state = (await createRoom()).state
    expect(state.sql.count('meta')).toBe(1)
    const meta = JSON.parse(String(state.sql.exec(`SELECT value FROM meta`).one().value)) as {
      controllerTokenHashes: string[]
      expiresAt: number
      joinTokenHash: string
    }
    expect(meta.controllerTokenHashes[0]).toMatch(/^[a-f0-9]{64}$/)
    expect(meta.expiresAt).toBe(START + RETENTION_MS)
    expect(meta.joinTokenHash).toBe('')
  })
})

describe('SessionObject: log', () => {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
  afterEach(() => spy.mockClear())

  it('writes connection events as JSON lines without frames or tokens', async () => {
    const room = await roomWithKeys()
    const ctl = await open(room, IDS.controller, { controller: true })
    const a = await open(room, IDS.playerA, { joinToken: room.joinToken })
    await a.nextOfType('relay.hello')
    a.send(
      frame({
        session: room.sessionId,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 1,
        payload: { k: 's1', n: 'AAAAAAAAAAAAAAAA', c: 'VERYSECRET' },
      }),
    )
    await ctl.until((e) => e.type === 'vote.cast', 'routed')
    const bad = await open(room, IDS.playerB, { joinToken: randomBytes(16) })
    await bad.closeCode()
    const lines = spy.mock.calls.map((c) => String(c[0]))
    expect(lines.length).toBeGreaterThanOrEqual(3)
    for (const line of lines) {
      const parsed = JSON.parse(line) as { event: string; at: number }
      expect(parsed.event).toBeTruthy()
      expect(parsed.at).toBe(START)
    }
    const all = lines.join('\n')
    expect(all).not.toContain('VERYSECRET')
    expect(all).not.toContain(room.controllerToken)
    expect(all).not.toContain(toBase64Url(room.joinToken))
    expect(all).toContain('"remote":"203.0.113.7"')
    expect(all).toContain('BAD_JOIN_TOKEN')
  })
})
