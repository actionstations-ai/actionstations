// Shared HTTP plumbing for provider adapters (ADR-0006): fetch with timeout and abort
// passthrough, retry with backoff, SSE / NDJSON stream parsing and error mapping.
// Error messages carry the HTTP status and the vendor's error text, never the API key.
import { createParser, type EventSourceMessage } from 'eventsource-parser'
import { AppError } from '../lib/errors'

export interface HttpRequest {
  method?: 'GET' | 'POST' | 'DELETE'
  headers?: Record<string, string>
  /** JSON-serialised when not a string. */
  body?: unknown
  signal?: AbortSignal
  /** Time allowed until response headers arrive (per attempt). Default 120 s. */
  timeoutMs?: number
  /** Retries after the first attempt for 429 / 5xx / network errors. Default 3. */
  retries?: number
  /** Base backoff delay; doubled per attempt. Default 500 ms. */
  backoffBaseMs?: number
  /** Human label used in error messages, e.g. "Anthropic". */
  vendor: string
  /** Secret to scrub from any error text (defence in depth). */
  secret?: string
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529])
const MAX_BACKOFF_MS = 30_000
const MAX_ERROR_TEXT = 600

export function redactSecrets(text: string, secret?: string): string {
  let out = secret && secret.length >= 4 ? text.split(secret).join('[redacted]') : text
  out = out.replace(/\b(sk-[A-Za-z0-9_-]{8,})/g, '[redacted]')
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[redacted]')
  return out
}

/** Pull the human-readable message out of a vendor error body (JSON or text). */
export function vendorErrorText(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const err = parsed.error
    if (typeof err === 'string') return err
    if (
      err &&
      typeof err === 'object' &&
      typeof (err as { message?: unknown }).message === 'string'
    )
      return (err as { message: string }).message
    if (typeof parsed.message === 'string') return parsed.message
    if (typeof parsed.detail === 'string') return parsed.detail
  } catch {
    /* not JSON */
  }
  return body.trim()
}

export function providerError(
  vendor: string,
  status: number,
  body: string,
  secret?: string,
): AppError {
  const text = redactSecrets(vendorErrorText(body), secret).slice(0, MAX_ERROR_TEXT)
  const hint = status === 401 || status === 403 ? ' (check the API key)' : ''
  return new AppError('PROVIDER', `${vendor} HTTP ${status}${hint}: ${text || 'no details'}`, {
    status,
  })
}

/** Delay to wait before the next attempt, honoring retry-after / retry-after-ms. */
export function retryDelayMs(res: Response | undefined, attempt: number, baseMs: number): number {
  const ms = res?.headers.get('retry-after-ms')
  if (ms && Number.isFinite(Number(ms))) return Math.min(Number(ms), MAX_BACKOFF_MS)
  const ra = res?.headers.get('retry-after')
  if (ra) {
    const secs = Number(ra)
    if (Number.isFinite(secs)) return Math.min(secs * 1000, MAX_BACKOFF_MS)
    const at = Date.parse(ra)
    if (Number.isFinite(at)) return Math.min(Math.max(0, at - Date.now()), MAX_BACKOFF_MS)
  }
  const jitter = Math.random() * baseMs * 0.25
  return Math.min(baseMs * 2 ** attempt + jitter, MAX_BACKOFF_MS)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled())
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(t)
      reject(cancelled())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const cancelled = (): AppError => new AppError('CANCELLED', 'Cancelled')

function encodeBody(body: unknown): string | undefined {
  if (body === undefined) return undefined
  return typeof body === 'string' ? body : JSON.stringify(body)
}

async function attemptFetch(url: string, req: HttpRequest): Promise<Response> {
  const timeoutMs = req.timeoutMs ?? 120_000
  const timer = new AbortController()
  const t = setTimeout(() => timer.abort(), timeoutMs)
  const signal = req.signal ? AbortSignal.any([req.signal, timer.signal]) : timer.signal
  const body = encodeBody(req.body)
  const headers = { ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }
  try {
    return await fetch(url, {
      method: req.method ?? (body !== undefined ? 'POST' : 'GET'),
      headers: { ...headers, ...req.headers },
      body,
      signal,
    })
  } catch (err) {
    if (req.signal?.aborted) throw cancelled()
    if (timer.signal.aborted)
      throw new AppError(
        'PROVIDER',
        `${req.vendor} timed out after ${Math.round(timeoutMs / 1000)} s`,
      )
    throw new NetworkError(`${req.vendor} unreachable at ${safeOrigin(url)}: ${errMessage(err)}`)
  } finally {
    clearTimeout(t)
  }
}

class NetworkError extends Error {}

function errMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause
    return cause?.code ?? cause?.message ?? err.message
  }
  return String(err)
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return 'configured URL'
  }
}

/**
 * fetch with retry/backoff. Resolves with an OK response (body unread); throws AppError
 * ('PROVIDER' for HTTP/network failures, 'CANCELLED' on abort).
 */
export async function request(url: string, req: HttpRequest): Promise<Response> {
  const retries = req.retries ?? 3
  const base = req.backoffBaseMs ?? 500
  for (let attempt = 0; ; attempt++) {
    let res: Response | undefined
    try {
      res = await attemptFetch(url, req)
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err
      if (attempt >= retries) throw new AppError('PROVIDER', redactSecrets(err.message, req.secret))
      await sleep(retryDelayMs(undefined, attempt, base), req.signal)
      continue
    }
    if (res.ok) return res
    const text = await res.text().catch(() => '')
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= retries)
      throw providerError(req.vendor, res.status, text, req.secret)
    await sleep(retryDelayMs(res, attempt, base), req.signal)
  }
}

export async function requestJson<T>(url: string, req: HttpRequest): Promise<T> {
  const res = await request(url, req)
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new AppError('PROVIDER', `${req.vendor} returned invalid JSON from ${safeOrigin(url)}`)
  }
}

/** Decoded body chunks; aborts map to CANCELLED, stalls longer than idleMs to PROVIDER. */
export async function* textChunks(
  res: Response,
  opts: { signal?: AbortSignal; idleMs?: number; vendor: string },
): AsyncGenerator<string> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const idleMs = opts.idleMs ?? 120_000
  const onAbort = (): void => void reader.cancel().catch(() => undefined)
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    for (;;) {
      if (opts.signal?.aborted) throw cancelled()
      const { done, value } = await readWithIdle(reader, idleMs, opts.vendor)
      if (opts.signal?.aborted) throw cancelled()
      if (done) break
      yield decoder.decode(value, { stream: true })
    }
    const tail = decoder.decode()
    if (tail) yield tail
  } finally {
    opts.signal?.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
}

async function readWithIdle(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleMs: number,
  vendor: string,
): Promise<Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']>>> {
  let t: ReturnType<typeof setTimeout> | undefined
  const stall = new Promise<never>((_, reject) => {
    t = setTimeout(() => {
      // Reject before cancelling: cancel() settles the pending read synchronously.
      reject(
        new AppError('PROVIDER', `${vendor} stream stalled for ${Math.round(idleMs / 1000)} s`),
      )
      void reader.cancel().catch(() => undefined)
    }, idleMs)
  })
  try {
    return await Promise.race([reader.read(), stall])
  } finally {
    clearTimeout(t)
  }
}

/** Server-sent events from a streaming response. */
export async function* sseEvents(
  res: Response,
  opts: { signal?: AbortSignal; idleMs?: number; vendor: string },
): AsyncGenerator<EventSourceMessage> {
  const queue: EventSourceMessage[] = []
  const parser = createParser({ onEvent: (e) => queue.push(e) })
  for await (const chunk of textChunks(res, opts)) {
    parser.feed(chunk)
    while (queue.length) yield queue.shift()!
  }
  parser.reset({ consume: true })
  while (queue.length) yield queue.shift()!
}

/** Newline-delimited JSON values from a streaming response (blank lines skipped). */
export async function* ndjsonLines(
  res: Response,
  opts: { signal?: AbortSignal; idleMs?: number; vendor: string },
): AsyncGenerator<unknown> {
  let buf = ''
  for await (const chunk of textChunks(res, opts)) {
    buf += chunk
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) yield parseLine(line, opts.vendor)
    }
  }
  if (buf.trim()) yield parseLine(buf.trim(), opts.vendor)
}

function parseLine(line: string, vendor: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    throw new AppError('PROVIDER', `${vendor} sent a malformed stream line`)
  }
}

/** Join a base URL and a path without doubling or dropping slashes. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}
