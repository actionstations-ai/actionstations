/**
 * One Durable Object per session: the sockets (hibernation API), the SQLite store, the retention
 * alarm, and the HTTP actions a controller calls with its token. All session logic is the
 * shared `SessionHub` (src/shared/live/hub.ts); this class owns only what the Workers runtime
 * gives it and what the relay adds: controller tokens, retention, hibernation.
 *
 * Hibernation: between messages the object may be evicted from memory while its sockets stay
 * open. On the next event the object is constructed again, `ctx.getWebSockets()` returns the
 * sockets, and each socket's attachment (client id, controller flag, connect time) re-registers
 * it with `SessionHub.restore()`, with no new hello. Everything a client relies on is in SQLite.
 */
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { SessionHub, type HubClient, type HubEvent, type SessionHubOptions } from '@shared/live/hub'
import {
  CreateSessionBody,
  JoinTokenBody,
  KickBody,
  SlidingWindow,
  WS_SUBPROTOCOL,
  apiError,
  bearerToken,
  hashBearerToken,
  controllerRoleOf,
  parseConnect,
  randomToken,
  sessionRoute,
} from '@actionstations/relay-core'
import {
  ACTIONS_PER_SESSION_PER_MINUTE,
  MAX_CONTROLLER_TOKENS,
  RELAY_HUB_OPTIONS,
  RETENTION_MS,
  TOMBSTONE_MS,
  type Attachment,
  type Env,
} from './env'
import { errorResponse, json } from './errors'
import { pingPongPair, upgradeResponse, websocketPair } from './platform'
import { SqliteHubStore, type SessionRecord } from './sqlite-store'

/** Largest body any action reads. */
const MAX_BODY = 4096

export class SessionObject {
  private readonly store: SqliteHubStore
  private hub: SessionHub | undefined
  private readonly clients = new WeakMap<WebSocket, HubClient>()
  private readonly actions = new SlidingWindow<string>(ACTIONS_PER_SESSION_PER_MINUTE, 60_000)

  /** `now` and `hubOverrides` exist for tests; the runtime passes `state` and `env` only. */
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
    private readonly now: () => number = () => Date.now(),
    private readonly hubOverrides: Partial<SessionHubOptions> = {},
  ) {
    this.store = new SqliteHubStore(state.storage.sql)
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
    const record = this.store.record()
    if (!record || record.sessionId !== route.sessionId) {
      return json(apiError('NOT_FOUND', 'Unknown session'), 404)
    }
    if (route.action === 'ws') return this.upgrade(request, url, record)
    if (!['kick', 'join-token', 'end', 'controllers'].includes(route.action)) {
      return json(apiError('NOT_FOUND', 'No such route'), 404)
    }
    if (request.method !== 'POST') return json(apiError('METHOD_NOT_ALLOWED', 'POST only'), 405)
    const role = await this.controllerRole(
      record,
      bearerToken(request.headers.get('Authorization')),
    )
    if (!role) return json(apiError('UNAUTHORIZED', 'A controller token is required'), 401)
    // A co-controller's token connects; ending, kicking and minting tokens stay with the host.
    if (role !== 'host') {
      return json(apiError('FORBIDDEN', 'Only the host controller may do this'), 403)
    }
    const allowed = this.actions.hit(route.action, this.now())
    if (!allowed.ok) {
      return json(apiError('RATE_LIMITED', 'Too many requests for this session'), 429, {
        'Retry-After': String(Math.max(1, Math.ceil(allowed.retryAfterMs / 1000))),
      })
    }
    if (record.endedAt !== undefined) return json(apiError('SESSION_ENDED', 'Session ended'), 410)
    const hub = this.hubFor()
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
      case 'end':
        await this.endSession(record, hub)
        return new Response(null, { status: 204 })
      default: {
        if (record.controllerTokenHashes.length >= MAX_CONTROLLER_TOKENS) {
          return json(
            apiError(
              'CONFLICT',
              `A session has at most ${MAX_CONTROLLER_TOKENS} controller tokens`,
            ),
            409,
          )
        }
        const token = randomToken()
        record.controllerTokenHashes.push(await hashBearerToken(token))
        this.store.setRecord(record)
        return json({ controllerToken: token }, 201)
      }
    }
  }

  private async controllerRole(
    record: SessionRecord,
    token: string | undefined,
  ): Promise<'host' | 'co' | undefined> {
    if (!token) return undefined
    return controllerRoleOf(await hashBearerToken(token), record.controllerTokenHashes)
  }

  /** The Worker's `POST /v1/sessions` after the quota said yes: the id is in the path. */
  private async create(request: Request, sessionId: string): Promise<Response> {
    if (request.method !== 'POST') return json(apiError('METHOD_NOT_ALLOWED', 'POST only'), 405)
    const body = CreateSessionBody.safeParse(await readJson(request))
    if (!body.success) return json(apiError('INVALID', 'Bad request body'), 400)
    if (this.store.record()) return json(apiError('CONFLICT', 'Session already exists'), 409)
    const controllerToken = randomToken()
    const createdAt = this.now()
    const record: SessionRecord = {
      sessionId,
      createdAt,
      expiresAt: createdAt + RETENTION_MS,
      controllerTokenHashes: [await hashBearerToken(controllerToken)],
    }
    this.store.setRecord(record)
    const hub = this.hubFor(body.data.joinTokenHash ?? '')
    await this.state.storage.setAlarm(record.expiresAt)
    return json({ sessionId, controllerToken, caps: hub.limits, expiresAt: record.expiresAt }, 201)
  }

  private async upgrade(request: Request, url: URL, record: SessionRecord): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json(apiError('INVALID', 'Expected a WebSocket upgrade'), 426)
    }
    const parsed = parseConnect({
      query: url.searchParams,
      authorization: request.headers.get('Authorization'),
      protocols: request.headers.get('Sec-WebSocket-Protocol') ?? '',
    })
    if (!parsed.ok)
      return json(apiError(parsed.code, parsed.message), parsed.code === 'FORBIDDEN' ? 403 : 400)
    const { auth } = parsed
    const controller = auth.controllerToken !== undefined
    const role = controller ? await this.controllerRole(record, auth.controllerToken) : undefined
    if (controller && !role) {
      return json(apiError('UNAUTHORIZED', 'Bad controller token'), 401)
    }
    const host = role !== 'co'
    const { client, server } = websocketPair()
    const attachment: Attachment = { clientId: auth.clientId, controller, host, since: this.now() }
    this.state.acceptWebSocket(server, [auth.clientId])
    server.serializeAttachment(attachment)
    const hub = this.hubFor()
    const handle = await hub.attach(socketFor(server), {
      clientId: auth.clientId,
      joinToken: auth.joinToken,
      resumeToken: auth.resumeToken,
      controller,
      host,
    })
    this.clients.set(server, handle)
    return upgradeResponse(client, WS_SUBPROTOCOL)
  }

  private async endSession(record: SessionRecord, hub: SessionHub): Promise<void> {
    hub.end()
    record.endedAt = this.now()
    this.store.setRecord(record)
    await this.state.storage.setAlarm(record.endedAt + TOMBSTONE_MS)
  }

  // ---- sockets ---------------------------------------------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const client = this.clientFor(ws)
    if (!client) return
    if (typeof message !== 'string') return ws.close(1003, 'Text frames only')
    client.receive(message)
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.clientFor(ws)?.detach()
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.clientFor(ws)?.detach()
  }

  /** The hub's handle for a socket, rebuilt from the attachment after a hibernation. */
  private clientFor(ws: WebSocket): HubClient | undefined {
    const hub = this.hubFor()
    const known = this.clients.get(ws)
    if (known) return known
    const attachment = ws.deserializeAttachment() as Attachment | null
    if (!attachment) return undefined
    const handle = hub.restore(socketFor(ws), attachment)
    this.clients.set(ws, handle)
    return handle
  }

  /**
   * The hub, built on first use after a (re)start, with every open socket re-attached from its
   * attachment so routing and presence see the roster the runtime holds.
   */
  private hubFor(joinTokenHash = ''): SessionHub {
    if (this.hub) return this.hub
    const record = this.store.record()
    const hub = new SessionHub({
      sessionId: record?.sessionId ?? '',
      kind: 'relay',
      joinTokenHash,
      crypto: createWebCryptoProvider(),
      store: this.store,
      version: this.env.RELAY_VERSION ?? 'dev',
      now: this.now,
      onEvent: (event) => this.log(event),
      ...RELAY_HUB_OPTIONS,
      ...this.hubOverrides,
    })
    this.hub = hub
    for (const ws of this.state.getWebSockets()) {
      if (this.clients.has(ws)) continue
      const attachment = ws.deserializeAttachment() as Attachment | null
      if (attachment) this.clients.set(ws, hub.restore(socketFor(ws), attachment))
    }
    return hub
  }

  // ---- retention -------------------------------------------------------------------------

  /** `createdAt + 72 h`: end and tombstone. `endedAt + 1 h`: forget the session entirely. */
  async alarm(): Promise<void> {
    const record = this.store.record()
    if (!record) return
    const now = this.now()
    if (record.endedAt !== undefined) {
      if (now >= record.endedAt + TOMBSTONE_MS) {
        this.hub = undefined
        await this.state.storage.deleteAll()
        this.store.ensureSchema()
      } else {
        await this.state.storage.setAlarm(record.endedAt + TOMBSTONE_MS)
      }
      return
    }
    if (now >= record.expiresAt) return this.endSession(record, this.hubFor())
    await this.state.storage.setAlarm(record.expiresAt)
  }

  /** Connection events for `wrangler tail` only (spec 0408 FR-9); nothing is persisted. */
  private log(event: HubEvent): void {
    console.log(
      JSON.stringify({ at: this.now(), session: this.store.record()?.sessionId, ...event }),
    )
  }
}

function socketFor(ws: WebSocket) {
  return {
    send: (frame: string) => ws.send(frame),
    close: (code: number, reason: string) => ws.close(code, reason),
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
