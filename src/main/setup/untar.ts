// Safe extraction of a vendor tarball (.tar.zst) into a folder the app owns (ADR-0021, #338).
// Written for Ollama's Linux release archives (GNU tar: regular files, directories, relative
// symlinks, ././@LongLink names) and nothing more. Every entry must stay inside the target
// folder and under an allowed prefix; symlinks may only point at paths inside those prefixes;
// nothing is ever written through a symlink; devices, FIFOs and sparse files are refused;
// set-id bits are dropped. The archive is streamed, never held in memory.
import { createReadStream, promises as fs } from 'node:fs'
import { posix, resolve, sep } from 'node:path'
import * as zlib from 'node:zlib'
import type { Readable } from 'node:stream'
import { AppError } from '../lib/errors'

export interface ExtractLimits {
  /** Paths an entry may have: exact directories ("bin") or prefixes ending in "/" ("lib/ollama/"). */
  allow: string[]
  /** Cap on the bytes written for all files together (a decompression bomb stops here). */
  maxBytes: number
  /** Cap on the number of entries. */
  maxEntries: number
}

export interface ExtractResult {
  files: number
  dirs: number
  symlinks: number
  bytes: number
}

const BLOCK = 512

/** Pulls exact byte counts out of a chunked stream. */
class ByteReader {
  private chunks: Buffer[] = []
  private buffered = 0
  private done = false
  private readonly it: AsyncIterator<Buffer>

  constructor(stream: AsyncIterable<Buffer>) {
    this.it = stream[Symbol.asyncIterator]()
  }

  private async fill(): Promise<boolean> {
    if (this.done) return false
    const next = await this.it.next()
    if (next.done) {
      this.done = true
      return false
    }
    this.chunks.push(next.value)
    this.buffered += next.value.length
    return true
  }

  /** Up to `max` bytes (at least one), or null at the end of the stream. */
  async some(max: number): Promise<Buffer | null> {
    while (this.buffered === 0) if (!(await this.fill())) return null
    const head = this.chunks[0]!
    if (head.length <= max) {
      this.chunks.shift()
      this.buffered -= head.length
      return head
    }
    this.chunks[0] = head.subarray(max)
    this.buffered -= max
    return head.subarray(0, max)
  }

  /** Exactly `n` bytes, or null if the stream ends first. */
  async exact(n: number): Promise<Buffer | null> {
    while (this.buffered < n) if (!(await this.fill())) return null
    const out = Buffer.allocUnsafe(n)
    let at = 0
    while (at < n) {
      const piece = await this.some(n - at)
      piece!.copy(out, at)
      at += piece!.length
    }
    return out
  }

  /** Read `n` bytes in pieces; throws if the stream ends first. */
  async each(n: number, onPiece: (b: Buffer) => Promise<void>): Promise<void> {
    let left = n
    while (left > 0) {
      const piece = await this.some(Math.min(left, 1 << 20))
      if (!piece) throw refuse('the archive ends in the middle of a file')
      left -= piece.length
      await onPiece(piece)
    }
  }
}

const refuse = (why: string) =>
  new AppError('VALIDATION', `Refused the archive: ${why}. Nothing was installed.`)

const cstr = (b: Buffer, start: number, len: number): string => {
  const s = b.subarray(start, start + len)
  const end = s.indexOf(0)
  return s.subarray(0, end === -1 ? s.length : end).toString('utf8')
}

/** Octal field, or GNU base-256 when the high bit of the first byte is set. */
function numeric(b: Buffer, start: number, len: number): number {
  const f = b.subarray(start, start + len)
  if (f[0]! & 0x80) {
    if (f[0] === 0xff) throw refuse('a header has a negative number')
    let n = f[0]! & 0x7f
    for (let i = 1; i < f.length; i++) n = n * 256 + f[i]!
    if (!Number.isSafeInteger(n)) throw refuse('a header number is too large')
    return n
  }
  const text = cstr(b, start, len).trim()
  if (text === '') return 0
  if (!/^[0-7]+$/.test(text)) throw refuse('a header has a malformed number')
  return parseInt(text, 8)
}

function checksumOk(h: Buffer): boolean {
  let sum = 0
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i]!
  return sum === numeric(h, 148, 8)
}

interface Header {
  name: string
  type: string
  mode: number
  size: number
  linkname: string
}

function parseHeader(h: Buffer): Header {
  if (!checksumOk(h)) throw refuse('a header checksum does not match (not a tar file, or corrupt)')
  const magic = h.subarray(257, 263).toString('latin1')
  let name = cstr(h, 0, 100)
  // POSIX ustar keeps a 155-byte prefix; old GNU ("ustar  ") uses that area for other fields.
  if (magic === 'ustar\0') {
    const prefix = cstr(h, 345, 155)
    if (prefix) name = `${prefix}/${name}`
  }
  return {
    name,
    type: String.fromCharCode(h[156]!) === '\0' ? '0' : String.fromCharCode(h[156]!),
    mode: numeric(h, 100, 8),
    size: numeric(h, 124, 12),
    linkname: cstr(h, 157, 100),
  }
}

/** "len key=value\n" records (POSIX pax extended header). */
export function parsePax(body: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  let at = 0
  while (at < body.length) {
    const space = body.indexOf(0x20, at)
    if (space === -1) break
    const len = Number(body.subarray(at, space).toString('latin1'))
    if (!Number.isInteger(len) || len <= 0 || at + len > body.length)
      throw refuse('a pax header is malformed')
    const rec = body.subarray(space + 1, at + len - 1).toString('utf8')
    const eq = rec.indexOf('=')
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1)
    at += len
  }
  return out
}

/**
 * An archive path as a clean relative POSIX path, or a refusal. Leading "./" is dropped; an
 * absolute path, a ".." segment, a backslash or a NUL is refused outright.
 */
export function cleanPath(raw: string): string {
  if (raw.includes('\0') || raw.includes('\\')) throw refuse(`the name "${raw}" is not allowed`)
  if (raw.startsWith('/')) throw refuse(`"${raw}" is an absolute path`)
  const segments = raw.split('/').filter((s) => s !== '' && s !== '.')
  if (segments.includes('..')) throw refuse(`"${raw}" points outside the install folder`)
  return segments.join('/')
}

/** Is `rel` inside an allowed prefix, or one of the folders on the way to one? */
export function allowedPath(rel: string, allow: string[], dir = false): boolean {
  return allow.some((a) => {
    const base = a.endsWith('/') ? a.slice(0, -1) : a
    if (rel === base) return dir || !a.endsWith('/')
    if (a.endsWith('/') && rel.startsWith(a)) return true
    return dir && base.startsWith(`${rel}/`)
  })
}

/** The absolute path for `rel`, after checking it resolves inside `root`. */
function inside(root: string, rel: string): string {
  const abs = resolve(root, ...rel.split('/'))
  if (abs !== root && !abs.startsWith(root + sep)) throw refuse(`"${rel}" escapes the folder`)
  return abs
}

async function lstatOrNull(p: string) {
  return fs.lstat(p).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return null
    throw e
  })
}

/** Create the folders above `rel`; refuse if any of them is a symlink or a file. */
async function ensureParents(root: string, rel: string): Promise<void> {
  const parts = rel.split('/').slice(0, -1)
  let cur = root
  for (const part of parts) {
    cur = `${cur}${sep}${part}`
    const st = await lstatOrNull(cur)
    if (!st) await fs.mkdir(cur)
    else if (!st.isDirectory()) throw refuse(`"${rel}" would be written through a link or a file`)
  }
}

/** Where a relative symlink in `rel` points, as an archive path; refused if it leaves `allow`. */
export function linkTarget(rel: string, target: string, allow: string[]): string {
  if (!target || target.includes('\0') || target.startsWith('/'))
    throw refuse(`the link "${rel}" points to an absolute or empty path`)
  const joined = posix.normalize(posix.join(posix.dirname(rel), target))
  if (joined === '..' || joined.startsWith('../') || joined.startsWith('/'))
    throw refuse(`the link "${rel}" points outside the install folder`)
  if (!allowedPath(joined, allow, true))
    throw refuse(`the link "${rel}" points outside the expected folders`)
  return joined
}

interface Pending {
  path?: string
  linkpath?: string
}

/** Stream a tar archive into `root` (which must exist) under the limits. */
export async function extractTar(
  stream: AsyncIterable<Buffer>,
  root: string,
  limits: ExtractLimits,
  signal?: AbortSignal,
): Promise<ExtractResult> {
  const reader = new ByteReader(stream)
  const result: ExtractResult = { files: 0, dirs: 0, symlinks: 0, bytes: 0 }
  let pending: Pending = {}
  let entries = 0
  const padding = (size: number) => (BLOCK - (size % BLOCK)) % BLOCK
  const skip = async (n: number) => {
    if (n > 0 && !(await reader.exact(n))) throw refuse('the archive is truncated')
  }
  const body = async (size: number, cap: number): Promise<Buffer> => {
    if (size > cap) throw refuse('an extended header is too large')
    const b = await reader.exact(size)
    if (!b) throw refuse('the archive is truncated')
    await skip(padding(size))
    return b
  }

  for (;;) {
    if (signal?.aborted) throw new AppError('CANCELLED', 'Cancelled')
    const block = await reader.exact(BLOCK)
    if (!block) throw refuse('the archive ends without an end marker')
    if (block.every((b) => b === 0)) break
    if (++entries > limits.maxEntries) throw refuse('it has too many entries')
    const h = parseHeader(block)

    // Metadata entries that describe the next one.
    if (h.type === 'L' || h.type === 'K') {
      const v = cstr(await body(h.size, 64 * 1024), 0, h.size)
      pending = { ...pending, [h.type === 'L' ? 'path' : 'linkpath']: v }
      continue
    }
    if (h.type === 'x' || h.type === 'g') {
      const pax = parsePax(await body(h.size, 1024 * 1024))
      if (h.type === 'x')
        pending = {
          ...pending,
          ...(pax.path !== undefined ? { path: pax.path } : {}),
          ...(pax.linkpath !== undefined ? { linkpath: pax.linkpath } : {}),
        }
      continue
    }

    const rel = cleanPath(pending.path ?? h.name)
    const linkRaw = pending.linkpath ?? h.linkname
    pending = {}
    const isDir = h.type === '5'
    if (rel === '') {
      if (!isDir) throw refuse('an entry has an empty name')
      await skip(h.size + padding(h.size))
      continue
    }
    if (!allowedPath(rel, limits.allow, isDir))
      throw refuse(`"${rel}" is outside the folders this archive may write`)
    const abs = inside(root, rel)
    await ensureParents(root, rel)
    const existing = await lstatOrNull(abs)

    if (isDir) {
      if (existing && !existing.isDirectory()) throw refuse(`"${rel}" is both a folder and a file`)
      if (!existing) await fs.mkdir(abs, { mode: 0o755 })
      result.dirs++
      await skip(h.size + padding(h.size))
      continue
    }
    if (existing) throw refuse(`"${rel}" appears twice`)

    if (h.type === '2') {
      linkTarget(rel, linkRaw, limits.allow)
      await fs.symlink(linkRaw, abs)
      result.symlinks++
      continue
    }
    if (h.type === '1') {
      // A hard link to an earlier file in this archive: copied, never linked.
      const from = cleanPath(linkRaw)
      if (!allowedPath(from, limits.allow)) throw refuse(`the link "${rel}" points outside`)
      const src = await lstatOrNull(inside(root, from))
      if (!src?.isFile()) throw refuse(`the link "${rel}" points to no earlier file`)
      await fs.copyFile(inside(root, from), abs, fs.constants.COPYFILE_EXCL)
      result.files++
      continue
    }
    if (h.type !== '0' && h.type !== '7')
      throw refuse(`"${rel}" is a special file (type ${JSON.stringify(h.type)})`)

    result.bytes += h.size
    if (result.bytes > limits.maxBytes) throw refuse('it unpacks to more than the size limit')
    const mode = h.mode & 0o111 ? 0o755 : 0o644
    // 'wx' = O_CREAT | O_EXCL: never follows or replaces an existing path.
    const fh = await fs.open(abs, 'wx', mode)
    try {
      await reader.each(h.size, async (piece) => {
        if (signal?.aborted) throw new AppError('CANCELLED', 'Cancelled')
        await fh.write(piece)
      })
    } finally {
      await fh.close()
    }
    await skip(padding(h.size))
    result.files++
  }
  return result
}

/** Is zstd decompression built into this runtime (Node 22.15+, Electron 36+)? */
export const zstdAvailable = (): boolean =>
  typeof (zlib as { createZstdDecompress?: unknown }).createZstdDecompress === 'function'

/** Decompress a .tar.zst file and extract it into `root`. */
export async function extractTarZst(
  file: string,
  root: string,
  limits: ExtractLimits,
  signal?: AbortSignal,
): Promise<ExtractResult> {
  if (!zstdAvailable())
    throw new AppError(
      'PROVIDER',
      'This version of Action Stations cannot unpack .tar.zst files; use "Open the download page".',
    )
  const create = (zlib as unknown as { createZstdDecompress: () => NodeJS.ReadWriteStream })
    .createZstdDecompress
  const input = createReadStream(file)
  const unzstd = create() as unknown as Readable
  input.on('error', (e) => unzstd.destroy(e))
  input.pipe(unzstd as unknown as NodeJS.WritableStream)
  try {
    return await extractTar(unzstd as AsyncIterable<Buffer>, root, limits, signal)
  } catch (err) {
    if (err instanceof AppError) throw err
    const msg = err instanceof Error ? err.message : String(err)
    throw new AppError('PROVIDER', `Could not unpack the archive: ${msg.slice(0, 200)}`)
  } finally {
    input.destroy()
    unzstd.destroy()
  }
}
