/** Bindings from wrangler.toml and the constants the Worker and its objects share. */
export interface Env {
  SESSIONS: DurableObjectNamespace
  QUOTA: DurableObjectNamespace
  ASSETS: Fetcher
  RELAY_VERSION?: string
}

/** Sessions created per UTC day, account-wide (spec 0408 FR-5). The 26th gets `503 DAILY_LIMIT`. */
export const SESSIONS_PER_DAY = 25

/** The one quota object's name. */
export const QUOTA_OBJECT_NAME = 'quota'

/** Per-address caps at the edge, best effort (one isolate's memory): session creations and socket upgrades per minute. */
export const CREATES_PER_IP_PER_MINUTE = 10
export const UPGRADES_PER_IP_PER_MINUTE = 60

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
