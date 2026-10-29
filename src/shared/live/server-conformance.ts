/**
 * The server contract of spec 0406 as one test suite, run against every server: the in-memory
 * `MemoryServer` and the LAN server over real WebSocket and SSE + POST connections (#407); the
 * relay (#408) and the self-hosted server (#409) plug in the same way. Imported by test files
 * only. Frames are built by hand so the suite needs no keys: a server never opens a payload.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { toBase64Url } from './bytes'
import type { CryptoProvider } from './crypto/provider'
import { createWebCryptoProvider } from './crypto/webcrypto'
import { CLOSE_CODES, LIMITS, PROTOCOL_VERSION, type ConnectionKind } from './protocol'
import type { ClientId, Envelope, RelayErrorCode } from './schemas'
import type { Transport } from './transport'

export interface ConnectOptions {
  clientId: ClientId
  joinToken?: Uint8Array
  resumeToken?: Uint8Array
  controller?: boolean
}

export interface ServerUnderTest {
  connect(options: ConnectOptions): Promise<Transport>
  kick(clientId: ClientId): void
  end(): void
  setJoinTokenHash(hex: string): void
  readonly lastIndex: number
  readonly connected: ClientId[]
  stop(): Promise<void>
}

export interface ServerFactoryOptions {
  sessionId: string
  kind: ConnectionKind
  joinTokenHash: string
  crypto: CryptoProvider
  framesPerMinute?: number
}

export type ServerFactory = (opts: ServerFactoryOptions) => Promise<ServerUnderTest>

const ids = (n: number): ClientId => toBase64Url(new Uint8Array(16).fill(n))
const SESSION = ids(0xaa)
const OTHER_SESSION = ids(0xbb)

export interface Collected {
  frames: Envelope[]
  closes: [number, string][]
  of(type: string): Envelope[]
  errors(code?: RelayErrorCode): Envelope[]
}

export function collect(transport: Transport): Collected {
  const frames: Envelope[] = []
  const closes: [number, string][] = []
  transport.onFrame((f) => frames.push(JSON.parse(f) as Envelope))
  transport.onClose((code, reason) => closes.push([code, reason]))
  return {
    frames,
    closes,
    of: (type) => frames.filter((e) => e.type === type),
    errors: (code) =>
      frames.filter(
        (e) => e.type === 'relay.error' && (!code || (e.payload as { code: string }).code === code),
      ),
  }
}

/** Poll until `cond` is true (both servers deliver asynchronously). */
export async function until(cond: () => boolean, ms = 4000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for a frame')
    await new Promise((r) => setTimeout(r, 5))
  }
}

function frame(from: ClientId, seq: number, to: string, type: string, payload = {}): string {
  const e: Envelope = {
    v: PROTOCOL_VERSION,
    session: SESSION,
    seq,
    from,
    to,
    type: type as Envelope['type'],
    ts: Date.now(),
    payload,
  }
  return JSON.stringify(e)
}

export function describeServerContract(name: string, factory: ServerFactory): void {
  describe(`server contract (spec 0406): ${name}`, () => {
    const crypto = createWebCryptoProvider()
    const joinToken = new Uint8Array(16).fill(7)
    let server: ServerUnderTest | undefined
    const open: Transport[] = []

    async function start(kind: ConnectionKind = 'lan', extra: Partial<ServerFactoryOptions> = {}) {
      const hashBytes = await crypto.sha256(joinToken)
      const joinTokenHash = [...hashBytes].map((b) => b.toString(16).padStart(2, '0')).join('')
      server = await factory({ sessionId: SESSION, kind, joinTokenHash, crypto, ...extra })
      return server
    }
    async function participant(n: number, token = joinToken, resume = new Uint8Array(16).fill(n)) {
      const t = await server!.connect({ clientId: ids(n), joinToken: token, resumeToken: resume })
      open.push(t)
      return { id: ids(n), t, got: collect(t) }
    }
    async function controller(n = 99) {
      const t = await server!.connect({ clientId: ids(n), controller: true })
      open.push(t)
      return { id: ids(n), t, got: collect(t) }
    }

    afterEach(async () => {
      for (const t of open.splice(0)) t.close()
      await server?.stop()
      server = undefined
    })

    it('answers hello first, with the kind caps and no roster for a participant', async () => {
      await start('lan')
      const p = await participant(1)
      await until(() => p.got.of('relay.hello').length === 1)
      const hello = p.got.of('relay.hello')[0]!
      expect(hello.from).toBe('server')
      expect(hello.to).toBe(`client:${p.id}`)
      const payload = hello.payload as {
        caps: unknown
        clients?: unknown
        server: { kind: string }
      }
      expect(payload.caps).toEqual(LIMITS.lan)
      expect(payload.server.kind).toBe('lan')
      expect(payload.clients).toBeUndefined()
    })

    it('gives a controller the roster in hello', async () => {
      await start()
      const p = await participant(1)
      await until(() => p.got.of('relay.hello').length === 1)
      const c = await controller()
      await until(() => c.got.of('relay.hello').length === 1)
      const clients = (c.got.of('relay.hello')[0]!.payload as { clients: { client: string }[] })
        .clients
      expect(clients.map((x) => x.client)).toContain(p.id)
    })

    it('refuses a bad join token with relay.error and close 4001', async () => {
      await start()
      const p = await participant(1, new Uint8Array(16).fill(9))
      await until(() => p.got.closes.length === 1)
      expect(p.got.errors('BAD_JOIN_TOKEN')).toHaveLength(1)
      expect(p.got.closes[0]![0]).toBe(CLOSE_CODES.BAD_JOIN_TOKEN)
      expect(server!.connected).not.toContain(p.id)
    })

    it('binds a client id to its resume token: another token is refused with 4005, the same resumes', async () => {
      await start()
      const first = await participant(1)
      await until(() => first.got.of('relay.hello').length === 1)
      first.t.send(frame(first.id, 3, 'controller', 'inject.receipt'))
      await until(() => server!.lastIndex === 1)
      const impostor = await participant(1, joinToken, new Uint8Array(16).fill(42))
      await until(() => impostor.got.closes.length === 1)
      expect(impostor.got.closes[0]![0]).toBe(CLOSE_CODES.CLIENT_ID_IN_USE)
      expect(impostor.got.errors('BAD_RESUME_TOKEN')).toHaveLength(1)
      first.t.close()
      const again = await participant(1)
      await until(() => again.got.of('relay.hello').length === 1)
      expect((again.got.of('relay.hello')[0]!.payload as { yourLastSeq: number }).yourLastSeq).toBe(
        3,
      )
    })

    it('refuses a participant without a resume token and a participant using the controller id', async () => {
      await start()
      const c = await controller(5)
      await until(() => c.got.of('relay.hello').length === 1)
      // Without a resume token a server may refuse before the protocol starts (a socket server
      // rejects the upgrade) or with 4005 (in process); either way there is no hello.
      const noToken = await server!.connect({ clientId: ids(2), joinToken })
      open.push(noToken)
      const got = collect(noToken)
      await until(() => got.closes.length === 1)
      expect(got.of('relay.hello')).toHaveLength(0)
      expect(server!.connected).not.toContain(ids(2))
      const squatter = await participant(5)
      await until(() => squatter.got.closes.length === 1)
      expect(squatter.got.closes[0]![0]).toBe(CLOSE_CODES.CLIENT_ID_IN_USE)
    })

    it('refuses a frame over the size cap and never stores it', async () => {
      await start('relay')
      const p = await participant(1)
      await until(() => p.got.of('relay.hello').length === 1)
      p.t.send('x'.repeat(LIMITS.relay.envelopeBytes + 1))
      // In process the hub answers TOO_LARGE; a socket server may cut the connection instead
      // (WebSocket 1009, HTTP 413) before the frame is even read.
      await until(() => p.got.errors('TOO_LARGE').length === 1 || p.got.closes.length === 1)
      expect(server!.lastIndex).toBe(0)
    })

    it('checks parse, session and from before anything else', async () => {
      await start('relay')
      const p = await participant(1)
      await until(() => p.got.of('relay.hello').length === 1)
      p.t.send('{not json')
      p.t.send(frame(p.id, 1, 'all', 'message.send').replace(SESSION, OTHER_SESSION))
      p.t.send(frame(ids(2), 1, 'all', 'message.send'))
      await until(() => p.got.errors().length === 3)
      expect(p.got.errors('INVALID')).toHaveLength(3)
      expect(server!.lastIndex).toBe(0)
    })

    it('drops a replayed or lower seq silently and refuses controller types from a participant', async () => {
      await start()
      const c = await controller()
      const p = await participant(1)
      await until(
        () => p.got.of('relay.hello').length === 1 && c.got.of('relay.hello').length === 1,
      )
      p.t.send(frame(p.id, 5, 'all', 'message.send'))
      p.t.send(frame(p.id, 5, 'all', 'message.send'))
      p.t.send(frame(p.id, 2, 'all', 'message.send'))
      p.t.send(frame(p.id, 6, 'all', 'inject.release'))
      await until(() => p.got.errors('NOT_CONTROLLER').length === 1)
      expect(c.got.of('message.send')).toHaveLength(1)
      expect(server!.lastIndex).toBe(1)
    })

    it('routes by destination: all, client:<id>, controller, role:', async () => {
      await start()
      const c = await controller()
      const a = await participant(1)
      const b = await participant(2)
      await until(() => [a, b, c].every((x) => x.got.of('relay.hello').length === 1))
      a.t.send(frame(a.id, 1, 'all', 'message.send'))
      a.t.send(frame(a.id, 2, `client:${b.id}`, 'message.send'))
      a.t.send(frame(a.id, 3, 'controller', 'inject.receipt'))
      a.t.send(frame(a.id, 4, 'role:pio', 'message.send'))
      await until(() => c.got.frames.filter((e) => e.from === a.id).length === 3)
      await until(() => b.got.frames.filter((e) => e.from === a.id).length === 3)
      expect(c.got.of('inject.receipt')).toHaveLength(1)
      expect(b.got.of('inject.receipt')).toHaveLength(0)
      expect(a.got.frames.filter((e) => e.from === a.id)).toHaveLength(0)
      expect(server!.lastIndex).toBe(4)
    })

    it('catch-up returns only what the connection would have received live, with arrival indexes', async () => {
      await start()
      const c = await controller()
      const a = await participant(1)
      await until(
        () => a.got.of('relay.hello').length === 1 && c.got.of('relay.hello').length === 1,
      )
      a.t.send(frame(a.id, 1, 'controller', 'inject.receipt'))
      a.t.send(frame(a.id, 2, 'all', 'message.send'))
      // Arrival order between two senders is not fixed over sockets: wait before the next sender.
      await until(() => server!.lastIndex === 2)
      c.t.send(frame(c.id, 1, `client:${a.id}`, 'welcome'))
      c.t.send(frame(c.id, 2, 'all', 'clock.state'))
      await until(() => server!.lastIndex === 4)
      const late = await participant(3)
      await until(() => late.got.of('relay.hello').length === 1)
      late.t.send(frame(late.id, 1, 'controller', 'catchup.request', { after: 0 }))
      await until(() => late.got.of('catchup.batch').length === 1)
      const batch = late.got.of('catchup.batch')[0]!.payload as {
        from: number
        to: number
        done: boolean
        entries: { i: number; e: Envelope }[]
      }
      expect(batch).toMatchObject({ from: 0, to: 4, done: true })
      expect(batch.entries.map((x) => [x.i, x.e.type])).toEqual([
        [2, 'message.send'],
        [4, 'clock.state'],
      ])
      // The sender of a stored frame never gets it back; the controller gets everything but its own.
      a.t.send(frame(a.id, 3, 'controller', 'catchup.request', { after: 0 }))
      c.t.send(frame(c.id, 3, 'controller', 'catchup.request', { after: 2 }))
      await until(
        () => a.got.of('catchup.batch').length === 1 && c.got.of('catchup.batch').length === 1,
      )
      const aBatch = a.got.of('catchup.batch')[0]!.payload as { entries: { i: number }[] }
      expect(aBatch.entries.map((x) => x.i)).toEqual([3, 4])
      const cBatch = c.got.of('catchup.batch')[0]!.payload as {
        from: number
        entries: { i: number }[]
      }
      expect(cBatch.from).toBe(2)
      expect(cBatch.entries.map((x) => x.i)).toEqual([])
    })

    it('sends presence to controllers only', async () => {
      await start()
      const c = await controller()
      const a = await participant(1)
      const b = await participant(2)
      await until(() => c.got.of('presence').length === 2)
      expect(c.got.of('presence').map((e) => (e.payload as { state: string }).state)).toEqual([
        'online',
        'online',
      ])
      b.t.close()
      await until(() => c.got.of('presence').length === 3)
      expect(c.got.of('presence')[2]!.payload).toMatchObject({ client: b.id, state: 'offline' })
      await new Promise((r) => setTimeout(r, 20))
      expect(a.got.of('presence')).toHaveLength(0)
    })

    it('kicks with 4003 and ends with 4002; a later connect is refused as ended', async () => {
      await start()
      const a = await participant(1)
      const b = await participant(2)
      await until(
        () => a.got.of('relay.hello').length === 1 && b.got.of('relay.hello').length === 1,
      )
      server!.kick(a.id)
      await until(() => a.got.closes.length === 1)
      expect(a.got.closes[0]![0]).toBe(CLOSE_CODES.KICKED)
      server!.end()
      await until(() => b.got.closes.length === 1)
      expect(b.got.closes[0]![0]).toBe(CLOSE_CODES.SESSION_ENDED)
      const late = await participant(3)
      await until(() => late.got.closes.length === 1)
      expect(late.got.closes[0]![0]).toBe(CLOSE_CODES.SESSION_ENDED)
      expect(late.got.errors('SESSION_ENDED')).toHaveLength(1)
    })

    it('rotates the join token: the old one is refused, the new one accepted', async () => {
      await start()
      const newToken = new Uint8Array(16).fill(11)
      const hash = [...(await crypto.sha256(newToken))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      server!.setJoinTokenHash(hash)
      const old = await participant(1)
      await until(() => old.got.closes.length === 1)
      expect(old.got.closes[0]![0]).toBe(CLOSE_CODES.BAD_JOIN_TOKEN)
      const fresh = await participant(2, newToken)
      await until(() => fresh.got.of('relay.hello').length === 1)
    })

    it('stores blob chunks, confirms with relay.blob.done and serves them back', async () => {
      await start('relay')
      const c = await controller()
      const a = await participant(1)
      await until(
        () => a.got.of('relay.hello').length === 1 && c.got.of('relay.hello').length === 1,
      )
      const blobId = toBase64Url(new Uint8Array(16).fill(3))
      const chunk = (n: number) => toBase64Url(new Uint8Array(1000).fill(n))
      c.t.send(
        frame(c.id, 1, 'controller', 'relay.blob.put', {
          blobId,
          index: 1,
          count: 2,
          bytes: chunk(2),
        }),
      )
      c.t.send(
        frame(c.id, 2, 'controller', 'relay.blob.put', {
          blobId,
          index: 0,
          count: 2,
          bytes: chunk(1),
        }),
      )
      await until(() => c.got.of('relay.blob.done').length === 1)
      expect(c.got.of('relay.blob.done')[0]!.payload).toMatchObject({
        blobId,
        stored: true,
        totalBytes: 2000,
      })
      a.t.send(frame(a.id, 1, 'controller', 'relay.blob.get', { blobId }))
      await until(() => a.got.of('relay.blob.chunk').length === 2)
      a.t.send(
        frame(a.id, 2, 'controller', 'relay.blob.get', { blobId: toBase64Url(new Uint8Array(16)) }),
      )
      await until(() => a.got.errors('BLOB_UNKNOWN').length === 1)
      const big = toBase64Url(new Uint8Array(LIMITS.relay.chunkBytes + 1))
      a.t.send(
        frame(a.id, 3, 'controller', 'relay.blob.put', { blobId, index: 0, count: 1, bytes: big }),
      )
      await until(() => a.got.errors('TOO_LARGE').length === 1)
    })

    it('rate-limits a participant (4008) and never the controller', async () => {
      await start('lan', { framesPerMinute: 3 })
      const c = await controller()
      const a = await participant(1)
      await until(
        () => a.got.of('relay.hello').length === 1 && c.got.of('relay.hello').length === 1,
      )
      for (let i = 1; i <= 6; i++) c.t.send(frame(c.id, i, 'all', 'clock.state'))
      for (let i = 1; i <= 4; i++) a.t.send(frame(a.id, i, 'all', 'message.send'))
      await until(() => a.got.closes.length === 1)
      expect(a.got.closes[0]![0]).toBe(CLOSE_CODES.RATE_LIMITED)
      expect(a.got.errors('RATE_LIMITED')).toHaveLength(1)
      await until(() => server!.lastIndex === 9)
      expect(c.got.closes).toHaveLength(0)
    })
  })
}
