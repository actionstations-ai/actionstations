// Shared by the cloud media adapters: wait for a queued job with growing pauses between checks,
// an overall time limit, and the job's cancel signal.
import { AppError } from '../../../lib/errors'

export interface PollOptions {
  /** First pause between checks. Default 2 s. */
  minMs?: number
  /** Longest pause. Default 15 s. */
  maxMs?: number
  /** Give up after this long. */
  timeoutMs: number
  signal?: AbortSignal
  /** Called once when the wait ends by cancel or timeout, before the error is thrown. */
  onStop?: (reason: 'cancelled' | 'timeout') => Promise<void>
  /** What timed out, for the message ("fal.ai video"). */
  label: string
}

export type PollStep<T> = { done: true; value: T } | { done: false }

export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AppError('CANCELLED', 'Cancelled'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new AppError('CANCELLED', 'Cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Run `step` until it reports done; pauses grow from minMs to maxMs (x1.5 each time). */
export async function pollUntil<T>(
  step: () => Promise<PollStep<T>>,
  opts: PollOptions,
): Promise<T> {
  const started = Date.now()
  const max = opts.maxMs ?? 15_000
  let delay = opts.minMs ?? 2_000
  for (;;) {
    try {
      if (opts.signal?.aborted) throw new AppError('CANCELLED', 'Cancelled')
      const result = await step()
      if (result.done) return result.value
      const left = opts.timeoutMs - (Date.now() - started)
      if (left <= 0) throw timeout(opts)
      await pause(Math.min(delay, left), opts.signal)
      delay = Math.min(delay * 1.5, max)
    } catch (err) {
      if (err instanceof AppError && err.code === 'CANCELLED') await opts.onStop?.('cancelled')
      if (err instanceof TimedOut) {
        await opts.onStop?.('timeout')
        throw err.error
      }
      throw err
    }
  }
}

class TimedOut extends Error {
  constructor(readonly error: AppError) {
    super(error.message)
  }
}

function timeout(opts: PollOptions): TimedOut {
  const minutes = Math.max(1, Math.round(opts.timeoutMs / 60_000))
  return new TimedOut(
    new AppError(
      'PROVIDER',
      `${opts.label} did not finish within ${minutes} min; it was cancelled`,
    ),
  )
}
