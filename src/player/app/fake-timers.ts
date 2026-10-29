/**
 * Deterministic timers for tests (never imported by the page): `advance(ms)` fires every
 * timeout that falls due, in order, so backoff and the 2 s / 3 s header rules are exact.
 */
import type { Timers } from './reconnect'

export class FakeTimers implements Timers {
  now = 1_700_000_000_000
  private next = 1
  private readonly pending = new Map<number, { at: number; cb: () => void }>()

  setTimeout(cb: () => void, ms: number): unknown {
    const id = this.next++
    this.pending.set(id, { at: this.now + ms, cb })
    return id
  }

  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number)
  }

  advance(ms: number): void {
    const until = this.now + ms
    for (;;) {
      const due = [...this.pending]
        .filter(([, t]) => t.at <= until)
        .sort((a, b) => a[1].at - b[1].at)
      if (due.length === 0) break
      const [id, t] = due[0]!
      this.pending.delete(id)
      this.now = Math.max(this.now, t.at)
      t.cb()
    }
    this.now = until
  }

  get count(): number {
    return this.pending.size
  }
}
