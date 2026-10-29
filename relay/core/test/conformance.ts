/**
 * The server conformance suite: one set of tests for the server contract of spec 0406, run
 * against every implementation (`MemoryServer` in `src/shared/live`, `SessionHub` on each store,
 * the Cloudflare Durable Object, the Node server over real sockets, the LAN server). A harness
 * wraps an implementation as a `ConformanceServer`; the suite only ever talks `Transport`.
 *
 * The suite asks for small caps (`TEST_LIMITS`) so the "full" and "quota" cases are reachable;
 * a harness that cannot change caps leaves `limits` alone and those two cases skip.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { toBase64Url } from '@shared/live/bytes'
import { seal } from '@shared/live/codec'
import { SessionKeys } from '@shared/live/crypto/keys'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { IDS, NONCE, PAYLOAD_FIXTURES } from '@shared/live/fixtures/payloads'
import {
  CLOSE_CODES,
  PROTOCOL_VERSION,
  type ConnectionKind,
  type Limits,
} from '@shared/live/protocol'
import type { ClientId, Envelope } from '@shared/live/schemas/envelope'
import type { RelayErrorCode } from '@shared/live/schemas/relay'
import type { Transport } from '@shared/live/transport'
import { HUB_LIMITS, type HubLimits } from '../src/limits'
import { randomBytes } from '../src/tokens'

export interface ConnectOptions {
  clientId: string
  joinToken?: Uint8Array
  resumeToken?: Uint8Array
  controller?: boolean
}

export interface ConformanceServer {
  readonly sessionId: string
  readonly limits: Limits
  connect(opts: ConnectOptions): Promise<Transport>
  kick(clientId: string): void | Promise<void>
  setJoinTokenHash(hex: string): void | Promise<void>
  end(): void | Promise<void>
  storedCount(): number | Promise<number>
  /** Release sockets, files or timers the harness holds. */
  close?(): void | Promise<void>
}

export interface ConformanceOptions {
  kind: ConnectionKind
  /** Caps the suite would like; a harness applies what it can. */
  limits: Partial<HubLimits>
}

export type ConformanceFactory = (opts: ConformanceOptions) => Promise<ConformanceServer>

/** Small enough to reach every cap in a test, generous rates so chunk uploads are not throttled. */
export function testLimits(kind: ConnectionKind): Partial<HubLimits> {
  const base = HUB_LIMITS[kind]
  return {
    clients: 4,
    blobsTotalBytes: base.playerBlobBytes + 2 * base.chunkBytes,
    rates: HUB_LIMITS.lan.rates,
  }
}

const crypto = createWebCryptoProvider()
const SEALED = { k: 's1', n: NONCE, c: 'AAAA' }

interface FrameInput {
  session: string
  from: ClientId
  to: string
  type: Envelope['type']
  seq: number
  payload?: Record<string, unknown>
}

export function frame(input: FrameInput): string {
  const envelope: Envelope = {
    v: PROTOCOL_VERSION,
    session: input.session,
    seq: input.seq,
    from: input.from,
    to: input.to,
    type: input.type,
    ts: 1_700_000_000_000,
    payload: input.payload ?? SEALED,
  }
  return JSON.stringify(envelope)
}

export async function waitFor(check: () => boolean, what: string, timeoutMs = 3000): Promise<void> {
  const until = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 5))
  }
}

/** A received envelope with its payload as the plain object a test inspects. */
export type Frame = Omit<Envelope, 'payload'> & { payload: Record<string, unknown> }

/** Collects what a transport delivers, so a test can wait for a frame or a close. */
export class Inbox {
  readonly frames: Frame[] = []
  readonly raw: string[] = []
  closed: { code: number; reason: string } | undefined

  constructor(readonly transport: Transport) {
    transport.onFrame((f) => {
      this.raw.push(f)
      this.frames.push(JSON.parse(f) as Frame)
    })
    transport.onClose((code, reason) => (this.closed = { code, reason }))
  }

  send(f: string): void {
    this.transport.send(f)
  }

  ofType(type: Envelope['type']): Frame[] {
    return this.frames.filter((e) => e.type === type)
  }

  async until(pred: (e: Frame) => boolean, what: string): Promise<Frame> {
    await waitFor(() => this.frames.some(pred), what)
    return this.frames.find(pred)!
  }

  async nextOfType(type: Envelope['type'], count = 1): Promise<Frame[]> {
    await waitFor(() => this.ofType(type).length >= count, `${count} × ${type}`)
    return this.ofType(type)
  }

  async error(code: RelayErrorCode): Promise<Frame> {
    return this.until(
      (e) => e.type === 'relay.error' && e.payload.code === code,
      `relay.error ${code}`,
    )
  }

  async closeCode(): Promise<number> {
    await waitFor(() => this.closed !== undefined, 'close')
    return this.closed!.code
  }

  /** Frames that are not server frames: what was routed to this client. */
  get routed(): Frame[] {
    return this.frames.filter((e) => e.from !== 'server')
  }
}

export function describeServerConformance(name: string, factory: ConformanceFactory): void {
  describe(`${name}: server contract (spec 0406)`, () => {
    const servers: ConformanceServer[] = []
    afterEach(async () => {
      for (const s of servers.splice(0)) await s.close?.()
    })

    async function room(kind: ConnectionKind = 'relay') {
      const server = await factory({ kind, limits: testLimits(kind) })
      servers.push(server)
      const keys = await SessionKeys.create(crypto, server.sessionId)
      await server.setJoinTokenHash(await keys.joinTokenHash())
      const joinToken = await keys.joinToken()
      const session = server.sessionId
      const connect = async (
        clientId: string,
        over: Partial<ConnectOptions> = {},
      ): Promise<Inbox> =>
        new Inbox(
          await server.connect({
            clientId,
            joinToken,
            resumeToken: randomBytes(16),
            ...over,
          }),
        )
      const controller = await connect(IDS.controller, { controller: true, joinToken: undefined })
      await controller.nextOfType('relay.hello')
      const send = (inbox: Inbox, input: Omit<FrameInput, 'session'>) =>
        inbox.send(frame({ session, ...input }))
      return { server, keys, joinToken, session, connect, controller, send }
    }

    it('hello tells the controller the caps, the index and the roster; a participant sees no roster', async () => {
      const r = await room()
      const [hello] = r.controller.ofType('relay.hello')
      expect(hello!.from).toBe('server')
      expect(hello!.seq).toBe(0)
      expect(hello!.payload).toMatchObject({
        index: 0,
        yourLastSeq: 0,
        caps: r.server.limits,
        clients: [{ client: IDS.controller }],
      })
      expect((hello!.payload.server as { kind: string }).kind).toBe('relay')
      expect((hello!.payload.server as { protocol: number[] }).protocol).toContain(PROTOCOL_VERSION)
      const a = await r.connect(IDS.playerA)
      const [helloA] = await a.nextOfType('relay.hello')
      expect(helloA!.payload.clients).toBeUndefined()
      expect(helloA!.payload).toMatchObject({ index: 0, yourLastSeq: 0 })
    })

    it('refuses a bad or missing join token with BAD_JOIN_TOKEN and close 4001', async () => {
      const r = await room()
      const wrong = await r.connect(IDS.playerA, { joinToken: randomBytes(16) })
      await wrong.error('BAD_JOIN_TOKEN')
      expect(await wrong.closeCode()).toBe(CLOSE_CODES.BAD_JOIN_TOKEN)
      const missing = await r.connect(IDS.playerB, { joinToken: undefined })
      expect(await missing.closeCode()).toBe(CLOSE_CODES.BAD_JOIN_TOKEN)
      expect(r.controller.ofType('presence')).toHaveLength(0)
    })

    it('binds a client id to its resume token: no token or another device is refused with 4005', async () => {
      const r = await room()
      const noToken = await r.connect(IDS.playerA, { resumeToken: undefined })
      await noToken.error('BAD_RESUME_TOKEN')
      expect(await noToken.closeCode()).toBe(CLOSE_CODES.CLIENT_ID_IN_USE)
      const token = randomBytes(16)
      const owner = await r.connect(IDS.playerA, { resumeToken: token })
      await owner.nextOfType('relay.hello')
      const thief = await r.connect(IDS.playerA, { resumeToken: randomBytes(16) })
      expect(await thief.closeCode()).toBe(CLOSE_CODES.CLIENT_ID_IN_USE)
      expect(owner.closed).toBeUndefined()
    })

    it('refuses a participant who claims the controller client id', async () => {
      const r = await room()
      const fake = await r.connect(IDS.controller)
      await fake.error('BAD_RESUME_TOKEN')
      expect(await fake.closeCode()).toBe(CLOSE_CODES.CLIENT_ID_IN_USE)
      expect(r.controller.closed).toBeUndefined()
    })

    it('lets the same device reconnect with its token, replaces the old socket and keeps its seq', async () => {
      const r = await room()
      const token = randomBytes(16)
      const first = await r.connect(IDS.playerA, { resumeToken: token })
      await first.nextOfType('relay.hello')
      r.send(first, { from: IDS.playerA, to: 'controller', type: 'inject.receipt', seq: 7 })
      await r.controller.until((e) => e.type === 'inject.receipt', 'receipt at the controller')
      const second = await r.connect(IDS.playerA, { resumeToken: token })
      const [hello] = await second.nextOfType('relay.hello')
      expect(hello!.payload.yourLastSeq).toBe(7)
      expect(hello!.payload.index).toBe(1)
      expect(await first.closeCode()).toBe(1000)
      // A replaced socket is not a presence change.
      await r.controller.until((e) => e.type === 'presence', 'presence online')
      expect(r.controller.ofType('presence').map((e) => e.payload.state)).toEqual(['online'])
    })

    it('routes all and role: to everyone but the sender, client: to one, controller to controllers only', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      const b = await r.connect(IDS.playerB)
      await a.nextOfType('relay.hello')
      await b.nextOfType('relay.hello')
      r.send(r.controller, { from: IDS.controller, to: 'all', type: 'clock.state', seq: 1 })
      r.send(r.controller, { from: IDS.controller, to: 'role:ops', type: 'inject.release', seq: 2 })
      r.send(r.controller, {
        from: IDS.controller,
        to: `client:${IDS.playerA}`,
        type: 'welcome',
        seq: 3,
      })
      r.send(a, { from: IDS.playerA, to: 'controller', type: 'vote.cast', seq: 1 })
      r.send(a, { from: IDS.playerA, to: 'all', type: 'message.send', seq: 2 })
      await waitFor(() => b.routed.length === 3, 'B receives 3')
      await waitFor(() => r.controller.routed.length === 2, 'controller receives 2')
      // A never gets its own `all` frame back.
      expect(a.routed.map((e) => e.type)).toEqual(['clock.state', 'inject.release', 'welcome'])
      expect(b.routed.map((e) => e.type)).toEqual(['clock.state', 'inject.release', 'message.send'])
      expect(r.controller.routed.map((e) => e.type)).toEqual(['vote.cast', 'message.send'])
    })

    it('refuses a frame whose from is not the connection, including from: server', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      r.send(a, { from: IDS.playerB, to: 'controller', type: 'vote.cast', seq: 1 })
      await a.error('INVALID')
      r.send(a, {
        from: 'server',
        to: `client:${IDS.playerA}`,
        type: 'relay.error',
        seq: 0,
        payload: { code: 'INVALID', message: 'x' },
      })
      await waitFor(() => a.ofType('relay.error').length === 2, 'second INVALID')
      r.send(a, { from: IDS.playerA, to: 'controller', type: 'vote.cast', seq: 1 })
      await r.controller.until((e) => e.type === 'vote.cast', 'the real frame')
      expect(r.controller.routed).toHaveLength(1)
    })

    it('drops a replayed or lower seq silently', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      r.send(a, { from: IDS.playerA, to: 'controller', type: 'vote.cast', seq: 5 })
      r.send(a, { from: IDS.playerA, to: 'controller', type: 'vote.cast', seq: 5 })
      r.send(a, { from: IDS.playerA, to: 'controller', type: 'vote.cast', seq: 3 })
      r.send(a, { from: IDS.playerA, to: 'controller', type: 'vote.cast', seq: 6 })
      await waitFor(() => r.controller.routed.length === 2, 'two accepted frames')
      expect(r.controller.routed.map((e) => e.seq)).toEqual([5, 6])
      expect(a.ofType('relay.error')).toHaveLength(0)
      expect(await r.server.storedCount()).toBe(2)
    })

    it('refuses controller-only types from a participant with NOT_CONTROLLER', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      const b = await r.connect(IDS.playerB)
      await b.nextOfType('relay.hello')
      r.send(a, { from: IDS.playerA, to: 'all', type: 'clock.state', seq: 1 })
      r.send(a, { from: IDS.playerA, to: 'all', type: 'session.end', seq: 2 })
      await waitFor(() => a.ofType('relay.error').length === 2, 'two refusals')
      expect(a.ofType('relay.error').map((e) => e.payload.code)).toEqual([
        'NOT_CONTROLLER',
        'NOT_CONTROLLER',
      ])
      r.send(a, { from: IDS.playerA, to: 'all', type: 'message.send', seq: 3 })
      await b.until((e) => e.type === 'message.send', 'B gets the message')
      expect(b.routed).toHaveLength(1)
      expect(await r.server.storedCount()).toBe(1)
    })

    it('refuses server frame types from a client and frames for another session', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      r.send(a, {
        from: IDS.playerA,
        to: 'controller',
        type: 'presence',
        seq: 1,
        payload: { client: IDS.playerA, state: 'online', at: 1 },
      })
      await a.error('INVALID')
      a.send(
        frame({
          session: 'other-00000000000000000'.slice(0, 22),
          from: IDS.playerA,
          to: 'controller',
          type: 'vote.cast',
          seq: 2,
        }),
      )
      await waitFor(() => a.ofType('relay.error').length === 2, 'second refusal')
      expect(await r.server.storedCount()).toBe(0)
    })

    it('refuses an oversize frame with TOO_LARGE and anything that is not an envelope with INVALID', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      const big = frame({
        session: r.session,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 1,
        payload: { k: 's1', n: NONCE, c: 'A'.repeat(r.server.limits.envelopeBytes) },
      })
      a.send(big)
      await a.error('TOO_LARGE')
      a.send('not json')
      a.send(JSON.stringify({ v: 1, hello: 'x' }))
      a.send(
        frame({
          session: r.session,
          from: IDS.playerA,
          to: 'controller',
          type: 'vote.cast',
          seq: 2,
        }).replace('"ts"', '"extra":1,"ts"'),
      )
      await waitFor(() => a.ofType('relay.error').length === 4, 'four refusals')
      expect(a.ofType('relay.error').map((e) => e.payload.code)).toEqual([
        'TOO_LARGE',
        'INVALID',
        'INVALID',
        'INVALID',
      ])
    })

    it('stores frames with arrival indexes and answers catch-up by destination, never with own frames', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      r.send(r.controller, { from: IDS.controller, to: 'all', type: 'clock.state', seq: 1 })
      r.send(r.controller, {
        from: IDS.controller,
        to: `client:${IDS.playerB}`,
        type: 'welcome',
        seq: 2,
      })
      r.send(a, { from: IDS.playerA, to: 'controller', type: 'inject.receipt', seq: 1 })
      r.send(r.controller, { from: IDS.controller, to: 'role:ops', type: 'inject.release', seq: 3 })
      await r.controller.until((e) => e.type === 'inject.receipt', 'receipt')
      await waitFor(() => a.routed.length === 2, 'A live frames')
      expect(await r.server.storedCount()).toBe(4)

      const b = await r.connect(IDS.playerB)
      const [helloB] = await b.nextOfType('relay.hello')
      expect(helloB!.payload.index).toBe(4)
      r.send(b, {
        from: IDS.playerB,
        to: 'controller',
        type: 'catchup.request',
        seq: 1,
        payload: { after: 0 },
      })
      const [batch] = await b.nextOfType('catchup.batch')
      const entries = batch!.payload.entries as { i: number; e: Envelope }[]
      expect(batch!.payload).toMatchObject({ from: 0, to: 4, done: true })
      expect(entries.map((x) => [x.i, x.e.type])).toEqual([
        [1, 'clock.state'],
        [2, 'welcome'],
        [4, 'inject.release'],
      ])

      r.send(a, {
        from: IDS.playerA,
        to: 'controller',
        type: 'catchup.request',
        seq: 2,
        payload: { after: 0 },
      })
      const [batchA] = await a.nextOfType('catchup.batch')
      const entriesA = batchA!.payload.entries as { i: number; e: Envelope }[]
      expect(entriesA.map((x) => x.i)).toEqual([1, 4])

      const ctl2 = await r.connect(IDS.controller, { controller: true, joinToken: undefined })
      await ctl2.nextOfType('relay.hello')
      r.send(ctl2, {
        from: IDS.controller,
        to: 'controller',
        type: 'catchup.request',
        seq: 4,
        payload: { after: 2 },
      })
      const [batchC] = await ctl2.nextOfType('catchup.batch')
      const entriesC = batchC!.payload.entries as { i: number; e: Envelope }[]
      expect(batchC!.payload).toMatchObject({ from: 2, to: 4, done: true })
      expect(entriesC.map((x) => [x.i, x.e.type])).toEqual([[3, 'inject.receipt']])
    })

    it('pages catch-up by limit, marks the last batch done, and answers an empty store with one empty batch', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      r.send(a, {
        from: IDS.playerA,
        to: 'controller',
        type: 'catchup.request',
        seq: 1,
        payload: { after: 0 },
      })
      const [empty] = await a.nextOfType('catchup.batch')
      expect(empty!.payload).toEqual({ from: 0, to: 0, entries: [], done: true })
      for (let i = 1; i <= 5; i++) {
        r.send(r.controller, { from: IDS.controller, to: 'all', type: 'clock.state', seq: i })
      }
      await waitFor(() => a.routed.length === 5, 'five live frames')
      r.send(a, {
        from: IDS.playerA,
        to: 'controller',
        type: 'catchup.request',
        seq: 2,
        payload: { after: 1, limit: 2 },
      })
      const batches = await a.nextOfType('catchup.batch', 3)
      expect(batches.slice(1).map((b) => [b.payload.from, b.payload.to, b.payload.done])).toEqual([
        [1, 3, false],
        [3, 5, true],
      ])
      const indexes = batches
        .slice(1)
        .flatMap((b) => (b.payload.entries as { i: number }[]).map((x) => x.i))
      expect(indexes).toEqual([2, 3, 4, 5])
      r.send(a, {
        from: IDS.playerA,
        to: 'controller',
        type: 'catchup.request',
        seq: 3,
        payload: { after: 9 },
      })
      const after9 = await a.until(
        (e) => e.type === 'catchup.batch' && e.payload.from === 9,
        'batch after 9',
      )
      expect(after9.payload).toEqual({ from: 9, to: 9, entries: [], done: true })
    })

    it('does not store ephemeral frames', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      r.send(a, {
        from: IDS.playerA,
        to: 'controller',
        type: 'catchup.request',
        seq: 1,
        payload: { after: 0 },
      })
      r.send(a, {
        from: IDS.playerA,
        to: 'controller',
        type: 'relay.blob.get',
        seq: 2,
        payload: { blobId: IDS.blob },
      })
      await a.error('BLOB_UNKNOWN')
      expect(await r.server.storedCount()).toBe(0)
    })

    it('tells controllers, and only controllers, who comes and goes', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      const b = await r.connect(IDS.playerB)
      await b.nextOfType('relay.hello')
      await r.controller.nextOfType('presence', 2)
      b.transport.close(1000, 'bye')
      await r.controller.nextOfType('presence', 3)
      expect(
        r.controller.ofType('presence').map((e) => [e.payload.client, e.payload.state]),
      ).toEqual([
        [IDS.playerA, 'online'],
        [IDS.playerB, 'online'],
        [IDS.playerB, 'offline'],
      ])
      r.send(r.controller, { from: IDS.controller, to: 'all', type: 'clock.state', seq: 1 })
      await a.until((e) => e.type === 'clock.state', 'a later frame')
      expect(a.ofType('presence')).toHaveLength(0)
    })

    it('stores blob chunks in any order, reports done, serves them back, and refuses unknown blobs', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      const chunks = [0, 1, 2].map((i) => toBase64Url(randomBytes(300 + i)))
      let seq = 0
      for (const index of [2, 0, 1]) {
        r.send(r.controller, {
          from: IDS.controller,
          to: 'controller',
          type: 'relay.blob.put',
          seq: ++seq,
          payload: { blobId: IDS.blob, index, count: 3, bytes: chunks[index] },
        })
      }
      const [done] = await r.controller.nextOfType('relay.blob.done')
      expect(done!.payload).toEqual({ blobId: IDS.blob, stored: true, totalBytes: 300 + 301 + 302 })
      r.send(a, {
        from: IDS.playerA,
        to: 'controller',
        type: 'relay.blob.get',
        seq: 1,
        payload: { blobId: IDS.blob },
      })
      const got = await a.nextOfType('relay.blob.chunk', 3)
      // Any order is fine (the assembler sorts); every chunk must come back once.
      const byIndex = [...got].sort(
        (x, y) => (x.payload.index as number) - (y.payload.index as number),
      )
      expect(byIndex.map((e) => e.payload.bytes)).toEqual(chunks)
      expect(got.every((e) => e.payload.count === 3)).toBe(true)
      r.send(a, {
        from: IDS.playerA,
        to: 'controller',
        type: 'relay.blob.get',
        seq: 2,
        payload: { blobId: IDS.vote },
      })
      const err = await a.error('BLOB_UNKNOWN')
      expect(err.payload.blobId).toBe(IDS.vote)
      expect(await r.server.storedCount()).toBe(0)
    })

    it('refuses a chunk out of range, a changed count, a chunk over the cap and another client’s blob; ignores a duplicate', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      const bytes = toBase64Url(randomBytes(100))
      const put = (inbox: Inbox, from: ClientId, seq: number, payload: Record<string, unknown>) =>
        r.send(inbox, { from, to: 'controller', type: 'relay.blob.put', seq, payload })
      put(r.controller, IDS.controller, 1, { blobId: IDS.blob, index: 0, count: 2, bytes })
      put(r.controller, IDS.controller, 2, { blobId: IDS.blob, index: 0, count: 2, bytes }) // duplicate: ignored
      put(r.controller, IDS.controller, 3, { blobId: IDS.blob, index: 2, count: 2, bytes })
      put(r.controller, IDS.controller, 4, { blobId: IDS.blob, index: 1, count: 3, bytes })
      put(r.controller, IDS.controller, 5, {
        blobId: IDS.vote,
        index: 0,
        count: 1,
        bytes: toBase64Url(randomBytes(r.server.limits.chunkBytes + 1)),
      })
      put(a, IDS.playerA, 1, { blobId: IDS.blob, index: 1, count: 2, bytes })
      await waitFor(
        () => r.controller.ofType('relay.error').length === 3,
        'three controller refusals',
      )
      expect(r.controller.ofType('relay.error').map((e) => e.payload.code)).toEqual([
        'INVALID',
        'INVALID',
        'TOO_LARGE',
      ])
      const theirs = await a.error('INVALID')
      expect(theirs.payload.blobId).toBe(IDS.blob)
      put(r.controller, IDS.controller, 6, { blobId: IDS.blob, index: 1, count: 2, bytes })
      const [done] = await r.controller.nextOfType('relay.blob.done')
      expect(done!.payload.totalBytes).toBe(200)
    })

    it('refuses a player blob over the player cap with BLOB_TOO_LARGE and forgets it', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      const { playerBlobBytes, chunkBytes } = r.server.limits
      const count = Math.ceil((playerBlobBytes + 17) / chunkBytes)
      const chunk = toBase64Url(randomBytes(chunkBytes))
      for (let index = 0; index < count; index++) {
        r.send(a, {
          from: IDS.playerA,
          to: 'controller',
          type: 'relay.blob.put',
          seq: index + 1,
          payload: { blobId: IDS.blob, index, count, bytes: chunk },
        })
      }
      const err = await a.error('BLOB_TOO_LARGE')
      expect(err.payload.blobId).toBe(IDS.blob)
      expect(a.ofType('relay.blob.done')).toHaveLength(0)
      r.send(a, {
        from: IDS.playerA,
        to: 'controller',
        type: 'relay.blob.get',
        seq: count + 1,
        payload: { blobId: IDS.blob },
      })
      await a.error('BLOB_UNKNOWN')
    })

    it('refuses a blob that would exceed the session quota with BLOB_QUOTA (when the harness honours caps)', async (ctx) => {
      const r = await room()
      const { blobsTotalBytes, chunkBytes, blobBytes } = r.server.limits
      if (blobsTotalBytes > blobBytes) return ctx.skip()
      const count = Math.ceil((blobsTotalBytes + 1) / chunkBytes)
      const chunk = toBase64Url(randomBytes(chunkBytes))
      for (let index = 0; index < count; index++) {
        r.send(r.controller, {
          from: IDS.controller,
          to: 'controller',
          type: 'relay.blob.put',
          seq: index + 1,
          payload: { blobId: IDS.blob, index, count, bytes: chunk },
        })
      }
      await r.controller.error('BLOB_QUOTA')
      expect(r.controller.ofType('relay.blob.done')).toHaveLength(0)
    })

    it('refuses a connection past the client cap with SESSION_FULL (when the harness honours caps)', async (ctx) => {
      const r = await room()
      if (r.server.limits.clients > 8) return ctx.skip()
      const ids = [
        'playerA',
        'playerB',
        'evaluator',
        'release',
        'vote',
        'survey',
        'item',
        'message',
      ] as const
      let full: Inbox | undefined
      for (let i = 0; i < r.server.limits.clients; i++) {
        const inbox = await r.connect(IDS[ids[i]!])
        const first = await inbox.until(
          (e) => e.type === 'relay.hello' || e.type === 'relay.error',
          'hello or error',
        )
        if (first.type === 'relay.error') {
          full = inbox
          break
        }
      }
      expect(full, 'the connection that made it one too many').toBeDefined()
      expect(full!.frames[0]!.payload.code).toBe('SESSION_FULL')
      expect(await full!.closeCode()).toBe(CLOSE_CODES.SESSION_FULL)
    })

    it('kick closes the client with 4003 and tells the controller it went offline', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      await r.controller.nextOfType('presence')
      await r.server.kick(IDS.playerA)
      expect(await a.closeCode()).toBe(CLOSE_CODES.KICKED)
      await r.controller.nextOfType('presence', 2)
      expect(r.controller.ofType('presence')[1]!.payload).toMatchObject({
        client: IDS.playerA,
        state: 'offline',
      })
    })

    it('end closes everyone with 4002, deletes the store, and refuses new connections with SESSION_ENDED', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      r.send(r.controller, { from: IDS.controller, to: 'all', type: 'session.end', seq: 1 })
      await a.until((e) => e.type === 'session.end', 'the end frame')
      expect(await r.server.storedCount()).toBe(1)
      await r.server.end()
      expect(await a.closeCode()).toBe(CLOSE_CODES.SESSION_ENDED)
      expect(await r.controller.closeCode()).toBe(CLOSE_CODES.SESSION_ENDED)
      expect(await r.server.storedCount()).toBe(0)
      const late = await r.connect(IDS.playerB)
      await late.error('SESSION_ENDED')
      expect(await late.closeCode()).toBe(CLOSE_CODES.SESSION_ENDED)
    })

    it('a new join-token hash refuses the old token and admits the new one', async () => {
      const r = await room()
      const rotated = await SessionKeys.create(crypto, r.session)
      await r.server.setJoinTokenHash(await rotated.joinTokenHash())
      const old = await r.connect(IDS.playerA)
      expect(await old.closeCode()).toBe(CLOSE_CODES.BAD_JOIN_TOKEN)
      const fresh = await r.connect(IDS.playerB, { joinToken: await rotated.joinToken() })
      await fresh.nextOfType('relay.hello')
      expect(fresh.closed).toBeUndefined()
    })

    it('routes payloads unchanged without reading them: garbage objects and real sealed frames alike', async () => {
      const r = await room()
      const a = await r.connect(IDS.playerA)
      await a.nextOfType('relay.hello')
      const garbage = frame({
        session: r.session,
        from: IDS.playerA,
        to: 'controller',
        type: 'vote.cast',
        seq: 1,
        payload: { anything: [1, { nested: true }], c: 42 },
      })
      a.send(garbage)
      await r.controller.until((e) => e.type === 'vote.cast', 'garbage routed')
      expect(r.controller.raw).toContain(garbage)

      const signing = await crypto.ecdsaGenerate()
      const header = {
        v: PROTOCOL_VERSION,
        session: r.session,
        seq: 1,
        from: IDS.controller,
        to: 'all',
        ts: Date.now(),
      } as const
      const sealed = await seal(
        crypto,
        r.keys,
        { ...header, type: 'clock.state' },
        PAYLOAD_FIXTURES['clock.state'],
        {
          signer: signing.privateKey,
        },
      )
      const text = JSON.stringify(sealed)
      r.controller.send(text)
      await a.until((e) => e.type === 'clock.state', 'sealed frame routed')
      expect(a.raw).toContain(text)
      const toController = await seal(
        crypto,
        r.keys,
        { ...header, from: IDS.playerA, to: 'controller', seq: 2, type: 'hotwash.item' },
        PAYLOAD_FIXTURES['hotwash.item'],
      )
      a.send(JSON.stringify(toController))
      await r.controller.until((e) => e.type === 'hotwash.item', 'controller-sealed frame routed')
      expect(r.controller.raw).toContain(JSON.stringify(toController))
    })
  })
}
