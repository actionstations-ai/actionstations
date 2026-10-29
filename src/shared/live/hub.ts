/**
 * The server contract of spec 0406 with no sockets: join token, client identity, size cap,
 * parse, `from` check, `seq`, controller-only types, rate limit, store, route, catch-up by
 * destination, blobs, presence. A transport (the in-memory pair for tests, the LAN server's
 * WebSocket and SSE connections, later the relay and the self-hosted server) attaches a
 * `HubSocket` per client and hands frames in; the hub decides everything else. It holds no
 * key and never reads a sealed payload.
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

type PlainType =
  | 'presence'
  | 'catchup.batch'
  | 'relay.hello'
  | 'relay.error'
  | 'relay.blob.chunk'
  | 'relay.blob.done'

/** What the hub needs from a connection: deliver a frame, close it. */
export interface HubSocket {
  send(frame: string): void
  close(code: number, reason: string): void
}

export interface HubAttachOptions {
  clientId: ClientId
  /** Participants: derived from the players root; the hub compares its hash. */
  joinToken?: Uint8Array
  /**
   * Participants: binds `clientId` to this device. The first connection registers its hash;
   * later connections with the same id must present the same token.
   */
  resumeToken?: Uint8Array
  /** A connection the transport authenticated as the controller (in-process, or a controller token). */
  controller?: boolean
  /** Remote address, for the per-address caps; absent in process. */
  remote?: string
}

/** The hub's handle on one attached connection. */
export interface HubClient {
  readonly clientId: ClientId
  readonly controller: boolean
  readonly open: boolean
  /** A frame arrived from the client. */
  receive(frame: string): void
  /** The transport closed on its own (network): forget the client, announce `presence offline`. */
  detach(): void
}

/** Connection events for a transport's log; never a payload. */
export type HubEvent =
  | { type: 'open'; clientId: ClientId; controller: boolean }
  | { type: 'refused'; clientId: ClientId; code: number; reason: string }
  | { type: 'close'; clientId: ClientId; code: number; reason: string }

export interface SessionHubOptions {
  sessionId: string
  kind: ConnectionKind
  /** hex SHA-256 of the join token the controller registered. */
  joinTokenHash: string
  crypto: CryptoProvider
  version?: string
  now?: () => number
  /**
   * Frames a participant identity (client id, bound to its resume token) may send per minute, a
   * token bucket that survives reconnects; controllers are exempt. Default: no limit.
   */
  framesPerMinute?: number
  /** Frames per minute from one remote address across all its identities. Default: 3 × framesPerMinute. */
  framesPerMinutePerRemote?: number
  /** Distinct participant identities one remote address may register. Default 4. */
  maxIdentitiesPerRemote?: number
  /** `catchup.request` frames an identity may send per minute. Default 6. */
  catchupsPerMinute?: number
  /** Sealed bytes one participant identity may upload in the session (complete or not). Default 4 × playerBlobBytes. */
  playerUploadBudgetBytes?: number
  /** Sealed bytes all participants' blobs may hold together; the controller's quota is separate. Default min(blobsTotalBytes, 64 MiB). */
  playersBlobPoolBytes?: number
  /** A blob not completed within this time is dropped and its bytes freed. Default 2 min. */
  incompleteBlobTtlMs?: number
  /** Stored envelopes before participants get `STORE_FULL`; controller frames are always stored. */
  storedEnvelopes?: number
  /** Stored envelope bytes (JSON) before participants get `STORE_FULL`. */
  storedBytes?: number
  onEvent?: (event: HubEvent) => void
}

interface Conn {
  clientId: ClientId
  controller: boolean
  remote?: string
  socket: HubSocket
  lastSeq: number
  since: number
  open: boolean
}

export interface StoredBlob {
  uploader: ClientId
  controller: boolean
  count: number
  chunks: Map<number, string>
  bytes: number
  done: boolean
  startedAt: number
}

/** A token bucket: `perMinute` burst, refilled at that rate. */
class Bucket {
  private tokens: number
  private refilledAt: number
  constructor(
    private readonly perMinute: number,
    now: number,
  ) {
    this.tokens = perMinute
    this.refilledAt = now
  }
  take(now: number): boolean {
    this.tokens = Math.min(
      this.perMinute,
      this.tokens + ((now - this.refilledAt) / 60_000) * this.perMinute,
    )
    this.refilledAt = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}

const MiB = 1024 * 1024
export const HUB_DEFAULTS = {
  maxIdentitiesPerRemote: 4,
  catchupsPerMinute: 6,
  playersBlobPoolBytes: 64 * MiB,
  incompleteBlobTtlMs: 120_000,
} as const

/** What the hub remembers about a client id: who may use it. */
type Identity = { kind: 'controller' } | { kind: 'participant'; resumeHash: string }

export const STORE_DEFAULTS = { envelopes: 20_000, bytes: 64 * 1024 * 1024 } as const

export class SessionHub {
  readonly limits: Limits
  /** Stored envelopes; arrival index is position + 1. */
  readonly stored: Envelope[] = []
  storedBytes = 0
  readonly blobs = new Map<string, StoredBlob>()
  /** Sealed bytes of every stored blob, complete or not. */
  blobBytes = 0
  /** The participants' share of `blobBytes`. */
  playerBlobBytes = 0
  ended = false
  private joinTokenHash: string
  private readonly conns = new Map<ClientId, Conn>()
  private readonly identities = new Map<ClientId, Identity>()
  private readonly identitiesByRemote = new Map<string, Set<ClientId>>()
  private readonly lastSeqs = new Map<ClientId, number>()
  /** Per identity and per remote address; kept for the session, so a reconnect refills nothing. */
  private readonly buckets = new Map<string, Bucket>()
  /** Sealed bytes each participant identity has uploaded in the session. */
  private readonly uploaded = new Map<ClientId, number>()
  private readonly now: () => number
  private readonly framesPerMinute: number
  private readonly framesPerMinutePerRemote: number
  private readonly catchupsPerMinute: number
  private readonly maxIdentitiesPerRemote: number
  private readonly playerUploadBudget: number
  private readonly playersBlobPool: number
  private readonly incompleteBlobTtl: number
  private readonly storeCap: { envelopes: number; bytes: number }

  constructor(private readonly opts: SessionHubOptions) {
    this.limits = LIMITS[opts.kind]
    this.joinTokenHash = opts.joinTokenHash
    this.now = opts.now ?? (() => Date.now())
    this.framesPerMinute = opts.framesPerMinute ?? Infinity
    this.framesPerMinutePerRemote = opts.framesPerMinutePerRemote ?? this.framesPerMinute * 3
    this.catchupsPerMinute = opts.catchupsPerMinute ?? HUB_DEFAULTS.catchupsPerMinute
    this.maxIdentitiesPerRemote = opts.maxIdentitiesPerRemote ?? HUB_DEFAULTS.maxIdentitiesPerRemote
    this.playerUploadBudget = opts.playerUploadBudgetBytes ?? 4 * this.limits.playerBlobBytes
    this.playersBlobPool =
      opts.playersBlobPoolBytes ??
      Math.min(this.limits.blobsTotalBytes, HUB_DEFAULTS.playersBlobPoolBytes)
    this.incompleteBlobTtl = opts.incompleteBlobTtlMs ?? HUB_DEFAULTS.incompleteBlobTtlMs
    this.storeCap = {
      envelopes: opts.storedEnvelopes ?? STORE_DEFAULTS.envelopes,
      bytes: opts.storedBytes ?? STORE_DEFAULTS.bytes,
    }
  }

  get sessionId() {
    return this.opts.sessionId
  }

  get kind(): ConnectionKind {
    return this.opts.kind
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

  /** Whether `token` is the current join token (for an HTTP route that must check before upgrading). */
  async checkJoinToken(token: Uint8Array | undefined): Promise<boolean> {
    if (!token) return false
    return toHex(await this.opts.crypto.sha256(token)) === this.joinTokenHash
  }

  /**
   * Attach a connection. A refused connection gets `relay.error` and a close with the spec's
   * code; the returned handle is then already closed.
   */
  async attach(socket: HubSocket, options: HubAttachOptions): Promise<HubClient> {
    const conn: Conn = {
      clientId: options.clientId,
      controller: options.controller ?? false,
      ...(options.remote ? { remote: options.remote } : {}),
      socket,
      lastSeq: 0,
      since: this.now(),
      open: true,
    }
    const handle = this.handleFor(conn)
    const refuse = (code: number, reason: string, error: RelayErrorCode) => {
      this.deliver(conn, this.serverFrame(conn, 'relay.error', { code: error, message: reason }))
      this.opts.onEvent?.({ type: 'refused', clientId: conn.clientId, code, reason })
      this.closeConn(conn, code, reason)
      return handle
    }
    if (this.ended) return refuse(CLOSE_CODES.SESSION_ENDED, 'Session ended', 'SESSION_ENDED')
    if (!conn.controller && !(await this.checkJoinToken(options.joinToken))) {
      return refuse(CLOSE_CODES.BAD_JOIN_TOKEN, 'Bad join token', 'BAD_JOIN_TOKEN')
    }
    const knownIdentity = this.identities.has(conn.clientId)
    if (!conn.controller && !knownIdentity && conn.remote && this.remoteIsFull(conn.remote)) {
      return refuse(CLOSE_CODES.RATE_LIMITED, 'Too many devices from this address', 'RATE_LIMITED')
    }
    if (!(await this.bindIdentity(conn, options.resumeToken))) {
      return refuse(
        CLOSE_CODES.CLIENT_ID_IN_USE,
        'Client id belongs to another device',
        'BAD_RESUME_TOKEN',
      )
    }
    if (!conn.controller && conn.remote) this.rememberRemote(conn.remote, conn.clientId)
    if (this.conns.size >= this.limits.clients && !this.conns.has(conn.clientId)) {
      return refuse(CLOSE_CODES.SESSION_FULL, 'Session full', 'SESSION_FULL')
    }
    const previous = this.conns.get(conn.clientId)
    conn.lastSeq = this.lastSeqs.get(conn.clientId) ?? 0
    if (previous) this.closeConn(previous, 1000, 'Replaced by a new connection', false)
    this.conns.set(conn.clientId, conn)
    this.opts.onEvent?.({ type: 'open', clientId: conn.clientId, controller: conn.controller })
    this.deliver(conn, this.serverFrame(conn, 'relay.hello', this.hello(conn)))
    if (!previous) this.presence(conn, 'online')
    return handle
  }

  private handleFor(conn: Conn): HubClient {
    return {
      clientId: conn.clientId,
      controller: conn.controller,
      get open() {
        return conn.open
      },
      receive: (frame) => this.handle(conn, frame),
      detach: () => this.closeConn(conn, 1006, 'Connection lost', true, false),
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
    this.storedBytes = 0
    this.blobs.clear()
    this.blobBytes = 0
    this.playerBlobBytes = 0
    this.buckets.clear()
    this.uploaded.clear()
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
    conn.socket.send(frame)
  }

  private closeConn(
    conn: Conn,
    code: number,
    reason: string,
    announce = true,
    closeSocket = true,
  ): void {
    if (!conn.open) return
    conn.open = false
    if (this.conns.get(conn.clientId) === conn) this.conns.delete(conn.clientId)
    if (closeSocket) conn.socket.close(code, reason)
    this.opts.onEvent?.({ type: 'close', clientId: conn.clientId, code, reason })
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

  private error(
    conn: Conn,
    code: RelayErrorCode,
    message: string,
    extra: { blobId?: string; retryAfterMs?: number } = {},
  ): void {
    this.deliver(conn, this.serverFrame(conn, 'relay.error', { code, message, ...extra }))
  }

  private remoteIsFull(remote: string): boolean {
    return (this.identitiesByRemote.get(remote)?.size ?? 0) >= this.maxIdentitiesPerRemote
  }

  private rememberRemote(remote: string, clientId: ClientId): void {
    let set = this.identitiesByRemote.get(remote)
    if (!set) this.identitiesByRemote.set(remote, (set = new Set()))
    set.add(clientId)
  }

  /** Take one token from the named bucket, creating it at `perMinute` on first use. */
  private take(name: string, perMinute: number): boolean {
    if (perMinute === Infinity) return true
    let bucket = this.buckets.get(name)
    if (!bucket) this.buckets.set(name, (bucket = new Bucket(perMinute, this.now())))
    return bucket.take(this.now())
  }

  /**
   * A participant's frames are limited per identity and per remote address, with buckets that
   * live as long as the session: reconnecting or taking a new client id refills nothing.
   * Controllers are exempt.
   */
  private rateLimited(conn: Conn): boolean {
    if (conn.controller) return false
    const byId = this.take(`id:${conn.clientId}`, this.framesPerMinute)
    const byRemote = conn.remote
      ? this.take(`remote:${conn.remote}`, this.framesPerMinutePerRemote)
      : true
    return !byId || !byRemote
  }

  /** Checks in the order the spec fixes: size → parse → from → seq → type allowed → rate → store → route. */
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
    if (this.rateLimited(conn)) {
      this.error(conn, 'RATE_LIMITED', 'Too many frames', { retryAfterMs: 60_000 })
      return this.closeConn(conn, CLOSE_CODES.RATE_LIMITED, 'Rate limited')
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
    if (!EPHEMERAL_TYPES.has(e.type) && !this.store(conn, e, frame)) return
    this.route(conn, e, frame)
  }

  /**
   * Arrival indexes are positions, so nothing is ever evicted: once the cap is reached,
   * participants get `STORE_FULL` and the controller's frames are still stored.
   */
  private store(conn: Conn, e: Envelope, frame: string): boolean {
    const bytes = byteLength(frame)
    const full =
      this.stored.length >= this.storeCap.envelopes ||
      this.storedBytes + bytes > this.storeCap.bytes
    if (full && !conn.controller) {
      this.error(conn, 'STORE_FULL', 'The session store is full')
      return false
    }
    this.stored.push(e)
    this.storedBytes += bytes
    return true
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
    // A catch-up can push the whole store; a participant may ask only a few times a minute.
    if (!conn.controller && !this.take(`catchup:${conn.clientId}`, this.catchupsPerMinute)) {
      return this.error(conn, 'RATE_LIMITED', 'Too many catch-up requests', {
        retryAfterMs: 10_000,
      })
    }
    const limit = req.data.limit ?? 100
    let after = req.data.after
    let done = false
    while (!done) {
      const slice = this.stored.slice(after, after + limit)
      const to = after + slice.length
      done = to >= this.stored.length
      const entries = slice
        .map((env, k) => ({ i: after + k + 1, e: env }))
        // Never a client's own frames (spec 0406 routing): it has them, and its replay guard
        // would otherwise take them for fresh frames from itself.
        .filter(({ e: env }) => env.from !== conn.clientId && this.visibleTo(conn, env))
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
      return this.error(conn, 'INVALID', 'Bad chunk encoding', { blobId })
    }
    if (chunk.length > this.limits.chunkBytes)
      return this.error(conn, 'TOO_LARGE', 'Chunk over the cap', { blobId })
    if (index >= count) return this.error(conn, 'INVALID', 'Chunk index out of range', { blobId })
    this.sweepBlobs()
    let blob = this.blobs.get(blobId)
    if (blob && blob.uploader !== conn.clientId)
      return this.error(conn, 'INVALID', 'Blob belongs to another client', { blobId })
    if (!blob) {
      blob = {
        uploader: conn.clientId,
        controller: conn.controller,
        count,
        chunks: new Map(),
        bytes: 0,
        done: false,
        startedAt: this.now(),
      }
      this.blobs.set(blobId, blob)
    }
    if (blob.count !== count || blob.done)
      return this.error(conn, 'INVALID', 'Blob already stored or count changed', { blobId })
    if (blob.chunks.has(index)) return
    const cap = conn.controller ? this.limits.blobBytes : this.limits.playerBlobBytes
    // The sealed size is the plaintext plus a 16-byte tag; the cap is on what the uploader may send.
    if (blob.bytes + chunk.length > cap + 16) {
      this.dropBlob(blobId, blob)
      return this.error(conn, 'BLOB_TOO_LARGE', 'Blob over the cap for this uploader', { blobId })
    }
    if (!this.quotaAllows(conn, chunk.length)) {
      this.dropBlob(blobId, blob)
      return this.error(conn, 'BLOB_QUOTA', 'Blob quota reached', { blobId })
    }
    blob.chunks.set(index, bytes)
    blob.bytes += chunk.length
    this.blobBytes += chunk.length
    if (!conn.controller) {
      this.playerBlobBytes += chunk.length
      this.uploaded.set(conn.clientId, (this.uploaded.get(conn.clientId) ?? 0) + chunk.length)
    }
    if (blob.chunks.size === count) {
      blob.done = true
      this.deliver(
        conn,
        this.serverFrame(conn, 'relay.blob.done', { blobId, stored: true, totalBytes: blob.bytes }),
      )
    }
  }

  /**
   * The controller's uploads count against the session quota alone; participants share a
   * smaller pool and each identity has a budget for the whole session (freed bytes do not
   * refill it), so one device cannot fill the host's memory with half-finished uploads.
   */
  private quotaAllows(conn: Conn, bytes: number): boolean {
    if (this.blobBytes + bytes > this.limits.blobsTotalBytes) return false
    if (conn.controller) return true
    if (this.playerBlobBytes + bytes > this.playersBlobPool) return false
    return (this.uploaded.get(conn.clientId) ?? 0) + bytes <= this.playerUploadBudget
  }

  private dropBlob(blobId: string, blob: StoredBlob): void {
    this.blobs.delete(blobId)
    this.blobBytes -= blob.bytes
    if (!blob.controller) this.playerBlobBytes -= blob.bytes
  }

  /** Drop uploads that never completed within the TTL; a transport calls this on a timer too. */
  sweepBlobs(now = this.now()): number {
    let dropped = 0
    for (const [blobId, blob] of this.blobs) {
      if (!blob.done && now - blob.startedAt > this.incompleteBlobTtl) {
        this.dropBlob(blobId, blob)
        dropped += 1
      }
    }
    return dropped
  }

  private blobGet(conn: Conn, e: Envelope): void {
    const get = RelayBlobGet.safeParse(e.payload)
    if (!get.success) return this.error(conn, 'INVALID', 'Bad relay.blob.get')
    const blob = this.blobs.get(get.data.blobId)
    if (!blob?.done)
      return this.error(conn, 'BLOB_UNKNOWN', 'No such blob', { blobId: get.data.blobId })
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

  /** The sealed chunks of a stored blob in index order, for an HTTP `GET …/blobs/:id` route. */
  blobChunks(blobId: string): string[] | undefined {
    const blob = this.blobs.get(blobId)
    if (!blob?.done) return undefined
    return [...blob.chunks.entries()].sort((a, b) => a[0] - b[0]).map(([, bytes]) => bytes)
  }
}
