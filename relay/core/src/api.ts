/**
 * The HTTP side of the server contract shared by the relay (#408) and the self-hosted server
 * (#409): request bodies, the connection contract (who is connecting and with which tokens),
 * routes and response headers, validated the same way by every adapter. The plumbing (Fetch
 * `Request` in a Worker, `IncomingMessage` in Node) stays in the adapters.
 *
 * Connection contract (spec 0406 lifecycle, fixed across servers):
 * - WebSocket: `GET /v1/sessions/<id>/ws?client=<clientId>` with subprotocols
 *   `["as-live.v1", "j.<joinToken>", "r.<resumeToken>"]`; the server echoes `as-live.v1`.
 *   A controller sends `Authorization: Bearer <controllerToken>` instead of `j.`/`r.`.
 * - SSE + POST (self-hosted and LAN only): `X-AS-Join` and `X-AS-Resume` headers on
 *   `GET …/events?client=<id>&after=<n>` and `POST …/send?client=<id>`.
 * - Tokens in the query string are refused: they would end up in request logs.
 */
import { z } from 'zod'
import { fromBase64Url } from '@shared/live/bytes'
import {
  JOIN_TOKEN_BYTES,
  PROTOCOL_VERSION,
  RESUME_TOKEN_BYTES,
  type ConnectionKind,
  type Limits,
} from '@shared/live/protocol'
import { Base64Url22 } from '@shared/live/schemas/envelope'
import type { RelayErrorCode } from '@shared/live/schemas/relay'

export const Sha256Hex = z.string().regex(/^[a-f0-9]{64}$/)

/**
 * `POST /v1/sessions`. `joinTokenHash` is optional because the join token is derived from the
 * session id the server is about to mint; the app sets it with `POST …/join-token` as soon as it
 * has derived the keys. The server stores no name: the app keeps whatever it calls the session
 * on the facilitator's computer, so the server learns one thing less.
 */
export const CreateSessionBody = z.strictObject({
  v: z.literal(PROTOCOL_VERSION),
  joinTokenHash: Sha256Hex.optional(),
})
export type CreateSessionBody = z.infer<typeof CreateSessionBody>

/** `POST /v1/sessions/:id/join-token` after a rotation. */
export const JoinTokenBody = z.strictObject({ joinTokenHash: Sha256Hex })

/** `POST /v1/sessions/:id/kick`. */
export const KickBody = z.strictObject({ client: Base64Url22 })

export const SessionIdParam = Base64Url22

/** Largest JSON body any API route reads. */
export const MAX_BODY_BYTES = 4096

export interface CreateSessionResponse {
  sessionId: string
  controllerToken: string
  caps: Limits
  expiresAt: number
}

export interface HealthResponse {
  kind: ConnectionKind
  version: string
  protocol: number[]
  caps: Limits
  /** SHA-256 of the player bundle this server serves (spec 0408 FR-6, 0411). */
  playerBundleSha256?: string
  /** A self-hosted server's self-signed certificate fingerprint (spec 0409 FR-10). */
  fingerprintSha256?: string
}

export type ApiErrorCode =
  | RelayErrorCode
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'CONFLICT'
  | 'INTERNAL'

export interface ApiError {
  error: { code: ApiErrorCode; message: string }
}

export function apiError(code: ApiErrorCode, message: string): ApiError {
  return { error: { code, message } }
}

const BEARER = /^Bearer\s+([A-Za-z0-9_-]{16,128})$/

/** The token of an `Authorization: Bearer <token>` header, or `undefined` for anything else. */
export function bearerToken(header: string | null | undefined): string | undefined {
  if (!header) return undefined
  return BEARER.exec(header.trim())?.[1]
}

// ---- the connection contract -----------------------------------------------------------------

export const WS_SUBPROTOCOL = 'as-live.v1'
export const JOIN_HEADER = 'X-AS-Join'
export const RESUME_HEADER = 'X-AS-Resume'

/** What a server hands its hub: a controller token, or a participant's join and resume tokens. */
export interface ConnectAuth {
  clientId: string
  joinToken?: Uint8Array
  resumeToken?: Uint8Array
  controllerToken?: string
}

export type ConnectParse =
  { ok: true; auth: ConnectAuth } | { ok: false; code: 'INVALID' | 'FORBIDDEN'; message: string }

const TOKEN_TEXT = /^[A-Za-z0-9_-]{16,64}$/
/** Query parameters that must never carry a token. */
const TOKEN_QUERY_KEYS = ['j', 'r', 't', 'token', 'join', 'resume', 'key']

function tokenBytes(text: string | undefined, length: number): Uint8Array | undefined {
  if (!text || !TOKEN_TEXT.test(text)) return undefined
  try {
    const bytes = fromBase64Url(text)
    return bytes.length === length ? bytes : undefined
  } catch {
    return undefined
  }
}

/** The `Sec-WebSocket-Protocol` list: `as-live.v1` and the `j.` / `r.` tokens. */
export function parseSubprotocols(header: string | null | undefined): {
  version: boolean
  join?: string
  resume?: string
} {
  const items = (header ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const out: { version: boolean; join?: string; resume?: string } = { version: false }
  for (const item of items) {
    if (item === WS_SUBPROTOCOL) out.version = true
    else if (item.startsWith('j.')) out.join = item.slice(2)
    else if (item.startsWith('r.')) out.resume = item.slice(2)
  }
  return out
}

export interface ConnectInput {
  query: URLSearchParams
  /** `Authorization` header (controllers). */
  authorization?: string | null
  /** `Sec-WebSocket-Protocol` header (WebSocket participants). */
  protocols?: string | null
  /** `X-AS-Join` / `X-AS-Resume` headers (SSE + POST participants). */
  joinHeader?: string | null
  resumeHeader?: string | null
}

/**
 * Who is connecting. Refuses a missing or malformed client id, any token in the query string,
 * a WebSocket without the `as-live.v1` subprotocol, and a participant whose tokens do not decode
 * to the protocol's sizes. A controller token is taken as presented; the server checks its hash.
 */
export function parseConnect(input: ConnectInput): ConnectParse {
  for (const key of TOKEN_QUERY_KEYS) {
    if (input.query.has(key)) {
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: 'Tokens go in the subprotocol or the X-AS-* headers, never in the URL',
      }
    }
  }
  const clientId = input.query.get('client') ?? undefined
  if (!clientId || !Base64Url22.safeParse(clientId).success) {
    return { ok: false, code: 'INVALID', message: 'Missing or bad client id' }
  }
  const controllerToken = bearerToken(input.authorization)
  if (controllerToken) return { ok: true, auth: { clientId, controllerToken } }
  let joinText: string | undefined
  let resumeText: string | undefined
  if (input.protocols !== undefined) {
    const protocols = parseSubprotocols(input.protocols)
    if (!protocols.version) {
      return { ok: false, code: 'INVALID', message: `Subprotocol ${WS_SUBPROTOCOL} is required` }
    }
    joinText = protocols.join
    resumeText = protocols.resume
  } else {
    joinText = input.joinHeader ?? undefined
    resumeText = input.resumeHeader ?? undefined
  }
  const joinToken = tokenBytes(joinText, JOIN_TOKEN_BYTES)
  const resumeToken = tokenBytes(resumeText, RESUME_TOKEN_BYTES)
  if (!joinToken || !resumeToken) {
    return { ok: false, code: 'INVALID', message: 'Missing or malformed join or resume token' }
  }
  return { ok: true, auth: { clientId, joinToken, resumeToken } }
}

/** The join token alone (`GET …/blobs/:id`), from the `X-AS-Join` header. */
export function parseJoinHeader(header: string | null | undefined): Uint8Array | undefined {
  return tokenBytes(header ?? undefined, JOIN_TOKEN_BYTES)
}

// ---- routes and headers ----------------------------------------------------------------------

/** The `/v1/sessions/:id/<action>` routes a controller calls with its token. */
export const SESSION_ACTIONS = ['kick', 'join-token', 'end', 'controllers'] as const
export type SessionAction = (typeof SESSION_ACTIONS)[number]

export interface SessionRoute {
  sessionId: string
  action: SessionAction | 'ws' | 'events' | 'send' | 'blob'
  blobId?: string
}

/** Parses `/v1/sessions/<id>/<action>` (and `/blobs/<blobId>`); `undefined` for any other path. */
export function sessionRoute(pathname: string): SessionRoute | undefined {
  const m =
    /^\/v1\/sessions\/([A-Za-z0-9_-]{22})\/(ws|kick|join-token|end|controllers|events|send|blobs\/([A-Za-z0-9_-]{22}))$/.exec(
      pathname,
    )
  if (!m) return undefined
  if (m[3]) return { sessionId: m[1]!, action: 'blob', blobId: m[3] }
  return { sessionId: m[1]!, action: m[2] as SessionRoute['action'] }
}

/** Response headers for API and HTML responses (spec 0407, 0408): never cached, never sniffed. */
export const API_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

/** Content Security Policy for the player page. `connectSrc` adds the WebSocket origin. */
export function playerPageCsp(connectSrc: string[] = []): string {
  const connect = ["'self'", ...connectSrc].join(' ')
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    'media-src blob:',
    `connect-src ${connect}`,
    "font-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export const HTML_HEADERS: Record<string, string> = {
  ...API_HEADERS,
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

/** `POST /v1/sessions` must come from the desktop app: JSON, and never from a web page. */
export function createRequestProblem(headers: {
  get(name: string): string | null
}): ApiError | undefined {
  if (headers.get('Origin') !== null) {
    return apiError(
      'FORBIDDEN',
      'Sessions are created by the Action Stations app, not from a web page',
    )
  }
  const type = headers.get('Content-Type') ?? ''
  if (!/^application\/json\b/i.test(type.trim())) {
    return apiError('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json')
  }
  return undefined
}
