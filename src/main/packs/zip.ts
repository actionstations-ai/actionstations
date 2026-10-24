// Zip handling for packs (ADR-0018, #303). The archive is parsed here from the raw bytes and
// must have exactly one reading: the end record ends the file, the central directory ends
// where the end record starts, and the entries' local headers and data (plus any data
// descriptor) tile the bytes before it from offset 0 with no gap and no overlap. Each local
// header must repeat its central record (name bytes, flags, method, sizes). So prepended or
// appended data, a second archive, overlapping or shared entries, a count that disagrees and
// a central name that differs from the local one are all refused. Entries are inflated from
// the region this scan proved (node:zlib), counting compressed bytes as the inflater consumes
// them, so the ratio limit is measured on real input and output; jszip only cross-checks.
import { createInflateRaw } from 'node:zlib'
import { PACK_LIMITS, type PackProblem } from '@shared/schemas/pack'

export interface RawZipEntry {
  /** Name exactly as stored (UTF-8), before any normalization. */
  name: string
  dir: boolean
  encrypted: boolean
  /** General purpose bit flag of the central record. */
  flags: number
  /** 0 = store, 8 = deflate. */
  method: number
  crc32: number
  compressedSize: number
  uncompressedSize: number
  /** Offset of the local header. */
  localHeaderOffset: number
  /** Offset of the entry's (compressed) data, right after its local header. */
  dataOffset: number
  /** File type bits of the unix mode (0o170000 mask), or undefined when not made on unix. */
  unixType?: number
}

const LOC_SIG = 0x04034b50
const CEN_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
const DD_SIG = 0x08074b50
const LOC_LEN = 30
const CEN_LEN = 46
const EOCD_MIN = 22
const MAX32 = 0xffffffff
const FLAG_ENCRYPTED = 0x0001
const FLAG_DESCRIPTOR = 0x0008
const FLAG_STRONG = 0x0040
const FLAG_UTF8 = 0x0800
/** Flags whose meaning a reader depends on: they must agree between the two headers. */
const FLAGS_THAT_MATTER = FLAG_ENCRYPTED | FLAG_DESCRIPTOR | FLAG_STRONG | FLAG_UTF8
/** Extra fields that change how an entry is read (ZIP64 sizes; Info-ZIP unicode path). */
const REFUSED_EXTRA = new Map([
  [0x0001, 'ZIP64 extra field'],
  [0x7075, 'unicode path extra field (it can rename the entry)'],
])
const MADE_BY_UNIX = new Set([3, 19]) // unix, OS X
export const S_IFMT = 0o170000
export const S_IFLNK = 0o120000
const S_IFREG = 0o100000
const S_IFDIR = 0o040000

const utf8 = new TextDecoder('utf-8', { fatal: true })

class ZipFormatError extends Error {}
export { ZipFormatError }

interface EndRecord {
  at: number
  count: number
  cdSize: number
  cdOffset: number
}

function findEndRecord(buf: Buffer): EndRecord {
  const stop = Math.max(0, buf.length - EOCD_MIN - 0xffff)
  let at = -1
  for (let i = buf.length - EOCD_MIN; i >= stop; i--)
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      at = i
      break
    }
  if (at < 0) throw new ZipFormatError('Not a zip archive')
  const count = buf.readUInt16LE(at + 10)
  const cdSize = buf.readUInt32LE(at + 12)
  const cdOffset = buf.readUInt32LE(at + 16)
  if (count === 0xffff || cdSize === MAX32 || cdOffset === MAX32)
    throw new ZipFormatError('ZIP64 archives are not supported')
  if (
    buf.readUInt16LE(at + 4) !== 0 ||
    buf.readUInt16LE(at + 6) !== 0 ||
    buf.readUInt16LE(at + 8) !== count
  )
    throw new ZipFormatError('Multi-part zip archives are not supported')
  if (at + EOCD_MIN + buf.readUInt16LE(at + 20) !== buf.length)
    throw new ZipFormatError('The zip archive has data after its end record')
  if (cdOffset + cdSize !== at)
    throw new ZipFormatError(
      'The zip central directory does not end where the end record starts (prepended data, or a second archive)',
    )
  return { at, count, cdSize, cdOffset }
}

function refusedExtra(buf: Buffer, start: number, end: number): string | undefined {
  let at = start
  while (at < end) {
    if (at + 4 > end) return 'malformed extra field'
    const id = buf.readUInt16LE(at)
    const len = buf.readUInt16LE(at + 2)
    if (at + 4 + len > end) return 'malformed extra field'
    const refused = REFUSED_EXTRA.get(id)
    if (refused) return refused
    at += 4 + len
  }
  return undefined
}

interface CentralRecord {
  entry: RawZipEntry
  nameBytes: Buffer
  next: number
}

function readCentral(buf: Buffer, at: number, end: number): CentralRecord {
  if (at + CEN_LEN > end || buf.readUInt32LE(at) !== CEN_SIG)
    throw new ZipFormatError('The zip central directory is damaged')
  const madeBy = buf.readUInt16LE(at + 4) >> 8
  const flags = buf.readUInt16LE(at + 8)
  const method = buf.readUInt16LE(at + 10)
  const crc32 = buf.readUInt32LE(at + 16)
  const compressedSize = buf.readUInt32LE(at + 20)
  const uncompressedSize = buf.readUInt32LE(at + 24)
  const nameLen = buf.readUInt16LE(at + 28)
  const extraLen = buf.readUInt16LE(at + 30)
  const commentLen = buf.readUInt16LE(at + 32)
  const disk = buf.readUInt16LE(at + 34)
  const attrs = buf.readUInt32LE(at + 38)
  const localHeaderOffset = buf.readUInt32LE(at + 42)
  const nameEnd = at + CEN_LEN + nameLen
  const next = nameEnd + extraLen + commentLen
  if (next > end) throw new ZipFormatError('The zip central directory is damaged')
  if (compressedSize === MAX32 || uncompressedSize === MAX32 || localHeaderOffset === MAX32)
    throw new ZipFormatError('ZIP64 archives are not supported')
  if (disk !== 0) throw new ZipFormatError('Multi-part zip archives are not supported')
  const nameBytes = buf.subarray(at + CEN_LEN, nameEnd)
  let name: string
  try {
    name = utf8.decode(nameBytes)
  } catch {
    throw new ZipFormatError('An entry name is not valid UTF-8')
  }
  const extra = refusedExtra(buf, nameEnd, nameEnd + extraLen)
  if (extra) throw new ZipFormatError(`Entry "${name}" has a ${extra}`)
  const unixType = MADE_BY_UNIX.has(madeBy) ? (attrs >>> 16) & S_IFMT : undefined
  const dir = name.endsWith('/') || (attrs & 0x10) !== 0 || unixType === S_IFDIR
  const entry: RawZipEntry = {
    name,
    dir,
    encrypted: (flags & (FLAG_ENCRYPTED | FLAG_STRONG)) !== 0,
    flags,
    method,
    crc32,
    compressedSize,
    uncompressedSize,
    localHeaderOffset,
    dataOffset: -1,
    ...(unixType !== undefined ? { unixType } : {}),
  }
  return { entry, nameBytes, next }
}

/** Checks one local header against its central record; returns the data offset. */
function checkLocal(buf: Buffer, rec: CentralRecord, limit: number): number {
  const e = rec.entry
  const at = e.localHeaderOffset
  const bad = (why: string) => new ZipFormatError(`Entry "${e.name}": ${why}`)
  if (at + LOC_LEN > limit || buf.readUInt32LE(at) !== LOC_SIG)
    throw bad('no local header where the central directory points')
  const flags = buf.readUInt16LE(at + 6)
  const nameLen = buf.readUInt16LE(at + 26)
  const dataOffset = at + LOC_LEN + nameLen + buf.readUInt16LE(at + 28)
  if (dataOffset > limit) throw bad('the local header runs past its entry')
  if (!buf.subarray(at + LOC_LEN, at + LOC_LEN + nameLen).equals(rec.nameBytes))
    throw bad('the local header name differs from the central directory name')
  if ((flags & FLAGS_THAT_MATTER) !== (e.flags & FLAGS_THAT_MATTER))
    throw bad('the local header flags differ from the central directory')
  if (buf.readUInt16LE(at + 8) !== e.method)
    throw bad('the local header compression method differs from the central directory')
  const local = [buf.readUInt32LE(at + 14), buf.readUInt32LE(at + 18), buf.readUInt32LE(at + 22)]
  const central = [e.crc32, e.compressedSize, e.uncompressedSize]
  // With a data descriptor the local values may be zero; otherwise they must agree.
  const deferred = (e.flags & FLAG_DESCRIPTOR) !== 0
  if (local.some((v, i) => v !== central[i] && !(deferred && v === 0)))
    throw bad('the local header sizes or CRC differ from the central directory')
  return dataOffset
}

/** Length of the data descriptor that fills [at, end), or -1 when it does not match `e`. */
function descriptorLength(buf: Buffer, at: number, end: number, e: RawZipEntry): number {
  const matches = (p: number) =>
    buf.readUInt32LE(p) === e.crc32 &&
    buf.readUInt32LE(p + 4) === e.compressedSize &&
    buf.readUInt32LE(p + 8) === e.uncompressedSize
  if (end - at === 16 && buf.readUInt32LE(at) === DD_SIG && matches(at + 4)) return 16
  if (end - at === 12 && matches(at)) return 12
  return -1
}

/**
 * Proves that local headers, data and descriptors tile [0, cdOffset) exactly, in offset
 * order, and fills in each entry's dataOffset.
 */
function checkLayout(buf: Buffer, records: CentralRecord[], cdOffset: number): void {
  const byOffset = [...records].sort(
    (a, b) => a.entry.localHeaderOffset - b.entry.localHeaderOffset,
  )
  const overlap = (a: RawZipEntry, b?: RawZipEntry) =>
    new ZipFormatError(
      `Entry "${a.name}" overlaps ${b ? `entry "${b.name}"` : 'the central directory'}`,
    )
  let cursor = 0
  for (const [i, rec] of byOffset.entries()) {
    const e = rec.entry
    if (e.localHeaderOffset !== cursor)
      throw new ZipFormatError(
        `The zip archive has unaccounted bytes before entry "${e.name}" (prepended or hidden data)`,
      )
    const next = byOffset[i + 1]?.entry
    const boundary = next?.localHeaderOffset ?? cdOffset
    if (next && boundary === cursor) throw overlap(next, e)
    e.dataOffset = checkLocal(buf, rec, boundary)
    const dataEnd = e.dataOffset + e.compressedSize
    if (dataEnd > boundary) throw overlap(e, next)
    if (e.flags & FLAG_DESCRIPTOR) {
      if (descriptorLength(buf, dataEnd, boundary, e) < 0)
        throw new ZipFormatError(`Entry "${e.name}": the data descriptor is missing or differs`)
    } else if (dataEnd !== boundary)
      throw new ZipFormatError(
        `The zip archive has unaccounted bytes after entry "${e.name}" (hidden data)`,
      )
    cursor = boundary
  }
  if (cursor !== cdOffset)
    throw new ZipFormatError('The zip archive has unaccounted bytes before its central directory')
}

/**
 * Every central-directory entry, in archive order, after proving the archive has one reading
 * (see the header comment). Throws ZipFormatError on anything else, ZIP64 included.
 */
export function scanCentralDirectory(buf: Buffer): RawZipEntry[] {
  const end = findEndRecord(buf)
  const records: CentralRecord[] = []
  let at = end.cdOffset
  while (at < end.at) {
    const rec = readCentral(buf, at, end.at)
    records.push(rec)
    at = rec.next
  }
  if (records.length !== end.count)
    throw new ZipFormatError(
      `The zip end record says ${end.count} entries; the central directory has ${records.length}`,
    )
  checkLayout(buf, records, end.cdOffset)
  return records.map((r) => r.entry)
}

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
/** Compressed bytes handed to the inflater at a time (a limit stops it within one chunk). */
const INPUT_CHUNK = 16 * 1024

/** Counts produced bytes against the per-file, total and ratio limits. */
function outputCheck(
  maxBytes: number,
  compressedSize: number,
  budget: InflateBudget,
): (chunk: number) => string | undefined {
  let size = 0
  const { maxTotalBytes, maxCompressionRatio } = budget.limits
  return (chunk) => {
    size += chunk
    budget.total += chunk
    if (size > maxBytes) return `file is larger than ${maxBytes} bytes`
    if (budget.total > maxTotalBytes) return 'the pack is larger than the uncompressed size limit'
    if (size > RATIO_FLOOR_BYTES && size > maxCompressionRatio * Math.max(compressedSize, 1))
      return `compression ratio exceeds ${maxCompressionRatio}:1 (possible zip bomb)`
    return undefined
  }
}

/**
 * Inflate one entry from the bytes scanCentralDirectory proved are its data (the region the
 * ratio is measured against is the region the inflater reads). Stops (and resolves a
 * problem) as soon as the entry passes `maxBytes`, the archive passes the total limit, or the
 * output passes the ratio limit against the compressed size. The inflater must consume every
 * compressed byte (zlib counts what it consumed, so padding after a small deflate stream
 * cannot buy a larger ratio allowance), and the output must have the size the headers declare.
 */
export function inflateEntry(
  buf: Buffer,
  raw: RawZipEntry,
  maxBytes: number,
  budget: InflateBudget,
): Promise<Buffer | PackProblem> {
  const path = raw.name
  const data = buf.subarray(raw.dataOffset, raw.dataOffset + raw.compressedSize)
  const check = outputCheck(maxBytes, raw.compressedSize, budget)
  const sizeProblem = (n: number): PackProblem | undefined =>
    n === raw.uncompressedSize
      ? undefined
      : { path, message: `inflates to ${n} bytes; the zip headers say ${raw.uncompressedSize}` }
  if (raw.method === 0) {
    const over = check(data.length)
    return Promise.resolve(
      over ? { path, message: over } : (sizeProblem(data.length) ?? Buffer.from(data)),
    )
  }
  return new Promise((resolve) => {
    const inflater = createInflateRaw()
    const trailing = { path, message: 'has bytes after the end of its compressed data' }
    const chunks: Buffer[] = []
    let size = 0
    let done = false
    const finish = (r: Buffer | PackProblem) => {
      if (done) return
      done = true
      inflater.destroy()
      resolve(r)
    }
    inflater
      .on('data', (chunk: Buffer) => {
        if (done) return
        const over = check(chunk.length)
        if (over) return finish({ path, message: over })
        size += chunk.length
        chunks.push(chunk)
      })
      .on('error', (err: NodeJS.ErrnoException) =>
        finish(
          err.code === 'ERR_STREAM_WRITE_AFTER_END'
            ? trailing
            : { path, message: `cannot be read: ${err.message}` },
        ),
      )
      .on('end', () => {
        if (inflater.bytesWritten !== data.length) return finish(trailing)
        finish(sizeProblem(size) ?? Buffer.concat(chunks, size))
      })
    const feed = (from: number): void => {
      if (done) return
      if (from >= data.length) return void inflater.end()
      const more = inflater.write(data.subarray(from, from + INPUT_CHUNK))
      if (more) setImmediate(() => feed(from + INPUT_CHUNK))
      else inflater.once('drain', () => feed(from + INPUT_CHUNK))
    }
    feed(0)
  })
}
