/**
 * An in-process session server for tests: the server contract of spec 0406 (join token, client
 * identity, size cap, parse, `from` check, `seq`, controller-only types, store, route, catch-up
 * by destination, blobs, presence) with no sockets. It holds no key and never reads a payload,
 * exactly like a real server. Later work (features, servers) tests end to end against it.
 */
import { byteLength, fromBase64Url, toHex } from './bytes'
import type { CryptoProvider } from './crypto/provider'
import { parseFrame } from './codec'
import {
  CLOSE_CODES,
  CONTROLLER_ONLY_TYPES,
  EPHEMERAL_TYPES,
  LIMITS,
  PROTOCOL_VERSION,
  type ConnectionKind,
  type Limits,
} from './protocol'
import {
  CatchupRequestPayload,
  RelayBlobGet,
  RelayBlobPut,
  type ClientId,
  type Envelope,
  type PayloadByType,
  type RelayErrorCode,
} from './schemas'
import type { Transport } from './transport'

type PlainType =
  | 'presence'
  | 'catchup.batch'
  | 'relay.hello'
  | 'relay.error'
  | 'relay.blob.chunk'
  | 'relay.blob.done'

interface Conn {
  clientId: ClientId
  controller: boolean
  lastSeq: number
  since: number
  open: boolean
  frameCbs: Set<(frame: string) => void>
  closeCbs: Set<(code: number, reason: string) => void>
  /** Frames (and a close) that arrived before the client subscribed; flushed on subscribe. */
  pendingFrames: string[]
  pendingClose?: [number, string]
}

interface StoredBlob {
  uploader: ClientId
  count: number
  chunks: Map<number, string>
  bytes: number
  done: boolean
}

export interface MemoryServerOptions {
  sessionId: string
  kind: ConnectionKind
  /** hex SHA-256 of the join token the controller registered. */
  joinTokenHash: string
  crypto: CryptoProvider
  version?: string
  now?: () => number
}

export interface ConnectOptions {
  clientId: ClientId
  /** Participants: derived from the players root; the server compares its hash. */
  joinToken?: Uint8Array
  /**
   * Participants: binds `clientId` to this device. The first connection registers its hash;
   * later connections with the same id must present the same token.
   */
  resumeToken?: Uint8Array
  /** A connection that presented the controller token (`Bearer`), not a join token. */
  controller?: boolean
}

/** What the server remembers about a client id: who may use it. */
type Identity = { kind: 'controller' } | { kind: 'participant'; resumeHash: string }

export class MemoryServer {
  readonly limits: Limits
  /** Stored envelopes; arrival index is position + 1. */
  readonly stored: Envelope[] = []
  readonly blobs = new Map<string, StoredBlob>()
  blobBytes = 0
  ended = false
  private joinTokenHash: string
  private readonly conns = new Map<ClientId, Conn>()
  private readonly identities = new Map<ClientId, Identity>()
  private readonly lastSeqs = new Map<ClientId, number>()
  private readonly now: () => number

  constructor(private readonly opts: MemoryServerOptions) {
    this.limits = LIMITS[opts.kind]
    this.joinTokenHash = opts.joinTokenHash
    this.now = opts.now ?? (() => Date.now())
  }

  get sessionId() {
    return this.opts.sessionId
  }

  get connected(): ClientId[] {
    return [...this.conns.keys()]
  }

  get lastIndex(): number {
    return this.stored.length
  }

  /** `POST /v1/sessions/:id/join-token` after a rotation. */
  setJoinTokenHash(hex: string): void {
    this.joinTokenHash = hex
  }

  async connect(options: ConnectOptions): Promise<Transport> {
    const conn: Conn = {
      clientId: options.clientId,
      controller: options.controller ?? false,
      lastSeq: 0,
      since: this.now(),
      open: true,
      frameCbs: new Set(),
      closeCbs: new Set(),
      pendingFrames: [],
    }
    const transport = this.transportFor(conn)
    const refuse = (code: number, reason: string, error: RelayErrorCode) => {
      queueMicrotask(() => {
        this.deliver(conn, this.serverFrame(conn, 'relay.error', { code: error, message: reason }))
        this.closeConn(conn, code, reason)
      })
      return transport
    }
    if (this.ended) return refuse(CLOSE_CODES.SESSION_ENDED, 'Session ended', 'SESSION_ENDED')
    if (!conn.controller) {
      const presented = options.joinToken
        ? toHex(await this.opts.crypto.sha256(options.joinToken))
        : ''
      if (presented !== this.joinTokenHash) {
        return refuse(CLOSE_CODES.BAD_JOIN_TOKEN, 'Bad join token', 'BAD_JOIN_TOKEN')
      }
    }
    if (!(await this.bindIdentity(conn, options.resumeToken))) {
      return refuse(
        CLOSE_CODES.CLIENT_ID_IN_USE,
        'Client id belongs to another device',
        'BAD_RESUME_TOKEN',
      )
    }
    if (this.conns.size >= this.limits.clients && !this.conns.has(conn.clientId)) {
      return refuse(CLOSE_CODES.SESSION_FULL, 'Session full', 'SESSION_FULL')
    }
    const previous = this.conns.get(conn.clientId)
    conn.lastSeq = this.lastSeqs.get(conn.clientId) ?? 0
    if (previous) this.closeConn(previous, 1000, 'Replaced by a new connection', false)
    this.conns.set(conn.clientId, conn)
    queueMicrotask(() => {
      this.deliver(conn, this.serverFrame(conn, 'relay.hello', this.hello(conn)))
      if (!previous) this.presence(conn, 'online')
    })
    return transport
  }

  private transportFor(conn: Conn): Transport {
    return {
      send: (frame) => queueMicrotask(() => this.handle(conn, frame)),
      close: (code = 1000, reason = '') => this.closeConn(conn, code, reason),
      onFrame: (cb) => {
        conn.frameCbs.add(cb)
        for (const frame of conn.pendingFrames.splice(0)) cb(frame)
        return () => conn.frameCbs.delete(cb)
      },
      onClose: (cb) => {
        conn.closeCbs.add(cb)
        if (conn.pendingClose) cb(...conn.pendingClose)
        return () => conn.closeCbs.delete(cb)
      },
    }
  }

  /**
   * A client id is owned by whoever used it first: a controller connection, or the participant
   * whose resume token hashes to what was registered. Anyone else is refused.
   */
  private async bindIdentity(conn: Conn, resumeToken: Uint8Array | undefined): Promise<boolean> {
    const known = this.identities.get(conn.clientId)
    if (conn.controller) {
      if (known && known.kind !== 'controller') return false
      this.identities.set(conn.clientId, { kind: 'controller' })
      return true
    }
    if (!resumeToken || resumeToken.length < 16) return false
    const resumeHash = toHex(await this.opts.crypto.sha256(resumeToken))
    if (!known) {
      this.identities.set(conn.clientId, { kind: 'participant', resumeHash })
      return true
    }
    return known.kind === 'participant' && known.resumeHash === resumeHash
  }

  /** `POST /v1/sessions/:id/kick`: close with 4003. The controller also rotates the key. */
  kick(clientId: ClientId): void {
    const conn = this.conns.get(clientId)
    if (conn) this.closeConn(conn, CLOSE_CODES.KICKED, 'Removed by the facilitator')
  }

  /** After `session.end` fanned out: drop the store and close everyone. */
  end(): void {
    this.ended = true
    for (const conn of [...this.conns.values()]) {
      this.closeConn(conn, CLOSE_CODES.SESSION_ENDED, 'Session ended')
    }
    this.stored.length = 0
    this.blobs.clear()
    this.blobBytes = 0
  }

  /** Participants learn nothing about other clients from hello; controllers get the roster. */
  private hello(conn: Conn): PayloadByType['relay.hello'] {
    const base = {
      index: this.lastIndex,
      yourLastSeq: conn.lastSeq,
      server: {
        kind: this.opts.kind,
        version: this.opts.version ?? 'test',
        protocol: [PROTOCOL_VERSION],
      },
      caps: this.limits,
    }
    if (!conn.controller) return base
    const clients = [...this.conns.values()].map((c) => ({ client: c.clientId, since: c.since }))
    return { ...base, clients }
  }

  private serverFrame<T extends PlainType>(conn: Conn, type: T, payload: PayloadByType[T]): string {
    const envelope: Envelope = {
      v: PROTOCOL_VERSION,
      session: this.opts.sessionId,
      seq: 0,
      from: 'server',
      to: `client:${conn.clientId}`,
      type,
      ts: this.now(),
      payload: payload as Record<string, unknown>,
    }
    return JSON.stringify(envelope)
  }

  private deliver(conn: Conn, frame: string): void {
    if (!conn.open) return
    if (conn.frameCbs.size === 0) conn.pendingFrames.push(frame)
    for (const cb of conn.frameCbs) cb(frame)
  }

  private closeConn(conn: Conn, code: number, reason: string, announce = true): void {
    if (!conn.open) return
    conn.open = false
    if (this.conns.get(conn.clientId) === conn) this.conns.delete(conn.clientId)
    if (conn.closeCbs.size === 0) conn.pendingClose = [code, reason]
    for (const cb of conn.closeCbs) cb(code, reason)
    if (announce) this.presence(conn, 'offline')
  }

  /** Presence goes to controller connections only: the roster is the controller's business. */
  private presence(about: Conn, state: 'online' | 'offline'): void {
    for (const other of this.conns.values()) {
      if (other === about || !other.controller) continue
      this.deliver(
        other,
        this.serverFrame(other, 'presence', { client: about.clientId, state, at: this.now() }),
      )
    }
  }

  private error(conn: Conn, code: RelayErrorCode, message: string, blobId?: string): void {
    this.deliver(
      conn,
      this.serverFrame(conn, 'relay.error', { code, message, ...(blobId ? { blobId } : {}) }),
    )
  }

  /** Checks in the order the spec fixes: size → parse → from → seq → type allowed → store → route. */
  private handle(conn: Conn, frame: string): void {
    if (!conn.open) return
    if (byteLength(frame) > this.limits.envelopeBytes)
      return this.error(conn, 'TOO_LARGE', 'Frame over the size cap')
    const parsed = parseFrame(frame)
    if (!parsed.ok) return this.error(conn, 'INVALID', 'Frame did not parse')
    const e = parsed.envelope
    if (e.session !== this.opts.sessionId) return this.error(conn, 'INVALID', 'Wrong session')
    if (e.from !== conn.clientId)
      return this.error(conn, 'INVALID', 'from does not match the connection')
    if (e.seq <= conn.lastSeq) return // a confused or replaying client: drop silently
    conn.lastSeq = e.seq
    this.lastSeqs.set(conn.clientId, e.seq)
    if (CONTROLLER_ONLY_TYPES.has(e.type) && !conn.controller) {
      return this.error(conn, 'NOT_CONTROLLER', `${e.type} is a controller type`)
    }
    switch (e.type) {
      case 'catchup.request':
        return this.catchup(conn, e)
      case 'relay.blob.put':
        return this.blobPut(conn, e)
      case 'relay.blob.get':
        return this.blobGet(conn, e)
      case 'presence':
      case 'catchup.batch':
      case 'relay.hello':
      case 'relay.error':
      case 'relay.blob.chunk':
      case 'relay.blob.done':
        return this.error(conn, 'INVALID', `${e.type} is a server frame`)
    }
    if (!EPHEMERAL_TYPES.has(e.type)) this.stored.push(e)
    this.route(conn, e, frame)
  }

  /** Whether a stored or live frame is for this connection, by its `to` alone. */
  private visibleTo(conn: Conn, e: Envelope): boolean {
    if (e.to === 'controller') return conn.controller
    if (e.to.startsWith('client:')) return e.to === `client:${conn.clientId}`
    return true // all, role:, team: (clients filter by their own role from welcome)
  }

  private route(sender: Conn, e: Envelope, frame: string): void {
    for (const conn of this.conns.values()) {
      if (conn === sender || !this.visibleTo(conn, e)) continue
      this.deliver(conn, frame)
    }
  }

  private catchup(conn: Conn, e: Envelope): void {
    const req = CatchupRequestPayload.safeParse(e.payload)
    if (!req.success) return this.error(conn, 'INVALID', 'Bad catchup.request')
    const limit = req.data.limit ?? 100
    let after = req.data.after
    let done = false
    while (!done) {
      const slice = this.stored.slice(after, after + limit)
      const to = after + slice.length
      done = to >= this.stored.length
      const entries = slice
        .map((env, k) => ({ i: after + k + 1, e: env }))
        .filter(({ e: env }) => this.visibleTo(conn, env))
      this.deliver(
        conn,
        this.serverFrame(conn, 'catchup.batch', { from: after, to, entries, done }),
      )
      after = to
    }
  }

  private blobPut(conn: Conn, e: Envelope): void {
    const put = RelayBlobPut.safeParse(e.payload)
    if (!put.success) return this.error(conn, 'INVALID', 'Bad relay.blob.put')
    const { blobId, index, count, bytes } = put.data
    let chunk: Uint8Array
    try {
      chunk = fromBase64Url(bytes)
    } catch {
      return this.error(conn, 'INVALID', 'Bad chunk encoding', blobId)
    }
    if (chunk.length > this.limits.chunkBytes)
      return this.error(conn, 'TOO_LARGE', 'Chunk over the cap', blobId)
    if (index >= count) return this.error(conn, 'INVALID', 'Chunk index out of range', blobId)
    let blob = this.blobs.get(blobId)
    if (blob && blob.uploader !== conn.clientId)
      return this.error(conn, 'INVALID', 'Blob belongs to another client', blobId)
    if (!blob) {
      blob = { uploader: conn.clientId, count, chunks: new Map(), bytes: 0, done: false }
      this.blobs.set(blobId, blob)
    }
    if (blob.count !== count || blob.done)
      return this.error(conn, 'INVALID', 'Blob already stored or count changed', blobId)
    if (blob.chunks.has(index)) return
    const cap = conn.controller ? this.limits.blobBytes : this.limits.playerBlobBytes
    // The sealed size is the plaintext plus a 16-byte tag; the cap is on what the uploader may send.
    if (blob.bytes + chunk.length > cap + 16) {
      this.blobs.delete(blobId)
      this.blobBytes -= blob.bytes
      return this.error(conn, 'BLOB_TOO_LARGE', 'Blob over the cap for this uploader', blobId)
    }
    if (this.blobBytes + chunk.length > this.limits.blobsTotalBytes) {
      this.blobs.delete(blobId)
      this.blobBytes -= blob.bytes
      return this.error(conn, 'BLOB_QUOTA', 'Session blob quota reached', blobId)
    }
    blob.chunks.set(index, bytes)
    blob.bytes += chunk.length
    this.blobBytes += chunk.length
    if (blob.chunks.size === count) {
      blob.done = true
      this.deliver(
        conn,
        this.serverFrame(conn, 'relay.blob.done', { blobId, stored: true, totalBytes: blob.bytes }),
      )
    }
  }

  private blobGet(conn: Conn, e: Envelope): void {
    const get = RelayBlobGet.safeParse(e.payload)
    if (!get.success) return this.error(conn, 'INVALID', 'Bad relay.blob.get')
    const blob = this.blobs.get(get.data.blobId)
    if (!blob?.done) return this.error(conn, 'BLOB_UNKNOWN', 'No such blob', get.data.blobId)
    for (const [index, bytes] of blob.chunks) {
      this.deliver(
        conn,
        this.serverFrame(conn, 'relay.blob.chunk', {
          blobId: get.data.blobId,
          index,
          count: blob.count,
          bytes,
        }),
      )
    }
  }
}

/** Resolves after queued microtasks have run: lets a test observe in-memory delivery. */
export async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => setTimeout(r, 0))
}
