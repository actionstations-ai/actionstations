/** Bindings from wrangler.toml and the constants the Worker and its objects share. */
import type { SessionHubOptions } from '@shared/live/hub'

export interface Env {
  SESSIONS: DurableObjectNamespace
  QUOTA: DurableObjectNamespace
  ASSETS: Fetcher
  RELAY_VERSION?: string
}

/**
 * Sessions created per UTC day, account-wide (spec 0408 FR-5), and per address (the /64 for
 * IPv6) so one person cannot take the day. With the per-session write budget below the worst
 * day stays under the free plan's 100,000 row writes: 25 × 3,600 = 90,000.
 */
export const SESSIONS_PER_DAY = 25
export const SESSIONS_PER_ADDRESS_PER_DAY = 3

/** The one quota object's name. */
export const QUOTA_OBJECT_NAME = 'quota'

/**
 * The relay's per-session caps (spec 0408 FR-5, "Allowance budget"): what one session may cost
 * of the shared free allowance. A stored frame is two row writes (seq, envelope); a chunk is
 * one plus its blob row; an identity is one.
 */
export const RELAY_HUB_OPTIONS: Pick<
  SessionHubOptions,
  'framesPerMinute' | 'storedEnvelopes' | 'storedBytes' | 'rowWriteBudget' | 'catchupBytes'
> = {
  framesPerMinute: 30,
  storedEnvelopes: 1_500,
  storedBytes: 12 * 1024 * 1024,
  rowWriteBudget: 3_600,
  catchupBytes: 512 * 1024,
}

/** Controller tokens a session may hold (the host plus co-controllers, #440). */
export const MAX_CONTROLLER_TOKENS = 8

/** Per-address caps at the edge, best effort (one isolate's memory). */
export const CREATES_PER_IP_PER_MINUTE = 10
export const UPGRADES_PER_IP_PER_MINUTE = 60
/** Controller HTTP actions (kick, join-token, end, controllers) per session per minute. */
export const ACTIONS_PER_SESSION_PER_MINUTE = 60

/** What the ping keepalive looks like; answered without waking the object. */
export const PING_REQUEST = '{"ping":1}'
export const PING_RESPONSE = '{"pong":1}'

/** What a hibernated socket remembers about its connection. Ids and times only. */
export interface Attachment {
  clientId: string
  controller: boolean
  since: number
}

/** The next UTC midnight after `now`, in epoch milliseconds. */
export function nextUtcMidnight(now: number): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
}

/** `YYYY-MM-DD` of `now` in UTC: the quota's day key. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** Retention (spec 0408 FR-3): everything goes 72 h after creation; the tombstone an hour after the end. */
export const RETENTION_MS = 72 * 60 * 60 * 1000
export const TOMBSTONE_MS = 60 * 60 * 1000
