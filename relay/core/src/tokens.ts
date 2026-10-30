/**
 * Ids and tokens a server mints or checks, on Web APIs only (`crypto.getRandomValues`,
 * `crypto.subtle.digest`) so the same code runs in a Worker, in Node and in Electron.
 *
 * A server stores hashes, never tokens: the join token's hash comes from the controller
 * (spec 0406, `SessionKeys.joinTokenHash`), the controller token's hash is kept at creation,
 * and a participant's resume token is hashed when the client id is first used.
 */
import { bytesEqual, fromBase64Url, toBase64Url, toHex, utf8 } from '@shared/live/bytes'
import { JOIN_TOKEN_BYTES, RESUME_TOKEN_BYTES } from '@shared/live/protocol'

/** Bytes of a controller token: 256 bits, shown to the server on every controller connection. */
export const CONTROLLER_TOKEN_BYTES = 32
/** Bytes of a session id: 128 bits, 22 characters base64url. */
export const SESSION_ID_BYTES = 16

const PRESENTED_TOKEN = /^[A-Za-z0-9_-]{16,128}$/

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length)
  globalThis.crypto.getRandomValues(out)
  return out
}

/** A new session id (base64url, 22 characters). */
export function randomId(): string {
  return toBase64Url(randomBytes(SESSION_ID_BYTES))
}

/** A new controller token (base64url, 43 characters). */
export function randomToken(): string {
  return toBase64Url(randomBytes(CONTROLLER_TOKEN_BYTES))
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? utf8(data) : data
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return toHex(new Uint8Array(digest))
}

/** What the server keeps of a bearer token (controller token, server key). */
export function hashBearerToken(token: string): Promise<string> {
  return sha256Hex(token)
}

/**
 * The hash of a token a client presents as base64url (join token, resume token): the client
 * derived the bytes, the controller registered their SHA-256. `undefined` when the text is not a
 * token at all or decodes to fewer than `minBytes`.
 */
export async function hashPresentedToken(
  text: string | undefined,
  minBytes: number,
): Promise<string | undefined> {
  if (!text || !PRESENTED_TOKEN.test(text)) return undefined
  let bytes: Uint8Array
  try {
    bytes = fromBase64Url(text)
  } catch {
    return undefined
  }
  if (bytes.length < minBytes) return undefined
  return sha256Hex(bytes)
}

export function hashJoinToken(text: string | undefined): Promise<string | undefined> {
  return hashPresentedToken(text, JOIN_TOKEN_BYTES)
}

export function hashResumeToken(text: string | undefined): Promise<string | undefined> {
  return hashPresentedToken(text, RESUME_TOKEN_BYTES)
}

/**
 * Compares two hex digests without an early exit on the first differing byte. Different
 * lengths are compared against themselves so the time spent does not say where they differ.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = utf8(a)
  const right = utf8(b)
  if (left.length !== right.length) {
    bytesEqual(left, left)
    return false
  }
  return bytesEqual(left, right)
}

/**
 * Which controller a presented token belongs to: the first registered hash is the host's, the
 * rest are co-controllers' (#517). A co-controller token opens a connection but not the
 * session's HTTP actions (end, kick, join token, more tokens).
 */
export function controllerRoleOf(
  presented: string | undefined,
  hashes: readonly string[],
): 'host' | 'co' | undefined {
  if (!presented || hashes.length === 0) return undefined
  if (matchesAny(presented, hashes.slice(0, 1))) return 'host'
  return matchesAny(presented, hashes.slice(1)) ? 'co' : undefined
}

/** Whether `presented` hashes to one of the registered hashes, in constant time per candidate. */
export function matchesAny(presented: string | undefined, hashes: readonly string[]): boolean {
  if (!presented) return false
  let found = false
  for (const hash of hashes) found = constantTimeEqual(presented, hash) || found
  return found
}
