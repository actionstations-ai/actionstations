// The update check's one request (#442): GET the latest release from the public GitHub API.
// Same discipline as pack fetching (src/main/packs/fetch.ts): https only (http only to this
// computer, for tests), no redirects, no cookies or token, an idle timeout and a byte cap
// counted on the bytes received. Nothing about the user or their projects is sent.
import type { LatestRelease } from '@shared/schemas/settings'
import { AppError } from '../lib/errors'
import { assertFetchUrl, idleAbort, readCapped } from '../packs/fetch'
import { RELEASES_REPO, toLatestRelease } from './release'

export const LATEST_RELEASE_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`
export const UPDATE_TIMEOUT_MS = 15_000
export const UPDATE_MAX_BYTES = 1024 * 1024

export interface FetchReleaseOptions {
  url?: string
  /** The running app's version, named in the User-Agent. */
  appVersion: string
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/** Details on a rate-limit error: when GitHub's limit resets. */
export interface RateLimitDetails {
  retryAfter?: string
}

/** The request headers: plain, fixed, and nothing that identifies the user. */
export function requestHeaders(appVersion: string): Record<string, string> {
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': `ActionStations/${appVersion}`,
  }
}

export async function fetchLatestRelease(opts: FetchReleaseOptions): Promise<LatestRelease> {
  const url = assertFetchUrl(opts.url ?? LATEST_RELEASE_URL).href
  const idle = idleAbort(opts.timeoutMs ?? UPDATE_TIMEOUT_MS, opts.signal)
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      signal: idle.signal,
      headers: requestHeaders(opts.appVersion),
    }).catch((err: unknown) => {
      throw requestError(err, idle.timedOut, opts.signal)
    })
    idle.touch()
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => undefined)
      throw statusError(res)
    }
    const chunks: Uint8Array[] = []
    await readCapped(
      { url, body: res.body },
      UPDATE_MAX_BYTES,
      (c) => void chunks.push(c),
      idle.touch,
    ).catch((err: unknown) => {
      throw err instanceof AppError ? err : requestError(err, idle.timedOut, opts.signal)
    })
    return toLatestRelease(parseJson(Buffer.concat(chunks).toString('utf8')))
  } finally {
    idle.dispose()
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new AppError('PROVIDER', 'GitHub sent an answer the app could not read')
  }
}

function requestError(err: unknown, timedOut: boolean, outer?: AbortSignal): AppError {
  if (timedOut) return new AppError('PROVIDER', 'GitHub did not answer in time')
  if (outer?.aborted) return new AppError('CANCELLED', 'The check was stopped')
  if (err instanceof AppError) return err
  return new AppError('PROVIDER', 'Could not reach GitHub. Check the network connection.')
}

/** A non-2xx answer: GitHub's rate limit (with its reset time) or a plain HTTP error. */
export function statusError(res: Response): AppError {
  const limited =
    (res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0'
  if (!limited) return new AppError('PROVIDER', `GitHub answered HTTP ${res.status}`)
  const reset = Number(res.headers.get('x-ratelimit-reset'))
  const details: RateLimitDetails =
    Number.isFinite(reset) && reset > 0 ? { retryAfter: new Date(reset * 1000).toISOString() } : {}
  return new AppError(
    'PROVIDER',
    'GitHub allows 60 checks an hour from one network, and that limit was reached',
    details,
  )
}
