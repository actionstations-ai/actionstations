/**
 * How a device presents itself on `/ws`, `/events`, `/send` and `/blobs` (spec 0406 lifecycle,
 * `src/shared/live/connect-url.ts`): the client id in the query, the join and resume tokens in
 * the WebSocket subprotocol list or in the `X-AS-Join` / `X-AS-Resume` headers, never in the
 * URL (a query string lands in logs and proxies; a request that carries one is refused).
 * Everything is validated with the protocol's own shapes before the hub sees it.
 */
import type { IncomingHttpHeaders } from 'node:http'
import { fromBase64Url } from '@shared/live/bytes'
import { JOIN_HEADER, parseConnectRequest } from '@shared/live/connect-url'
import { JOIN_TOKEN_BYTES, RESUME_TOKEN_BYTES } from '@shared/live/protocol'
import { Base64Url22 } from '@shared/live/schemas/envelope'

export interface ConnectParams {
  clientId: string
  joinToken: Uint8Array
  resumeToken: Uint8Array
}

export type ConnectRefusal = 'TOKEN_IN_QUERY' | 'MALFORMED' | 'BAD_PROTOCOL'
export type ConnectParse =
  { ok: true; params: ConnectParams } | { ok: false; reason: ConnectRefusal }

function bytesOf(text: string | undefined, length: number): Uint8Array | undefined {
  if (!text) return undefined
  try {
    const bytes = fromBase64Url(text)
    return bytes.length === length ? bytes : undefined
  } catch {
    return undefined
  }
}

/**
 * The connect parameters of an upgrade (`protocols` = `Sec-WebSocket-Protocol`) or of a
 * fallback request (`headers`). Both tokens are required: a device always has a resume token.
 */
export function parseConnectParams(input: {
  search: URLSearchParams
  protocols?: string | string[] | undefined
  headers?: IncomingHttpHeaders
}): ConnectParse {
  const parsed = parseConnectRequest({
    search: input.search,
    ...(input.protocols !== undefined ? { protocols: input.protocols } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  })
  if (!parsed.ok) {
    if (parsed.reason === 'TOKEN_IN_QUERY') return { ok: false, reason: 'TOKEN_IN_QUERY' }
    if (parsed.reason === 'BAD_PROTOCOL') return { ok: false, reason: 'BAD_PROTOCOL' }
    return { ok: false, reason: 'MALFORMED' }
  }
  const { clientId, joinToken, resumeToken } = parsed.request
  if (!Base64Url22.safeParse(clientId).success) return { ok: false, reason: 'MALFORMED' }
  const join = bytesOf(joinToken, JOIN_TOKEN_BYTES)
  const resume = bytesOf(resumeToken, RESUME_TOKEN_BYTES)
  if (!join || !resume) return { ok: false, reason: 'MALFORMED' }
  return { ok: true, params: { clientId, joinToken: join, resumeToken: resume } }
}

/** Only the join token (the blob route), from the `X-AS-Join` header: 16 bytes, base64url. */
export function parseJoinToken(headers: IncomingHttpHeaders): Uint8Array | undefined {
  const raw = headers[JOIN_HEADER]
  const text = Array.isArray(raw) ? raw[0] : raw
  if (!text || !/^[A-Za-z0-9_-]{16,64}$/.test(text)) return undefined
  return bytesOf(text, JOIN_TOKEN_BYTES)
}
