// Download one .aspack archive into userData/packs/.staging/ (ADR-0018, #267). Used for catalog
// Install / Update (cap = the entry's size, sha256 = the entry's) and Install from URL (cap =
// 200 MB, sha256 optional from the user). The bytes are hashed while streaming; a mismatch,
// an oversize body, a timeout or a cancel removes the partial file. Installing is the
// installer's job (#260): this returns the staged file's path.
import { createHash } from 'node:crypto'
import { createWriteStream, promises as fs, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import { once } from 'node:events'
import { PACK_FILE_EXT, PACK_LIMITS } from '@shared/schemas/pack'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'
import { userDataPath } from '../lib/paths'
import {
  DEFAULT_TIMEOUT_MS,
  abortError,
  idleAbort,
  packGet,
  readCapped,
  redact,
  type PackFetchOptions,
} from './fetch'

/** Resolves when the stream has closed (an 'error' on the way does not reject it). */
const closed = (s: WriteStream): Promise<void> =>
  s.closed ? Promise.resolve() : new Promise((r) => s.once('close', () => r()))

export const stagingDir = (): string => userDataPath('packs', '.staging')

export interface DownloadArchiveRequest {
  url: string
  /** Lowercase hex sha256 the archive must have; omitted for a URL install without one. */
  expectedSha256?: string
  /** Byte cap on the bytes received: the catalog entry's size, or PACK_LIMITS.maxArchiveBytes. */
  maxBytes: number
}

export interface DownloadProgress {
  receivedBytes: number
  /** The cap's size, or Content-Length when smaller; undefined when unknown. */
  totalBytes?: number
}

export interface DownloadArchiveOptions extends PackFetchOptions {
  onProgress?: (p: DownloadProgress) => void
  /** Where to write; defaults to userData/packs/.staging. */
  dir?: string
}

export interface DownloadedArchive {
  path: string
  sha256: string
  size: number
}

/** Stream `req.url` into a staging file, hashing as it goes; refuse a hash mismatch. */
export async function downloadArchive(
  req: DownloadArchiveRequest,
  opts: DownloadArchiveOptions = {},
): Promise<DownloadedArchive> {
  const maxBytes = Math.min(req.maxBytes, PACK_LIMITS.maxArchiveBytes)
  const dir = opts.dir ?? stagingDir()
  await fs.mkdir(dir, { recursive: true })
  const base = join(dir, `${newId()}`)
  const part = `${base}.part`
  const idle = idleAbort(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal)
  const hash = createHash('sha256')
  const out = createWriteStream(part, { flags: 'wx' })
  let writeError: Error | undefined
  out.on('error', (e) => (writeError ??= e))
  try {
    const res = await packGet(req.url, maxBytes, idle.signal, opts.fetchImpl)
    const totalBytes = Math.min(res.declaredBytes ?? maxBytes, maxBytes)
    opts.onProgress?.({ receivedBytes: 0, totalBytes })
    const size = await readCapped(
      res,
      maxBytes,
      async (chunk, received) => {
        hash.update(chunk)
        if (!out.write(chunk)) await once(out, 'drain')
        opts.onProgress?.({ receivedBytes: received, totalBytes })
      },
      idle.touch,
    )
    out.end()
    await closed(out)
    if (writeError) throw writeError
    const sha256 = hash.digest('hex')
    if (req.expectedSha256 && sha256 !== req.expectedSha256.toLowerCase())
      throw new AppError(
        'VALIDATION',
        `The archive from ${redact(res.url)} does not match the expected sha256 (got ${sha256}); it was removed`,
      )
    const path = `${base}${PACK_FILE_EXT}`
    await fs.rename(part, path)
    return { path, sha256, size }
  } catch (err) {
    out.destroy()
    await closed(out)
    await fs.rm(part, { force: true })
    if (idle.signal.aborted) throw abortError(idle.timedOut, req.url)
    throw err
  } finally {
    idle.dispose()
  }
}
