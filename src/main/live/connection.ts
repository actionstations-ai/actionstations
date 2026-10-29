/**
 * Choosing and checking a live play connection (spec 0410): what a connection is called on screen,
 * whether it is allowed to start, and the consent a remote kind needs first. Pure functions; the
 * probes that touch a network are in `test.ts` and run only from a test or a start the
 * facilitator asked for (Project rules 3).
 */
import { RELAY_HOST } from '@shared/live/servers'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { LiveConnection, RemoteStatus } from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import { normalizeServerUrl } from './transport/remote'

export type RemoteKind = 'relay' | 'self-hosted'

export const isRemote = (c: LiveConnection): c is Exclude<LiveConnection, { kind: 'lan' }> =>
  c.kind !== 'lan'

/** The scenario's own choice wins; the settings default only pre-selects a scenario with none. */
export function resolveConnection(
  state: Pick<FacilitatorState, 'live'> | undefined,
  defaultKind: LiveConnection['kind'],
): LiveConnection | undefined {
  const chosen = state?.live?.connection
  if (chosen) return chosen
  if (defaultKind === 'lan') return { kind: 'lan', tls: 'self-signed' }
  if (defaultKind === 'relay') return { kind: 'relay' }
  return undefined
}

/** The connection with its address checked and normalized; throws a plain `VALIDATION` error. */
export function validateConnection(c: LiveConnection): LiveConnection {
  if (c.kind !== 'self-hosted') return c
  return { ...c, url: normalizeServerUrl(c.url, c.insecureHttp) }
}

export function hasConsented(state: Pick<FacilitatorState, 'live'>, kind: RemoteKind): boolean {
  return state.live?.consented?.includes(kind) ?? false
}

export function requireConsent(state: Pick<FacilitatorState, 'live'>, c: LiveConnection): void {
  if (!isRemote(c) || hasConsented(state, c.kind)) return
  throw new AppError('VALIDATION', 'Confirm what this connection sends first.', {
    reason: 'consent',
    kind: c.kind,
  })
}

/** Host and security as the Live play header shows them (spec 0410 FR-6). */
export function remoteStatusOf(
  c: Exclude<LiveConnection, { kind: 'lan' }>,
  base: string,
  pinned: boolean,
): RemoteStatus {
  const host = c.kind === 'relay' && base.includes(RELAY_HOST) ? RELAY_HOST : new URL(base).host
  const security = base.startsWith('http:') ? 'http' : pinned ? 'self-signed' : 'https'
  return { kind: c.kind, host, security }
}
