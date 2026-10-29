// Import the user's own .pmtiles or .mbtiles (#436, FR-16) into the app-level store.
import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import type { StoredArchive } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { ensureDir, exists } from '../lib/fs'
import { nowIso } from '../lib/ids'
import { inspectArchive } from './archives'
import { addArchive, archivePath, archivesDir, sha256File } from './store'

export interface ImportArchiveRequest {
  filePath: string
  title: string
  attribution?: string
}

export async function importArchive(req: ImportArchiveRequest): Promise<StoredArchive> {
  const ext = extname(req.filePath).toLowerCase()
  const format = ext === '.pmtiles' ? 'pmtiles' : ext === '.mbtiles' ? 'mbtiles' : undefined
  if (!format) throw new AppError('VALIDATION', 'Choose a .pmtiles or .mbtiles file')
  const info = await inspectArchive(req.filePath, format)
  const attribution = info.attribution || req.attribution?.trim() || ''
  if (!attribution)
    throw new AppError(
      'VALIDATION',
      'This file has no attribution. Enter the attribution its provider asks for.',
    )
  const sha256 = await sha256File(req.filePath)
  await ensureDir(archivesDir())
  const dest = archivePath({ sha256, format })
  if (!(await exists(dest))) {
    await fs.copyFile(req.filePath, dest)
    await fs.chmod(dest, 0o444).catch(() => undefined)
  }
  const archive: StoredArchive = {
    sha256,
    kind: 'file',
    format,
    title: req.title.trim().slice(0, 200) || info.name || 'Imported map',
    bytes: info.bytes,
    bounds: info.bounds,
    minZoom: info.minZoom,
    maxZoom: info.maxZoom,
    tileType: info.tileType,
    schema: info.schema,
    attribution,
    addedAt: nowIso(),
  }
  await addArchive(archive)
  return archive
}
