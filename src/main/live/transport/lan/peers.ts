/**
 * The devices currently attached to the LAN server over any transport (WebSocket or the SSE
 * stream), for the status line and for closing everything at stop.
 */
export interface Peer {
  transport: 'ws' | 'sse'
  clientId: string
  remote: string
  /** Terminate the underlying connection without a protocol close (stop, idle timeout). */
  terminate(): void
}

export class Peers {
  private readonly set = new Set<Peer>()
  private readonly listeners = new Set<(count: number) => void>()
  /** Whether any device has ever attached; drives the "no connections yet" guidance. */
  everConnected = false

  get count(): number {
    return this.set.size
  }

  add(peer: Peer): void {
    this.set.add(peer)
    this.everConnected = true
    this.changed()
  }

  remove(peer: Peer): void {
    if (this.set.delete(peer)) this.changed()
  }

  onChange(cb: (count: number) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  terminateAll(): void {
    for (const peer of [...this.set]) peer.terminate()
    this.set.clear()
    this.changed()
  }

  private changed(): void {
    for (const cb of this.listeners) cb(this.set.size)
  }
}

/**
 * Connection attempts per remote address: over `burst` within one second drops that address
 * for `banMs` (spec 0407: 10/s, 10 s). A phone reconnecting after sleep is far below this.
 */
export class Flood {
  private readonly counts = new Map<
    string,
    { n: number; windowStart: number; bannedUntil: number }
  >()

  constructor(
    private readonly burst = 10,
    private readonly banMs = 10_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** True when the attempt should be dropped. */
  hit(remote: string): boolean {
    const t = this.now()
    const entry = this.counts.get(remote) ?? { n: 0, windowStart: t, bannedUntil: 0 }
    this.counts.set(remote, entry)
    if (entry.bannedUntil > t) return true
    if (t - entry.windowStart >= 1000) {
      entry.windowStart = t
      entry.n = 0
    }
    entry.n += 1
    if (entry.n > this.burst) {
      entry.bannedUntil = t + this.banMs
      return true
    }
    return false
  }

  /** Forget addresses idle for over a minute so the map cannot grow without bound. */
  sweep(): void {
    const t = this.now()
    for (const [remote, entry] of this.counts) {
      if (entry.bannedUntil < t && t - entry.windowStart > 60_000) this.counts.delete(remote)
    }
  }
}
