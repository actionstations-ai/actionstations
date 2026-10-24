// The one network path for packs (ADR-0018): GET with manual redirects (every hop must pass
// PackFetchUrl, so https only, http on loopback only, and never from a remote host to a
// loopback one), a byte cap measured on the bytes received, an idle timeout, and cancellation.
// Callers: catalog.ts (index.json) and download.ts (archives), both only on user actions.
import { PackFetchUrl } from '@shared/schemas/pack'
import { AppError } from '../lib/errors'

export const MAX_REDIRECTS = 5
export const DEFAULT_TIMEOUT_MS = 30_000

export interface PackFetchOptions {
  signal?: AbortSignal
  /** Abort when no bytes arrive for this long (headers or body). */
  timeoutMs?: number
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const isLoopback = (u: URL): boolean => LOOPBACK.has(u.hostname)

/** Throws VALIDATION unless `url` may be fetched (after `from`, when it is a redirect). */
export function assertFetchUrl(url: string, from?: URL): URL {
  if (!PackFetchUrl.safeParse(url).success)
    throw new AppError('VALIDATION', `Refused ${redact(url)}: pack and catalog URLs must use https`)
  const u = new URL(url)
  if (u.username || u.password)
    throw new AppError('VALIDATION', 'Refused a URL with a user name or password in it')
  if (from && isLoopback(u) && !isLoopback(from))
    throw new AppError('VALIDATION', `Refused a redirect from ${from.host} to a local address`)
  return u
}

/** A URL for messages: no query string or fragment (they may carry tokens). */
export function redact(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}${u.pathname}`
  } catch {
    return '(invalid URL)'
  }
}

/**
 * An abort controller that fires on the caller's signal or after `ms` without activity.
 * `touch()` restarts the idle clock; `timedOut` says which one fired.
 */
export interface IdleAbort {
  signal: AbortSignal
  touch(): void
  readonly timedOut: boolean
  dispose(): void
}

export function idleAbort(ms: number, outer?: AbortSignal): IdleAbort {
  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const fire = () => {
    timedOut = true
    controller.abort(new AppError('PROVIDER', 'Timed out'))
  }
  const touch = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fire, ms)
  }
  const onOuter = () => controller.abort(outer?.reason)
  if (outer?.aborted) controller.abort(outer.reason)
  else outer?.addEventListener('abort', onOuter, { once: true })
  touch()
  return {
    signal: controller.signal,
    touch,
    get timedOut() {
      return timedOut
    },
    dispose: () => {
      if (timer) clearTimeout(timer)
      outer?.removeEventListener('abort', onOuter)
    },
  }
}

export interface PackResponse {
  /** Final URL after redirects. */
  url: string
  /** Content-Length when the server sent one. */
  declaredBytes?: number
  body: ReadableStream<Uint8Array>
}

/** The error for an aborted request: CANCELLED for the user, PROVIDER for a timeout. */
export function abortError(timedOut: boolean, url: string): AppError {
  return timedOut
    ? new AppError('PROVIDER', `${redact(url)} did not respond in time`)
    : new AppError('CANCELLED', 'Cancelled')
}

/**
 * GET `url`, following up to MAX_REDIRECTS redirects by hand. Refuses a declared length
 * over `maxBytes` before reading; the caller still counts the bytes it reads (see readCapped).
 */
export async function packGet(
  url: string,
  maxBytes: number,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<PackResponse> {
  let current = assertFetchUrl(url)
  for (let hop = 0; ; hop++) {
    const res = await fetchImpl(current.href, {
      method: 'GET',
      redirect: 'manual',
      signal,
      credentials: 'omit',
      headers: { accept: 'application/json, application/octet-stream;q=0.9, */*;q=0.1' },
    })
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => undefined)
      const location = res.headers.get('location')
      if (!location) throw new AppError('PROVIDER', `${redact(current.href)} redirected nowhere`)
      if (hop >= MAX_REDIRECTS) throw new AppError('PROVIDER', 'Too many redirects')
      const next = new URL(location, current).href
      current = assertFetchUrl(next, current)
      continue
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => undefined)
      throw new AppError('PROVIDER', `${redact(current.href)} answered HTTP ${res.status}`)
    }
    const length = Number(res.headers.get('content-length'))
    if (Number.isFinite(length) && length > maxBytes) {
      await res.body.cancel().catch(() => undefined)
      throw tooLarge(current.href, maxBytes)
    }
    return {
      url: current.href,
      ...(Number.isFinite(length) && length > 0 ? { declaredBytes: length } : {}),
      body: res.body,
    }
  }
}

export const tooLarge = (url: string, maxBytes: number): AppError =>
  new AppError('VALIDATION', `${redact(url)} is larger than the ${formatBytes(maxBytes)} limit`)

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n % (1024 * 1024) ? 1 : 0)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} bytes`
}

/**
 * Read a body chunk by chunk, calling `onChunk` for each, and stop with an error as soon as
 * more than `maxBytes` have arrived. `touch` restarts the idle timeout on every chunk.
 */
export async function readCapped(
  res: PackResponse,
  maxBytes: number,
  onChunk: (chunk: Uint8Array, total: number) => void | Promise<void>,
  touch: () => void,
): Promise<number> {
  const reader = res.body.getReader()
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return total
      touch()
      total += value.byteLength
      if (total > maxBytes) throw tooLarge(res.url, maxBytes)
      await onChunk(value, total)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
