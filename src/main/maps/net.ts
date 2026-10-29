// The one HTTP path for map data (#436). Every hop must be HTTPS on an allowed host (http is
// accepted only on this computer, for the local fixture server in tests). Redirects are followed
// by hand, no cookies or referrer are sent, and the User-Agent names the app (FR-11, FR-15).
import { AppError } from '../lib/errors'
import { MAX_REDIRECTS, redact } from '../packs/fetch'

/** Release assets of a public GitHub repository (catalog and state files), as for Ollama. */
export const GITHUB_HOSTS = [
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
] as const
/** This computer only (localhost, 127.x, ::1); not the local network. */
export function isLoopback(url: string | URL): boolean {
  if (!URL.canParse(url.toString())) return false
  const h = new URL(url.toString()).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\.\d+\.\d+\.\d+$/.test(h)
  )
}

export const OPENFREEMAP_HOST = 'tiles.openfreemap.org'

let appVersion = '0.0.0'
/** Set once at startup from app.getVersion(); the User-Agent names it. */
export function setMapsAppVersion(v: string): void {
  appVersion = v
}
export const mapsUserAgent = (): string =>
  `ActionStations/${appVersion} (+https://actionstations.ai)`

export interface GuardedGetOptions {
  allowedHosts: readonly string[]
  signal?: AbortSignal
  headers?: Record<string, string>
  fetchImpl?: typeof fetch
  /** Accept http on loopback addresses (tests and the e2e fixture server only). */
  allowLoopback?: boolean
}

/** Throws VALIDATION unless a request to `url` may be made. */
export function assertMapUrl(url: string, opts: GuardedGetOptions): URL {
  if (!URL.canParse(url)) throw new AppError('VALIDATION', 'Refused an invalid map URL')
  const u = new URL(url)
  if (u.username || u.password)
    throw new AppError('VALIDATION', 'Refused a URL with a user name or password in it')
  const loopbackOk = opts.allowLoopback === true && isLoopback(u)
  if (u.protocol !== 'https:' && !(loopbackOk && u.protocol === 'http:'))
    throw new AppError('VALIDATION', `Refused ${redact(url)}: map data must use https`)
  const host = u.hostname.toLowerCase()
  if (!opts.allowedHosts.includes(host) && !loopbackOk)
    throw new AppError('VALIDATION', `Refused ${redact(url)}: ${host} is not an allowed map host`)
  return u
}

/**
 * GET `url`, re-checking every redirect hop. Returns the final response (status not checked
 * beyond redirects, so callers can read 206, 304 and 416).
 */
export async function guardedGet(url: string, opts: GuardedGetOptions): Promise<Response> {
  let current = assertMapUrl(url, opts)
  for (let hop = 0; ; hop++) {
    const res = await (opts.fetchImpl ?? fetch)(current.href, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: opts.signal ?? null,
      headers: { 'user-agent': mapsUserAgent(), ...opts.headers },
    })
    if (res.status < 300 || res.status >= 400 || res.status === 304) return res
    await res.body?.cancel().catch(() => undefined)
    const location = res.headers.get('location')
    if (!location) throw new AppError('PROVIDER', `${redact(current.href)} redirected nowhere`)
    if (hop >= MAX_REDIRECTS) throw new AppError('PROVIDER', 'Too many redirects')
    current = assertMapUrl(new URL(location, current).href, opts)
  }
}
