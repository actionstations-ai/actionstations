// Pack catalogs and downloads (ADR-0018, #267). Every network request behind these channels
// starts from an explicit user action: Refresh / opening Browse (packs:catalogRefresh) and
// Install / Update / Install from URL (packs:download). Nothing here runs at startup.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { PackCatalogSource } from '../schemas/settings'
import {
  ArchiveSha256,
  PackAuthor,
  PackCatalogEntry,
  PackDocument,
  PackFetchUrl,
  PackId,
  PackInstallSource,
  PackItemSummary,
  PackKind,
  PackProblem,
  SemVer,
  Sha256Hex,
} from '../schemas/pack'

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

// ---- installed packs (#260) ----------------------------------------------------------------

/** An item that an enabled pack (or a built-in domain, packId "builtin") already provides. */
export const PackConflictView = z.object({
  kind: PackKind,
  id: z.string(),
  packId: z.string(),
  packName: z.string(),
})
export type PackConflictView = z.infer<typeof PackConflictView>

/** One installed pack on the Packs screen: registry entry + manifest summary + state. */
export const InstalledPackView = z.object({
  id: PackId,
  version: SemVer,
  /** The manifest name, or the id when the folder is broken. */
  name: z.string(),
  summary: z.string(),
  description: z.string(),
  author: PackAuthor.optional(),
  license: z.string().optional(),
  homepage: z.string().optional(),
  domains: z.array(z.string()),
  tags: z.array(z.string()),
  enabled: z.boolean(),
  installedAt: z.string(),
  source: PackInstallSource,
  archiveSha256: ArchiveSha256,
  contentSha256: Sha256Hex,
  items: z.array(PackItemSummary),
  /** Why the pack is not loaded (folder missing, a file changed): reinstall or uninstall it. */
  broken: z.string().optional(),
  /** A pack that is not active: what blocks enabling it, one sentence naming the other pack. */
  conflict: z.string().optional(),
  conflicts: z.array(PackConflictView),
})
export type InstalledPackView = z.infer<typeof InstalledPackView>

export const PackInstallAction = z.enum(['install', 'reinstall', 'update', 'downgrade'])
export type PackInstallAction = z.infer<typeof PackInstallAction>

/** What the review screen shows before Install (ADR-0018 "Review before install"). */
export const PackReview = z.object({
  id: PackId,
  name: z.string(),
  version: SemVer,
  summary: z.string(),
  description: z.string(),
  author: PackAuthor,
  license: z.string(),
  homepage: z.string().optional(),
  minAppVersion: SemVer,
  domains: z.array(z.string()),
  tags: z.array(z.string()),
  /** Archive bytes. */
  size: z.number().int().nonnegative(),
  archiveSha256: Sha256Hex,
  contentSha256: Sha256Hex,
  source: PackInstallSource,
  /** Items with what each replaces (replacesBuiltin) and, for workflows, custom nodes. */
  items: z.array(PackItemSummary),
  /** Every document file with its title, license and source. */
  documents: z.array(PackDocument),
  /** Node classes outside ComfyUI core across all workflows ("needs custom nodes"). */
  customNodes: z.array(z.string()),
  conflicts: z.array(PackConflictView),
  conflict: z.string().optional(),
  /** The installed version of the same pack id, if any. */
  installed: z.object({ version: SemVer, enabled: z.boolean() }).optional(),
  action: PackInstallAction,
  /** Whether Install leaves the pack enabled (no conflict, and not disabled by the user). */
  willEnable: z.boolean(),
})
export type PackReview = z.infer<typeof PackReview>

const LocalPath = z.string().min(1).max(4096)

/** A file the user picked, or an archive packs:download staged (with where it came from). */
export const PackInspectRequest = z.union([
  z.object({ filePath: LocalPath }),
  z.object({ downloadedPath: LocalPath, source: PackInstallSource }),
])
export type PackInspectRequest = z.infer<typeof PackInspectRequest>

export const PackInspectResult = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), review: PackReview }),
  z.object({ ok: z.literal(false), problems: z.array(PackProblem) }),
])
export type PackInspectResult = z.infer<typeof PackInspectResult>

/**
 * Install a reviewed archive. `path` is the picked file (source "file", left in place) or the
 * staged download (source "url" / "catalog"; deleted after the install, whether it worked or not).
 */
export const PackInstallRequest = z.object({
  path: LocalPath,
  source: PackInstallSource,
  /** Required to install an older version than the one installed. */
  confirmDowngrade: z.boolean().optional(),
})
export type PackInstallRequest = z.infer<typeof PackInstallRequest>

export const PackInstallResult = z.object({ pack: InstalledPackView, action: PackInstallAction })
export type PackInstallResult = z.infer<typeof PackInstallResult>

export const PackVerifyResult = z.object({
  id: PackId,
  version: SemVer,
  ok: z.boolean(),
  problem: z.string().optional(),
})
export type PackVerifyResult = z.infer<typeof PackVerifyResult>

/** An installed pack with a newer version in a cached catalog (prerelease rule: catalog.ts). */
export const PackUpdateView = z.object({
  id: PackId,
  installed: SemVer,
  latest: PackCatalogEntry,
  /** The catalog that lists `latest` (pass it to packs:download). */
  catalogUrl: z.string(),
})
export type PackUpdateView = z.infer<typeof PackUpdateView>

/** Pushed after every install, enable, disable, update, uninstall and the startup load. */
export const PacksChangedEvent = z.object({
  installed: z.number().int().nonnegative(),
  enabled: z.number().int().nonnegative(),
})

const PackRef = z.object({ id: PackId })

export const packChannels = {
  /** Installed packs (sorted by id) with state, items and conflicts. */
  'packs:list': channel(z.void(), z.array(InstalledPackView)),
  /** Verify an archive and return the review data; installs nothing. */
  'packs:inspect': channel(PackInspectRequest, PackInspectResult),
  'packs:install': channel(PackInstallRequest, PackInstallResult),
  /** Enabling checks conflicts again (CONFLICT error naming the other pack). */
  'packs:setEnabled': channel(PackRef.extend({ enabled: z.boolean() }), InstalledPackView),
  /** Remove the pack's folder and registry entry; projects keep their copies. */
  'packs:uninstall': channel(PackRef, z.void()),
  /** Re-hash every file of one pack (or of all packs); a mismatch marks the pack broken. */
  'packs:verify': channel(PackRef.partial(), z.array(PackVerifyResult)),
  /** Updates from the cached catalogs (no network). */
  'packs:updates': channel(z.void(), z.array(PackUpdateView)),
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
