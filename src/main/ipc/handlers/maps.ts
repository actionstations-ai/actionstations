// maps:* (#436). Network use: maps:fetch only with online maps on; maps:catalog with refresh,
// maps:download-state, maps:check-updates and maps:area-download only when the user asks. No
// project data is sent anywhere; a request carries the app's User-Agent and nothing else.
import { PackFetchUrl } from '@shared/schemas/pack'
import { MapsSettings, type MapCatalog } from '@shared/schemas'
import type { CatalogView } from '@shared/ipc'
import { compositeTile } from '../../maps/archives'
import { ensurePyramid } from '../../maps/pyramid'
import { electronImaging } from '../../maps/pyramid-electron'
import { snapshotMap } from '../../maps/snapshot'
import {
  archivePartsFor,
  copyArchivesIntoProject,
  geoLayer,
  resolveBasemap,
} from '../../maps/basemap'
import {
  cachedCatalog,
  entryStates,
  fetchCatalog,
  installEntry,
  updatesFor,
  type CatalogNet,
} from '../../maps/catalog'
import { downloadArea, planArea } from '../../maps/area'
import { importArchive } from '../../maps/import-archive'
import { importSitePlan } from '../../maps/import-plan'
import { isLoopback, setMapsAppVersion } from '../../maps/net'
import { fetchOnline, pruneCache } from '../../maps/online'
import { readProjectMaps, saveProjectMaps } from '../../maps/project'
import { readStore, removeArchive, sha256File } from '../../maps/store'
import { jobs } from '../../jobs/manager'
import { AppError } from '../../lib/errors'
import { requireProject } from '../../project/guard'
import { packAppVersion } from '../../packs/app-version'
import { getSettings, updateSettings } from '../../settings/store'
import { defineHandlers } from '../registry'

const EMPTY = { data: new Uint8Array(0), contentType: 'application/octet-stream' }

async function mapsSettings(): Promise<MapsSettings> {
  setMapsAppVersion(packAppVersion())
  return (await getSettings()).maps
}

const catalogNet = (s: MapsSettings, signal?: AbortSignal): CatalogNet => ({
  catalogUrl: s.catalogUrl,
  ...(isLoopback(s.catalogUrl) ? { allowLoopback: true } : {}),
  ...(signal ? { signal } : {}),
})

/** https, or http on this computer only; the same rule the downloads enforce per hop. */
function checkUrl(url: string | undefined, what: string): void {
  if (url && !PackFetchUrl.safeParse(url).success)
    throw new AppError('VALIDATION', `${what} must start with https://`)
  if (url && !isLoopback(url) && new URL(url).protocol !== 'https:')
    throw new AppError('VALIDATION', `${what} must start with https://`)
}

async function catalogView(s: MapsSettings, refresh: boolean): Promise<CatalogView> {
  let catalog: MapCatalog | undefined
  let error: string | undefined
  if (refresh) {
    try {
      catalog = await fetchCatalog(catalogNet(s))
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }
  const fromNetwork = catalog !== undefined
  catalog ??= await cachedCatalog()
  if (!catalog) {
    if (error) throw new AppError('PROVIDER', error)
    return { release: '', attribution: '', entries: [], cached: true }
  }
  return {
    release: catalog.release,
    attribution: catalog.attribution,
    entries: await entryStates(catalog),
    cached: !fromNetwork,
    ...(error ? { error } : {}),
  }
}

async function usageNames(): Promise<Map<string, string[]>> {
  const used = new Map<string, string[]>()
  for (const p of (await getSettings()).recentProjects) {
    const maps = await readProjectMaps(p.path).catch(() => undefined)
    if (!maps) continue
    const store = (await readStore()).archives
    for (const layer of maps.maps.maps) {
      if (layer.kind !== 'geo') continue
      for (const src of [layer.basemap, layer.fallback]) {
        if (!src || src.kind === 'online') continue
        const shas =
          src.kind === 'catalog'
            ? store.filter((a) => a.catalogId && src.ids.includes(a.catalogId)).map((a) => a.sha256)
            : [src.sha256]
        for (const sha of shas) used.set(sha, [...new Set([...(used.get(sha) ?? []), p.name])])
      }
    }
  }
  return used
}

let fetches = 0

export default defineHandlers({
  'maps:get': async ({ projectPath }) => readProjectMaps(await requireProject(projectPath)),

  'maps:save': async ({ projectPath, maps, revision }) =>
    saveProjectMaps(await requireProject(projectPath), maps, revision),

  'maps:import-plan': async ({ projectPath, filePath, title, documentId, page }) => {
    const root = await requireProject(projectPath)
    const { layer, maps, revision } = await importSitePlan(root, {
      filePath,
      title,
      ...(documentId ? { documentId } : {}),
      ...(page ? { page } : {}),
    })
    if (layer.kind === 'site_plan')
      void ensurePyramid(root, layer, electronImaging).catch((e: unknown) =>
        console.error('[maps] tile pyramid:', (e as Error).message),
      )
    return { maps, revision, mapId: layer.id }
  },

  'maps:import-archive': async (req) => importArchive(req),

  'maps:settings-set': async (patch) => {
    checkUrl(patch.online?.osmUrl, 'The OpenStreetMap address')
    checkUrl(patch.online?.customUrl, 'The custom map address')
    checkUrl(patch.catalogUrl, 'The catalog address')
    const next = await updateSettings((s) => {
      const { online, ...rest } = patch
      s.maps = MapsSettings.parse({
        ...s.maps,
        ...rest,
        online: { ...s.maps.online, ...(online ?? {}) },
      })
    })
    return next.maps
  },

  'maps:catalog': async ({ refresh }) => catalogView(await mapsSettings(), refresh),

  'maps:download-state': async ({ ids }) => {
    const s = await mapsSettings()
    const catalog = (await cachedCatalog()) ?? (await fetchCatalog(catalogNet(s)))
    const entries = ids.map((id) => {
      const entry = catalog.entries.find((e) => e.id === id)
      if (!entry) throw new AppError('NOT_FOUND', `The catalog has no map called ${id}`)
      return entry
    })
    const job = jobs.start('map-download', async (ctx) => {
      for (const [i, entry] of entries.entries()) {
        await installEntry(catalog, entry, {
          ...catalogNet(s, ctx.signal),
          onProgress: (f, message) => ctx.progress((i + f) / entries.length, message),
        })
      }
      return { ids }
    })
    return { jobId: job.id }
  },

  'maps:check-updates': async () => {
    const s = await mapsSettings()
    const catalog = await fetchCatalog(catalogNet(s))
    return { updates: await updatesFor(catalog) }
  },

  'maps:area-plan': (req) => planArea(req),

  'maps:area-download': async ({ title, ...req }) => {
    await mapsSettings()
    const job = jobs.start('map-area', async (ctx) => {
      const archive = await downloadArea(req, {
        title,
        signal: ctx.signal,
        onProgress: (f, m) => ctx.progress(f, m),
      })
      return { sha256: archive.sha256 }
    })
    return { jobId: job.id }
  },

  'maps:basemap': async ({ projectPath, mapId }) => {
    const root = await requireProject(projectPath)
    const s = await mapsSettings()
    const online = { ...s.online }
    return resolveBasemap(root, mapId, s, (url) => fetchOnline(url, { settings: online }))
  },

  'maps:tile': async ({ projectPath, mapId, z, x, y }) => {
    const root = await requireProject(projectPath)
    const parts = await archivePartsFor(root, await geoLayer(root, mapId))
    const tile = await compositeTile(parts, z, x, y)
    return tile ? { data: new Uint8Array(tile.data), contentType: tile.contentType } : EMPTY
  },

  'maps:fetch': async ({ url }) => {
    const s = await mapsSettings()
    if (++fetches % 200 === 0) void pruneCache()
    const got = await fetchOnline(url, { settings: s.online })
    return { data: new Uint8Array(got.data), contentType: got.contentType }
  },

  'maps:store': async () => {
    const used = await usageNames()
    return (await readStore()).archives.map((a) => ({ ...a, usedBy: used.get(a.sha256) ?? [] }))
  },

  'maps:store-delete': async ({ sha256 }) => {
    await removeArchive(sha256)
    return {}
  },

  'maps:copy-into-project': async ({ projectPath, mapId }) => {
    const root = await requireProject(projectPath)
    return { copied: await copyArchivesIntoProject(root, await geoLayer(root, mapId)) }
  },

  'maps:plan-pyramid': async ({ projectPath, mapId }) => {
    const root = await requireProject(projectPath)
    const { maps } = await readProjectMaps(root)
    const layer = maps.maps.find((m) => m.id === mapId)
    if (!layer || layer.kind !== 'site_plan') throw new AppError('NOT_FOUND', 'That plan is gone')
    return (await ensurePyramid(root, layer, electronImaging)) ?? null
  },

  'maps:snapshot': async ({ projectPath, scenarioId, mapId, audience }) =>
    snapshotMap(await requireProject(projectPath), { scenarioId, mapId, audience }),

  'maps:locate': async ({ projectPath, mapId, filePath }) => {
    const root = await requireProject(projectPath)
    const layer = await geoLayer(root, mapId)
    const want = [layer.basemap, layer.fallback].find(
      (b) => b && (b.kind === 'area' || b.kind === 'file'),
    )
    if (!want || (want.kind !== 'area' && want.kind !== 'file'))
      throw new AppError('VALIDATION', 'This map does not use a single map file')
    if ((await sha256File(filePath)) !== want.sha256)
      throw new AppError('VALIDATION', 'That file is not the one this map was made with')
    await importArchive({ filePath, title: layer.title, attribution: 'Map data' })
    return {}
  },
})
