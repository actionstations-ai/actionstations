/**
 * The Action Stations relay as seen by the app (spec 0408, 0410). The address is a constant
 * (`RELAY_URL`); an unpackaged test run may point `TTX_LIVE_RELAY_URL` at a local server, which
 * is the only way to reach a plain-http relay. No server key: the relay's sessions are limited by
 * daily quotas, not credentials.
 */
import { app } from 'electron'
import { RELAY_URL } from '@shared/live/servers'
import { AppError } from '../../lib/errors'
import { createRemoteClient, type RemoteClient } from './remote-client'
import { normalizeServerUrl } from './remote'

/** The relay's base address: the constant, or the test override in an unpackaged run. */
export function relayBase(): string {
  const override = !app.isPackaged ? process.env.TTX_LIVE_RELAY_URL : undefined
  if (!override) return RELAY_URL
  try {
    return normalizeServerUrl(override, true)
  } catch (err) {
    throw new AppError('VALIDATION', `TTX_LIVE_RELAY_URL is not usable: ${(err as Error).message}`)
  }
}

export function createRelayClient(base: string = relayBase()): RemoteClient {
  return createRemoteClient({ target: { base } })
}
