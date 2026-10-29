/**
 * HTTP routes of the self-hosted server: the relay's API (spec 0408) plus session creation
 * guarded by the server key (spec 0409 FR-3), the SSE + POST fallback and blob download shared
 * with the LAN server (spec 0407), and the player page from a fixed asset map. Request strings
 * decide a branch; they never become a file path. Errors are JSON without stack traces.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  CreateSessionBody,
  JoinTokenBody,
  KickBody,
  MAX_BODY_BYTES,
  SlidingWindow,
  apiError,
  bearerToken,
  createRequestProblem,
  sessionRoute,
  type HealthResponse,
  type SessionAction,
} from '@actionstations/relay-core'
import { PROTOCOL_VERSION } from '@shared/live/protocol'
import { Base64Url22 } from '@shared/live/schemas/envelope'
import { parseConnectParams, parseJoinToken } from '@main/live/transport/lan/connect-params'
import {
  applyCommonHeaders,
  htmlCsp,
  readBody,
  remoteOf,
  sendBlob,
  sendError,
  sendJson,
  type HttpErrorCode,
} from '@main/live/transport/lan/respond'
import { isServerKey } from './server-key'
import type { LiveSession, SessionRegistry } from './sessions'
import type { AssetMap } from './static'

/** Blob downloads one remote address may run at once. */
const MAX_BLOB_DOWNLOADS_PER_REMOTE = 2
/** Server-key attempts per address per minute: a wrong key is the one thing worth guessing at. */
const KEY_ATTEMPTS_PER_MINUTE = 20

export interface RouteContext {
  registry: SessionRegistry
  assets: AssetMap
  dataDir: string
  version: string
  tls: boolean
  fingerprintSha256?: string
  now: () => number
}

const keyAttempts = new WeakMap<RouteContext, SlidingWindow<string>>()
const blobDownloads = new Map<string, number>()

function fail(res: ServerResponse, code: HttpErrorCode, message: string): void {
  sendError(res, code, message)
}

function health(ctx: RouteContext): HealthResponse {
  return {
    kind: 'self-hosted',
    version: ctx.version,
    protocol: [PROTOCOL_VERSION],
    caps: ctx.registry.limits,
    playerBundleSha256: ctx.assets.playerBundleSha256,
    ...(ctx.fingerprintSha256 ? { fingerprintSha256: ctx.fingerprintSha256 } : {}),
  }
}

const NO_BODY_METHODS = new Set(['GET', 'HEAD'])

export async function handleRequest(
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://relay')
  const method = req.method ?? 'GET'
  if (url.pathname === '/v1/health') {
    if (method !== 'GET') return fail(res, 'METHOD_NOT_ALLOWED', 'GET only')
    return sendJson(res, 200, health(ctx))
  }
  if (url.pathname === '/v1/sessions') {
    if (method !== 'POST') return fail(res, 'METHOD_NOT_ALLOWED', 'POST only')
    return createSession(ctx, req, res)
  }
  const route = sessionRoute(url.pathname)
  if (route) return sessionRequest(ctx, req, res, url, route)
  if (url.pathname.startsWith('/v1/')) return fail(res, 'NOT_FOUND', 'No such route')
  if (!NO_BODY_METHODS.has(method)) return fail(res, 'METHOD_NOT_ALLOWED', 'GET only')
  return serveStatic(ctx, req, res, url.pathname)
}

async function readJson(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
  const body = await readBody(req, MAX_BODY_BYTES)
  if (body === undefined) return void fail(res, 'TOO_LARGE', 'Request body too large')
  try {
    return JSON.parse(body.toString('utf8') || 'null') as unknown
  } catch {
    return void fail(res, 'BAD_REQUEST', 'Request body is not JSON')
  }
}

async function createSession(
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const problem = createRequestProblem({
    get: (name) => (req.headers[name.toLowerCase()] as string | undefined) ?? null,
  })
  if (problem) {
    return sendJson(res, problem.error.code === 'FORBIDDEN' ? 403 : 415, problem)
  }
  const window = keyAttempts.get(ctx) ?? new SlidingWindow<string>(KEY_ATTEMPTS_PER_MINUTE, 60_000)
  keyAttempts.set(ctx, window)
  if (!window.hit(remoteOf(req), ctx.now()).ok) {
    return fail(res, 'RATE_LIMITED', 'Too many attempts from this address')
  }
  if (!(await isServerKey(ctx.dataDir, bearerToken(req.headers.authorization)))) {
    return fail(res, 'UNAUTHORIZED', 'A server key is required to create sessions')
  }
  const raw = await readJson(req, res)
  if (raw === undefined) return
  const body = CreateSessionBody.safeParse(raw)
  if (!body.success) return fail(res, 'BAD_REQUEST', 'Bad request body')
  const created = await ctx.registry.create(body.data.joinTokenHash)
  if (!created.ok) {
    return sendJson(res, 503, apiError('SESSION_FULL', 'This server has reached its session limit'))
  }
  sendJson(res, 201, {
    sessionId: created.sessionId,
    controllerToken: created.controllerToken,
    caps: ctx.registry.limits,
    expiresAt: created.expiresAt,
  })
}

async function sessionRequest(
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  route: NonNullable<ReturnType<typeof sessionRoute>>,
): Promise<void> {
  const session = ctx.registry.get(route.sessionId)
  if (!session) return fail(res, 'NOT_FOUND', 'Unknown session')
  switch (route.action) {
    case 'ws':
      return fail(res, 'BAD_REQUEST', 'This path is a WebSocket endpoint')
    case 'events':
    case 'send':
      return fallback(req, res, url, session, route.action)
    case 'blob':
      return serveBlob(req, res, session, route.blobId!)
    default:
      return sessionAction(ctx, req, res, session, route.action, route.sessionId)
  }
}

async function fallback(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  session: LiveSession,
  action: 'events' | 'send',
): Promise<void> {
  const want = action === 'events' ? 'GET' : 'POST'
  if (req.method !== want) return fail(res, 'METHOD_NOT_ALLOWED', `Use ${want}`)
  const parsed = parseConnectParams({ search: url.searchParams, headers: req.headers })
  if (!parsed.ok) {
    return parsed.reason === 'TOKEN_IN_QUERY'
      ? fail(res, 'BAD_REQUEST', 'Tokens go in the X-AS-Join and X-AS-Resume headers, not the URL')
      : fail(res, 'UNAUTHORIZED', 'Missing or malformed join parameters')
  }
  if (action === 'events') {
    return session.fallback.events(req, res, parsed.params, remoteOf(req))
  }
  return session.fallback.send(req, res, parsed.params, session.hub.limits.envelopeBytes)
}

async function sessionAction(
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  session: LiveSession,
  action: SessionAction,
  sessionId: string,
): Promise<void> {
  if (req.method !== 'POST') return fail(res, 'METHOD_NOT_ALLOWED', 'POST only')
  if (!(await ctx.registry.isController(session, bearerToken(req.headers.authorization)))) {
    return fail(res, 'UNAUTHORIZED', 'A controller token is required')
  }
  if (session.store.record()?.endedAt !== undefined) {
    return fail(res, 'SESSION_ENDED', 'Session ended')
  }
  switch (action) {
    case 'kick': {
      const body = KickBody.safeParse(await readJson(req, res))
      if (res.headersSent) return
      if (!body.success) return fail(res, 'BAD_REQUEST', 'Bad request body')
      session.hub.kick(body.data.client)
      return noContent(res)
    }
    case 'join-token': {
      const body = JoinTokenBody.safeParse(await readJson(req, res))
      if (res.headersSent) return
      if (!body.success) return fail(res, 'BAD_REQUEST', 'Bad request body')
      session.hub.setJoinTokenHash(body.data.joinTokenHash)
      return noContent(res)
    }
    case 'end':
      ctx.registry.end(sessionId)
      return noContent(res)
    case 'controllers': {
      const token = await ctx.registry.addController(session)
      if (!token)
        return fail(res, 'CONFLICT', 'A session has a limited number of controller tokens')
      return sendJson(res, 201, { controllerToken: token })
    }
  }
}

function noContent(res: ServerResponse): void {
  applyCommonHeaders(res)
  res.writeHead(204)
  res.end()
}

/** `GET …/blobs/:id` with `X-AS-Join`: the fetch fallback's blob path (two downloads per address). */
async function serveBlob(
  req: IncomingMessage,
  res: ServerResponse,
  session: LiveSession,
  blobId: string,
): Promise<void> {
  if (req.method !== 'GET') return fail(res, 'METHOD_NOT_ALLOWED', 'Use GET')
  const token = parseJoinToken(req.headers)
  if (!token || !(await session.hub.checkJoinToken(token))) {
    return fail(res, 'UNAUTHORIZED', 'Bad join token')
  }
  const chunks = Base64Url22.safeParse(blobId).success ? session.hub.blobChunks(blobId) : undefined
  if (!chunks) return fail(res, 'NOT_FOUND', 'No such blob')
  const remote = remoteOf(req)
  const active = blobDownloads.get(remote) ?? 0
  if (active >= MAX_BLOB_DOWNLOADS_PER_REMOTE) {
    return fail(res, 'RATE_LIMITED', 'Too many downloads at once')
  }
  blobDownloads.set(remote, active + 1)
  try {
    await sendBlob(res, chunks)
  } finally {
    blobDownloads.set(remote, (blobDownloads.get(remote) ?? 1) - 1)
  }
}

const PLAYER_PAGE = /^\/s\/[A-Za-z0-9_-]{22}\/?$/

function serveStatic(
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): void {
  const isPage = pathname === '/' || pathname === '/index.html' || PLAYER_PAGE.test(pathname)
  const asset = ctx.assets.files.get(isPage ? '/index.html' : pathname)
  if (!asset) return fail(res, 'NOT_FOUND', 'Not found')
  applyCommonHeaders(res, asset.immutable ? 'public, max-age=31536000, immutable' : 'no-store')
  if (asset.contentType.startsWith('text/html')) {
    const host = req.headers.host
    res.setHeader(
      'Content-Security-Policy',
      htmlCsp(host ? `${ctx.tls ? 'wss' : 'ws'}://${host}` : ''),
    )
  }
  res.writeHead(200, { 'Content-Type': asset.contentType, 'Content-Length': asset.bytes.length })
  res.end(req.method === 'HEAD' ? undefined : asset.bytes)
}
