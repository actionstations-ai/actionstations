// Resumable HTTPS file download for map archives (#436, FR-13). The bytes go to
// partial/<key>.part with partial/<key>.json beside it (URL and ETag). A restart asks for the
// rest with Range and If-Range on the stored ETag; when the server sends the whole file again
// (the file changed) the download starts from zero. The sha256 is checked before the file is
// used: a mismatch deletes it and fails.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { Sha256Hex } from '@shared/schemas/pack'
import { AppError } from '../lib/errors'
import { ensureDir, exists, readJsonOr, writeJsonAtomic } from '../lib/fs'
import { abortError, formatBytes, idleAbort, redact } from '../packs/fetch'
import { guardedGet, type GuardedGetOptions } from './net'
import { partialDir, sha256File } from './store'

const PartMeta = z.object({ url: z.string(), etag: z.string().optional() })

export interface DownloadRequest extends Omit<GuardedGetOptions, 'headers' | 'signal'> {
  url: string
  /** Names the partial files; the expected hash for catalog parts. */
  key: string
  expectedSha256: string
  /** Byte cap on the whole file; the catalog's size for the part. */
  maxBytes: number
  signal?: AbortSignal
  onProgress?: (receivedBytes: number, totalBytes: number | undefined) => void
  idleMs?: number
}

export interface DownloadedFile {
  path: string
  sha256: string
  bytes: number
  resumedFrom: number
}

const safeKey = (key: string): string => key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100)

async function sizeOf(path: string): Promise<number> {
  return fs.stat(path).then(
    (s) => s.size,
    () => 0,
  )
}

/** Where to start: the saved bytes when this URL's partial file is still valid, else zero. */
async function resumePoint(
  part: string,
  metaPath: string,
  url: string,
): Promise<{ offset: number; etag?: string }> {
  const none: z.infer<typeof PartMeta> = { url: '' }
  const meta = await readJsonOr(metaPath, PartMeta, () => none).catch(() => none)
  const offset = meta.url === url ? await sizeOf(part) : 0
  if (offset === 0) return { offset: 0 }
  return { offset, ...(meta.etag ? { etag: meta.etag } : {}) }
}

function rangeHeaders(offset: number, etag: string | undefined): Record<string, string> {
  if (offset === 0) return {}
  return { range: `bytes=${offset}-`, ...(etag ? { 'if-range': etag } : {}) }
}

async function copyBody(
  res: Response,
  part: string,
  start: number,
  req: DownloadRequest,
  touch: () => void,
): Promise<number> {
  const fh = await fs.open(part, start > 0 ? 'a' : 'w')
  const reader = res.body!.getReader()
  let total = start
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return total
      touch()
      total += value.byteLength
      if (total > req.maxBytes)
        throw new AppError(
          'VALIDATION',
          `${redact(req.url)} is larger than the ${formatBytes(req.maxBytes)} expected`,
        )
      await fh.write(value)
      req.onProgress?.(total, req.maxBytes)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    await fh.close()
  }
}

async function discard(part: string, metaPath: string): Promise<void> {
  await fs.rm(part, { force: true })
  await fs.rm(metaPath, { force: true })
}

export async function downloadFile(req: DownloadRequest): Promise<DownloadedFile> {
  Sha256Hex.parse(req.expectedSha256)
  await ensureDir(partialDir())
  const base = join(partialDir(), safeKey(req.key))
  const part = `${base}.part`
  const metaPath = `${base}.json`
  const idle = idleAbort(req.idleMs ?? 30_000, req.signal)
  try {
    let { offset, etag } = await resumePoint(part, metaPath, req.url)
    const resumedFrom = offset
    const res = await guardedGet(req.url, {
      ...req,
      signal: idle.signal,
      headers: rangeHeaders(offset, etag),
    }).catch((err: unknown) => {
      if (idle.signal.aborted) throw abortError(idle.timedOut, req.url)
      throw err
    })
    idle.touch()
    if (res.status === 416 && offset > 0) {
      // The saved bytes may be the whole file; the hash check below decides.
      await res.body?.cancel().catch(() => undefined)
    } else {
      if (!res.ok || !res.body)
        throw new AppError('PROVIDER', `${redact(req.url)} answered HTTP ${res.status}`)
      if (res.status !== 206) offset = 0
      etag = res.headers.get('etag') ?? undefined
      await writeJsonAtomic(metaPath, { url: req.url, ...(etag ? { etag } : {}) })
      await copyBody(res, part, offset, req, idle.touch).catch((err: unknown) => {
        if (idle.signal.aborted) throw abortError(idle.timedOut, req.url)
        throw err
      })
    }
    if (!(await exists(part))) throw new AppError('PROVIDER', 'The server sent no data')
    const sha256 = await sha256File(part)
    if (sha256 !== req.expectedSha256) {
      await discard(part, metaPath)
      throw new AppError(
        'VALIDATION',
        `${redact(req.url)} does not match its checksum. The download was deleted.`,
      )
    }
    await fs.rm(metaPath, { force: true })
    return {
      path: part,
      sha256,
      bytes: await sizeOf(part),
      resumedFrom: res.status === 206 ? resumedFrom : 0,
    }
  } finally {
    idle.dispose()
  }
}
