/**
 * The HTTP side of the server contract (spec 0406 "Session lifecycle", 0408 "Worker"): request
 * bodies, query parameters and response shapes every adapter validates the same way. The
 * plumbing (Fetch `Request` in a Worker, `IncomingMessage` in Node) stays in the adapters.
 */
import { z } from 'zod'
import { PROTOCOL_VERSION, type ConnectionKind, type Limits } from '@shared/live/protocol'
import { Base64Url22 } from '@shared/live/schemas/envelope'
import type { RelayErrorCode } from '@shared/live/schemas/relay'
import type { AcceptAuth } from './hub'

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

export interface ApiError {
  error: {
    code: RelayErrorCode | 'NOT_FOUND' | 'METHOD_NOT_ALLOWED' | 'UNAUTHORIZED' | 'INTERNAL'
    message: string
  }
}

export function apiError(code: ApiError['error']['code'], message: string): ApiError {
  return { error: { code, message } }
}

const BEARER = /^Bearer\s+([A-Za-z0-9_-]{16,128})$/

/** The token of an `Authorization: Bearer <token>` header, or `undefined` for anything else. */
export function bearerToken(header: string | null | undefined): string | undefined {
  if (!header) return undefined
  return BEARER.exec(header.trim())?.[1]
}

/**
 * Who is connecting on `GET /v1/sessions/:id/ws`: a controller with a bearer token, or a
 * participant with `?j=<joinToken>&c=<clientId>&r=<resumeToken>`. `undefined` when the request
 * carries no usable client id.
 */
export function wsAuth(
  query: URLSearchParams,
  authorization: string | null | undefined,
): AcceptAuth | undefined {
  const clientId = query.get('c') ?? undefined
  if (!clientId || !Base64Url22.safeParse(clientId).success) return undefined
  const controllerToken = bearerToken(authorization)
  if (controllerToken) return { clientId, controllerToken }
  return {
    clientId,
    joinToken: query.get('j') ?? undefined,
    resumeToken: query.get('r') ?? undefined,
  }
}

/** The `/v1/sessions/:id/<action>` routes a controller calls with its token. */
export const SESSION_ACTIONS = ['kick', 'join-token', 'end', 'controllers'] as const
export type SessionAction = (typeof SESSION_ACTIONS)[number]

export interface SessionRoute {
  sessionId: string
  action: SessionAction | 'ws'
}

/** Parses `/v1/sessions/<id>/<action>`; `undefined` for any other path. */
export function sessionRoute(pathname: string): SessionRoute | undefined {
  const m = /^\/v1\/sessions\/([A-Za-z0-9_-]{22})\/(ws|kick|join-token|end|controllers)$/.exec(
    pathname,
  )
  if (!m) return undefined
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
