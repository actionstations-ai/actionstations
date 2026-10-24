// Pack catalogs and downloads (ADR-0018, #267). Every network request behind these channels
// starts from an explicit user action: Refresh / opening Browse (packs:catalogRefresh) and
// Install / Update / Install from URL (packs:download). Nothing here runs at startup.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { PackCatalogSource } from '../schemas/settings'
import { PackCatalogEntry, PackFetchUrl, PackId, SemVer, Sha256Hex } from '../schemas/pack'

/** The official catalog, offered as one click in Settings and on the Packs screen. */
export const OFFICIAL_CATALOG_URL = 'https://actionstations.ai/packs/index.json'

const CatalogRef = z.object({ url: z.string().min(1).max(2048) })

export const CatalogRefreshResult = z.object({
  url: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
  /** Valid entries kept. */
  entries: z.number().int().nonnegative(),
  /** Invalid or duplicate entries skipped. */
  skipped: z.number().int().nonnegative(),
})
export type CatalogRefreshResult = z.infer<typeof CatalogRefreshResult>

/** One catalog as last fetched (from the local cache; no network). */
export const CachedCatalogView = z.object({
  url: z.string(),
  name: z.string(),
  fetchedAt: z.string(),
  entries: z.array(PackCatalogEntry),
  skipped: z.number().int().nonnegative(),
})
export type CachedCatalogView = z.infer<typeof CachedCatalogView>

/** What to download: an entry of a catalog the user added, or a URL the user pasted. */
export const PackDownloadRequest = z.discriminatedUnion('source', [
  z.object({ source: z.literal('catalog'), catalogUrl: z.string(), id: PackId, version: SemVer }),
  z.object({ source: z.literal('url'), url: PackFetchUrl, sha256: Sha256Hex.optional() }),
])
export type PackDownloadRequest = z.infer<typeof PackDownloadRequest>

/** Result of a finished pack-download job: the staged archive, ready for the installer. */
export const PackDownloadResult = z.object({
  path: z.string(),
  sha256: Sha256Hex,
  size: z.number().int().nonnegative(),
  url: z.string(),
  catalogUrl: z.string().optional(),
})
export type PackDownloadResult = z.infer<typeof PackDownloadResult>

export const packChannels = {
  'packs:catalogs': channel(z.void(), z.array(PackCatalogSource)),
  'packs:catalogAdd': channel(
    z.object({ url: PackFetchUrl, name: z.string().max(100).optional() }),
    z.array(PackCatalogSource),
  ),
  'packs:catalogRemove': channel(CatalogRef, z.array(PackCatalogSource)),
  /** Fetch index.json of one added catalog, or of all of them when url is omitted. */
  'packs:catalogRefresh': channel(
    z.object({ url: z.string().min(1).max(2048).optional() }),
    z.array(CatalogRefreshResult),
  ),
  /** Cached entries of every added catalog (offline; never fetches). */
  'packs:catalogEntries': channel(z.void(), z.array(CachedCatalogView)),
  'packs:download': channel(PackDownloadRequest, z.object({ jobId: SafeId })),
}
