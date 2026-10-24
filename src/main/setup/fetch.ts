// The one network path for local tools setup (ADR-0021): GET with manual redirects where every
// hop must be https on a pinned vendor host, a byte cap, an idle timeout and cancellation.
// Downloads hash while streaming and remove the partial file on any failure. Only called from
// jobs the user started with a click.
import { createHash } from 'node:crypto'
import { createWriteStream, promises as fs, type WriteStream } from 'node:fs'
import { once } from 'node:events'
import { AppError } from '../lib/errors'
import {
  DEFAULT_TIMEOUT_MS,
  MAX_REDIRECTS,
  abortError,
  formatBytes,
  idleAbort,
  readCapped,
  redact,
  type PackResponse,
} from '../packs/fetch'

export interface HostPolicy {
  /** Exact host names, or suffixes starting with "." (".hf.co"). */
  hosts: string[]
  /** Tests only: allow plain http to 127.0.0.1 (the local fixture server). */
  allowLoopbackHttp?: boolean
}

export interface SetupFetchOptions {
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const hostAllowed = (host: string, hosts: string[]): boolean =>
  hosts.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h))

/** Throws VALIDATION unless `url` is https on an allowed host (or loopback http in tests). */
export function assertAllowed(url: string, policy: HostPolicy): URL {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new AppError('VALIDATION', 'Refused an invalid download URL')
  }
  if (u.username || u.password)
    throw new AppError('VALIDATION', 'Refused a URL with a user name or password in it')
  const loopback = policy.allowLoopbackHttp && u.protocol === 'http:' && u.hostname === '127.0.0.1'
  if (loopback) return u
  if (u.protocol !== 'https:')
    throw new AppError('VALIDATION', `Refused ${redact(url)}: downloads must use https`)
  if (!hostAllowed(u.hostname, policy.hosts))
    throw new AppError(
      'VALIDATION',
      `Refused ${u.hostname}: it is not one of the vendor's download hosts. The vendor may have moved its downloads; use "Open the download page".`,
    )
  return u
}

/** GET with every redirect hop checked against the policy; refuses an oversize declared length. */
export async function setupGet(
  url: string,
  policy: HostPolicy,
  maxBytes: number,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  accept = 'application/octet-stream, */*;q=0.5',
): Promise<PackResponse> {
  let current = assertAllowed(url, policy)
  for (let hop = 0; ; hop++) {
    const res = await fetchImpl(current.href, {
      method: 'GET',
      redirect: 'manual',
      signal,
      credentials: 'omit',
      headers: { accept, 'user-agent': 'ActionStations-setup' },
    })
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => undefined)
      const location = res.headers.get('location')
      if (!location) throw new AppError('PROVIDER', `${redact(current.href)} redirected nowhere`)
      if (hop >= MAX_REDIRECTS) throw new AppError('PROVIDER', 'Too many redirects')
      current = assertAllowed(new URL(location, current).href, policy)
      continue
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => undefined)
      throw new AppError('PROVIDER', `${redact(current.href)} answered HTTP ${res.status}`)
    }
    const length = Number(res.headers.get('content-length'))
    if (Number.isFinite(length) && length > maxBytes) {
      await res.body.cancel().catch(() => undefined)
      throw new AppError(
        'VALIDATION',
        `${redact(current.href)} is larger than the ${formatBytes(maxBytes)} limit`,
      )
    }
    return {
      url: current.href,
      ...(Number.isFinite(length) && length > 0 ? { declaredBytes: length } : {}),
      body: res.body,
    }
  }
}

/** Fetch a small JSON document (a release listing) under the same policy. */
export async function setupGetJson(
  url: string,
  policy: HostPolicy,
  opts: SetupFetchOptions = {},
): Promise<unknown> {
  const idle = idleAbort(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal)
  try {
    const res = await setupGet(
      url,
      policy,
      4 * 1024 * 1024,
      idle.signal,
      opts.fetchImpl,
      'application/json',
    )
    const chunks: Uint8Array[] = []
    await readCapped(res, 4 * 1024 * 1024, (c) => void chunks.push(c), idle.touch)
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (err) {
    if (idle.signal.aborted) throw abortError(idle.timedOut, url)
    throw err
  } finally {
    idle.dispose()
  }
}

const closed = (s: WriteStream): Promise<void> =>
  s.closed ? Promise.resolve() : new Promise((r) => s.once('close', () => r()))

export interface DownloadRequest {
  url: string
  policy: HostPolicy
  maxBytes: number
  /** Lowercase hex sha256 the file must have, when the vendor publishes one. */
  expectedSha256?: string
  /** Final path; the bytes go to `<dest>.part` first. */
  dest: string
}

export interface DownloadProgress {
  receivedBytes: number
  totalBytes?: number
}

export interface DownloadedFile {
  path: string
  sha256: string
  size: number
  /** The URL after redirects. */
  url: string
}

/** Stream `req.url` into `req.dest`, hashing as it goes; refuse a hash mismatch. */
export async function downloadFile(
  req: DownloadRequest,
  opts: SetupFetchOptions & { onProgress?: (p: DownloadProgress) => void } = {},
): Promise<DownloadedFile> {
  const part = `${req.dest}.part`
  const idle = idleAbort(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal)
  const hash = createHash('sha256')
  const out = createWriteStream(part, { flags: 'w' })
  let writeError: Error | undefined
  out.on('error', (e) => (writeError ??= e))
  try {
    const res = await setupGet(req.url, req.policy, req.maxBytes, idle.signal, opts.fetchImpl)
    const totalBytes = res.declaredBytes
    opts.onProgress?.({ receivedBytes: 0, ...(totalBytes ? { totalBytes } : {}) })
    const size = await readCapped(
      res,
      req.maxBytes,
      async (chunk, received) => {
        hash.update(chunk)
        if (!out.write(chunk)) await once(out, 'drain')
        opts.onProgress?.({ receivedBytes: received, ...(totalBytes ? { totalBytes } : {}) })
      },
      idle.touch,
    )
    out.end()
    await closed(out)
    if (writeError) throw writeError
    const sha256 = hash.digest('hex')
    if (req.expectedSha256 && sha256 !== req.expectedSha256.toLowerCase())
      throw new AppError(
        'VALIDATION',
        `The file from ${redact(res.url)} does not match the vendor's published sha256; it was deleted`,
      )
    await fs.rename(part, req.dest)
    return { path: req.dest, sha256, size, url: res.url }
  } catch (err) {
    out.destroy()
    await closed(out)
    await fs.rm(part, { force: true })
    if (idle.signal.aborted) throw abortError(idle.timedOut, req.url)
    throw err
  } finally {
    idle.dispose()
  }
}
