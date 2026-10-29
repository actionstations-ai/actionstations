/**
 * How a device presents itself to a session server (specs 0407 and 0411). One place fixes the
 * contract every server parses. Tokens never travel in a URL: query strings show up in request
 * logs and proxies, so the join token and the resume token go in the WebSocket subprotocol list
 * or in request headers, and a server refuses a request that carries them in the query.
 *
 *   WebSocket  GET  <base>/v1/sessions/<id>/ws?client=<clientId>
 *              Sec-WebSocket-Protocol: as-live.v1, j.<joinToken>, r.<resumeToken>
 *              (the server echoes `as-live.v1` only)
 *   Stream     GET  <base>/v1/sessions/<id>/events?client=<clientId>&after=<index>
 *   Send       POST <base>/v1/sessions/<id>/send?client=<clientId>
 *              X-AS-Join: <joinToken>   X-AS-Resume: <resumeToken>
 *
 * Tokens are base64url. `client` is the device's client id; the join token is derived from the
 * players root and the resume token binds the id to the device. None of them is a key: a server
 * stores only hashes.
 */
import { toBase64Url } from './bytes'

export interface ConnectParams {
  base: string
  sessionId: string
  joinToken: Uint8Array
  clientId: string
  /** Absent only when a server issues the resume token itself on first connect. */
  resumeToken?: Uint8Array
}

/** The subprotocol a server accepts and echoes. */
export const WS_SUBPROTOCOL = 'as-live.v1'
export const JOIN_HEADER = 'x-as-join'
export const RESUME_HEADER = 'x-as-resume'
const TOKEN_RE = /^[A-Za-z0-9_-]{1,128}$/
/** Query parameters a server must refuse: a token in a URL would land in request logs. */
export const FORBIDDEN_QUERY = ['j', 'r', 'join', 'resume', 'token'] as const

function origin(base: string): string {
  return base.replace(/\/+$/, '')
}

function sessionPath(p: ConnectParams, leaf: 'ws' | 'events' | 'send'): string {
  return `/v1/sessions/${p.sessionId}/${leaf}`
}

export function webSocketUrl(p: ConnectParams): string {
  const ws = origin(p.base).replace(/^http/, 'ws')
  return `${ws}${sessionPath(p, 'ws')}?client=${encodeURIComponent(p.clientId)}`
}

/** The subprotocol list the browser sends: the version, then the tokens. */
export function webSocketProtocols(p: ConnectParams): string[] {
  const out = [WS_SUBPROTOCOL, `j.${toBase64Url(p.joinToken)}`]
  if (p.resumeToken) out.push(`r.${toBase64Url(p.resumeToken)}`)
  return out
}

export function eventsUrl(p: ConnectParams, after: number): string {
  const q = new URLSearchParams({ client: p.clientId, after: String(after) })
  return `${origin(p.base)}${sessionPath(p, 'events')}?${q}`
}

export function sendUrl(p: ConnectParams): string {
  return `${origin(p.base)}${sessionPath(p, 'send')}?client=${encodeURIComponent(p.clientId)}`
}

/** Headers the stream and send requests carry. */
export function connectHeaders(p: ConnectParams): Record<string, string> {
  const h: Record<string, string> = { [JOIN_HEADER]: toBase64Url(p.joinToken) }
  if (p.resumeToken) h[RESUME_HEADER] = toBase64Url(p.resumeToken)
  return h
}

export interface ConnectRequest {
  clientId: string
  /** base64url, as presented. */
  joinToken: string
  resumeToken?: string
  after: number
}

export type ConnectParseResult =
  | { ok: true; request: ConnectRequest }
  | { ok: false; reason: 'TOKEN_IN_QUERY' | 'MISSING_CLIENT' | 'MISSING_JOIN' | 'BAD_PROTOCOL' }

/**
 * `Sec-WebSocket-Protocol` as a server sees it (one header or a list): the version entry must
 * be present; `j.` and `r.` entries carry the tokens.
 */
export function parseWebSocketProtocols(header: string | string[] | Iterable<string> | undefined): {
  joinToken?: string
  resumeToken?: string
  version: boolean
} {
  const raw = header === undefined ? [] : typeof header === 'string' ? [header] : [...header]
  const entries = raw
    .flatMap((h) => h.split(','))
    .map((s) => s.trim())
    .filter(Boolean)
  const out: { joinToken?: string; resumeToken?: string; version: boolean } = {
    version: entries.includes(WS_SUBPROTOCOL),
  }
  for (const e of entries) {
    if (e.startsWith('j.') && TOKEN_RE.test(e.slice(2))) out.joinToken = e.slice(2)
    else if (e.startsWith('r.') && TOKEN_RE.test(e.slice(2))) out.resumeToken = e.slice(2)
  }
  return out
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | Headers,
  name: string,
): string | undefined {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined
  }
  const v = (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Parse a connect request the way every server does: the client id and resume index from the
 * query, the tokens from the subprotocol list (WebSocket) or the headers (stream and send).
 * A token in the query string is refused outright.
 */
export function parseConnectRequest(input: {
  search: string | URLSearchParams
  headers?: Record<string, string | string[] | undefined> | Headers
  /** For a WebSocket upgrade: the browser's subprotocol list. */
  protocols?: string | string[] | Iterable<string>
}): ConnectParseResult {
  const q = typeof input.search === 'string' ? new URLSearchParams(input.search) : input.search
  for (const name of FORBIDDEN_QUERY)
    if (q.has(name)) return { ok: false, reason: 'TOKEN_IN_QUERY' }
  const clientId = q.get('client')
  if (!clientId) return { ok: false, reason: 'MISSING_CLIENT' }
  const rawAfter = Number(q.get('after') ?? 0)
  const after = Number.isInteger(rawAfter) && rawAfter >= 0 ? rawAfter : 0
  let joinToken: string | undefined
  let resumeToken: string | undefined
  if (input.protocols !== undefined) {
    const parsed = parseWebSocketProtocols(input.protocols)
    if (!parsed.version) return { ok: false, reason: 'BAD_PROTOCOL' }
    joinToken = parsed.joinToken
    resumeToken = parsed.resumeToken
  } else if (input.headers) {
    const j = headerValue(input.headers, JOIN_HEADER)
    const r = headerValue(input.headers, RESUME_HEADER)
    if (j && TOKEN_RE.test(j)) joinToken = j
    if (r && TOKEN_RE.test(r)) resumeToken = r
  }
  if (!joinToken) return { ok: false, reason: 'MISSING_JOIN' }
  return {
    ok: true,
    request: { clientId, joinToken, ...(resumeToken ? { resumeToken } : {}), after },
  }
}
