// maps/maps.json in a project (#436, FR-1): the project's maps and places. Writes are
// serialized per project and carry a revision (a hash of the saved file) so a stale save is
// refused instead of overwriting a newer one. Site plan files must sit under maps/<mapId>/.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { ProjectMaps, type MapLayer } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import { ensureDir, safeJoin, safeJoinReal, writeFileAtomic } from '../lib/fs'

export const mapsFile = (root: string): string => safeJoin(root, 'maps', 'maps.json')
export const mapFolder = (root: string, mapId: string): string => safeJoin(root, 'maps', mapId)

const revisionOf = (text: string): string =>
  createHash('sha256').update(text).digest('hex').slice(0, 16)

export interface MapsWithRevision {
  maps: ProjectMaps
  revision: string
}

export async function readProjectMaps(root: string): Promise<MapsWithRevision> {
  let text: string
  try {
    text = await fs.readFile(mapsFile(root), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      return { maps: ProjectMaps.parse({}), revision: 'none' }
    throw e
  }
  const parsed = ProjectMaps.safeParse(JSON.parse(text))
  if (!parsed.success)
    throw new AppError('VALIDATION', 'maps/maps.json is not valid', parsed.error.issues)
  return { maps: parsed.data, revision: revisionOf(text) }
}

/** Throws unless every file a site plan names is inside its own maps/<id>/ folder. */
export function checkMapPaths(root: string, maps: ProjectMaps): void {
  for (const m of maps.maps) {
    if (m.kind !== 'site_plan') continue
    for (const rel of [m.source, m.image]) {
      const prefix = `maps/${m.id}/`
      if (!rel.startsWith(prefix) || rel.slice(prefix.length).includes('/'))
        throw new AppError('PATH_ESCAPE', `Site plan files must be inside ${prefix}`)
      safeJoinReal(root, rel)
    }
  }
}

/** Throws unless ids are unique, the default map exists and every position names a map. */
export function checkMapRefs(maps: ProjectMaps): void {
  const ids = new Set(maps.maps.map((m: MapLayer) => m.id))
  if (ids.size !== maps.maps.length) throw new AppError('VALIDATION', 'Two maps share an id')
  if (maps.defaultMapId && !ids.has(maps.defaultMapId))
    throw new AppError('VALIDATION', 'The default map does not exist')
  const placeIds = new Set(maps.places.map((p) => p.id))
  if (placeIds.size !== maps.places.length)
    throw new AppError('VALIDATION', 'Two places share an id')
  for (const p of maps.places)
    for (const pos of p.positions)
      if (!ids.has(pos.mapId))
        throw new AppError('VALIDATION', `"${p.label}" is pinned to a map that does not exist`)
}

const chains = new Map<string, Promise<unknown>>()

export function saveProjectMaps(
  root: string,
  maps: ProjectMaps,
  revision: string,
): Promise<MapsWithRevision> {
  const prev = chains.get(root) ?? Promise.resolve()
  const run = prev
    .catch(() => undefined)
    .then(async () => {
      const current = await readProjectMaps(root)
      if (current.revision !== revision)
        throw new AppError(
          'CONFLICT',
          'The maps changed since you opened them. Reload and try again.',
        )
      const next = ProjectMaps.parse(maps)
      checkMapRefs(next)
      checkMapPaths(root, next)
      await ensureDir(safeJoin(root, 'maps'))
      const text = JSON.stringify(next, null, 2) + '\n'
      await writeFileAtomic(mapsFile(root), text)
      emit('maps:changed', { path: root })
      return { maps: next, revision: revisionOf(text) }
    })
  chains.set(root, run)
  return run
}
