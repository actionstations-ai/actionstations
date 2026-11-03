// Stall and repetition guard for a streamed model reply (#606). The Tabletop Mini Benchmark
// puts no time limit on a call: a slow model is reported as slow, not failed. A call ends only
// when the model stops producing tokens (a stall) or writes the same text over and over (a
// loop). The guard is off unless a provider's options carry `streamGuard`, so the app's own
// calls keep their normal timeouts.
import { AppError } from '../lib/errors'

export interface StreamGuardOptions {
  /** Longest wait for the first output token, covering prompt processing. */
  firstTokenMs: number
  /** Longest gap between output tokens once the reply has started. */
  stallMs: number
  /** A repeating unit must cover at least this many characters to count as a loop. */
  loopMinChars: number
  /** ...and repeat at least this many times. */
  loopMinRepeats: number
}

/** How much of the end of the reply is kept for loop checks and the failure record. */
const WINDOW_CHARS = 6000
const TAIL_CHARS = 400
/** Loop checks run after this many new characters. */
const CHECK_EVERY = 200
const MAX_UNIT = 1000

const positive = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined

/** `options.streamGuard` when it is complete and valid; undefined (guard off) otherwise. */
export function streamGuardOption(
  options: Record<string, unknown> | undefined,
): StreamGuardOptions | undefined {
  const raw = options?.streamGuard
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const firstTokenMs = positive(r.firstTokenMs)
  const stallMs = positive(r.stallMs)
  const loopMinChars = positive(r.loopMinChars)
  const loopMinRepeats = positive(r.loopMinRepeats)
  if (!firstTokenMs || !stallMs || !loopMinChars || !loopMinRepeats) return undefined
  return { firstTokenMs, stallMs, loopMinChars, loopMinRepeats }
}

export interface Loop {
  unit: string
  repeats: number
}

/**
 * A unit that repeats to the end of `text`: the last max(minChars, minRepeats x unit) characters
 * are the unit over and over. Whitespace-only units (blank runs) are not loops.
 */
export function findLoop(text: string, minChars: number, minRepeats: number): Loop | undefined {
  const n = text.length
  for (let p = 1; p <= MAX_UNIT; p++) {
    const span = Math.max(minChars, p * minRepeats)
    if (span > n) break
    if (!isPeriodic(text, n, span, p)) continue
    const unit = text.slice(n - p)
    if (unit.trim()) return { unit, repeats: Math.floor(span / p) }
  }
  return undefined
}

function isPeriodic(text: string, n: number, span: number, p: number): boolean {
  for (let i = n - 1; i >= n - span + p; i--) if (text[i] !== text[i - p]) return false
  return true
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

export class StreamGuard {
  private readonly controller = new AbortController()
  private timer: ReturnType<typeof setTimeout> | undefined
  private window = ''
  private sinceCheck = 0
  private started = false
  failure: AppError | undefined

  constructor(private readonly opts: StreamGuardOptions) {}

  /** Aborts when the guard trips; pass it (combined with the caller's signal) to the request. */
  get signal(): AbortSignal {
    return this.controller.signal
  }

  /** Start waiting for the first token. */
  arm(): void {
    this.restart(this.opts.firstTokenMs)
  }

  /** Call for every piece of output (answer or reasoning). */
  token(text: string): void {
    if (this.failure || !text) return
    this.started = true
    this.restart(this.opts.stallMs)
    this.window = (this.window + text).slice(-WINDOW_CHARS)
    this.sinceCheck += text.length
    if (this.sinceCheck < CHECK_EVERY) return
    this.sinceCheck = 0
    const loop = findLoop(this.window, this.opts.loopMinChars, this.opts.loopMinRepeats)
    if (loop) this.trip('loop', `repeating the same text (${oneLine(loop.unit).slice(0, 80)})`)
  }

  stop(): void {
    clearTimeout(this.timer)
  }

  /** The error to throw when the stream ended because the guard aborted it. */
  get tripped(): AppError | undefined {
    return this.failure
  }

  private restart(ms: number): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.onSilence(ms), ms)
  }

  private onSilence(ms: number): void {
    const secs = Math.round(ms / 1000)
    this.trip(
      'stall',
      this.started
        ? `no new output for ${secs} s after the reply started`
        : `no output for ${secs} s while the prompt was read`,
    )
  }

  private trip(kind: 'stall' | 'loop', what: string): void {
    if (this.failure) return
    const tail = this.window.slice(-TAIL_CHARS)
    this.failure = new AppError(
      'PROVIDER',
      `Reply ${kind === 'stall' ? 'stalled' : 'looped'}: ${what}. Last output: "${oneLine(tail)}"`,
      {
        guard: kind,
        tail,
      },
    )
    this.stop()
    this.controller.abort()
  }
}
