// Pack catalogs (ADR-0018, #267): the list of catalog URLs in settings, fetching index.json on
// an explicit Refresh, a local cache for offline display, and update detection. Importing this
// module does nothing on the network; only refreshCatalog() fetches.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { z } from 'zod'
import {
  PACK_FORMAT_VERSION,
  PACK_LIMITS,
  PackFetchUrl,
  compareSemver,
  isAppCompatible,
  parseCatalog,
  type PackCatalog,
  type PackCatalogEntry,
  type SkippedCatalogEntry,
} from '@shared/schemas/pack'
import type { PackCatalogSource } from '@shared/schemas/settings'
import { OFFICIAL_CATALOG_URL } from '@shared/ipc/packs'
import { AppError, toAppError } from '../lib/errors'
import { readJsonOr, writeJsonAtomic } from '../lib/fs'
import { nowIso } from '../lib/ids'
import { userDataPath } from '../lib/paths'
import { getSettings, updateSettings } from '../settings/store'
import {
  DEFAULT_TIMEOUT_MS,
  idleAbort,
  packGet,
  readCapped,
  abortError,
  type PackFetchOptions,
} from './fetch'

export { OFFICIAL_CATALOG_URL }

/** Normalize a catalog URL so the same catalog is not added twice (refuses unsafe ones). */
export function normalizeCatalogUrl(url: string): string {
  if (!PackFetchUrl.safeParse(url).success)
    throw new AppError('VALIDATION', 'Catalog URLs must use https (http only on this computer)')
  const u = new URL(url)
  if (u.username || u.password)
    throw new AppError('VALIDATION', 'Catalog URLs may not contain a user name or password')
  u.hash = ''
  return u.href
}

export const catalogsDir = (): string => userDataPath('packs', 'catalogs')

/** userData/packs/catalogs/<sha256(url)>.json */
export const catalogCachePath = (url: string): string =>
  userDataPath('packs', 'catalogs', `${createHash('sha256').update(url).digest('hex')}.json`)

// ---- settings: the list of catalogs ------------------------------------------------------

export async function listCatalogs(): Promise<PackCatalogSource[]> {
  return (await getSettings()).packs.catalogs
}

export async function addCatalog(url: string, name?: string): Promise<PackCatalogSource[]> {
  const normalized = normalizeCatalogUrl(url)
  const next = await updateSettings((s) => {
    if (s.packs.catalogs.some((c) => c.url === normalized))
      throw new AppError('CONFLICT', 'That catalog is already in the list')
    if (s.packs.catalogs.length >= 50) throw new AppError('VALIDATION', 'Too many catalogs')
    s.packs.catalogs.push({ url: normalized, addedAt: nowIso(), ...(name ? { name } : {}) })
  })
  return next.packs.catalogs
}

export async function removeCatalog(url: string): Promise<PackCatalogSource[]> {
  const next = await updateSettings((s) => {
    s.packs.catalogs = s.packs.catalogs.filter((c) => c.url !== url)
  })
  await fs.rm(catalogCachePath(url), { force: true })
  return next.packs.catalogs
}

async function recordFetch(url: string, patch: Partial<PackCatalogSource>): Promise<void> {
  await updateSettings((s) => {
    const c = s.packs.catalogs.find((x) => x.url === url)
    if (!c) return
    Object.assign(c, patch)
    if (patch.lastFetchedAt) delete c.lastError
  })
}

// ---- fetching ------------------------------------------------------------------------------

export interface FetchedCatalog {
  catalog: PackCatalog
  skipped: SkippedCatalogEntry[]
}

/**
 * GET and parse one index.json: 5 MB cap on received bytes, idle timeout, https-only redirects.
 * Invalid entries are skipped and returned in `skipped`; an invalid envelope throws.
 */
export async function fetchCatalog(
  url: string,
  opts: PackFetchOptions = {},
): Promise<FetchedCatalog> {
  const max = PACK_LIMITS.maxCatalogBytes
  const idle = idleAbort(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal)
  const chunks: Uint8Array[] = []
  try {
    const res = await packGet(url, max, idle.signal, opts.fetchImpl)
    await readCapped(res, max, (c) => void chunks.push(c), idle.touch)
  } catch (err) {
    if (idle.signal.aborted) throw abortError(idle.timedOut, url)
    throw err
  } finally {
    idle.dispose()
  }
  let data: unknown
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new AppError('VALIDATION', 'The catalog is not valid JSON')
  }
  const parsed = parseCatalog(data)
  if (!parsed.ok) throw new AppError('VALIDATION', parsed.reason)
  return { catalog: parsed.catalog, skipped: parsed.skipped }
}

/** On-disk cache of the last successful fetch. */
const CachedCatalogFile = z.object({
  url: z.string(),
  fetchedAt: z.string(),
  skipped: z.array(z.object({ index: z.number(), id: z.string().optional(), reason: z.string() })),
  catalog: z.unknown(),
})

export interface CachedCatalog extends FetchedCatalog {
  url: string
  fetchedAt: string
}

export async function readCachedCatalog(url: string): Promise<CachedCatalog | undefined> {
  const file = await readJsonOr(catalogCachePath(url), CachedCatalogFile.nullable(), () => null)
    // A damaged cache file reads as "not fetched yet"; the next Refresh rewrites it.
    .catch(() => null)
  if (!file || file.url !== url) return undefined
  // Re-parse: the cache was written by an older app or edited by hand.
  const parsed = parseCatalog(file.catalog)
  if (!parsed.ok) return undefined
  return {
    url,
    fetchedAt: file.fetchedAt,
    catalog: parsed.catalog,
    skipped: [...file.skipped, ...parsed.skipped],
  }
}

export interface RefreshResult {
  url: string
  ok: boolean
  error?: string
  entries: number
  skipped: number
}

/**
 * Fetch one catalog the user added, cache it and record lastFetchedAt / lastError. Refuses a
 * URL that is not in settings: the app only fetches catalogs the user chose.
 */
export async function refreshCatalog(
  url: string,
  opts: PackFetchOptions = {},
): Promise<RefreshResult> {
  if (!(await listCatalogs()).some((c) => c.url === url))
    throw new AppError('NOT_FOUND', 'That catalog is not in the list')
  try {
    const fetched = await fetchCatalog(url, opts)
    const fetchedAt = nowIso()
    await writeJsonAtomic(catalogCachePath(url), {
      url,
      fetchedAt,
      skipped: fetched.skipped,
      catalog: fetched.catalog,
    })
    await recordFetch(url, { lastFetchedAt: fetchedAt, name: fetched.catalog.name })
    return {
      url,
      ok: true,
      entries: fetched.catalog.packs.length,
      skipped: fetched.skipped.length,
    }
  } catch (err) {
    const e = toAppError(err)
    if (e.code === 'CANCELLED') throw e
    const message = e.message.slice(0, 1000)
    await recordFetch(url, { lastError: message })
    return { url, ok: false, error: message, entries: 0, skipped: 0 }
  }
}

/** Refresh every added catalog (or the one given), one after another. */
export async function refreshCatalogs(
  url: string | undefined,
  opts: PackFetchOptions = {},
): Promise<RefreshResult[]> {
  const urls = url ? [url] : (await listCatalogs()).map((c) => c.url)
  const out: RefreshResult[] = []
  for (const u of urls) out.push(await refreshCatalog(u, opts))
  return out
}

/** Cached view of every added catalog that has been fetched at least once. No network. */
export async function cachedCatalogs(): Promise<CachedCatalog[]> {
  const out: CachedCatalog[] = []
  for (const c of await listCatalogs()) {
    const cached = await readCachedCatalog(c.url)
    if (cached) out.push(cached)
  }
  return out
}

/** The cached entry `id@version` of an added catalog, or NOT_FOUND. */
export async function findCatalogEntry(
  catalogUrl: string,
  id: string,
  version: string,
): Promise<PackCatalogEntry> {
  if (!(await listCatalogs()).some((c) => c.url === catalogUrl))
    throw new AppError('NOT_FOUND', 'That catalog is not in the list')
  const cached = await readCachedCatalog(catalogUrl)
  const entry = cached?.catalog.packs.find((p) => p.id === id && p.version === version)
  if (!entry) throw new AppError('NOT_FOUND', `${id} ${version} is not in that catalog`)
  return entry
}

// ---- update detection ----------------------------------------------------------------------

export interface InstalledPackRef {
  id: string
  version: string
}

export interface PackUpdate {
  id: string
  installed: string
  latest: PackCatalogEntry
}

/** Whether this app can install the entry: known formatVersion and minAppVersion met. */
export function isEntryInstallable(entry: PackCatalogEntry, appVersion: string): boolean {
  return (
    entry.formatVersion <= PACK_FORMAT_VERSION && isAppCompatible(entry.minAppVersion, appVersion)
  )
}

/** Whether a semantic version has a prerelease part ("1.2.0-beta.1"). */
export const isPrerelease = (version: string): boolean => version.includes('-')

/**
 * The entry to offer per pack id across `entries` (owner decision, #260), among installable
 * entries only:
 * - installed at a prerelease: the highest version, prereleases included;
 * - installed at a stable version: the highest stable version (never a prerelease);
 * - not installed: the highest stable version, or the highest prerelease when the pack has
 *   no stable version.
 */
export function latestInstallable(
  entries: readonly PackCatalogEntry[],
  appVersion: string,
  installed: readonly InstalledPackRef[] = [],
): Map<string, PackCatalogEntry> {
  const higher = (m: Map<string, PackCatalogEntry>, e: PackCatalogEntry) => {
    const cur = m.get(e.id)
    if (!cur || compareSemver(e.version, cur.version) > 0) m.set(e.id, e)
  }
  const stable = new Map<string, PackCatalogEntry>()
  const any = new Map<string, PackCatalogEntry>()
  for (const e of entries) {
    if (!isEntryInstallable(e, appVersion)) continue
    higher(any, e)
    if (!isPrerelease(e.version)) higher(stable, e)
  }
  const installedVersion = new Map(installed.map((p) => [p.id, p.version]))
  const best = new Map<string, PackCatalogEntry>()
  for (const [id, top] of any) {
    const v = installedVersion.get(id)
    const pick = v === undefined ? (stable.get(id) ?? top) : isPrerelease(v) ? top : stable.get(id)
    if (pick) best.set(id, pick)
  }
  return best
}

/** Installed packs that have a higher installable version in the given catalog entries. */
export function findUpdates(
  entries: readonly PackCatalogEntry[],
  installed: readonly InstalledPackRef[],
  appVersion: string,
): PackUpdate[] {
  const latest = latestInstallable(entries, appVersion, installed)
  const out: PackUpdate[] = []
  for (const p of installed) {
    const l = latest.get(p.id)
    if (l && compareSemver(l.version, p.version) > 0)
      out.push({ id: p.id, installed: p.version, latest: l })
  }
  return out
}
