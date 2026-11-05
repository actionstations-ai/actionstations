// Download a finished image or video from the URL a cloud service returned. The URL comes from
// the service's own response, so it is held to a few rules: https only (plain http only for a
// loopback test server), no private-network or loopback hosts unless the provider itself lives
// there, a size limit while streaming, and a content type that matches what was asked for.
import { AppError } from '../../../lib/errors'
import { isLoopbackHost, isPrivateNetworkHost } from '@shared/provider-network'

export const MAX_BYTES = { video: 200 * 1024 * 1024, image: 30 * 1024 * 1024 } as const

const EXTENSIONS: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
}

export interface DownloadOptions {
  kind: 'image' | 'video'
  /** Host of the provider's own base URL, allowed even when it is a local address (tests). */
  providerHost?: string
  signal?: AbortSignal
  /** Time allowed for the whole transfer. Default 5 min. */
  timeoutMs?: number
  vendor: string
  /**
   * Authorization header value for services whose result links need the key (Replicate). Sent
   * only to hosts `authHost` accepts, and so never on a redirect to anywhere else.
   */
  authorization?: string
  authHost?: (host: string) => boolean
}

export interface Downloaded {
  mimeType: string
  extension: string
  bytes: Uint8Array
}

const MAX_HOPS = 4

function checkUrl(raw: string, opts: DownloadOptions): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new AppError(
      'PROVIDER',
      `${opts.vendor} returned a result link that is not a web address`,
    )
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const local = isLoopbackHost(host) || isPrivateNetworkHost(host)
  if (local && host !== opts.providerHost)
    throw new AppError(
      'PROVIDER',
      `${opts.vendor} returned a result link to a local address; refused`,
    )
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(host)))
    throw new AppError(
      'PROVIDER',
      `${opts.vendor} returned a result link that is not https; refused`,
    )
  if (url.username || url.password)
    throw new AppError(
      'PROVIDER',
      `${opts.vendor} returned a result link with credentials; refused`,
    )
  return url
}

/** Fetch the file. No Authorization header is sent unless the options name one for this host. */
export async function downloadMedia(rawUrl: string, opts: DownloadOptions): Promise<Downloaded> {
  const timer = new AbortController()
  const t = setTimeout(() => timer.abort(), opts.timeoutMs ?? 300_000)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timer.signal]) : timer.signal
  try {
    const res = await fetchChecked(rawUrl, opts, signal)
    return await readLimited(res, opts, signal)
  } catch (err) {
    if (err instanceof AppError) throw err
    if (opts.signal?.aborted) throw new AppError('CANCELLED', 'Cancelled')
    if (timer.signal.aborted) throw new AppError('PROVIDER', `${opts.vendor} download timed out`)
    throw new AppError('PROVIDER', `${opts.vendor} download failed`)
  } finally {
    clearTimeout(t)
  }
}

function authFor(url: URL, opts: DownloadOptions): Record<string, string> {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  return opts.authorization && opts.authHost?.(host) ? { authorization: opts.authorization } : {}
}

async function fetchChecked(
  rawUrl: string,
  opts: DownloadOptions,
  signal: AbortSignal,
): Promise<Response> {
  let current = checkUrl(rawUrl, opts)
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const res = await fetch(current, {
      redirect: 'manual',
      signal,
      headers: authFor(current, opts),
    })
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!location) {
      if (!res.ok)
        throw new AppError('PROVIDER', `${opts.vendor} download failed (HTTP ${res.status})`)
      return res
    }
    await res.body?.cancel().catch(() => undefined)
    current = checkUrl(new URL(location, current).toString(), opts)
  }
  throw new AppError('PROVIDER', `${opts.vendor} download: too many redirects`)
}

async function readLimited(
  res: Response,
  opts: DownloadOptions,
  signal: AbortSignal,
): Promise<Downloaded> {
  const mimeType = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  const extension = EXTENSIONS[mimeType]
  if (!mimeType.startsWith(`${opts.kind}/`) || !extension)
    throw new AppError(
      'PROVIDER',
      `${opts.vendor} returned a file of type "${mimeType || 'unknown'}" where ${opts.kind === 'video' ? 'a video' : 'an image'} was expected`,
    )
  const limit = MAX_BYTES[opts.kind]
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) throw tooLarge(opts)
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = res.body?.getReader()
  if (!reader) throw new AppError('PROVIDER', `${opts.vendor} sent an empty file`)
  for (;;) {
    if (signal.aborted) throw new AppError('CANCELLED', 'Cancelled')
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge(opts)
    }
    chunks.push(value)
  }
  if (total === 0) throw new AppError('PROVIDER', `${opts.vendor} sent an empty file`)
  return { mimeType, extension, bytes: Buffer.concat(chunks) }
}

const tooLarge = (opts: DownloadOptions): AppError =>
  new AppError(
    'PROVIDER',
    `${opts.vendor} result is larger than the ${MAX_BYTES[opts.kind] / 1024 / 1024} MB limit for ${opts.kind}s; not saved`,
  )
