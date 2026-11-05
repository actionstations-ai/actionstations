// Shared by the cloud media adapters: the starting image as a data URI, the poster copy, and
// writing a downloaded result into the job's output folder.
import { promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import type { MediaJob, MediaOutput } from '../../types'
import { pngSize } from '../comfyui/provider'
import type { Downloaded } from './download'

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

export async function dataUri(path: string): Promise<string> {
  const mime = IMAGE_MIME[extname(path).toLowerCase()] ?? 'image/png'
  const bytes = await fs.readFile(path)
  return `data:${mime};base64,${bytes.toString('base64')}`
}

/** The starting image doubles as the clip's poster frame, as in the ComfyUI path. */
export async function copyPoster(job: MediaJob, stamp: number): Promise<string | undefined> {
  if (!job.inputImagePath) return undefined
  const target = join(
    job.outDir,
    `${job.injectId}-poster-${stamp}${extname(job.inputImagePath).toLowerCase() || '.png'}`,
  )
  await fs.copyFile(job.inputImagePath, target)
  return target
}

export interface SavedMeta {
  width?: number | undefined
  height?: number | undefined
  /** Seconds, for a clip; falls back to the requested length. */
  durationSec?: number | undefined
  model: string
  prompt: string
}

/** Write the downloaded file and describe it, with the poster copy for a clip. */
export async function saveDownloaded(
  job: MediaJob,
  kind: 'image' | 'video',
  file: Downloaded,
  meta: SavedMeta,
  providerId: string,
): Promise<MediaOutput> {
  await fs.mkdir(job.outDir, { recursive: true })
  const stamp = Date.now()
  const filePath = join(job.outDir, `${job.injectId}-${kind}-${stamp}-1${file.extension}`)
  await fs.writeFile(filePath, file.bytes)
  const size = file.mimeType === 'image/png' ? pngSize(file.bytes) : undefined
  const width = meta.width ?? size?.width
  const height = meta.height ?? size?.height
  const duration = kind === 'video' ? meta.durationSec : undefined
  const poster = kind === 'video' ? await copyPoster(job, stamp) : undefined
  return {
    kind,
    filePath,
    mimeType: file.mimeType,
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(duration ? { durationSec: duration } : {}),
    ...(poster ? { posterPath: poster } : {}),
    provenance: {
      provider: providerId,
      model: meta.model,
      prompt: meta.prompt,
      ...(job.brief.negativePrompt ? { negativePrompt: job.brief.negativePrompt } : {}),
      ...(job.seed !== undefined ? { seed: job.seed } : {}),
    },
  }
}
