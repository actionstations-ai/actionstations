// The state map catalog (#436, FR-14): fetched only when the user opens "Download a state map"
// or clicks "Check for updates". Each part's sha256 is checked after download. A new version is
// downloaded and verified before the old file is removed.
import { promises as fs } from 'node:fs'
import { MapCatalog, type MapCatalogEntry, type StoredArchive } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { nowIso } from '../lib/ids'
import { ensureDir, readJsonOr, writeJsonAtomic } from '../lib/fs'
import { abortError, idleAbort, readCapped, redact } from '../packs/fetch'
import { inspectArchive } from './archives'
import { downloadFile } from './download'
import { GITHUB_HOSTS, guardedGet, type GuardedGetOptions } from './net'
import { addArchive, mapsDir, moveIntoStore, readStore, removeArchive } from './store'

export const CATALOG_MAX_BYTES = 1024 * 1024

export interface CatalogNet {
  catalogUrl: string
  fetchImpl?: typeof fetch
  allowLoopback?: boolean
  signal?: AbortSignal
}

export const allowedHostsFor = (catalogUrl: string): string[] => [
  ...GITHUB_HOSTS,
  new URL(catalogUrl).hostname.toLowerCase(),
]

const netOptions = (n: CatalogNet): GuardedGetOptions => ({
  allowedHosts: allowedHostsFor(n.catalogUrl),
  ...(n.fetchImpl ? { fetchImpl: n.fetchImpl } : {}),
  ...(n.allowLoopback ? { allowLoopback: true } : {}),
})

/** Fetch and validate catalog.json (at most 1 MB) and keep it as the last good copy. */
export async function fetchCatalog(n: CatalogNet): Promise<MapCatalog> {
  const idle = idleAbort(20_000, n.signal)
  try {
    const res = await guardedGet(n.catalogUrl, { ...netOptions(n), signal: idle.signal }).catch(
      (err: unknown) => {
        if (idle.signal.aborted) throw abortError(idle.timedOut, n.catalogUrl)
        throw err
      },
    )
    if (!res.ok || !res.body)
      throw new AppError('PROVIDER', `${redact(n.catalogUrl)} answered HTTP ${res.status}`)
    const chunks: Uint8Array[] = []
    await readCapped(
      { url: n.catalogUrl, body: res.body },
      CATALOG_MAX_BYTES,
      (c) => void chunks.push(c),
      idle.touch,
    )
    const text = Buffer.concat(chunks).toString('utf8')
    const parsed = MapCatalog.safeParse(JSON.parse(text))
    if (!parsed.success)
      throw new AppError(
        'VALIDATION',
        'The map catalog is not in a format this version understands',
      )
    await ensureDir(mapsDir())
    await writeJsonAtomic(mapsDir('catalog.json'), parsed.data)
    return parsed.data
  } finally {
    idle.dispose()
  }
}

export async function cachedCatalog(): Promise<MapCatalog | undefined> {
  return readJsonOr(mapsDir('catalog.json'), MapCatalog.optional(), () => undefined).catch(
    () => undefined,
  )
}

export interface EntryState {
  entry: MapCatalogEntry
  installed: boolean
  updateAvailable: boolean
  bytes: number
}

const partShas = (e: MapCatalogEntry): string[] => e.parts.map((p) => p.sha256)

export async function entryStates(catalog: MapCatalog): Promise<EntryState[]> {
  const store = await readStore()
  return catalog.entries.map((entry) => {
    const mine = store.archives.filter((a) => a.catalogId === entry.id)
    const have = new Set(mine.map((a) => a.sha256))
    const current = partShas(entry).every((s) => have.has(s))
    return {
      entry,
      installed: mine.length > 0,
      updateAvailable: mine.length > 0 && !current,
      bytes: entry.parts.reduce((n, p) => n + p.bytes, 0),
    }
  })
}

export interface UpdateInfo {
  id: string
  installedSha: string
  latestSha: string
  bytes: number
}

export async function updatesFor(catalog: MapCatalog): Promise<UpdateInfo[]> {
  const store = await readStore()
  const out: UpdateInfo[] = []
  for (const entry of catalog.entries) {
    const mine = store.archives.filter((a) => a.catalogId === entry.id)
    if (mine.length === 0) continue
    const have = new Set(mine.map((a) => a.sha256))
    if (partShas(entry).every((s) => have.has(s))) continue
    out.push({
      id: entry.id,
      installedSha: mine[0]!.sha256,
      latestSha: entry.parts[0]!.sha256,
      bytes: entry.parts.reduce((n, p) => n + p.bytes, 0),
    })
  }
  return out
}

export interface InstallOptions extends CatalogNet {
  onProgress?: (fraction: number, message: string) => void
}

/** Download, verify and install every part of an entry; then retire the older version. */
export async function installEntry(
  catalog: MapCatalog,
  entry: MapCatalogEntry,
  opts: InstallOptions,
): Promise<StoredArchive[]> {
  const total = entry.parts.reduce((n, p) => n + p.bytes, 0)
  let done = 0
  const installed: StoredArchive[] = []
  for (const [index, part] of entry.parts.entries()) {
    const existing = (await readStore()).archives.find((a) => a.sha256 === part.sha256)
    if (existing) {
      installed.push(existing)
      done += part.bytes
      continue
    }
    const got = await downloadFile({
      ...netOptions(opts),
      url: part.url,
      key: part.sha256,
      expectedSha256: part.sha256,
      maxBytes: part.bytes,
      ...(opts.signal ? { signal: opts.signal } : {}),
      onProgress: (n) =>
        opts.onProgress?.(
          Math.min(0.99, (done + n) / total),
          `${entry.name}: part ${index + 1} of ${entry.parts.length}`,
        ),
    })
    done += part.bytes
    const info = await inspectArchive(got.path, 'pmtiles').catch(async (err: unknown) => {
      await fs.rm(got.path, { force: true })
      throw err
    })
    await moveIntoStore(got.path, { sha256: got.sha256, format: 'pmtiles' })
    const archive: StoredArchive = {
      sha256: got.sha256,
      kind: 'catalog',
      format: 'pmtiles',
      title: entry.name,
      bytes: info.bytes,
      bounds: info.bounds,
      minZoom: info.minZoom,
      maxZoom: info.maxZoom,
      tileType: info.tileType,
      schema: info.schema,
      attribution: catalog.attribution,
      catalogId: entry.id,
      part: index,
      builtAt: catalog.release,
      addedAt: nowIso(),
    }
    await addArchive(archive)
    installed.push(archive)
  }
  await retireOlder(entry, new Set(partShas(entry)))
  opts.onProgress?.(1, `${entry.name} is installed`)
  return installed
}

async function retireOlder(entry: MapCatalogEntry, keep: Set<string>): Promise<void> {
  const store = await readStore()
  for (const old of store.archives)
    if (old.catalogId === entry.id && !keep.has(old.sha256)) await removeArchive(old.sha256)
}
