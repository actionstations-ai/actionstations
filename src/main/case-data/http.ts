// The one network path for connectors (spec 0448 NFR-2, ADR-0076). Same discipline as the hazard
// layer: https only, only the connector's own fixed hosts, redirects by hand and only within the
// same host (at most 3), a fixed User-Agent, no cookies or credentials, a byte cap counted on
// received bytes and an idle timeout. Nothing here runs unless the user consented to a fetch.
import { AppError } from '../lib/errors'
import { abortError, idleAbort, readCapped, redact, tooLarge } from '../packs/fetch'
import type { FetchContext } from '../toolkits/connectors/registry'

export const MAX_CASE_REDIRECTS = 3
export const CASE_TIMEOUT_MS = 60_000

/** The User-Agent; an archive that requires a contact (SEC EDGAR) gets the user's own in it. */
export const caseUserAgent = (version: string, contact?: string): string =>
  contact
    ? `ActionStations/${version} (${contact})`
    : `ActionStations/${version} (+https://actionstations.ai)`

export interface CaseHttpOptions {
  hosts: readonly string[]
  version: string
  /** Bytes this GET may still receive. */
  maxBytes: () => number
  /** Called with the bytes received and the final address, for the fetch log. */
  onResponse: (info: { url: string; status: number; bytes: number }) => void
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  timeoutMs?: number
  /** The user's contact for archives that require one; sent in the User-Agent. */
  contact?: string
  /** Least milliseconds between two requests (an archive's fair-access rate). */
  minIntervalMs?: number
  /** Test hooks for the pacing. */
  sleep?: (ms: number) => Promise<void>
  clock?: () => number
}

/** Throws unless `url` is https on one of `hosts`, with no credentials in it. */
export function assertConnectorUrl(url: string, hosts: readonly string[]): URL {
  if (!URL.canParse(url)) throw new AppError('VALIDATION', 'Refused an invalid address')
  const u = new URL(url)
  if (u.protocol !== 'https:')
    throw new AppError('VALIDATION', `Refused ${redact(url)}: archives must use https`)
  if (!hosts.includes(u.hostname))
    throw new AppError('VALIDATION', `Refused ${u.hostname}: not an archive this source uses`)
  if (u.username || u.password)
    throw new AppError('VALIDATION', 'Refused an address with a user name or password in it')
  return u
}

async function readBody(res: Response, url: string, max: number, touch: () => void) {
  const chunks: Uint8Array[] = []
  const body = res.body
  if (!body) return new Uint8Array(0)
  await readCapped({ url, body }, max, (c) => void chunks.push(c), touch)
  return new Uint8Array(Buffer.concat(chunks))
}

export function createCaseGet(opts: CaseHttpOptions): FetchContext['get'] {
  const fetchImpl = opts.fetchImpl ?? fetch
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const clock = opts.clock ?? Date.now
  const interval = opts.minIntervalMs ?? 0
  let nextAt = 0
  /** Keep requests at least `interval` apart, in the order they were asked for. */
  const pace = async (): Promise<void> => {
    if (interval <= 0) return
    const now = clock()
    const start = Math.max(now, nextAt)
    nextAt = start + interval
    if (start > now) await sleep(start - now)
  }
  return async (url, init) => {
    const idle = idleAbort(opts.timeoutMs ?? CASE_TIMEOUT_MS, opts.signal)
    const first = assertConnectorUrl(url, opts.hosts)
    let current = first
    try {
      for (let hop = 0; ; hop++) {
        await pace()
        const res = await fetchImpl(current.href, {
          method: 'GET',
          redirect: 'manual',
          signal: idle.signal,
          credentials: 'omit',
          headers: {
            'user-agent': caseUserAgent(opts.version, opts.contact),
            ...(init?.range ? { range: `bytes=${init.range[0]}-${init.range[1]}` } : {}),
          },
        })
        idle.touch()
        if (res.status >= 300 && res.status < 400) {
          await res.body?.cancel().catch(() => undefined)
          const location = res.headers.get('location')
          if (!location)
            throw new AppError('PROVIDER', `${redact(current.href)} redirected nowhere`)
          if (hop >= MAX_CASE_REDIRECTS) throw new AppError('PROVIDER', 'Too many redirects')
          const next = assertConnectorUrl(new URL(location, current).href, opts.hosts)
          if (next.hostname !== first.hostname)
            throw new AppError('VALIDATION', `Refused a redirect to ${next.hostname}`)
          current = next
          continue
        }
        if (!res.ok) {
          await res.body?.cancel().catch(() => undefined)
          throw new AppError('PROVIDER', `${redact(current.href)} answered HTTP ${res.status}`)
        }
        const max = opts.maxBytes()
        const declared = Number(res.headers.get('content-length'))
        if (Number.isFinite(declared) && declared > max) {
          await res.body?.cancel().catch(() => undefined)
          throw tooLarge(current.href, max)
        }
        const data = await readBody(res, current.href, max, idle.touch)
        opts.onResponse({ url: current.href, status: res.status, bytes: data.byteLength })
        return { status: res.status, data }
      }
    } catch (err) {
      if (idle.signal.aborted) throw abortError(idle.timedOut, current.href)
      throw err
    } finally {
      idle.dispose()
    }
  }
}
