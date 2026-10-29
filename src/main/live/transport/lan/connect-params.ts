/**
 * The query string a device presents on `/ws`, `/events`, `/send` and `/blobs` (spec 0406
 * lifecycle): `j` the join token, `c` the client id, `r` the resume token, all base64url.
 * Validated with the protocol's own shapes before anything reaches the hub.
 */
import { z } from 'zod'
import { fromBase64Url } from '@shared/live/bytes'
import { JOIN_TOKEN_BYTES, RESUME_TOKEN_BYTES } from '@shared/live/protocol'
import { Base64Url22 } from '@shared/live/schemas/envelope'

export interface ConnectParams {
  clientId: string
  joinToken: Uint8Array
  resumeToken: Uint8Array
}

const Token = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/)

const Query = z.object({
  j: Token,
  c: Base64Url22,
  r: Token,
})

function bytesOf(text: string, length: number): Uint8Array | undefined {
  try {
    const bytes = fromBase64Url(text)
    return bytes.length === length ? bytes : undefined
  } catch {
    return undefined
  }
}

/** The connect parameters, or undefined when anything is missing or malformed. */
export function parseConnectParams(search: URLSearchParams): ConnectParams | undefined {
  const parsed = Query.safeParse({
    j: search.get('j') ?? undefined,
    c: search.get('c') ?? search.get('client') ?? undefined,
    r: search.get('r') ?? undefined,
  })
  if (!parsed.success) return undefined
  const joinToken = bytesOf(parsed.data.j, JOIN_TOKEN_BYTES)
  const resumeToken = bytesOf(parsed.data.r, RESUME_TOKEN_BYTES)
  if (!joinToken || !resumeToken) return undefined
  return { clientId: parsed.data.c, joinToken, resumeToken }
}

/** Only the join token (the blob route): 16 bytes, base64url. */
export function parseJoinToken(search: URLSearchParams): Uint8Array | undefined {
  const j = search.get('j')
  if (!j || !Token.safeParse(j).success) return undefined
  return bytesOf(j, JOIN_TOKEN_BYTES)
}
