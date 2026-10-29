/**
 * One Durable Object per session: the sockets (hibernation API), the SQLite store, the retention
 * alarm, and the HTTP actions a controller calls with its token. All session logic is
 * `SessionHub` from the core; this class only owns what the Workers runtime gives it.
 *
 * Hibernation: between messages the object may be evicted from memory while its sockets stay
 * open. On the next event the object is constructed again, `ctx.getWebSockets()` returns the
 * sockets, and each socket's attachment (client id, controller flag, connect time) rebuilds its
 * `Connection`; `SessionHub.attach` registers them without a new hello. Per-sender `seq`, client
 * identities and frames are in SQLite, so nothing a client relies on lives only in memory.
 */
import {
  CreateSessionBody,
  HUB_LIMITS,
  JoinTokenBody,
  KickBody,
  RETENTION_MS,
  SessionHub,
  TOMBSTONE_MS,
  announcedLimits,
  apiError,
  bearerToken,
  isControllerAuth,
  sessionRoute,
  wsAuth,
  type Connection,
  type HubLimits,
  type LogEvent,
} from '@actionstations/relay-core'
import type { Attachment, Env } from './env'
import { errorResponse, json } from './errors'
import { pingPongPair, upgradeResponse, websocketPair } from './platform'
import { SqliteStore } from './sqlite-store'

/** Largest body any action reads. */
const MAX_BODY = 4096

export class SessionObject {
  private readonly store: SqliteStore
  private hub: SessionHub | undefined
  private readonly conns = new WeakMap<WebSocket, Connection>()

  /** `now` and `limits` exist for tests; the runtime passes `state` and `env` only. */
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
    private readonly now: () => number = () => Date.now(),
    private readonly limits: HubLimits = HUB_LIMITS.relay,
  ) {
    this.store = new SqliteStore(state.storage.sql)
    state.setWebSocketAutoResponse(pingPongPair())
  }

  // ---- HTTP ------------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.route(request)
    } catch (err) {
      return errorResponse(err, this.now())
    }
  }

  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const created = /^\/v1\/sessions\/([A-Za-z0-9_-]{22})\/create$/.exec(url.pathname)
    if (created) return this.create(request, created[1]!)
    const route = sessionRoute(url.pathname)
    if (!route) return json(apiError('NOT_FOUND', 'No such route'), 404)
    // The id in the path named this object; the stored metadata says which session it holds.
    const meta = this.store.meta()
    if (!meta || meta.sessionId !== route.sessionId) {
      return json(apiError('NOT_FOUND', 'Unknown session'), 404)
    }
    const hub = this.hubFor(route.sessionId)
    if (route.action === 'ws') return this.upgrade(request, url, hub)
    if (request.method !== 'POST') return json(apiError('METHOD_NOT_ALLOWED', 'POST only'), 405)
    if (!(await hub.isControllerToken(bearerToken(request.headers.get('Authorization'))))) {
      return json(apiError('UNAUTHORIZED', 'A controller token is required'), 401)
    }
    if (hub.ended) return json(apiError('SESSION_ENDED', 'Session ended'), 410)
    switch (route.action) {
      case 'kick': {
        const body = KickBody.safeParse(await readJson(request))
        if (!body.success) return json(apiError('INVALID', 'Bad request body'), 400)
        hub.kick(body.data.client)
        return new Response(null, { status: 204 })
      }
      case 'join-token': {
        const body = JoinTokenBody.safeParse(await readJson(request))
        if (!body.success) return json(apiError('INVALID', 'Bad request body'), 400)
        hub.setJoinTokenHash(body.data.joinTokenHash)
        return new Response(null, { status: 204 })
      }
      case 'end': {
        hub.end()
        await this.state.storage.setAlarm(hub.tombstoneExpiresAt ?? this.now() + TOMBSTONE_MS)
        return new Response(null, { status: 204 })
      }
      case 'controllers':
        return json({ controllerToken: await hub.addController() }, 201)
    }
  }

  /** The Worker's `POST /v1/sessions` after the quota said yes: the id is in the path. */
  private async create(request: Request, sessionId: string): Promise<Response> {
    if (request.method !== 'POST') return json(apiError('METHOD_NOT_ALLOWED', 'POST only'), 405)
    const body = CreateSessionBody.safeParse(await readJson(request))
    if (!body.success) return json(apiError('INVALID', 'Bad request body'), 400)
    if (this.store.meta()) return json(apiError('INVALID', 'Session already exists'), 409)
    const hub = this.hubFor(sessionId)
    const { meta, controllerToken } = await hub.create({ joinTokenHash: body.data.joinTokenHash })
    await this.state.storage.setAlarm(meta.expiresAt)
    return json(
      { sessionId, controllerToken, caps: announcedLimits(this.limits), expiresAt: meta.expiresAt },
      201,
    )
  }

  private async upgrade(request: Request, url: URL, hub: SessionHub): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json(apiError('INVALID', 'Expected a WebSocket upgrade'), 426)
    }
    const auth = wsAuth(url.searchParams, request.headers.get('Authorization'))
    if (!auth) return json(apiError('INVALID', 'Missing or bad client id'), 400)
    const { client, server } = websocketPair()
    const attachment: Attachment = {
      clientId: auth.clientId,
      controller: isControllerAuth(auth),
      since: this.now(),
    }
    this.state.acceptWebSocket(server, [auth.clientId])
    server.serializeAttachment(attachment)
    const conn = this.connectionFor(server, attachment, request.headers.get('CF-Connecting-IP'))
    await hub.accept(conn, auth)
    return upgradeResponse(client)
  }

  // ---- sockets ---------------------------------------------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const conn = this.known(ws)
    if (conn) this.hubForSocket().onFrame(conn, message)
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    const conn = this.known(ws)
    if (conn) this.hubForSocket().onClose(conn, code)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const conn = this.known(ws)
    if (conn) this.hubForSocket().onClose(conn, 1006)
  }

  /** The hub for a socket event: the session id is in the stored metadata. */
  private hubForSocket(): SessionHub {
    const meta = this.store.meta()
    return this.hubFor(meta?.sessionId ?? '')
  }

  private known(ws: WebSocket): Connection | undefined {
    this.hubForSocket()
    return this.conns.get(ws)
  }

  /**
   * The hub, built on first use after a (re)start: every open socket is re-attached from its
   * attachment, so the roster is what the runtime says it is.
   */
  private hubFor(sessionId: string): SessionHub {
    if (this.hub) return this.hub
    const hub = new SessionHub({
      sessionId,
      store: this.store,
      kind: 'relay',
      limits: this.limits,
      version: this.env.RELAY_VERSION ?? 'dev',
      now: this.now,
      log: (event) => this.log(event),
      retentionMs: RETENTION_MS,
    })
    this.hub = hub
    for (const ws of this.state.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Attachment | null
      if (!attachment) continue
      const conn = this.connectionFor(ws, attachment, null)
      hub.attach(conn, attachment.since)
    }
    return hub
  }

  private connectionFor(ws: WebSocket, attachment: Attachment, remote: string | null): Connection {
    const conn: Connection = {
      clientId: attachment.clientId,
      controller: attachment.controller,
      send: (frame) => ws.send(frame),
      close: (code, reason) => ws.close(code, reason),
      ...(remote ? { remote } : {}),
    }
    this.conns.set(ws, conn)
    return conn
  }

  // ---- retention -------------------------------------------------------------------------

  /** `createdAt + 72 h`: end and tombstone. `endedAt + 1 h`: forget the session entirely. */
  async alarm(): Promise<void> {
    const meta = this.store.meta()
    if (!meta) return
    const now = this.now()
    if (meta.endedAt !== undefined) {
      if (now >= meta.endedAt + TOMBSTONE_MS) {
        this.hub = undefined
        await this.state.storage.deleteAll()
        this.store.ensureSchema()
      } else {
        await this.state.storage.setAlarm(meta.endedAt + TOMBSTONE_MS)
      }
      return
    }
    if (now >= meta.expiresAt) {
      const hub = this.hubFor(meta.sessionId)
      hub.end()
      await this.state.storage.setAlarm(hub.tombstoneExpiresAt ?? now + TOMBSTONE_MS)
      return
    }
    await this.state.storage.setAlarm(meta.expiresAt)
  }

  /** Connection events for `wrangler tail` only (spec 0408 FR-9); nothing is persisted. */
  private log(event: LogEvent): void {
    console.log(JSON.stringify({ at: this.now(), ...event }))
  }
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text()
  if (text.length > MAX_BODY) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}
