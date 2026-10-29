/**
 * Edge-side rate limiting with injected clocks: a sliding window per key (session creations,
 * socket upgrades, HTTP actions per address or per session). State is in memory only; a server
 * that restarts starts lenient, which is the safe direction. Keys with no recent hit are pruned
 * as the window is used, so a flood of addresses cannot grow the map without bound.
 */

export type RateDecision = { ok: true } | { ok: false; retryAfterMs: number }

/** At most `limit` hits per key inside any window of `windowMs`. */
export class SlidingWindow<K = string> {
  private readonly hits = new Map<K, number[]>()
  private sinceLastPrune = 0

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    /** Keys at most; past it the oldest-touched keys go first. */
    private readonly maxKeys = 10_000,
  ) {}

  hit(key: K, now: number): RateDecision {
    if (++this.sinceLastPrune >= 256) this.prune(now)
    const start = now - this.windowMs
    const recent = (this.hits.get(key) ?? []).filter((t) => t > start)
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      return { ok: false, retryAfterMs: recent[0]! + this.windowMs - now }
    }
    recent.push(now)
    this.hits.delete(key) // re-insert so iteration order is by last touch
    this.hits.set(key, recent)
    if (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value
      if (oldest !== undefined) this.hits.delete(oldest)
    }
    return { ok: true }
  }

  /** Drops keys with no hit inside the window. */
  prune(now: number): void {
    this.sinceLastPrune = 0
    const start = now - this.windowMs
    for (const [key, times] of this.hits) {
      const recent = times.filter((t) => t > start)
      if (recent.length === 0) this.hits.delete(key)
      else this.hits.set(key, recent)
    }
  }

  get size(): number {
    return this.hits.size
  }
}

/** The /64 of an IPv6 address, or the IPv4 address itself: what one person controls at once. */
export function addressPrefix(address: string): string {
  if (!address.includes(':')) return address
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped) return mapped[1]!
  const groups = expandIpv6(address)
  return groups ? groups.slice(0, 4).join(':') + '::/64' : address
}

function expandIpv6(address: string): string[] | undefined {
  const zone = address.indexOf('%')
  const text = zone >= 0 ? address.slice(0, zone) : address
  const [head, rest] = text.split('::')
  if (head === undefined) return undefined
  const headParts = head ? head.split(':') : []
  const restParts = rest ? rest.split(':') : []
  if (headParts.length + restParts.length > 8) return undefined
  const missing = 8 - headParts.length - restParts.length
  const groups = [
    ...headParts,
    ...Array<string>(rest === undefined ? 0 : missing).fill('0'),
    ...restParts,
  ]
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return undefined
  return groups.map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''))
}
