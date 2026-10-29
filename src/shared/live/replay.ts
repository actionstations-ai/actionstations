import type { ClientId } from './schemas/envelope'

/**
 * Per-sender sequence tracking. `seq` is strictly increasing per sender; a duplicate or lower
 * value is a replay. Server frames (`from: "server"`, `seq: 0`) are ephemeral and never guarded.
 */
export class ReplayGuard {
  private readonly last = new Map<ClientId, number>()
  dropped = 0

  /** True when the frame is fresh. Does not record it: call `commit` once it opened. */
  check(from: ClientId, seq: number): boolean {
    if (from === 'server') return true
    const fresh = seq > (this.last.get(from) ?? 0)
    if (!fresh) this.dropped++
    return fresh
  }

  commit(from: ClientId, seq: number): void {
    if (from === 'server') return
    if (seq > (this.last.get(from) ?? 0)) this.last.set(from, seq)
  }

  lastSeq(from: ClientId): number {
    return this.last.get(from) ?? 0
  }

  /** Restore from persisted state (a controller resuming a session). */
  load(entries: Iterable<[ClientId, number]>): void {
    for (const [from, seq] of entries) this.last.set(from, seq)
  }

  snapshot(): [ClientId, number][] {
    return [...this.last.entries()]
  }
}
