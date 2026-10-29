/**
 * A device's identity in a session: its client id (the envelope's `from`) and the resume token
 * that binds the id to this device at the server. The server keeps only the token's SHA-256;
 * a later connection with the same id must present the same token, so knowing an id (ids are
 * visible to the controller and in `to`) gives nobody the right to speak as it.
 */
import { fromBase64Url, toBase64Url } from './bytes'
import type { CryptoProvider } from './crypto/provider'
import { RESUME_TOKEN_BYTES } from './protocol'
import type { ClientId } from './schemas'
import type { KeyValue } from './transport'

export interface ClientIdentity {
  clientId: ClientId
  resumeToken: Uint8Array
}

export function createIdentity(crypto: CryptoProvider): ClientIdentity {
  return {
    clientId: toBase64Url(crypto.random(16)),
    resumeToken: crypto.random(RESUME_TOKEN_BYTES),
  }
}

function storageKey(sessionId: string): string {
  return `as-live:${sessionId}:identity`
}

/** The identity kept for this session (a reload or reconnect keeps it), or a new one, saved. */
export function loadOrCreateIdentity(
  crypto: CryptoProvider,
  storage: KeyValue,
  sessionId: string,
): ClientIdentity {
  const saved = storage.get(storageKey(sessionId))
  if (saved) {
    const [clientId, token] = saved.split('.')
    if (clientId && token) {
      try {
        const resumeToken = fromBase64Url(token)
        if (resumeToken.length === RESUME_TOKEN_BYTES) return { clientId, resumeToken }
      } catch {
        // fall through to a fresh identity
      }
    }
  }
  const identity = createIdentity(crypto)
  storage.set(storageKey(sessionId), `${identity.clientId}.${toBase64Url(identity.resumeToken)}`)
  return identity
}

/** "Forget this session": the next load gets a new identity. */
export function forgetIdentity(storage: KeyValue, sessionId: string): void {
  storage.set(storageKey(sessionId), '')
}
