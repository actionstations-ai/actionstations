// Media export: every inject asset copied as S<scenario>-I<id>-<type>.<ext>, video posters
// next to their video, and an MP3 beside every WAV (encoded with the audio-fx module).
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { toMp3 } from '../providers/media/audio-fx'
import { ensureDir, safeJoin, writeFileAtomic } from '../lib/fs'
import type { ExportModel } from './model'
import type { PlannedMedia } from './naming'

export interface ExportedFile {
  /** Path inside the export folder, POSIX style (media/S3-I04-tweet.png). */
  file: string
  sha256: string
  bytes: number
  rowId: string
  kind: 'image' | 'video' | 'audio' | 'pdf' | 'poster' | 'mp3'
}

export const sha256Hex = (data: Uint8Array): string =>
  createHash('sha256').update(data).digest('hex')

export interface MediaExportResult {
  files: ExportedFile[]
  /** Missing source files and failed MP3 encodes (listed, not fatal). */
  warnings: string[]
}

async function writeEntry(
  dir: string,
  name: string,
  data: Uint8Array,
  rowId: string,
  kind: ExportedFile['kind'],
): Promise<ExportedFile> {
  await writeFileAtomic(join(dir, name), data)
  return { file: `media/${name}`, sha256: sha256Hex(data), bytes: data.byteLength, rowId, kind }
}

function encodeMp3(wav: Uint8Array, warnings: string[], rowId: string): Uint8Array | undefined {
  try {
    return toMp3(wav)
  } catch (err) {
    warnings.push(`${rowId}: MP3 not written (${(err as Error).message})`)
    return undefined
  }
}

async function exportOne(
  model: ExportModel,
  dir: string,
  planned: PlannedMedia,
  warnings: string[],
): Promise<ExportedFile[]> {
  const { asset, inject } = planned
  const rowId = inject.mselRowId
  const data = await fs.readFile(safeJoin(model.root, asset.path))
  const out = [await writeEntry(dir, planned.fileName, data, rowId, asset.kind)]
  if (planned.posterName && asset.posterPath && model.available.has(asset.posterPath)) {
    const poster = await fs.readFile(safeJoin(model.root, asset.posterPath))
    out.push(await writeEntry(dir, planned.posterName, poster, rowId, 'poster'))
  }
  if (planned.mp3Name) {
    const mp3 = encodeMp3(data, warnings, rowId)
    if (mp3) out.push(await writeEntry(dir, planned.mp3Name, mp3, rowId, 'mp3'))
  }
  return out
}

/** Copy every available asset into `<folder>/media/`. */
export async function exportMedia(
  model: ExportModel,
  folder: string,
  onFile?: (f: ExportedFile) => void,
): Promise<MediaExportResult> {
  const dir = join(folder, 'media')
  await ensureDir(dir)
  const files: ExportedFile[] = []
  const warnings: string[] = []
  for (const planned of model.media) {
    if (!model.available.has(planned.asset.path)) {
      warnings.push(`${planned.inject.mselRowId}: missing file ${planned.asset.path}`)
      continue
    }
    for (const f of await exportOne(model, dir, planned, warnings)) {
      files.push(f)
      onFile?.(f)
    }
  }
  return { files, warnings }
}
