/**
 * Rate limiting primitives with injected clocks: a token bucket per connection and per
 * session (frames), and a sliding window per client id (reconnects). State is in memory only;
 * a server that restarts or hibernates starts lenient, which is the safe direction.
 */

export type RateDecision = { ok: true } | { ok: false; retryAfterMs: number }

/** `capacity` tokens, refilled at `perMinute` per minute; one token per frame. */
export class TokenBucket {
  private tokens: number
  private updatedAt: number

  constructor(
    private readonly capacity: number,
    private readonly perMinute: number,
    now: number,
  ) {
    this.tokens = capacity
    this.updatedAt = now
  }

  take(now: number): RateDecision {
    this.refill(now)
    if (this.tokens >= 1) {
      this.tokens -= 1
      return { ok: true }
    }
    const perMs = this.perMinute / 60_000
    return { ok: false, retryAfterMs: Math.ceil((1 - this.tokens) / perMs) }
  }

  private refill(now: number): void {
    const elapsed = Math.max(0, now - this.updatedAt)
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed * this.perMinute) / 60_000)
    this.updatedAt = now
  }
}

/** At most `limit` hits per key inside any window of `windowMs`. */
export class SlidingWindow<K = string> {
  private readonly hits = new Map<K, number[]>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  hit(key: K, now: number): RateDecision {
    const start = now - this.windowMs
    const recent = (this.hits.get(key) ?? []).filter((t) => t > start)
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      return { ok: false, retryAfterMs: recent[0]! + this.windowMs - now }
    }
    recent.push(now)
    this.hits.set(key, recent)
    return { ok: true }
  }

  /** Drops keys with no hit inside the window; call it now and then so the map stays small. */
  prune(now: number): void {
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
