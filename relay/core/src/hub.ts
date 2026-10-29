/**
 * The server contract of spec 0406 ("Session lifecycle", "Routing") as one state machine per
 * session, with no sockets and no keys: `MemoryServer` in `src/shared/live/transport-memory.ts`
 * is the reference, and the conformance suite in `relay/core/test/conformance.ts` holds both to
 * the same behaviour. Adapters (Cloudflare Durable Object, Node `ws`, the in-app LAN server)
 * own the sockets, call `accept` / `onFrame` / `onClose`, and persist through a `SessionStore`.
 *
 * Per frame, in the order the spec fixes: size cap → envelope parse → `from` is the connection's
 * id → `seq` strictly increasing per client → type allowed for this connection → rate limit →
 * store (unless ephemeral) → route by `to`. The hub reads `v`, `session`, `seq`, `from`, `to`,
 * `type` and the frame size, and never a payload.
 */
import { fromBase64Url } from '@shared/live/bytes'
import {
  CLOSE_CODES,
  CONTROLLER_ONLY_TYPES,
  EPHEMERAL_TYPES,
  PROTOCOL_VERSION,
  type ConnectionKind,
} from '@shared/live/protocol'
import { Base64Url22, type ClientId, type Envelope } from '@shared/live/schemas/envelope'
import {
  CatchupRequestPayload,
  RelayBlobGet,
  RelayBlobPut,
  type CatchupBatchPayload,
  type PresencePayload,
  type RelayBlobChunk,
  type RelayBlobDone,
  type RelayError,
  type RelayErrorCode,
  type RelayHello,
} from '@shared/live/schemas/relay'
import { checkFrame, type IncomingFrame } from './frames'
import { announcedLimits, HUB_LIMITS, RETENTION_MS, TOMBSTONE_MS, type HubLimits } from './limits'
import { SlidingWindow, TokenBucket } from './quota'
import type { SessionMeta, SessionStore } from './store'
import { hashBearerToken, hashJoinToken, hashResumeToken, matchesAny, randomToken } from './tokens'

/** What the hub needs from a socket. Adapters build one per accepted connection. */
export interface Connection {
  readonly clientId: ClientId
  /** Presented a controller token (or is the in-process controller of the LAN server). */
  readonly controller: boolean
  send(frame: string): void
  close(code: number, reason: string): void
  /** Remote address, for connection logs only. */
  readonly remote?: string
}

export interface AcceptAuth {
  clientId: string
  /** Participants: base64url join token from the invite (`?j=`). */
  joinToken?: string
  /** Participants: base64url resume token that binds the client id to this device (`?r=`). */
  resumeToken?: string
  /** Controllers: the token minted at creation (`Authorization: Bearer`). */
  controllerToken?: string
  /**
   * The in-process controller of the LAN server (#407), where no token exists because the
   * server runs inside the facilitator's app. Never set from anything a network peer sent.
   */
  trustedController?: boolean
}

/** Whether an auth makes a controller connection; adapters set `Connection.controller` from it. */
export function isControllerAuth(auth: AcceptAuth): boolean {
  return auth.trustedController === true || auth.controllerToken !== undefined
}

export type AcceptResult =
  | { ok: true; controller: boolean; replaced: boolean }
  | { ok: false; code: number; error: RelayErrorCode; message: string }

export type LogEventKind =
  | 'accept'
  | 'refuse'
  | 'close'
  | 'kick'
  | 'end'
  | 'rate_limited'
  | 'store_full'
  | 'blob_refused'
  | 'frame_refused'

/** A connection-level event for the server's log. Carries no payload, token or key, ever. */
export interface LogEvent {
  event: LogEventKind
  session: string
  client?: string
  controller?: boolean
  code?: number
  error?: RelayErrorCode
  type?: string
  remote?: string
  bytes?: number
}

export interface SessionHubOptions {
  sessionId: string
  store: SessionStore
  kind: ConnectionKind
  limits?: HubLimits
  version?: string
  now?: () => number
  log?: (event: LogEvent) => void
  retentionMs?: number
}

type PlainType =
  | 'presence'
  | 'catchup.batch'
  | 'relay.hello'
  | 'relay.error'
  | 'relay.blob.chunk'
  | 'relay.blob.done'
type PlainPayload<T extends PlainType> = T extends 'presence'
  ? PresencePayload
  : T extends 'catchup.batch'
    ? CatchupBatchPayload
    : T extends 'relay.hello'
      ? RelayHello
      : T extends 'relay.error'
        ? RelayError
        : T extends 'relay.blob.chunk'
          ? RelayBlobChunk
          : RelayBlobDone

interface ConnState {
  conn: Connection
  since: number
  lastSeq: number
  bucket: TokenBucket
  /** Consecutive rate-limited frames; past the burst the connection is closed. */
  strikes: number
  open: boolean
}

const CONTROLLER_TOKEN_REFUSED = 'Bad controller token'

export class SessionHub {
  readonly limits: HubLimits
  private readonly conns = new Map<ClientId, ConnState>()
  private readonly reconnects: SlidingWindow<ClientId>
  private readonly sessionBucket: TokenBucket
  private readonly now: () => number
  private readonly log: (event: LogEvent) => void
  private readonly retentionMs: number

  constructor(private readonly opts: SessionHubOptions) {
    this.limits = opts.limits ?? HUB_LIMITS[opts.kind]
    this.now = opts.now ?? (() => Date.now())
    this.log = opts.log ?? (() => {})
    this.retentionMs = opts.retentionMs ?? RETENTION_MS
    this.reconnects = new SlidingWindow(this.limits.rates.reconnectsPerHour, 60 * 60 * 1000)
    this.sessionBucket = new TokenBucket(
      this.limits.rates.sessionBurst,
      this.limits.rates.sessionPerMinute,
      this.now(),
    )
  }

  get sessionId(): string {
    return this.opts.sessionId
  }

  get store(): SessionStore {
    return this.opts.store
  }

  get meta(): SessionMeta | undefined {
    return this.opts.store.meta()
  }

  get exists(): boolean {
    return this.meta !== undefined
  }

  get ended(): boolean {
    return this.meta?.endedAt !== undefined
  }

  get lastIndex(): number {
    return this.opts.store.lastIndex()
  }

  get connected(): ClientId[] {
    return [...this.conns.keys()]
  }

  /** When the retention alarm must delete everything (`createdAt + retention`). */
  get expiresAt(): number | undefined {
    return this.meta?.expiresAt
  }

  /** When the tombstone of an ended session may go (`endedAt + 1 h`). */
  get tombstoneExpiresAt(): number | undefined {
    const ended = this.meta?.endedAt
    return ended === undefined ? undefined : ended + TOMBSTONE_MS
  }

  // ---- lifecycle -------------------------------------------------------------------------

  /**
   * `POST /v1/sessions`: mints the controller token (returned once; only its hash is kept) and
   * records the join-token hash when the app already has one. The join token is derived from the
   * session id the server mints, so the app usually sets it right after with `setJoinTokenHash`;
   * until then no participant can connect.
   */
  async create(
    input: { joinTokenHash?: string } = {},
  ): Promise<{ meta: SessionMeta; controllerToken: string }> {
    if (this.exists) throw new Error('Session already exists')
    const controllerToken = randomToken()
    const createdAt = this.now()
    const meta: SessionMeta = {
      sessionId: this.opts.sessionId,
      createdAt,
      expiresAt: createdAt + this.retentionMs,
      joinTokenHash: input.joinTokenHash ?? '',
      controllerTokenHashes: [await hashBearerToken(controllerToken)],
    }
    this.opts.store.setMeta(meta)
    return { meta, controllerToken }
  }

  /** `POST /v1/sessions/:id/controllers` (#440): one more controller token. */
  async addController(): Promise<string> {
    const meta = this.requireMeta()
    const token = randomToken()
    meta.controllerTokenHashes.push(await hashBearerToken(token))
    this.opts.store.setMeta(meta)
    return token
  }

  /** `POST /v1/sessions/:id/join-token` after a rotation. */
  setJoinTokenHash(hex: string): void {
    const meta = this.requireMeta()
    this.opts.store.setMeta({ ...meta, joinTokenHash: hex })
  }

  /** Whether a bearer token is one of this session's controller tokens (for the HTTP routes). */
  async isControllerToken(token: string | undefined): Promise<boolean> {
    const meta = this.meta
    if (!meta || !token) return false
    return matchesAny(await hashBearerToken(token), meta.controllerTokenHashes)
  }

  /** `POST /v1/sessions/:id/kick`: close with 4003. The controller also rotates the key. */
  kick(clientId: ClientId): void {
    const state = this.conns.get(clientId)
    this.log({ event: 'kick', session: this.sessionId, client: clientId })
    if (state) this.closeConn(state, CLOSE_CODES.KICKED, 'Removed by the facilitator')
  }

  /**
   * After `session.end` fanned out (or `POST /v1/sessions/:id/end`, or the retention alarm):
   * close everyone, drop the content, keep a tombstone.
   */
  end(): void {
    const meta = this.meta
    if (!meta || meta.endedAt !== undefined) return
    this.opts.store.setMeta({ ...meta, endedAt: this.now() })
    for (const state of [...this.conns.values()]) {
      this.closeConn(state, CLOSE_CODES.SESSION_ENDED, 'Session ended')
    }
    this.opts.store.deleteContent()
    this.log({ event: 'end', session: this.sessionId })
  }

  // ---- connections -----------------------------------------------------------------------

  /**
   * Admits a connection or refuses it with a `relay.error` and a close code. The adapter has
   * already accepted the socket, so a refused client learns why.
   */
  async accept(conn: Connection, auth: AcceptAuth): Promise<AcceptResult> {
    const refused = await this.checkAuth(conn, auth)
    if (refused) {
      this.deliver(
        conn,
        this.serverFrame(conn.clientId, 'relay.error', {
          code: refused.error,
          message: refused.message,
        }),
      )
      conn.close(refused.code, refused.message)
      this.log({
        event: 'refuse',
        session: this.sessionId,
        client: auth.clientId,
        code: refused.code,
        error: refused.error,
        remote: conn.remote,
      })
      return refused
    }
    const previous = this.conns.get(conn.clientId)
    if (previous) this.closeConn(previous, 1000, 'Replaced by a new connection', false)
    const state = this.attach(conn)
    this.deliver(conn, this.serverFrame(conn.clientId, 'relay.hello', this.hello(state)))
    if (!previous) this.presence(state, 'online')
    this.log({
      event: 'accept',
      session: this.sessionId,
      client: conn.clientId,
      controller: conn.controller,
      remote: conn.remote,
    })
    return { ok: true, controller: conn.controller, replaced: previous !== undefined }
  }

  /**
   * Registers a connection without a hello or presence: an adapter that lost its memory (a
   * Durable Object waking from hibernation) rebuilds its connections this way before handling
   * their frames.
   */
  attach(conn: Connection, since = this.now()): ConnState {
    const rates = this.limits.rates
    const state: ConnState = {
      conn,
      since,
      lastSeq: this.opts.store.lastSeq(conn.clientId),
      bucket: conn.controller
        ? new TokenBucket(rates.controllerBurst, rates.controllerPerMinute, this.now())
        : new TokenBucket(rates.clientBurst, rates.clientPerMinute, this.now()),
      strikes: 0,
      open: true,
    }
    this.conns.set(conn.clientId, state)
    return state
  }

  /** The socket closed (by the peer, a timeout, or after the hub asked): drop it, tell controllers. */
  onClose(conn: Connection, code = 1000): void {
    const state = this.conns.get(conn.clientId)
    if (!state || state.conn !== conn) return
    this.log({
      event: 'close',
      session: this.sessionId,
      client: conn.clientId,
      code,
      remote: conn.remote,
    })
    state.open = false
    this.conns.delete(conn.clientId)
    this.presence(state, 'offline')
  }

  private async checkAuth(
    conn: Connection,
    auth: AcceptAuth,
  ): Promise<Extract<AcceptResult, { ok: false }> | undefined> {
    const refuse = (code: number, error: RelayErrorCode, message: string) => ({
      ok: false as const,
      code,
      error,
      message,
    })
    const meta = this.meta
    if (!meta) return refuse(CLOSE_CODES.SESSION_ENDED, 'SESSION_ENDED', 'Unknown session')
    if (meta.endedAt !== undefined) {
      return refuse(CLOSE_CODES.SESSION_ENDED, 'SESSION_ENDED', 'Session ended')
    }
    if (!Base64Url22.safeParse(auth.clientId).success || auth.clientId !== conn.clientId) {
      return refuse(CLOSE_CODES.CLIENT_ID_IN_USE, 'INVALID', 'Bad client id')
    }
    if (conn.controller) {
      if (!auth.trustedController) {
        const presented = auth.controllerToken ? await hashBearerToken(auth.controllerToken) : ''
        if (!matchesAny(presented, meta.controllerTokenHashes)) {
          return refuse(CLOSE_CODES.BAD_JOIN_TOKEN, 'BAD_JOIN_TOKEN', CONTROLLER_TOKEN_REFUSED)
        }
      }
    } else {
      const presented = await hashJoinToken(auth.joinToken)
      if (!presented || !meta.joinTokenHash || !matchesAny(presented, [meta.joinTokenHash])) {
        return refuse(CLOSE_CODES.BAD_JOIN_TOKEN, 'BAD_JOIN_TOKEN', 'Bad join token')
      }
    }
    const reconnect = this.reconnects.hit(conn.clientId, this.now())
    if (!reconnect.ok) {
      return refuse(
        CLOSE_CODES.RATE_LIMITED,
        'RATE_LIMITED',
        'Too many connections for this client',
      )
    }
    if (!(await this.bindIdentity(conn, auth.resumeToken))) {
      return refuse(
        CLOSE_CODES.CLIENT_ID_IN_USE,
        'BAD_RESUME_TOKEN',
        'Client id belongs to another device',
      )
    }
    if (this.conns.size >= this.limits.clients && !this.conns.has(conn.clientId)) {
      return refuse(CLOSE_CODES.SESSION_FULL, 'SESSION_FULL', 'Session full')
    }
    return undefined
  }

  /**
   * A client id is owned by whoever used it first: a controller connection, or the participant
   * whose resume token hashes to what was registered. Anyone else is refused.
   */
  private async bindIdentity(conn: Connection, resumeToken: string | undefined): Promise<boolean> {
    const known = this.opts.store.identity(conn.clientId)
    if (conn.controller) {
      if (known && known.kind !== 'controller') return false
      if (!known) this.opts.store.setIdentity(conn.clientId, { kind: 'controller' })
      return true
    }
    const resumeHash = await hashResumeToken(resumeToken)
    if (!resumeHash) return false
    if (!known) {
      this.opts.store.setIdentity(conn.clientId, { kind: 'participant', resumeHash })
      return true
    }
    return known.kind === 'participant' && matchesAny(resumeHash, [known.resumeHash])
  }

  private closeConn(state: ConnState, code: number, reason: string, announce = true): void {
    if (!state.open) return
    state.open = false
    if (this.conns.get(state.conn.clientId) === state) this.conns.delete(state.conn.clientId)
    state.conn.close(code, reason)
    if (announce) this.presence(state, 'offline')
  }

  // ---- server frames ---------------------------------------------------------------------

  /** Participants learn nothing about other clients from hello; controllers get the roster. */
  private hello(state: ConnState): RelayHello {
    const base: RelayHello = {
      index: this.lastIndex,
      yourLastSeq: state.lastSeq,
      server: {
        kind: this.opts.kind,
        version: this.opts.version ?? 'dev',
        protocol: [PROTOCOL_VERSION],
      },
      caps: announcedLimits(this.limits),
    }
    if (!state.conn.controller) return base
    const clients = [...this.conns.values()].map((c) => ({
      client: c.conn.clientId,
      since: c.since,
    }))
    return { ...base, clients }
  }

  private serverFrame<T extends PlainType>(
    to: ClientId,
    type: T,
    payload: PlainPayload<T>,
  ): string {
    const envelope: Envelope = {
      v: PROTOCOL_VERSION,
      session: this.opts.sessionId,
      seq: 0,
      from: 'server',
      to: `client:${to}`,
      type,
      ts: this.now(),
      payload: payload as Record<string, unknown>,
    }
    return JSON.stringify(envelope)
  }

  private deliver(conn: Connection, frame: string): void {
    try {
      conn.send(frame)
    } catch {
      // A socket that is already gone: its close event cleans up.
    }
  }

  /** Presence goes to controller connections only: the roster is the controller's business. */
  private presence(about: ConnState, state: 'online' | 'offline'): void {
    const payload: PresencePayload = { client: about.conn.clientId, state, at: this.now() }
    for (const other of this.conns.values()) {
      if (other === about || !other.conn.controller) continue
      this.deliver(other.conn, this.serverFrame(other.conn.clientId, 'presence', payload))
    }
  }

  private error(
    conn: Connection,
    code: RelayErrorCode,
    message: string,
    extra: { blobId?: string; retryAfterMs?: number } = {},
  ): void {
    const payload: RelayError = { code, message }
    if (extra.blobId) payload.blobId = extra.blobId
    if (extra.retryAfterMs !== undefined)
      payload.retryAfterMs = Math.max(0, Math.ceil(extra.retryAfterMs))
    this.deliver(conn, this.serverFrame(conn.clientId, 'relay.error', payload))
  }

  // ---- frames ----------------------------------------------------------------------------

  /** Checks in the order the spec fixes: size → parse → from → seq → type allowed → rate → store → route. */
  onFrame(conn: Connection, data: IncomingFrame): void {
    const state = this.conns.get(conn.clientId)
    if (!state || state.conn !== conn || !state.open) return
    const checked = checkFrame(data, this.limits)
    if (!checked.ok) {
      this.log({
        event: 'frame_refused',
        session: this.sessionId,
        client: conn.clientId,
        error: checked.code,
      })
      return this.error(conn, checked.code, checked.message)
    }
    const { envelope: e, frame } = checked
    if (e.session !== this.opts.sessionId) return this.error(conn, 'INVALID', 'Wrong session')
    if (e.from !== conn.clientId) {
      return this.error(conn, 'INVALID', 'from does not match the connection')
    }
    if (e.seq <= state.lastSeq) return // a confused or replaying client: drop silently
    state.lastSeq = e.seq
    this.opts.store.setLastSeq(conn.clientId, e.seq)
    if (CONTROLLER_ONLY_TYPES.has(e.type) && !conn.controller) {
      return this.error(conn, 'NOT_CONTROLLER', `${e.type} is a controller type`)
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
    if (!this.withinRate(state)) return
    switch (e.type) {
      case 'catchup.request':
        return this.catchup(conn, e)
      case 'relay.blob.put':
        return this.blobPut(conn, e)
      case 'relay.blob.get':
        return this.blobGet(conn, e)
    }
    if (!EPHEMERAL_TYPES.has(e.type)) {
      if (!conn.controller && this.opts.store.count() >= this.limits.storedEnvelopes) {
        this.log({ event: 'store_full', session: this.sessionId, client: conn.clientId })
        return this.error(conn, 'STORE_FULL', 'Session store is full')
      }
      this.opts.store.append({ from: e.from, to: e.to, type: e.type, frame })
    }
    this.route(state, e, frame)
  }

  /**
   * One token per frame from the connection's bucket and the session's. Over the limit the frame
   * is dropped with `RATE_LIMITED` and `retryAfterMs`; a client that keeps going past its burst
   * is closed with 4008.
   */
  private withinRate(state: ConnState): boolean {
    const now = this.now()
    const own = state.bucket.take(now)
    const shared = own.ok ? this.sessionBucket.take(now) : own
    if (own.ok && shared.ok) {
      state.strikes = 0
      return true
    }
    const retryAfterMs = (own.ok ? shared : own) as { ok: false; retryAfterMs: number }
    state.strikes += 1
    this.log({ event: 'rate_limited', session: this.sessionId, client: state.conn.clientId })
    this.error(state.conn, 'RATE_LIMITED', 'Too many frames; slow down', {
      retryAfterMs: retryAfterMs.retryAfterMs,
    })
    const burst = state.conn.controller
      ? this.limits.rates.controllerBurst
      : this.limits.rates.clientBurst
    if (state.strikes > burst) this.closeConn(state, CLOSE_CODES.RATE_LIMITED, 'Rate limited')
    return false
  }

  /** Whether a stored or live frame is for this connection, by its `to` alone. */
  private visibleTo(conn: Connection, to: string): boolean {
    if (to === 'controller') return conn.controller
    if (to.startsWith('client:')) return to === `client:${conn.clientId}`
    return true // all, role:, team: (clients filter by their own role from welcome)
  }

  private route(sender: ConnState, e: Envelope, frame: string): void {
    for (const state of this.conns.values()) {
      if (state === sender || !state.open || !this.visibleTo(state.conn, e.to)) continue
      this.deliver(state.conn, frame)
    }
  }

  /** Stored frames addressed to this connection, in arrival order, in pages of `limit`. */
  private catchup(conn: Connection, e: Envelope): void {
    const req = CatchupRequestPayload.safeParse(e.payload)
    if (!req.success) return this.error(conn, 'INVALID', 'Bad catchup.request')
    const limit = req.data.limit ?? 100
    const total = this.opts.store.lastIndex()
    let after = req.data.after
    let done = false
    while (!done) {
      const page = this.opts.store.readAfter(after, limit)
      const to = after + page.length
      done = to >= total || page.length < limit
      const entries = page
        .filter((row) => row.from !== conn.clientId && this.visibleTo(conn, row.to))
        .map((row) => ({ i: row.index, e: JSON.parse(row.frame) as Envelope }))
      this.deliver(
        conn,
        this.serverFrame(conn.clientId, 'catchup.batch', { from: after, to, entries, done }),
      )
      after = to
    }
  }

  private blobPut(conn: Connection, e: Envelope): void {
    const put = RelayBlobPut.safeParse(e.payload)
    if (!put.success) return this.error(conn, 'INVALID', 'Bad relay.blob.put')
    const { blobId, index, count, bytes } = put.data
    let chunk: Uint8Array
    try {
      chunk = fromBase64Url(bytes)
    } catch {
      return this.error(conn, 'INVALID', 'Bad chunk encoding', { blobId })
    }
    const store = this.opts.store
    if (chunk.length > this.limits.chunkBytes) {
      return this.error(conn, 'TOO_LARGE', 'Chunk over the cap', { blobId })
    }
    if (index >= count) return this.error(conn, 'INVALID', 'Chunk index out of range', { blobId })
    const existing = store.blob(blobId)
    if (existing && existing.uploader !== conn.clientId) {
      return this.error(conn, 'INVALID', 'Blob belongs to another client', { blobId })
    }
    if (existing && (existing.count !== count || existing.done)) {
      return this.error(conn, 'INVALID', 'Blob already stored or count changed', { blobId })
    }
    if (existing && store.hasChunk(blobId, index)) return
    const cap = conn.controller ? this.limits.blobBytes : this.limits.playerBlobBytes
    const soFar = existing?.bytes ?? 0
    // The sealed size is the plaintext plus a 16-byte tag; the cap is on what the uploader may send.
    if (soFar + chunk.length > cap + 16) {
      store.deleteBlob(blobId)
      this.log({
        event: 'blob_refused',
        session: this.sessionId,
        client: conn.clientId,
        error: 'BLOB_TOO_LARGE',
      })
      return this.error(conn, 'BLOB_TOO_LARGE', 'Blob over the cap for this uploader', { blobId })
    }
    if (store.blobBytes() + chunk.length > this.limits.blobsTotalBytes) {
      store.deleteBlob(blobId)
      this.log({
        event: 'blob_refused',
        session: this.sessionId,
        client: conn.clientId,
        error: 'BLOB_QUOTA',
      })
      return this.error(conn, 'BLOB_QUOTA', 'Session blob quota reached', { blobId })
    }
    const blob = store.putChunk(blobId, conn.clientId, count, index, bytes, chunk.length)
    if (blob.done) {
      this.deliver(
        conn,
        this.serverFrame(conn.clientId, 'relay.blob.done', {
          blobId,
          stored: true,
          totalBytes: blob.bytes,
        }),
      )
    }
  }

  private blobGet(conn: Connection, e: Envelope): void {
    const get = RelayBlobGet.safeParse(e.payload)
    if (!get.success) return this.error(conn, 'INVALID', 'Bad relay.blob.get')
    const { blobId } = get.data
    const blob = this.opts.store.blob(blobId)
    if (!blob?.done) return this.error(conn, 'BLOB_UNKNOWN', 'No such blob', { blobId })
    for (const { index, bytes } of this.opts.store.chunks(blobId)) {
      this.deliver(
        conn,
        this.serverFrame(conn.clientId, 'relay.blob.chunk', {
          blobId,
          index,
          count: blob.count,
          bytes,
        }),
      )
    }
  }

  private requireMeta(): SessionMeta {
    const meta = this.meta
    if (!meta) throw new Error('Unknown session')
    return meta
  }
}
