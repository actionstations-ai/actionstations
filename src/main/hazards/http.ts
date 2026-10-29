// The one network path for hazard sources (spec 0439, ADR-0061). Same discipline as
// src/main/packs/fetch.ts: manual redirects, a byte cap counted on received bytes, an idle
// timeout, cancellation. Stricter on where it may go: https only, four fixed hosts, redirects
// only within the same host (at most 3), a fixed User-Agent and no cookies. Nothing here is
// called unless the user pressed Fetch.
import { AppError } from '../lib/errors'
import { abortError, idleAbort, readCapped, redact, tooLarge } from '../packs/fetch'

export const HAZARD_HOSTS = [
  'api.weather.gov',
  'earthquake.usgs.gov',
  'firms.modaps.eosdis.nasa.gov',
  'www.fema.gov',
] as const
export type HazardHost = (typeof HAZARD_HOSTS)[number]

export const MAX_HAZARD_REDIRECTS = 3
export const MAX_HAZARD_BYTES = 5 * 1024 * 1024
export const HAZARD_TIMEOUT_MS = 30_000

/** The only identification sent: the app, its version and its website. Never an email address. */
export const userAgent = (version: string): string =>
  `ActionStations/${version} (+https://actionstations.ai)`

/** An HTTP error status, kept apart so callers can tell a rate limit from a broken request. */
export class HazardHttpError extends AppError {
  constructor(
    message: string,
    public readonly httpStatus: number,
  ) {
    super('PROVIDER', message)
    this.name = 'HazardHttpError'
  }
}

export interface HazardResponse {
  status: number
  text: string
}

export interface HazardHttpOptions {
  /** Shown in the User-Agent. */
  version: string
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
  /**
   * Test builds only: send requests for every allowed host to this base URL instead, as
   * `<base>/<host>/<path>`. Ignored unless `testBase` is set; the caller sets it from the
   * environment only when NODE_ENV is "test".
   */
  testBase?: string
  timeoutMs?: number
  maxBytes?: number
}

/** Throws unless `url` is https on one of the four hosts, with no credentials in it. */
export function assertHazardUrl(url: string): URL {
  if (!URL.canParse(url)) throw new AppError('VALIDATION', 'Refused an invalid hazard URL')
  const u = new URL(url)
  if (u.protocol !== 'https:')
    throw new AppError('VALIDATION', `Refused ${redact(url)}: hazard sources must use https`)
  if (!(HAZARD_HOSTS as readonly string[]).includes(u.hostname))
    throw new AppError('VALIDATION', `Refused ${u.hostname}: not a hazard source host`)
  if (u.username || u.password)
    throw new AppError('VALIDATION', 'Refused a URL with a user name or password in it')
  return u
}

function actualUrl(u: URL, testBase?: string): string {
  if (!testBase) return u.href
  return `${testBase.replace(/\/$/, '')}/${u.hostname}${u.pathname}${u.search}`
}

async function readText(
  body: ReadableStream<Uint8Array>,
  url: string,
  o: Required<Pick<HazardHttpOptions, 'maxBytes'>>,
  touch: () => void,
) {
  const chunks: Uint8Array[] = []
  await readCapped(
    { url, body },
    o.maxBytes,
    (c) => {
      chunks.push(c)
    },
    touch,
  )
  return Buffer.concat(chunks).toString('utf8')
}

/** GET `url` and return the body as text. `signal` cancels the request. */
export async function hazardGet(
  url: string,
  opts: HazardHttpOptions,
  signal?: AbortSignal,
): Promise<HazardResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const maxBytes = opts.maxBytes ?? MAX_HAZARD_BYTES
  const idle = idleAbort(opts.timeoutMs ?? HAZARD_TIMEOUT_MS, signal)
  const first = assertHazardUrl(url)
  let current = first
  try {
    for (let hop = 0; ; hop++) {
      const res = await fetchImpl(actualUrl(current, opts.testBase), {
        method: 'GET',
        redirect: 'manual',
        signal: idle.signal,
        credentials: 'omit',
        headers: {
          'user-agent': userAgent(opts.version),
          accept: 'application/geo+json, application/json, text/csv;q=0.9',
        },
      })
      idle.touch()
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => undefined)
        const location = res.headers.get('location')
        if (!location) throw new AppError('PROVIDER', `${redact(current.href)} redirected nowhere`)
        if (hop >= MAX_HAZARD_REDIRECTS) throw new AppError('PROVIDER', 'Too many redirects')
        const next = assertHazardUrl(new URL(location, current).href)
        if (next.hostname !== first.hostname)
          throw new AppError(
            'VALIDATION',
            `Refused a redirect from ${first.hostname} to ${next.hostname}`,
          )
        current = next
        continue
      }
      if (!res.ok || !res.body) {
        await res.body?.cancel().catch(() => undefined)
        throw new HazardHttpError(`${redact(current.href)} answered HTTP ${res.status}`, res.status)
      }
      const length = Number(res.headers.get('content-length'))
      if (Number.isFinite(length) && length > maxBytes) {
        await res.body.cancel().catch(() => undefined)
        throw tooLarge(current.href, maxBytes)
      }
      return {
        status: res.status,
        text: await readText(res.body, current.href, { maxBytes }, idle.touch),
      }
    }
  } catch (err) {
    if (idle.signal.aborted) throw abortError(idle.timedOut, current.href)
    throw err
  } finally {
    idle.dispose()
  }
}

export type HazardGet = (url: string, signal?: AbortSignal) => Promise<HazardResponse>

/** A `hazardGet` bound to its options, the shape the source modules take. */
export const boundGet =
  (opts: HazardHttpOptions): HazardGet =>
  (url, signal) =>
    hazardGet(url, opts, signal)
