/**
 * The server contract of spec 0406 with no sockets: join token, client identity, size cap,
 * parse, `from` check, `seq`, controller-only types, rate limit, store, route, catch-up by
 * destination, blobs, presence. A transport (the in-memory pair for tests, the LAN server's
 * WebSocket and SSE connections, the relay's Durable Object, the self-hosted server) attaches a
 * `HubSocket` per client and hands frames in; the hub decides everything else. It holds no key
 * and never reads a sealed payload.
 *
 * Persistence is a `HubStore`: `MemoryHubStore` by default (the LAN server, tests), SQLite in a
 * Durable Object (the relay, #408) or `node:sqlite` (the self-hosted server, #409). A server
 * that loses its memory while sockets stay open (a hibernating Durable Object) re-registers
 * them with `restore()`; the store is the only state a client relies on. Rate-limit state
 * (buckets, identities per address, upload budgets) is in memory on purpose: a restart starts
 * lenient, which is the safe direction.
 */
import { byteLength, fromBase64Url, toHex } from './bytes'
import type { CryptoProvider } from './crypto/provider'
import { parseFrame } from './codec'
import {
  CLOSE_CODES,
  CONTROLLER_ONLY_TYPES,
  HOST_ONLY_TYPES,
  PARTICIPANT_ONLY_TYPES,
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
  /**
   * With `controller`: false marks a co-controller's token (#517). Such a connection may send the
   * scoped controller types, never the host-only ones, and learns neither the roster of devices
   * nor the frames sealed to the host. Default true.
   */
  host?: boolean
  /** Remote address, for the per-address caps; absent in process. */
  remote?: string
}

/** What a transport kept with a socket while the hub was not in memory. */
export interface HubRestoreOptions {
  clientId: ClientId
  controller: boolean
  host?: boolean
  since: number
  remote?: string
}

/** The hub's handle on one attached connection. */
export interface HubClient {
  readonly clientId: ClientId
  readonly controller: boolean
  /** A controller connection that is the host's, not a co-controller's. */
  readonly host: boolean
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
  | { type: 'store_full'; clientId: ClientId }
  | { type: 'send_failed'; clientId: ClientId }

// ---- persistence ------------------------------------------------------------------------------

/** The hub's own persisted state; a store keeps it next to the frames. */
export interface HubState {
  joinTokenHash: string
  ended: boolean
}

export interface StoredEnvelope {
  /** Arrival index, 1-based and contiguous. */
  index: number
  envelope: Envelope
  /** JSON bytes of the frame as stored. */
  bytes: number
}

export type StoredIdentity = { kind: 'controller' } | { kind: 'participant'; resumeHash: string }

export interface StoredBlobMeta {
  uploader: ClientId
  /** Uploaded by a controller connection (its own quota) rather than a participant (the pool). */
  controller: boolean
  count: number
  /** Distinct chunk indexes received. */
  received: number
  /** Sealed bytes received. */
  bytes: number
  done: boolean
  /** When the first chunk arrived; an upload not completed in time is dropped. */
  startedAt: number
}

export interface StoredChunk {
  index: number
  /** base64url of the sealed chunk, as the uploader sent it. */
  bytes: string
}

/** Running totals a store keeps up to date, so no call has to count rows. */
export interface StoreCounts {
  envelopes: number
  envelopeBytes: number
  /** Sealed bytes of every blob, complete or not. */
  blobBytes: number
  /** The participants' share of `blobBytes`. */
  playerBlobBytes: number
  /**
   * Row writes so far, by one formula every store follows so budgets mean the same everywhere:
   * an appended envelope counts 2 (the frame and its sender's seq), an identity 1, a chunk 2
   * (the chunk and its blob row). Ephemeral frames' seqs are not persisted and not counted.
   */
  writes: number
}

/**
 * Everything a session server persists. Synchronous on purpose: every backend is (a Map,
 * Durable Object `sql.exec`, `node:sqlite`), and it keeps one frame's processing atomic.
 * `src/shared/live/hub-store-conformance.ts` is the contract every implementation must pass.
 */
export interface HubStore {
  state(): HubState | undefined
  setState(state: HubState): void
  appendEnvelope(envelope: Envelope, frame: string, bytes: number): number
  /** Frames with index in (`after`, `after + limit`], in index order. */
  readEnvelopes(after: number, limit: number): StoredEnvelope[]
  lastIndex(): number
  counts(): StoreCounts
  lastSeq(client: ClientId): number
  setLastSeq(client: ClientId, seq: number): void
  identity(client: ClientId): StoredIdentity | undefined
  setIdentity(client: ClientId, identity: StoredIdentity): void
  blob(blobId: string): StoredBlobMeta | undefined
  /** Every blob, complete or not (for the incomplete-upload sweep). */
  listBlobs(): ({ blobId: string } & StoredBlobMeta)[]
  /** Stores one chunk, creating the blob on the first; a chunk already stored is ignored. */
  putChunk(
    blobId: string,
    start: { uploader: ClientId; controller: boolean; count: number; startedAt: number },
    index: number,
    bytes: string,
    byteLength: number,
  ): StoredBlobMeta
  hasChunk(blobId: string, index: number): boolean
  /** In index order. */
  chunks(blobId: string): StoredChunk[]
  deleteBlob(blobId: string): void
  /** Frames, seqs, identities and blobs go (session end); the state stays. */
  clear(): void
}

export interface StoredBlob extends StoredBlobMeta {
  chunks: Map<number, string>
}

export class MemoryHubStore implements HubStore {
  private hubState: HubState | undefined
  readonly stored: Envelope[] = []
  private readonly sizes: number[] = []
  private readonly seqs = new Map<ClientId, number>()
  private readonly identities = new Map<ClientId, StoredIdentity>()
  readonly blobs = new Map<string, StoredBlob>()
  private totals: StoreCounts = this.zero()

  private zero(): StoreCounts {
    return { envelopes: 0, envelopeBytes: 0, blobBytes: 0, playerBlobBytes: 0, writes: 0 }
  }

  state(): HubState | undefined {
    return this.hubState ? { ...this.hubState } : undefined
  }

  setState(state: HubState): void {
    this.hubState = { ...state }
  }

  appendEnvelope(envelope: Envelope, _frame: string, bytes: number): number {
    this.stored.push(envelope)
    this.sizes.push(bytes)
    this.totals.envelopes += 1
    this.totals.envelopeBytes += bytes
    this.totals.writes += 2
    return this.stored.length
  }

  readEnvelopes(after: number, limit: number): StoredEnvelope[] {
    const start = Math.max(0, after)
    return this.stored
      .slice(start, start + limit)
      .map((envelope, k) => ({ index: start + k + 1, envelope, bytes: this.sizes[start + k]! }))
  }

  lastIndex(): number {
    return this.stored.length
  }

  counts(): StoreCounts {
    return { ...this.totals }
  }

  lastSeq(client: ClientId): number {
    return this.seqs.get(client) ?? 0
  }

  setLastSeq(client: ClientId, seq: number): void {
    this.seqs.set(client, seq)
  }

  identity(client: ClientId): StoredIdentity | undefined {
    return this.identities.get(client)
  }

  setIdentity(client: ClientId, identity: StoredIdentity): void {
    this.identities.set(client, identity)
    this.totals.writes += 1
  }

  private meta(blob: StoredBlob): StoredBlobMeta {
    const { uploader, controller, count, received, bytes, done, startedAt } = blob
    return { uploader, controller, count, received, bytes, done, startedAt }
  }

  blob(blobId: string): StoredBlobMeta | undefined {
    const blob = this.blobs.get(blobId)
    return blob ? this.meta(blob) : undefined
  }

  listBlobs(): ({ blobId: string } & StoredBlobMeta)[] {
    return [...this.blobs.entries()].map(([blobId, blob]) => ({ blobId, ...this.meta(blob) }))
  }

  putChunk(
    blobId: string,
    start: { uploader: ClientId; controller: boolean; count: number; startedAt: number },
    index: number,
    bytes: string,
    byteLength: number,
  ): StoredBlobMeta {
    let blob = this.blobs.get(blobId)
    if (!blob) {
      blob = { ...start, received: 0, bytes: 0, done: false, chunks: new Map() }
      this.blobs.set(blobId, blob)
    }
    if (!blob.chunks.has(index)) {
      blob.chunks.set(index, bytes)
      blob.received += 1
      blob.bytes += byteLength
      blob.done = blob.received === blob.count
      this.totals.blobBytes += byteLength
      if (!blob.controller) this.totals.playerBlobBytes += byteLength
      this.totals.writes += 2
    }
    return this.meta(blob)
  }

  hasChunk(blobId: string, index: number): boolean {
    return this.blobs.get(blobId)?.chunks.has(index) ?? false
  }

  chunks(blobId: string): StoredChunk[] {
    const blob = this.blobs.get(blobId)
    if (!blob) return []
    return [...blob.chunks.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, bytes]) => ({ index, bytes }))
  }

  deleteBlob(blobId: string): void {
    const blob = this.blobs.get(blobId)
    if (!blob) return
    this.totals.blobBytes -= blob.bytes
    if (!blob.controller) this.totals.playerBlobBytes -= blob.bytes
    this.blobs.delete(blobId)
  }

  clear(): void {
    this.stored.length = 0
    this.sizes.length = 0
    this.seqs.clear()
    this.identities.clear()
    this.blobs.clear()
    this.totals = this.zero()
  }
}

// ---- the hub ----------------------------------------------------------------------------------

export interface SessionHubOptions {
  sessionId: string
  kind: ConnectionKind
  /** hex SHA-256 of the join token the controller registered; the store's value wins when it has one. */
  joinTokenHash: string
  crypto: CryptoProvider
  version?: string
  now?: () => number
  /** Where frames, seqs, identities and blobs live. Default: in memory. */
  store?: HubStore
  /** Caps below the kind's `LIMITS` (an operator's settings, a test). */
  limits?: Partial<Limits>
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
  /** Stored envelopes before the session is full (every sender; see `storeFrame()`). */
  storedEnvelopes?: number
  /** Stored envelope bytes (JSON) before the session is full. */
  storedBytes?: number
  /** Row writes (frames, identities, chunks) a session may cost in its lifetime. */
  rowWriteBudget?: number
  /** Largest `catchup.batch` in entry bytes; the client asks for the next page. */
  catchupBytes?: number
  onEvent?: (event: HubEvent) => void
}

interface Conn {
  clientId: ClientId
  controller: boolean
  host: boolean
  remote?: string
  socket: HubSocket
  lastSeq: number
  since: number
  open: boolean
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

export const STORE_DEFAULTS = { envelopes: 20_000, bytes: 64 * 1024 * 1024 } as const
/** Half a MiB of entries per catch-up page: well under any socket's message limit. */
export const CATCHUP_PAGE_BYTES = 512 * 1024

export class SessionHub {
  readonly limits: Limits
  readonly store: HubStore
  private readonly conns = new Map<ClientId, Conn>()
  private readonly identitiesByRemote = new Map<string, Set<ClientId>>()
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
  private readonly storeCap: { envelopes: number; bytes: number; writes: number }
  private readonly catchupBytes: number

  constructor(private readonly opts: SessionHubOptions) {
    this.limits = { ...LIMITS[opts.kind], ...opts.limits }
    this.store = opts.store ?? new MemoryHubStore()
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
    const envelopes = opts.storedEnvelopes ?? STORE_DEFAULTS.envelopes
    this.storeCap = {
      envelopes,
      bytes: opts.storedBytes ?? STORE_DEFAULTS.bytes,
      writes:
        opts.rowWriteBudget ??
        3 * envelopes + 2 * Math.ceil(this.limits.blobsTotalBytes / this.limits.chunkBytes) + 1000,
    }
    this.catchupBytes = opts.catchupBytes ?? CATCHUP_PAGE_BYTES
    if (!this.store.state())
      this.store.setState({ joinTokenHash: opts.joinTokenHash, ended: false })
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
    return this.store.lastIndex()
  }

  get ended(): boolean {
    return this.store.state()?.ended ?? false
  }

  private get joinTokenHash(): string {
    return this.store.state()?.joinTokenHash ?? ''
  }

  /** Stored envelopes in arrival order (a copy for stores that are not in memory). */
  get stored(): Envelope[] {
    if (this.store instanceof MemoryHubStore) return this.store.stored
    return this.store.readEnvelopes(0, Number.MAX_SAFE_INTEGER).map((row) => row.envelope)
  }

  get storedBytes(): number {
    return this.store.counts().envelopeBytes
  }

  /** Sealed bytes of every stored blob, complete or not. */
  get blobBytes(): number {
    return this.store.counts().blobBytes
  }

  /** The participants' share of `blobBytes`. */
  get playerBlobBytes(): number {
    return this.store.counts().playerBlobBytes
  }

  /** Blobs with their chunks; only the in-memory store can enumerate them (tests, the LAN server). */
  get blobs(): Map<string, StoredBlob> {
    return this.store instanceof MemoryHubStore ? this.store.blobs : new Map()
  }

  /** `POST /v1/sessions/:id/join-token` after a rotation. */
  setJoinTokenHash(hex: string): void {
    this.store.setState({ joinTokenHash: hex, ended: this.ended })
  }

  /** Whether `token` is the current join token (for an HTTP route that must check before upgrading). */
  async checkJoinToken(token: Uint8Array | undefined): Promise<boolean> {
    if (!token) return false
    const expected = this.joinTokenHash
    return (
      expected !== '' && constantTimeEqual(toHex(await this.opts.crypto.sha256(token)), expected)
    )
  }

  /**
   * Attach a connection. A refused connection gets `relay.error` and a close with the spec's
   * code; the returned handle is then already closed.
   */
  async attach(socket: HubSocket, options: HubAttachOptions): Promise<HubClient> {
    const conn = this.connFor(
      socket,
      options.clientId,
      options.controller ?? false,
      options.host ?? true,
      this.now(),
      options.remote,
    )
    const handle = this.handleFor(conn)
    const refuse = (code: number, reason: string, error: RelayErrorCode) => {
      this.deliver(conn, this.serverFrame(conn, 'relay.error', { code: error, message: reason }))
      this.opts.onEvent?.({ type: 'refused', clientId: conn.clientId, code, reason })
      // Never joined, so nothing to announce: controllers learn nothing about refused attempts.
      this.closeConn(conn, code, reason, false)
      return handle
    }
    if (this.ended) return refuse(CLOSE_CODES.SESSION_ENDED, 'Session ended', 'SESSION_ENDED')
    if (!conn.controller && !(await this.checkJoinToken(options.joinToken))) {
      return refuse(CLOSE_CODES.BAD_JOIN_TOKEN, 'Bad join token', 'BAD_JOIN_TOKEN')
    }
    const knownIdentity = this.store.identity(conn.clientId) !== undefined
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
    conn.lastSeq = this.store.lastSeq(conn.clientId)
    if (previous) this.closeConn(previous, 1000, 'Replaced by a new connection', false)
    this.conns.set(conn.clientId, conn)
    this.opts.onEvent?.({ type: 'open', clientId: conn.clientId, controller: conn.controller })
    this.deliver(conn, this.serverFrame(conn, 'relay.hello', this.hello(conn)))
    if (!previous) this.presence(conn, 'online')
    return handle
  }

  /**
   * Re-register a connection the transport kept while this hub was not in memory: no hello, no
   * presence, the client's `seq` from the store. For a Durable Object waking from hibernation.
   */
  restore(socket: HubSocket, options: HubRestoreOptions): HubClient {
    const conn = this.connFor(
      socket,
      options.clientId,
      options.controller,
      options.host ?? true,
      options.since,
      options.remote,
    )
    conn.lastSeq = this.store.lastSeq(conn.clientId)
    const previous = this.conns.get(conn.clientId)
    if (previous) previous.open = false
    this.conns.set(conn.clientId, conn)
    if (!conn.controller && conn.remote) this.rememberRemote(conn.remote, conn.clientId)
    return this.handleFor(conn)
  }

  private connFor(
    socket: HubSocket,
    clientId: ClientId,
    controller: boolean,
    host: boolean,
    since: number,
    remote: string | undefined,
  ): Conn {
    return {
      clientId,
      controller,
      host: controller && host,
      ...(remote ? { remote } : {}),
      socket,
      lastSeq: 0,
      since,
      open: true,
    }
  }

  private handleFor(conn: Conn): HubClient {
    return {
      clientId: conn.clientId,
      controller: conn.controller,
      host: conn.host,
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
    const known = this.store.identity(conn.clientId)
    if (conn.controller) {
      if (known && known.kind !== 'controller') return false
      if (!known) this.store.setIdentity(conn.clientId, { kind: 'controller' })
      return true
    }
    if (!resumeToken || resumeToken.length < 16) return false
    const resumeHash = toHex(await this.opts.crypto.sha256(resumeToken))
    if (!known) {
      this.store.setIdentity(conn.clientId, { kind: 'participant', resumeHash })
      return true
    }
    return known.kind === 'participant' && constantTimeEqual(known.resumeHash, resumeHash)
  }

  /** `POST /v1/sessions/:id/kick`: close with 4003. The controller also rotates the key. */
  kick(clientId: ClientId): void {
    const conn = this.conns.get(clientId)
    if (conn) this.closeConn(conn, CLOSE_CODES.KICKED, 'Removed by the facilitator')
  }

  /** Closes one connection with a code of the transport's choosing (1001 at a restart). */
  disconnect(clientId: ClientId, code: number, reason: string): void {
    const conn = this.conns.get(clientId)
    if (conn) this.closeConn(conn, code, reason)
  }

  /** After `session.end` fanned out: drop the store and close everyone. */
  end(): void {
    this.store.setState({ joinTokenHash: this.joinTokenHash, ended: true })
    for (const conn of [...this.conns.values()]) {
      this.closeConn(conn, CLOSE_CODES.SESSION_ENDED, 'Session ended')
    }
    this.store.clear()
    this.buckets.clear()
    this.uploaded.clear()
  }

  /** Participants learn nothing about other clients from hello; the host gets the roster. */
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
    if (!conn.host) return base
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

  /** A send that throws (a socket gone bad, a message over the transport's limit) ends the connection. */
  private deliver(conn: Conn, frame: string): void {
    if (!conn.open) return
    try {
      conn.socket.send(frame)
    } catch {
      this.opts.onEvent?.({ type: 'send_failed', clientId: conn.clientId })
      this.closeConn(conn, 1011, 'Send failed', true)
    }
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
    if (closeSocket) {
      try {
        conn.socket.close(code, reason)
      } catch {
        // The socket was already gone.
      }
    }
    this.opts.onEvent?.({ type: 'close', clientId: conn.clientId, code, reason })
    if (announce) this.presence(conn, 'offline')
  }

  /** Presence goes to the host connection only: the roster is the controller's business. */
  private presence(about: Conn, state: 'online' | 'offline'): void {
    for (const other of [...this.conns.values()]) {
      if (other === about || !other.host) continue
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

  /**
   * Checks in the order the spec fixes: size → parse → from → seq → type allowed → rate → store →
   * route. The sender's `seq` is recorded only once a frame passed every check, so a refused
   * frame costs no write and does not burn a sequence number.
   */
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
    if (CONTROLLER_ONLY_TYPES.has(e.type) && !conn.controller) {
      return this.error(conn, 'NOT_CONTROLLER', `${e.type} is a controller type`)
    }
    if (HOST_ONLY_TYPES.has(e.type) && !conn.host) {
      return this.error(conn, 'NOT_CONTROLLER', `${e.type} is a host type, not a co-controller's`)
    }
    if (PARTICIPANT_ONLY_TYPES.has(e.type) && conn.controller) {
      return this.error(conn, 'INVALID', `${e.type} comes from a device, not a controller`)
    }
    switch (e.type) {
      case 'presence':
      case 'catchup.batch':
      case 'relay.hello':
      case 'relay.error':
      case 'relay.blob.chunk':
      case 'relay.blob.done':
        return this.error(conn, 'INVALID', `${e.type} is a server frame`)
    }
    if (this.rateLimited(conn)) {
      this.error(conn, 'RATE_LIMITED', 'Too many frames', { retryAfterMs: 60_000 })
      return this.closeConn(conn, CLOSE_CODES.RATE_LIMITED, 'Rate limited')
    }
    conn.lastSeq = e.seq
    // Ephemeral frames' seqs stay in memory: a replay of one after a restart is harmless.
    if (!EPHEMERAL_TYPES.has(e.type)) this.store.setLastSeq(conn.clientId, e.seq)
    switch (e.type) {
      case 'catchup.request':
        return this.catchup(conn, e)
      case 'relay.blob.put':
        return this.blobPut(conn, e)
      case 'relay.blob.get':
        return this.blobGet(conn, e)
    }
    if (!EPHEMERAL_TYPES.has(e.type) && !this.storeFrame(conn, e, frame)) return
    this.route(conn, e, frame)
  }

  /** Whether the session may take one more frame of `bytes`. */
  private storeHasRoom(bytes: number): boolean {
    const counts = this.store.counts()
    return (
      counts.envelopes < this.storeCap.envelopes &&
      counts.envelopeBytes + bytes <= this.storeCap.bytes &&
      counts.writes < this.storeCap.writes
    )
  }

  /**
   * Arrival indexes are positions, so nothing is ever evicted. The caps apply to every sender:
   * a participant's frame past them is refused with `STORE_FULL` and goes nowhere; a controller's
   * is still routed live (an end or a notice must get through) but is not stored, and the
   * controller is told `STORE_FULL` so the app can warn that late joiners will miss it.
   */
  private storeFrame(conn: Conn, e: Envelope, frame: string): boolean {
    const bytes = byteLength(frame)
    if (this.storeHasRoom(bytes)) {
      this.store.appendEnvelope(e, frame, bytes)
      return true
    }
    this.opts.onEvent?.({ type: 'store_full', clientId: conn.clientId })
    this.error(conn, 'STORE_FULL', 'The session store is full')
    return conn.controller
  }

  /** Whether a stored or live frame is for this connection, by its `to` alone. */
  private visibleTo(conn: Conn, e: Envelope): boolean {
    if (e.to === 'controller') return conn.host
    if (e.to.startsWith('client:')) return e.to === `client:${conn.clientId}`
    return true // all, role:, team: (clients filter by their own role from welcome)
  }

  private route(sender: Conn, e: Envelope, frame: string): void {
    for (const conn of [...this.conns.values()]) {
      if (conn === sender || !this.visibleTo(conn, e)) continue
      this.deliver(conn, frame)
    }
  }

  /**
   * One page per request: up to `limit` stored frames after `after`, cut when the entries
   * addressed to this connection pass `catchupBytes`. `to` is the index the page reached; the
   * client asks for the next page with `after: to` until `done`. A participant may ask only a
   * few times a minute.
   */
  private catchup(conn: Conn, e: Envelope): void {
    const req = CatchupRequestPayload.safeParse(e.payload)
    if (!req.success) return this.error(conn, 'INVALID', 'Bad catchup.request')
    if (!conn.controller && !this.take(`catchup:${conn.clientId}`, this.catchupsPerMinute)) {
      return this.error(conn, 'RATE_LIMITED', 'Too many catch-up requests', {
        retryAfterMs: 10_000,
      })
    }
    const limit = req.data.limit ?? 100
    const after = req.data.after
    const page = this.store.readEnvelopes(after, limit)
    const entries: { i: number; e: Envelope }[] = []
    let to = after
    let bytes = 0
    for (const row of page) {
      // Never a client's own frames (spec 0406 routing): it has them, and its replay guard
      // would otherwise take them for fresh frames from itself.
      const mine = row.envelope.from !== conn.clientId && this.visibleTo(conn, row.envelope)
      if (mine && entries.length > 0 && bytes + row.bytes > this.catchupBytes) break
      to = row.index
      if (mine) {
        entries.push({ i: row.index, e: row.envelope })
        bytes += row.bytes
      }
    }
    const done = to >= this.store.lastIndex()
    this.deliver(conn, this.serverFrame(conn, 'catchup.batch', { from: after, to, entries, done }))
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
    const blob = this.store.blob(blobId)
    if (blob && blob.uploader !== conn.clientId)
      return this.error(conn, 'INVALID', 'Blob belongs to another client', { blobId })
    if (blob && (blob.count !== count || blob.done))
      return this.error(conn, 'INVALID', 'Blob already stored or count changed', { blobId })
    if (blob && this.store.hasChunk(blobId, index)) return
    const cap = conn.controller ? this.limits.blobBytes : this.limits.playerBlobBytes
    const soFar = blob?.bytes ?? 0
    // The sealed size is the plaintext plus a 16-byte tag; the cap is on what the uploader may send.
    if (soFar + chunk.length > cap + 16) {
      this.store.deleteBlob(blobId)
      return this.error(conn, 'BLOB_TOO_LARGE', 'Blob over the cap for this uploader', { blobId })
    }
    if (!this.quotaAllows(conn, chunk.length)) {
      this.store.deleteBlob(blobId)
      return this.error(conn, 'BLOB_QUOTA', 'Blob quota reached', { blobId })
    }
    const after = this.store.putChunk(
      blobId,
      { uploader: conn.clientId, controller: conn.controller, count, startedAt: this.now() },
      index,
      bytes,
      chunk.length,
    )
    if (!conn.controller) {
      this.uploaded.set(conn.clientId, (this.uploaded.get(conn.clientId) ?? 0) + chunk.length)
    }
    if (after.done) {
      this.deliver(
        conn,
        this.serverFrame(conn, 'relay.blob.done', {
          blobId,
          stored: true,
          totalBytes: after.bytes,
        }),
      )
    }
  }

  /**
   * The controller's uploads count against the session quota and the write budget alone;
   * participants share a smaller pool and each identity has a budget for the whole session
   * (freed bytes do not refill it), so one device cannot fill the host with half-finished uploads.
   */
  private quotaAllows(conn: Conn, bytes: number): boolean {
    const counts = this.store.counts()
    if (counts.blobBytes + bytes > this.limits.blobsTotalBytes) return false
    if (counts.writes >= this.storeCap.writes) return false
    if (conn.controller) return true
    if (counts.playerBlobBytes + bytes > this.playersBlobPool) return false
    return (this.uploaded.get(conn.clientId) ?? 0) + bytes <= this.playerUploadBudget
  }

  /** Drop uploads that never completed within the TTL; a transport calls this on a timer too. */
  sweepBlobs(now = this.now()): number {
    let dropped = 0
    for (const blob of this.store.listBlobs()) {
      if (!blob.done && now - blob.startedAt > this.incompleteBlobTtl) {
        this.store.deleteBlob(blob.blobId)
        dropped += 1
      }
    }
    return dropped
  }

  private blobGet(conn: Conn, e: Envelope): void {
    const get = RelayBlobGet.safeParse(e.payload)
    if (!get.success) return this.error(conn, 'INVALID', 'Bad relay.blob.get')
    const blob = this.store.blob(get.data.blobId)
    if (!blob?.done)
      return this.error(conn, 'BLOB_UNKNOWN', 'No such blob', { blobId: get.data.blobId })
    for (const { index, bytes } of this.store.chunks(get.data.blobId)) {
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
    const blob = this.store.blob(blobId)
    if (!blob?.done) return undefined
    return this.store.chunks(blobId).map((c) => c.bytes)
  }
}

/** Hex digests compared without an early exit; different lengths are compared against themselves. */
export function constantTimeEqual(a: string, b: string): boolean {
  const right = a.length === b.length ? b : a
  let diff = a.length === b.length ? 0 : 1
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}
