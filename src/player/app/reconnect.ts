/**
 * Reconnection policy (spec 0411 FR-7): exponential backoff from 0.5 s to 30 s with jitter,
 * an immediate attempt when the page wakes (visible again, back online, restored from the
 * back-forward cache), and the close codes that mean "stop trying". Pure logic over injected
 * timers so it is tested without a browser.
 */
import { CLOSE_CODES } from '../../shared/live/protocol'

export const BACKOFF_MIN_MS = 500
export const BACKOFF_MAX_MS = 30_000
/** How long a drop may last before the page says "Reconnecting…". */
export const RECONNECTING_AFTER_MS = 2_000
/** How long "You're back" stays up. */
export const BACK_FOR_MS = 3_000

/** Delay before attempt `attempt` (0-based): doubling from 0.5 s, capped at 30 s, half jittered. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempt))
  return Math.round(base / 2 + random() * (base / 2))
}

export type TerminalReason =
  'update-required' | 'link-invalid' | 'ended' | 'removed' | 'device-conflict'

/** A close code after which the page must not reconnect, mapped to the screen it shows. */
export function terminalReason(code: number): TerminalReason | undefined {
  switch (code) {
    case CLOSE_CODES.VERSION:
      return 'update-required'
    case CLOSE_CODES.BAD_JOIN_TOKEN:
      return 'link-invalid'
    case CLOSE_CODES.SESSION_ENDED:
      return 'ended'
    case CLOSE_CODES.KICKED:
      return 'removed'
    case CLOSE_CODES.CLIENT_ID_IN_USE:
      return 'device-conflict'
    default:
      return undefined
  }
}

export interface Timers {
  setTimeout(cb: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface SchedulerOptions {
  /** Called when it is time to try again. */
  attempt: () => void
  timers?: Timers
  random?: () => number
}

/**
 * Decides when the next connection attempt happens. `failed()` after a drop schedules a retry
 * with backoff; `wake()` (a visibility, online or pageshow event) retries at once when a retry
 * is pending; `connected()` resets the backoff; `stop()` cancels everything.
 */
export class ReconnectScheduler {
  attempts = 0
  private handle: unknown
  private stopped = false
  private readonly timers: Timers
  private readonly random: () => number

  constructor(private readonly opts: SchedulerOptions) {
    this.timers = opts.timers ?? globalThis
    this.random = opts.random ?? Math.random
  }

  get pending(): boolean {
    return this.handle !== undefined
  }

  /** The connection dropped (or an attempt failed): try again after the backoff delay. */
  failed(retryAfterMs?: number): number {
    if (this.stopped) return -1
    this.cancel()
    const delay = Math.max(retryAfterMs ?? 0, backoffDelay(this.attempts, this.random))
    this.attempts += 1
    this.handle = this.timers.setTimeout(() => {
      this.handle = undefined
      this.opts.attempt()
    }, delay)
    return delay
  }

  /** The page woke up: if a retry is waiting, do not wait any longer. */
  wake(): boolean {
    if (this.stopped || !this.pending) return false
    this.cancel()
    this.opts.attempt()
    return true
  }

  connected(): void {
    this.attempts = 0
    this.cancel()
  }

  stop(): void {
    this.stopped = true
    this.cancel()
  }

  private cancel(): void {
    if (this.handle !== undefined) this.timers.clearTimeout(this.handle)
    this.handle = undefined
  }
}
