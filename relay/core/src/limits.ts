/**
 * Server-side caps per connection kind: the protocol's `LIMITS` (spec 0406) plus what only a
 * server enforces (spec 0408 FR-5): stored envelopes per session and rate limits. The relay's
 * numbers protect a shared free daily allowance; LAN and self-hosted servers run on hardware the
 * organization owns, so theirs are looser.
 */
import { LIMITS, PROTOCOL_VERSION, type ConnectionKind, type Limits } from '@shared/live/protocol'

export interface RateLimits {
  /** Incoming frames per minute from one participant connection, and the burst it may send at once. */
  clientPerMinute: number
  clientBurst: number
  /** The same for a controller connection, which uploads blobs as many small frames. */
  controllerPerMinute: number
  controllerBurst: number
  /** Incoming frames per minute across the whole session. */
  sessionPerMinute: number
  sessionBurst: number
  /** Connections per client id per hour, the first one included. */
  reconnectsPerHour: number
}

export interface HubLimits extends Limits {
  /** Stored envelopes per session; past it, participant frames are refused with `STORE_FULL`. */
  storedEnvelopes: number
  rates: RateLimits
}

const OWN_HARDWARE: RateLimits = {
  clientPerMinute: 120,
  clientBurst: 30,
  controllerPerMinute: 6000,
  controllerBurst: 600,
  sessionPerMinute: 6000,
  sessionBurst: 1000,
  reconnectsPerHour: 120,
}

export const HUB_LIMITS: Record<ConnectionKind, HubLimits> = {
  lan: { ...LIMITS.lan, storedEnvelopes: 20_000, rates: OWN_HARDWARE },
  relay: {
    ...LIMITS.relay,
    storedEnvelopes: 4_000,
    rates: {
      clientPerMinute: 30,
      clientBurst: 10,
      controllerPerMinute: 600,
      controllerBurst: 60,
      sessionPerMinute: 600,
      sessionBurst: 100,
      reconnectsPerHour: 20,
    },
  },
  'self-hosted': { ...LIMITS['self-hosted'], storedEnvelopes: 20_000, rates: OWN_HARDWARE },
}

/** Default retention: a session's rows are deleted this long after creation at the latest. */
export const RETENTION_MS = 72 * 60 * 60 * 1000
/** How long a content-free tombstone answers `SESSION_ENDED` after `session.end`. */
export const TOMBSTONE_MS = 60 * 60 * 1000

/** The protocol's `Limits` subset of a `HubLimits`, as announced in `relay.hello.caps`. */
export function announcedLimits(limits: HubLimits): Limits {
  const { envelopeBytes, chunkBytes, blobBytes, playerBlobBytes, blobsTotalBytes, clients } = limits
  return { envelopeBytes, chunkBytes, blobBytes, playerBlobBytes, blobsTotalBytes, clients }
}

export { LIMITS, PROTOCOL_VERSION }
export type { ConnectionKind, Limits }
