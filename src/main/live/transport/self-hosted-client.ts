/**
 * An organization's own session server as seen by the app (spec 0409, 0410): a URL the
 * facilitator typed, an optional pinned certificate fingerprint for a self-signed server, and the
 * server key from safeStorage. The key leaves this computer only as the bearer of
 * `POST /v1/sessions` (and the key check) to that URL.
 */
import { createHash } from 'node:crypto'
import { SERVER_KEY_PREFIX } from '@shared/live/servers'
import { getSecret, hasSecret, setSecret } from '../../secrets'
import { createRemoteClient, type RemoteClient } from './remote-client'
import { normalizeServerUrl } from './remote'

/** `live-server-<sha256 of the address>`: the secret name for a server's key. */
export function serverKeyName(url: string): string {
  return (
    SERVER_KEY_PREFIX + createHash('sha256').update(normalizeServerUrl(url, true)).digest('hex')
  )
}

export const getServerKey = (url: string) => getSecret(serverKeyName(url))
export const hasServerKey = (url: string) => hasSecret(serverKeyName(url))
export const setServerKey = (url: string, key: string | null) => setSecret(serverKeyName(url), key)

export interface SelfHostedOptions {
  url: string
  fingerprintSha256?: string
  insecureHttp?: boolean
  /** A key not saved yet (the test button before Save); otherwise the stored key is used. */
  serverKey?: string
}

export async function createSelfHostedClient(o: SelfHostedOptions): Promise<RemoteClient> {
  const base = normalizeServerUrl(o.url, o.insecureHttp ?? false)
  const key = o.serverKey?.trim() || (await getServerKey(base))
  return createRemoteClient({
    target: { base, ...(o.fingerprintSha256 ? { fingerprintSha256: o.fingerprintSha256 } : {}) },
    ...(key ? { serverKey: key } : {}),
  })
}
