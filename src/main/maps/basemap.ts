// Which map data a geo map draws from (#436, FR-9 and Design §2): an installed archive, the
// online provider, or a reason it cannot be drawn. A project copy of an archive
// (maps/<mapId>/<sha256>.<ext>) is used before the one in the store.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { BasemapSource, MapLayer, MapsSettings, StoredArchive } from '@shared/schemas'
import type { BasemapView } from '@shared/ipc/maps'
import { AppError } from '../lib/errors'
import { ensureDir, exists, safeJoin } from '../lib/fs'
import { mapFolder, readProjectMaps } from './project'
import { OFFLINE_MESSAGE, onlineSetup, type OnlineResponse } from './online'
import { archivePath, readStore } from './store'

export interface ArchivePart {
  path: string
  archive: StoredArchive
}

type GeoLayer = Extract<MapLayer, { kind: 'geo' }>

export async function geoLayer(root: string, mapId: string): Promise<GeoLayer> {
  const { maps } = await readProjectMaps(root)
  const layer = maps.maps.find((m) => m.id === mapId)
  if (!layer || layer.kind !== 'geo')
    throw new AppError('NOT_FOUND', 'That is not a geographic map')
  return layer
}

/** Where the archive's file is: the project's copy when there is one, else the store's. */
export async function locateArchive(
  root: string,
  mapId: string,
  a: StoredArchive,
): Promise<string | undefined> {
  const copy = join(mapFolder(root, mapId), `${a.sha256}.${a.format}`)
  if (await exists(copy)) return copy
  const stored = archivePath(a)
  return (await exists(stored)) ? stored : undefined
}

async function archivesFor(
  root: string,
  mapId: string,
  source: BasemapSource,
): Promise<{ parts: ArchivePart[]; missing: string[]; sha?: string }> {
  const store = (await readStore()).archives
  if (source.kind === 'catalog') {
    const found = source.ids.flatMap((id) =>
      store.filter((a) => a.catalogId === id).sort((a, b) => (a.part ?? 0) - (b.part ?? 0)),
    )
    const have = new Set(found.map((a) => a.catalogId))
    return {
      parts: await withPaths(root, mapId, found),
      missing: source.ids.filter((i) => !have.has(i)),
    }
  }
  if (source.kind === 'online') return { parts: [], missing: [] }
  const a = store.find((x) => x.sha256 === source.sha256)
  if (a) return { parts: await withPaths(root, mapId, [a]), missing: [] }
  return { parts: [], missing: [], sha: source.sha256 }
}

async function withPaths(
  root: string,
  mapId: string,
  list: StoredArchive[],
): Promise<ArchivePart[]> {
  const out: ArchivePart[] = []
  for (const archive of list) {
    const path = await locateArchive(root, mapId, archive)
    if (path) out.push({ path, archive })
  }
  return out
}

/** The archive files a geo map reads tiles from (empty when it is online or missing). */
export async function archivePartsFor(root: string, layer: GeoLayer): Promise<ArchivePart[]> {
  for (const source of [layer.basemap, layer.fallback]) {
    if (!source) continue
    const { parts } = await archivesFor(root, layer.id, source)
    if (parts.length > 0) return parts
  }
  return []
}

async function describe(
  root: string,
  layer: GeoLayer,
  source: BasemapSource,
  settings: MapsSettings,
  load: (url: string) => Promise<OnlineResponse>,
): Promise<BasemapView> {
  if (source.kind === 'online') {
    if (!settings.online.enabled) return { mode: 'offline-off', message: OFFLINE_MESSAGE }
    const setup = await onlineSetup(settings.online, load)
    return { mode: 'online', ...setup }
  }
  const { parts, missing, sha } = await archivesFor(root, layer.id, source)
  if (parts.length === 0) {
    const what =
      source.kind === 'catalog' ? `Map data for ${source.ids.join(', ')}` : 'The map file'
    return {
      mode: 'missing',
      message: `${what} is not on this computer.`,
      catalogIds: missing,
      ...(sha ? { sha256: sha } : {}),
    }
  }
  const first = parts[0]!.archive
  return {
    mode: 'archive',
    attribution: first.attribution || 'Map data',
    tileType: first.tileType,
    schema: first.schema,
    bounds: unionBounds(parts.map((p) => p.archive)),
    minZoom: Math.min(...parts.map((p) => p.archive.minZoom)),
    maxZoom: Math.max(...parts.map((p) => p.archive.maxZoom)),
    ...(first.builtAt ? { builtAt: first.builtAt } : {}),
    sourceName: first.title,
  }
}

function unionBounds(list: StoredArchive[]): [number, number, number, number] {
  return [
    Math.min(...list.map((a) => a.bounds[0])),
    Math.min(...list.map((a) => a.bounds[1])),
    Math.max(...list.map((a) => a.bounds[2])),
    Math.max(...list.map((a) => a.bounds[3])),
  ]
}

/** The primary source if it can be drawn, else the fallback, else why the primary cannot. */
export async function resolveBasemap(
  root: string,
  mapId: string,
  settings: MapsSettings,
  load: (url: string) => Promise<OnlineResponse>,
): Promise<BasemapView> {
  const layer = await geoLayer(root, mapId)
  const first = await describe(root, layer, layer.basemap, settings, load)
  if (first.mode === 'archive' || first.mode === 'online' || !layer.fallback) return first
  const second = await describe(root, layer, layer.fallback, settings, load)
  return second.mode === 'archive' || second.mode === 'online' ? second : first
}

/** Copy the map's archives into maps/<mapId>/ (git-ignored) so the project can move. */
export async function copyArchivesIntoProject(root: string, layer: GeoLayer): Promise<number> {
  let copied = 0
  await ensureDir(mapFolder(root, layer.id))
  for (const source of [layer.basemap, layer.fallback]) {
    if (!source) continue
    const { parts } = await archivesFor(root, layer.id, source)
    for (const { path, archive } of parts) {
      const dest = safeJoin(mapFolder(root, layer.id), `${archive.sha256}.${archive.format}`)
      if (path === dest || (await exists(dest))) continue
      await fs.copyFile(path, dest)
      copied++
    }
  }
  return copied
}
