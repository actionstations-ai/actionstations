// Pack reader (ADR-0018, docs/packs-format.md). One code path for install, the export
// wizard's self-check and the CLI validator: open an .aspack, verify it completely, and
// return an in-memory description of it or every problem found.
//
//   readPack(source, { appVersion, builtins? }) → ReadPackResult
//     source     { path } of an .aspack file or { buffer } of its bytes
//     appVersion the running app's version (callers pass app.getVersion(); tests their own)
//     builtins   shipped ids (default: loadBuiltins() from the resources folder)
//   ok    → { pack: { manifest, archiveSha256, contentSha256, files, items } }
//   error → { problems: [{ path?, message }] }; a newer formatVersion or minAppVersion gives
//           one "update the app" problem before anything else in pack.json is read.
//
// Order: archive size → zip layout (one reading only, see zip.ts) → central directory
// (names, encryption, links, duplicates, count) → jszip agrees with the scan → pack.json
// (header, then PackManifest) → archive entries = files[] → inflate every file from its
// scanned bytes with byte limits, sha256 and size → per-kind content checks. Nothing touches the disk
// except reading `source.path`; extractPack (extract.ts) writes the verified files.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import JSZip from 'jszip'
import {
  PACK_FORMAT_VERSION,
  PACK_MANIFEST_FILE,
  PackManifest,
  PackManifestHeader,
  SemVer,
  isAppCompatible,
  packPathProblem,
  type PackItemSummary,
  type PackProblem,
} from '@shared/schemas/pack'
import { loadBuiltins, type PackBuiltins } from './builtins'
import { checkPackContent } from './content'
import {
  ZipFormatError,
  entryMetaProblem,
  inflateEntry,
  scanCentralDirectory,
  DEFAULT_READ_LIMITS,
  type InflateBudget,
  type PackReadLimits,
  type RawZipEntry,
} from './zip'

export type { PackItemSummary, PackProblem } from '@shared/schemas/pack'
export type { PackBuiltins } from './builtins'
export type { PackReadLimits } from './zip'

export interface VerifiedPack {
  manifest: PackManifest
  /** pack.json exactly as stored in the archive (extractPack writes these bytes). */
  manifestBytes: Buffer
  /** sha256 of the archive bytes (what a catalog entry carries). */
  archiveSha256: string
  /** sha256 of the sorted "<sha256>  <path>\n" lines of files[] (independent of zip layout). */
  contentSha256: string
  /** Every file but pack.json, verified against its sha256 and size. */
  files: ReadonlyMap<string, Buffer>
  items: PackItemSummary[]
}

export type ReadPackResult =
  { ok: true; pack: VerifiedPack } | { ok: false; problems: PackProblem[] }

export type PackSource = { path: string } | { buffer: Buffer }

export interface ReadPackOptions {
  appVersion: string
  builtins?: PackBuiltins
  /**
   * A bundled pack assembled from the repo (scripts/build-bundled-packs.mjs, ADR-0020): it may
   * provide the built-in domain ids. Never set for a pack a user installs.
   */
  trusted?: boolean
  /** Override some byte limits (tests; defaults are PACK_LIMITS). */
  limits?: Partial<PackReadLimits>
  /** The newest format this reader accepts (tests simulate an older app; default PACK_FORMAT_VERSION). */
  maxFormatVersion?: number
}

const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')
const fail = (problems: PackProblem[]): ReadPackResult => ({ ok: false, problems })
const UPDATE = 'Update Action Stations to install it.'

export async function loadSource(source: PackSource, max: number): Promise<Buffer | PackProblem> {
  if ('buffer' in source) {
    if (source.buffer.length > max)
      return { message: `The archive is larger than the ${max} byte limit` }
    return source.buffer
  }
  const st = await fs.stat(source.path).catch(() => null)
  if (!st?.isFile()) return { message: `Cannot read ${source.path}` }
  if (st.size > max) return { message: `The archive is larger than the ${max} byte limit` }
  return fs.readFile(source.path)
}

/** Name, flag and count checks on the raw central directory. */
export function checkEntries(entries: RawZipEntry[], maxFiles: number): PackProblem[] {
  const problems: PackProblem[] = []
  const seen = new Map<string, string>()
  const files = entries.filter((e) => !e.dir)
  if (files.length > maxFiles + 1)
    problems.push({ message: `The archive has ${files.length} files; the limit is ${maxFiles}` })
  for (const e of entries) {
    const path = e.name
    const meta = entryMetaProblem(e)
    if (meta) problems.push({ path, message: meta })
    const name = e.dir ? path.replace(/\/+$/, '') : path
    const unsafe = packPathProblem(name)
    if (unsafe) {
      problems.push({ path, message: `unsafe path: ${unsafe}` })
      continue
    }
    const key = path.toLowerCase()
    const other = seen.get(key)
    if (other !== undefined)
      problems.push({
        path,
        message:
          other === path
            ? 'duplicate entry in the archive'
            : `differs from "${other}" only in case (macOS and Windows would merge them)`,
      })
    seen.set(key, path)
  }
  return problems
}

/** jszip's compressed object for a loaded entry (`_data`, not part of its typings). */
interface JSZipCompressed {
  compressedSize?: number
  uncompressedSize?: number
  /** Read as a signed 32-bit integer. */
  crc32?: number
  compressedContent?: Uint8Array
}

/** Whether jszip's object for an entry has the sizes, CRC and data length the scan found. */
function sameAsScan(obj: JSZip.JSZipObject | undefined, e: RawZipEntry): boolean {
  const data = (obj as unknown as { _data?: JSZipCompressed } | undefined)?._data
  return (
    data?.compressedSize === e.compressedSize &&
    data.uncompressedSize === e.uncompressedSize &&
    data.crc32 !== undefined &&
    data.crc32 >>> 0 === e.crc32 &&
    data.compressedContent?.length === e.compressedSize
  )
}

/**
 * Cross-check: jszip must read the same entries the scan proved (same names, same count, same
 * sizes and CRC). jszip names an entry from its local header and reads every central record
 * up to the first bad signature, so any disagreement means the archive has two readings.
 */
export async function crossCheckJszip(
  buf: Buffer,
  entries: RawZipEntry[],
): Promise<PackProblem | undefined> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buf)
  } catch (e) {
    return { message: `The archive cannot be opened: ${(e as Error).message}` }
  }
  const inconsistent = { message: 'The archive’s file table is inconsistent' }
  const all = Object.values(zip.files)
  const files = all.filter((o) => !o.dir)
  const rawFiles = entries.filter((e) => !e.dir)
  if (all.length !== entries.length || files.length !== rawFiles.length) return inconsistent
  const byName = new Map(files.map((o) => [o.unsafeOriginalName ?? o.name, o]))
  if (rawFiles.some((e) => !sameAsScan(byName.get(e.name), e))) return inconsistent
  return undefined
}

function checkHeader(
  data: unknown,
  appVersion: string,
  maxFormat = PACK_FORMAT_VERSION,
): PackProblem | undefined {
  const header = PackManifestHeader.safeParse(data)
  if (!header.success)
    return { path: PACK_MANIFEST_FILE, message: 'formatVersion is missing or not a number' }
  const { formatVersion, minAppVersion } = header.data
  if (formatVersion > maxFormat)
    return {
      path: PACK_MANIFEST_FILE,
      message: `This pack needs a newer version of the app (pack format ${formatVersion}). ${UPDATE}`,
    }
  if (
    minAppVersion !== undefined &&
    SemVer.safeParse(minAppVersion).success &&
    !isAppCompatible(minAppVersion, appVersion)
  )
    return {
      path: PACK_MANIFEST_FILE,
      message: `This pack needs Action Stations ${minAppVersion} or later (this is ${appVersion}). ${UPDATE}`,
    }
  return undefined
}

async function readManifest(
  buf: Buffer,
  raw: Map<string, RawZipEntry>,
  budget: InflateBudget,
  appVersion: string,
  maxFormat?: number,
): Promise<{ manifest: PackManifest; bytes: Buffer } | PackProblem[]> {
  const entry = raw.get(PACK_MANIFEST_FILE)
  if (!entry)
    return [{ path: PACK_MANIFEST_FILE, message: 'missing: a pack has pack.json at its root' }]
  const bytes = await inflateEntry(buf, entry, budget.limits.maxManifestBytes, budget)
  if (!Buffer.isBuffer(bytes)) return [bytes]
  let data: unknown
  try {
    data = JSON.parse(bytes.toString('utf8'))
  } catch (e) {
    return [{ path: PACK_MANIFEST_FILE, message: `not valid JSON: ${(e as Error).message}` }]
  }
  const header = checkHeader(data, appVersion, maxFormat)
  if (header) return [header]
  const parsed = PackManifest.safeParse(data)
  if (parsed.success) return { manifest: parsed.data, bytes }
  return parsed.error.issues.map((i) => ({
    path: PACK_MANIFEST_FILE,
    message: `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`,
  }))
}

function compareEntries(manifest: PackManifest, raw: Map<string, RawZipEntry>): PackProblem[] {
  const listed = new Set(manifest.files.map((f) => f.path))
  const problems: PackProblem[] = []
  for (const name of raw.keys())
    if (name !== PACK_MANIFEST_FILE && !listed.has(name))
      problems.push({ path: name, message: 'in the archive but not listed in pack.json files' })
  for (const f of manifest.files)
    if (!raw.has(f.path))
      problems.push({
        path: f.path,
        message: 'listed in pack.json files but missing from the archive',
      })
  return problems
}

async function readFiles(
  buf: Buffer,
  manifest: PackManifest,
  raw: Map<string, RawZipEntry>,
  budget: InflateBudget,
): Promise<Map<string, Buffer> | PackProblem[]> {
  const files = new Map<string, Buffer>()
  const problems: PackProblem[] = []
  for (const f of manifest.files) {
    const bytes = await inflateEntry(buf, raw.get(f.path)!, budget.limits.maxFileBytes, budget)
    if (!Buffer.isBuffer(bytes)) return [...problems, bytes] // a byte limit stops the read
    if (bytes.length !== f.size)
      problems.push({
        path: f.path,
        message: `size is ${bytes.length} bytes; pack.json says ${f.size}`,
      })
    else if (sha256(bytes) !== f.sha256)
      problems.push({ path: f.path, message: 'sha256 does not match pack.json' })
    files.set(f.path, bytes)
  }
  return problems.length ? problems : files
}

export const contentSha256 = (files: readonly { path: string; sha256: string }[]): string =>
  sha256(
    files
      .map((f) => `${f.sha256}  ${f.path}\n`)
      .sort()
      .join(''),
  )

/** Open and fully verify a pack. Never throws for a bad pack; problems describe it. */
export async function readPack(source: PackSource, opts: ReadPackOptions): Promise<ReadPackResult> {
  const limits: PackReadLimits = { ...DEFAULT_READ_LIMITS, ...opts.limits }
  const buf = await loadSource(source, limits.maxArchiveBytes)
  if (!Buffer.isBuffer(buf)) return fail([buf])
  let entries: RawZipEntry[]
  try {
    entries = scanCentralDirectory(buf)
  } catch (e) {
    if (e instanceof ZipFormatError) return fail([{ message: `${e.message}.` }])
    throw e
  }
  const entryProblems = checkEntries(entries, limits.maxFiles)
  if (entryProblems.length) return fail(entryProblems)
  const disagreement = await crossCheckJszip(buf, entries)
  if (disagreement) return fail([disagreement])
  const raw = new Map(entries.filter((e) => !e.dir).map((e) => [e.name, e]))
  const budget: InflateBudget = { total: 0, limits }
  const read = await readManifest(buf, raw, budget, opts.appVersion, opts.maxFormatVersion)
  if (Array.isArray(read)) return fail(read)
  const { manifest } = read
  const mismatch = compareEntries(manifest, raw)
  if (mismatch.length) return fail(mismatch)
  const files = await readFiles(buf, manifest, raw, budget)
  if (Array.isArray(files)) return fail(files)
  const content = checkPackContent(manifest, files, opts.builtins ?? (await loadBuiltins()), {
    trusted: !!opts.trusted,
  })
  if (content.problems.length) return fail(content.problems)
  return {
    ok: true,
    pack: {
      manifest,
      manifestBytes: read.bytes,
      archiveSha256: sha256(buf),
      contentSha256: contentSha256(manifest.files),
      files,
      items: content.items,
    },
  }
}
