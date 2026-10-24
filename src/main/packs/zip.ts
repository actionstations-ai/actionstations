// Zip handling for packs (ADR-0018). jszip inflates, but it trusts the archive more than a
// pack reader may: it throws one generic error for an encrypted entry, rewrites "../" names
// (keeping the original only in `unsafeOriginalName`), and silently keeps the last of two
// entries with the same name. So the central directory is scanned here first, from the raw
// bytes, and every entry is judged on its own name, flags and mode before jszip sees the
// archive. Inflation then counts the bytes it actually produces and stops at the limits.
import type JSZip from 'jszip'
import { PACK_LIMITS, type PackProblem } from '@shared/schemas/pack'

export interface RawZipEntry {
  /** Name exactly as stored (UTF-8), before any normalization. */
  name: string
  dir: boolean
  encrypted: boolean
  /** 0 = store, 8 = deflate. */
  method: number
  compressedSize: number
  /** File type bits of the unix mode (0o170000 mask), or undefined when not made on unix. */
  unixType?: number
}

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const EOCD_MIN = 22
const MADE_BY_UNIX = new Set([3, 19]) // unix, OS X
export const S_IFMT = 0o170000
export const S_IFLNK = 0o120000
const S_IFREG = 0o100000
const S_IFDIR = 0o040000

const utf8 = new TextDecoder('utf-8', { fatal: true })

function findEocd(buf: Buffer): number {
  const stop = Math.max(0, buf.length - EOCD_MIN - 0xffff)
  for (let i = buf.length - EOCD_MIN; i >= stop; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i
  }
  return -1
}

class ZipFormatError extends Error {}

function readRecord(buf: Buffer, at: number): { entry: RawZipEntry; next: number } {
  if (at + 46 > buf.length || buf.readUInt32LE(at) !== CEN_SIG)
    throw new ZipFormatError('The zip central directory is damaged')
  const madeBy = buf.readUInt16LE(at + 4) >> 8
  const flags = buf.readUInt16LE(at + 8)
  const method = buf.readUInt16LE(at + 10)
  const compressedSize = buf.readUInt32LE(at + 20)
  const nameLen = buf.readUInt16LE(at + 28)
  const extraLen = buf.readUInt16LE(at + 30)
  const commentLen = buf.readUInt16LE(at + 32)
  const attrs = buf.readUInt32LE(at + 38)
  const next = at + 46 + nameLen + extraLen + commentLen
  if (next > buf.length) throw new ZipFormatError('The zip central directory is damaged')
  let name: string
  try {
    name = utf8.decode(buf.subarray(at + 46, at + 46 + nameLen))
  } catch {
    throw new ZipFormatError('An entry name is not valid UTF-8')
  }
  const unixType = MADE_BY_UNIX.has(madeBy) ? (attrs >>> 16) & S_IFMT : undefined
  const dir = name.endsWith('/') || (attrs & 0x10) !== 0 || unixType === S_IFDIR
  // Bit 0: encrypted; bit 6: strong encryption.
  const encrypted = (flags & 0x41) !== 0
  return {
    entry: {
      name,
      dir,
      encrypted,
      method,
      compressedSize,
      ...(unixType !== undefined ? { unixType } : {}),
    },
    next,
  }
}

/** Every central-directory entry, in archive order. Throws on a malformed or ZIP64 archive. */
export function scanCentralDirectory(buf: Buffer): RawZipEntry[] {
  const eocd = findEocd(buf)
  if (eocd < 0) throw new ZipFormatError('Not a zip archive')
  const count = buf.readUInt16LE(eocd + 10)
  const offset = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || offset === 0xffffffff)
    throw new ZipFormatError('ZIP64 archives are not supported')
  if (buf.readUInt16LE(eocd + 4) !== 0 || buf.readUInt16LE(eocd + 8) !== count)
    throw new ZipFormatError('Multi-part zip archives are not supported')
  const entries: RawZipEntry[] = []
  let at = offset
  for (let i = 0; i < count; i++) {
    const { entry, next } = readRecord(buf, at)
    entries.push(entry)
    at = next
  }
  return entries
}

export { ZipFormatError }

/** Problems with one entry's metadata (name rules are checked by the caller). */
export function entryMetaProblem(e: RawZipEntry): string | undefined {
  if (e.encrypted) return 'entry is encrypted; packs may not contain encrypted entries'
  if (e.unixType === S_IFLNK) return 'entry is a symbolic link; packs may not contain links'
  if (e.unixType !== undefined && e.unixType !== 0 && e.unixType !== S_IFREG && !e.dir)
    return 'entry is not a regular file'
  if (!e.dir && e.method !== 0 && e.method !== 8)
    return `compression method ${e.method} is not supported (use deflate or store)`
  return undefined
}

/** Byte limits the reader enforces (PACK_LIMITS; tests may pass smaller ones). */
export interface PackReadLimits {
  maxArchiveBytes: number
  maxTotalBytes: number
  maxFileBytes: number
  maxManifestBytes: number
  maxFiles: number
  maxCompressionRatio: number
}

export const DEFAULT_READ_LIMITS: PackReadLimits = {
  maxArchiveBytes: PACK_LIMITS.maxArchiveBytes,
  maxTotalBytes: PACK_LIMITS.maxTotalBytes,
  maxFileBytes: PACK_LIMITS.maxFileBytes,
  maxManifestBytes: PACK_LIMITS.maxManifestBytes,
  maxFiles: PACK_LIMITS.maxFiles,
  maxCompressionRatio: PACK_LIMITS.maxCompressionRatio,
}

/** Running byte budget across all entries of one archive. */
export interface InflateBudget {
  total: number
  limits: PackReadLimits
}

/** Below this many inflated bytes the ratio limit is not applied (tiny files compress well). */
export const RATIO_FLOOR_BYTES = 1024 * 1024

interface StreamHelper {
  on(event: 'data', cb: (chunk: Uint8Array) => void): StreamHelper
  on(event: 'error', cb: (err: Error) => void): StreamHelper
  on(event: 'end', cb: () => void): StreamHelper
  resume(): StreamHelper
  pause(): StreamHelper
}

/**
 * Inflate one entry, counting the bytes actually produced. Stops (and resolves a problem) as
 * soon as the entry passes `maxBytes`, the archive passes the total limit, or the entry's
 * output passes the compression-ratio limit against its stored compressed size.
 */
export function inflateEntry(
  obj: JSZip.JSZipObject,
  raw: RawZipEntry,
  maxBytes: number,
  budget: InflateBudget,
): Promise<Buffer | PackProblem> {
  const path = raw.name
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let done = false
    const finish = (r: Buffer | PackProblem) => {
      if (done) return
      done = true
      resolve(r)
    }
    const helper = (
      obj as unknown as { internalStream(type: 'uint8array'): StreamHelper }
    ).internalStream('uint8array')
    const stop = (message: string) => {
      helper.pause()
      finish({ path, message })
    }
    helper
      .on('data', (chunk) => {
        if (done) return
        size += chunk.length
        budget.total += chunk.length
        if (size > maxBytes) return stop(`file is larger than ${maxBytes} bytes`)
        if (budget.total > budget.limits.maxTotalBytes)
          return stop('the pack is larger than the uncompressed size limit')
        if (
          size > RATIO_FLOOR_BYTES &&
          size > budget.limits.maxCompressionRatio * Math.max(raw.compressedSize, 1)
        )
          return stop(
            `compression ratio exceeds ${budget.limits.maxCompressionRatio}:1 (possible zip bomb)`,
          )
        // Copy: the inflater may reuse its output buffer for the next chunk.
        chunks.push(Buffer.from(chunk))
      })
      .on('error', (err) => finish({ path, message: `cannot be read: ${err.message}` }))
      .on('end', () => finish(Buffer.concat(chunks, size)))
      .resume()
  })
}
