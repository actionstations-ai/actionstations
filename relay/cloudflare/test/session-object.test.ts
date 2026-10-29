/**
 * The Durable Object under the shim: the shared conformance suite, then what the object adds to
 * the hub: hibernation (connections rebuilt from attachments), the retention and tombstone
 * alarms, the connection contract, the HTTP actions and their checks, and a log without frames.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toBase64Url } from '@shared/live/bytes'
import { SessionKeys } from '@shared/live/crypto/keys'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { IDS } from '@shared/live/fixtures/payloads'
import { CLOSE_CODES, PROTOCOL_VERSION } from '@shared/live/protocol'
import type { Envelope } from '@shared/live/schemas'
import { collect, describeServerContract, until } from '@shared/live/server-conformance'
import { randomBytes } from '@actionstations/relay-core'
import { MAX_CONTROLLER_TOKENS, RETENTION_MS, TOMBSTONE_MS } from '../src/env'
import { connectTransport, createRoom, sessionObjectFactory, START, type Room } from './do-harness'

vi.mock('../src/platform', async () => (await import('./shim')).platformShim)

const crypto = createWebCryptoProvider()

describeServerContract('SessionObject (Durable Object, shim)', sessionObjectFactory)

function frame(
  session: string,
  from: string,
  seq: number,
  to: string,
  type: string,
  payload: Record<string, unknown> = { k: 's1', n: 'AAAAAAAAAAAAAAAA', c: 'AAAA' },
): string {
  const e: Envelope = {
    v: PROTOCOL_VERSION,
    session,
    seq,
    from,
    to,
    type: type as Envelope['type'],
    ts: START,
    payload,
  }
  return JSON.stringify(e)
}

async function roomWithKeys(
  hub: Parameters<typeof createRoom>[0] extends infer O
    ? O extends { hub?: infer H }
      ? H
      : never
    : never = {},
) {
  const room = await createRoom({ hub })
  const keys = await SessionKeys.create(crypto, room.sessionId)
  await room.action('join-token', { joinTokenHash: await keys.joinTokenHash() })
  return Object.assign(room, { joinToken: await keys.joinToken() })
}

async function open(
  room: Room & { joinToken?: Uint8Array },
  clientId: string,
  over: { controller?: boolean; resumeToken?: Uint8Array; joinToken?: Uint8Array } = {},
) {
  const t = await connectTransport(room, {
    clientId,
    controller: over.controller,
    joinToken: over.controller ? undefined : (over.joinToken ?? room.joinToken),
    resumeToken: over.controller ? undefined : (over.resumeToken ?? randomBytes(16)),
  })
  return { t, got: collect(t) }
}

describe('SessionObject: hibernation', () => {
  it('rebuilds connections from attachments: frames flow, seq continues and the roster is intact', async () => {
    const room = await roomWithKeys()
    const ctl = await open(room, IDS.controller, { controller: true })
    const token = randomBytes(16)
    const a = await open(room, IDS.playerA, { resumeToken: token })
    await until(
      () => a.got.of('relay.hello').length === 1 && ctl.got.of('relay.hello').length === 1,
    )
    a.t.send(frame(room.sessionId, IDS.playerA, 2, 'controller', 'vote.cast'))
    await until(() => ctl.got.of('vote.cast').length === 1)

    room.wake()
    a.t.send(frame(room.sessionId, IDS.playerA, 2, 'controller', 'vote.cast')) // replay
    a.t.send(frame(room.sessionId, IDS.playerA, 3, 'controller', 'vote.cast'))
    await until(() => ctl.got.of('vote.cast').length === 2)
    expect(ctl.got.of('vote.cast').map((e) => e.seq)).toEqual([2, 3])
    expect(room.lastIndex()).toBe(2)

    const b = await open(room, IDS.playerB)
    await until(() => b.got.of('relay.hello').length === 1)
    await until(() => ctl.got.of('presence').length === 2)
    const ctl2 = await open(room, IDS.controller, { controller: true })
    await until(() => ctl2.got.of('relay.hello').length === 1)
    const clients = (
      ctl2.got.of('relay.hello')[0]!.payload as { clients: { client: string }[] }
    ).clients
      .map((c) => c.client)
      .sort()
    expect(clients).toEqual([IDS.controller, IDS.playerA, IDS.playerB].sort())
    await until(() => ctl.got.closes.length === 1)
    expect(ctl.got.closes[0]![0]).toBe(1000)
    a.t.close()
    await until(() =>
      ctl2.got.of('presence').some((e) => (e.payload as { state: string }).state === 'offline'),
    )
  })
})

describe('SessionObject: retention', () => {
  it('sets the 72 h alarm at creation, ends the session when it fires, then forgets it an hour later', async () => {
    const room = await roomWithKeys()
    expect(room.state.alarm).toBe(START + RETENTION_MS)
    const a = await open(room, IDS.playerA)
    await until(() => a.got.of('relay.hello').length === 1)
    a.t.send(frame(room.sessionId, IDS.playerA, 1, 'controller', 'vote.cast'))
    await until(() => room.lastIndex() === 1)

    room.clock.now = START + RETENTION_MS - 1
    await room.object.alarm()
    expect(a.got.closes).toHaveLength(0)
    expect(room.state.alarm).toBe(START + RETENTION_MS)

    room.clock.now = START + RETENTION_MS
    await room.object.alarm()
    await until(() => a.got.closes.length === 1)
    expect(a.got.closes[0]![0]).toBe(CLOSE_CODES.SESSION_ENDED)
    expect(room.lastIndex()).toBe(0)
    expect(room.state.sql.count('state')).toBeGreaterThan(0)
    expect(room.state.alarm).toBe(START + RETENTION_MS + TOMBSTONE_MS)
    const late = await open(room, IDS.playerB)
    await until(() => late.got.closes.length === 1)
    expect(late.got.closes[0]![0]).toBe(CLOSE_CODES.SESSION_ENDED)
    expect((await room.action('kick', { client: IDS.playerA })).status).toBe(410)

    room.clock.now = START + RETENTION_MS + TOMBSTONE_MS
    await room.object.alarm()
    expect(room.state.sql.count('state')).toBe(0)
    expect(room.state.alarm).toBeNull()
    expect(
      (
        await room.connect({
          clientId: IDS.playerB,
          joinToken: room.joinToken,
          resumeToken: randomBytes(16),
        })
      ).status,
    ).toBe(404)
  })

  it('end over HTTP closes everyone and schedules the tombstone alarm', async () => {
    const room = await roomWithKeys()
    const a = await open(room, IDS.playerA)
    await until(() => a.got.of('relay.hello').length === 1)
    room.clock.now = START + 60_000
    expect((await room.action('end')).status).toBe(204)
    await until(() => a.got.closes.length === 1)
    expect(a.got.closes[0]![0]).toBe(CLOSE_CODES.SESSION_ENDED)
    expect(room.state.alarm).toBe(START + 60_000 + TOMBSTONE_MS)
    expect((await room.action('end')).status).toBe(410)
  })
})

describe('SessionObject: the connection contract', () => {
  it('refuses tokens in the query string, a missing subprotocol, a bad client id and a bad controller token', async () => {
    const room = await roomWithKeys()
    const j = toBase64Url(room.joinToken)
    const r = toBase64Url(randomBytes(16))
    expect(
      (await room.connect({ clientId: IDS.playerA }, { query: { j, r }, protocols: 'as-live.v1' }))
        .status,
    ).toBe(403)
    expect(
      (await room.connect({ clientId: IDS.playerA }, { protocols: `j.${j}, r.${r}` })).status,
    ).toBe(400)
    expect((await room.connect({ clientId: 'short' }, { protocols: 'as-live.v1' })).status).toBe(
      400,
    )
    const bad = await room.object.fetch(
      new Request(`https://relay/v1/sessions/${room.sessionId}/ws?client=${IDS.controller}`, {
        headers: {
          Upgrade: 'websocket',
          'Sec-WebSocket-Protocol': 'as-live.v1',
          Authorization: 'Bearer ' + 'x'.repeat(43),
        },
      }),
    )
    expect(bad.status).toBe(401)
    const plain = await room.object.fetch(
      new Request(`https://relay/v1/sessions/${room.sessionId}/ws?client=${IDS.playerA}`),
    )
    expect(plain.status).toBe(426)
    const good = await room.connect({
      clientId: IDS.playerA,
      joinToken: room.joinToken,
      resumeToken: randomBytes(16),
    })
    expect(good.status).toBe(101)
    expect(good.headers.get('Sec-WebSocket-Protocol')).toBe('as-live.v1')
  })
})

describe('SessionObject: HTTP', () => {
  it('answers 404 for a session it does not hold and 409 for a second create', async () => {
    const room = await createRoom()
    const other = 'other-00000000000000000'.slice(0, 22)
    expect(
      (
        await room.object.fetch(
          new Request(`https://relay/v1/sessions/${other}/ws`, {
            headers: { Upgrade: 'websocket' },
          }),
        )
      ).status,
    ).toBe(404)
    expect(
      (
        await room.object.fetch(
          new Request(`https://relay/v1/sessions/${room.sessionId}/create`, {
            method: 'POST',
            body: '{"v":1}',
          }),
        )
      ).status,
    ).toBe(409)
    expect(
      (
        await room.object.fetch(
          new Request(`https://relay/v1/sessions/${'x'.repeat(22)}/create`, {
            method: 'POST',
            body: '{"v":2}',
          }),
        )
      ).status,
    ).toBe(400)
    expect((await room.object.fetch(new Request('https://relay/nothing'))).status).toBe(404)
    expect(
      (await room.object.fetch(new Request(`https://relay/v1/sessions/${room.sessionId}/events`)))
        .status,
    ).toBe(404)
  })

  it('requires the controller token for actions, validates bodies, rate-limits actions and caps controller tokens', async () => {
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
    const tokens: string[] = []
    for (let i = 1; i < MAX_CONTROLLER_TOKENS; i++) {
      const co = await room.action('controllers')
      expect(co.status).toBe(201)
      tokens.push(((await co.json()) as { controllerToken: string }).controllerToken)
    }
    expect((await room.action('controllers')).status).toBe(409)
    expect((await room.action('kick', { client: IDS.playerA }, tokens[0])).status).toBe(204)
    const asCo = await room.object.fetch(
      new Request(`https://relay/v1/sessions/${room.sessionId}/ws?client=${IDS.evaluator}`, {
        headers: {
          Upgrade: 'websocket',
          'Sec-WebSocket-Protocol': 'as-live.v1',
          Authorization: `Bearer ${tokens[0]}`,
        },
      }),
    )
    expect(asCo.status).toBe(101)
    let limited: Response | undefined
    for (let i = 0; i < 70 && !limited; i++) {
      const res = await room.action('kick', { client: IDS.playerA })
      if (res.status === 429) limited = res
    }
    expect(limited?.headers.get('Retry-After')).toBeTruthy()
  })
})

describe('SessionObject: log', () => {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
  afterEach(() => spy.mockClear())

  it('writes connection events as JSON lines without frames or tokens', async () => {
    const room = await roomWithKeys()
    const ctl = await open(room, IDS.controller, { controller: true })
    const a = await open(room, IDS.playerA)
    await until(
      () => a.got.of('relay.hello').length === 1 && ctl.got.of('relay.hello').length === 1,
    )
    a.t.send(
      frame(room.sessionId, IDS.playerA, 1, 'controller', 'vote.cast', {
        k: 's1',
        n: 'AAAAAAAAAAAAAAAA',
        c: 'VERYSECRET',
      }),
    )
    await until(() => ctl.got.of('vote.cast').length === 1)
    const bad = await open(room, IDS.playerB, { joinToken: randomBytes(16) })
    await until(() => bad.got.closes.length === 1)
    const lines = spy.mock.calls.map((c) => String(c[0]))
    expect(lines.length).toBeGreaterThanOrEqual(3)
    for (const line of lines) expect((JSON.parse(line) as { type: string }).type).toBeTruthy()
    const all = lines.join('\n')
    expect(all).not.toContain('VERYSECRET')
    expect(all).not.toContain(room.controllerToken)
    expect(all).not.toContain(toBase64Url(room.joinToken))
    expect(all).toContain('"type":"refused"')
  })
})
