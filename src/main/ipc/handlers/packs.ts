// packs:* catalog and download channels (#267). Each network request here is the direct
// result of a renderer call the user made (Refresh / Browse, Install / Update / Install from
// URL); registering these handlers fetches nothing.
import { PACK_LIMITS } from '@shared/schemas/pack'
import type { PackDownloadRequest, PackDownloadResult } from '@shared/ipc/packs'
import { defineHandlers } from '../registry'
import { jobs } from '../../jobs/manager'
import {
  addCatalog,
  cachedCatalogs,
  findCatalogEntry,
  listCatalogs,
  refreshCatalogs,
  removeCatalog,
} from '../../packs/catalog'
import { downloadArchive, type DownloadArchiveRequest } from '../../packs/download'
import { formatBytes } from '../../packs/fetch'

/** Resolve what to fetch before the job starts, so a bad request fails the call itself. */
async function resolveDownload(
  req: PackDownloadRequest,
): Promise<DownloadArchiveRequest & { catalogUrl?: string }> {
  if (req.source === 'url')
    return {
      url: req.url,
      maxBytes: PACK_LIMITS.maxArchiveBytes,
      ...(req.sha256 ? { expectedSha256: req.sha256 } : {}),
    }
  const entry = await findCatalogEntry(req.catalogUrl, req.id, req.version)
  return {
    url: entry.url,
    expectedSha256: entry.sha256,
    maxBytes: entry.size,
    catalogUrl: req.catalogUrl,
  }
}

export default defineHandlers({
  'packs:catalogs': () => listCatalogs(),
  'packs:catalogAdd': ({ url, name }) => addCatalog(url, name),
  'packs:catalogRemove': ({ url }) => removeCatalog(url),
  'packs:catalogRefresh': ({ url }) => refreshCatalogs(url),
  'packs:catalogEntries': async () =>
    (await cachedCatalogs()).map((c) => ({
      url: c.url,
      name: c.catalog.name,
      fetchedAt: c.fetchedAt,
      entries: c.catalog.packs,
      skipped: c.skipped.length,
    })),
  'packs:download': async (req) => {
    const { catalogUrl, ...download } = await resolveDownload(req)
    const job = jobs.start(
      'pack-download',
      async (ctx): Promise<PackDownloadResult> => {
        ctx.log(`Downloading ${new URL(download.url).host}${new URL(download.url).pathname}`)
        const got = await downloadArchive(download, {
          signal: ctx.signal,
          onProgress: ({ receivedBytes, totalBytes }) =>
            ctx.progress(
              totalBytes ? receivedBytes / totalBytes : 0,
              totalBytes
                ? `Downloaded ${formatBytes(receivedBytes)} of ${formatBytes(totalBytes)}`
                : `Downloaded ${formatBytes(receivedBytes)}`,
            ),
        })
        return { ...got, url: download.url, ...(catalogUrl ? { catalogUrl } : {}) }
      },
      { payload: { url: download.url, ...(catalogUrl ? { catalogUrl } : {}) } },
    )
    return { jobId: job.id }
  },
})
