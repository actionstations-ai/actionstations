// The app-level map store (#436, Design §2): userData/maps/store.json lists the archives, and
// archives/<sha256>.pmtiles|.mbtiles holds them, content-addressed and read-only once verified.
import { createHash } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { MapStore, type StoredArchive } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import { ensureDir, exists, readJsonOr, writeJsonAtomic } from '../lib/fs'
import { userDataPath } from '../lib/paths'

export const mapsDir = (...p: string[]): string => userDataPath('maps', ...p)
export const archivesDir = (): string => mapsDir('archives')
export const partialDir = (): string => mapsDir('partial')

export const archivePath = (a: Pick<StoredArchive, 'sha256' | 'format'>): string =>
  join(archivesDir(), `${a.sha256}.${a.format}`)

let chain: Promise<unknown> = Promise.resolve()
/** Serialize store.json read-modify-write so concurrent downloads never clobber each other. */
function serialized<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.catch(() => undefined).then(run)
  chain = next
  return next
}

export async function readStore(): Promise<MapStore> {
  return readJsonOr(mapsDir('store.json'), MapStore, () => MapStore.parse({}))
}

export async function findArchive(sha256: string): Promise<StoredArchive | undefined> {
  return (await readStore()).archives.find((a) => a.sha256 === sha256)
}

/** Add (or replace by sha256) an archive whose file is already in archives/. */
export function addArchive(archive: StoredArchive): Promise<void> {
  return serialized(async () => {
    const store = await readStore()
    const archives = store.archives.filter((a) => a.sha256 !== archive.sha256)
    archives.push(archive)
    await ensureDir(mapsDir())
    await writeJsonAtomic(mapsDir('store.json'), { ...store, archives })
    emit('maps:store-changed', {})
  })
}

export function removeArchive(sha256: string): Promise<void> {
  return serialized(async () => {
    const store = await readStore()
    const found = store.archives.find((a) => a.sha256 === sha256)
    if (!found) throw new AppError('NOT_FOUND', 'That map file is not installed')
    await fs.chmod(archivePath(found), 0o644).catch(() => undefined)
    await fs.rm(archivePath(found), { force: true })
    await writeJsonAtomic(mapsDir('store.json'), {
      ...store,
      archives: store.archives.filter((a) => a.sha256 !== sha256),
    })
    emit('maps:store-changed', {})
  })
}

/** Move a verified file into archives/ under its hash, read-only. */
export async function moveIntoStore(
  tmpPath: string,
  archive: Pick<StoredArchive, 'sha256' | 'format'>,
): Promise<void> {
  await ensureDir(archivesDir())
  const dest = archivePath(archive)
  if (await exists(dest)) await fs.rm(tmpPath, { force: true })
  else await fs.rename(tmpPath, dest)
  await fs.chmod(dest, 0o444).catch(() => undefined)
}

/** Streamed sha256 of a file (NFR-4: a 2 GB file in seconds, no memory growth). */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}
