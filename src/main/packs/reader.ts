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
// Order: archive size → central directory (names, encryption, links, duplicates, count) →
// pack.json (header, then PackManifest) → archive entries = files[] → inflate every file
// with byte limits, sha256 and size → per-kind content checks. Nothing touches the disk
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
  /** Override some byte limits (tests; defaults are PACK_LIMITS). */
  limits?: Partial<PackReadLimits>
}

const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')
const fail = (problems: PackProblem[]): ReadPackResult => ({ ok: false, problems })
const UPDATE = 'Update Action Stations to install it.'

async function loadSource(source: PackSource, max: number): Promise<Buffer | PackProblem> {
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
function checkEntries(entries: RawZipEntry[], maxFiles: number): PackProblem[] {
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
    if (e.dir) continue
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

/** Open the zip with jszip and map each raw entry to its object (names must agree). */
async function openZip(
  buf: Buffer,
  entries: RawZipEntry[],
): Promise<Map<string, JSZip.JSZipObject> | PackProblem> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buf)
  } catch (e) {
    return { message: `The archive cannot be opened: ${(e as Error).message}` }
  }
  const objects = new Map<string, JSZip.JSZipObject>()
  for (const obj of Object.values(zip.files))
    if (!obj.dir) objects.set(obj.unsafeOriginalName ?? obj.name, obj)
  const names = entries.filter((e) => !e.dir).map((e) => e.name)
  if (objects.size !== names.length || names.some((n) => !objects.has(n)))
    return { message: 'The archive’s file table is inconsistent' }
  return objects
}

function checkHeader(data: unknown, appVersion: string): PackProblem | undefined {
  const header = PackManifestHeader.safeParse(data)
  if (!header.success)
    return { path: PACK_MANIFEST_FILE, message: 'formatVersion is missing or not a number' }
  const { formatVersion, minAppVersion } = header.data
  if (formatVersion > PACK_FORMAT_VERSION)
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
  objects: Map<string, JSZip.JSZipObject>,
  raw: Map<string, RawZipEntry>,
  budget: InflateBudget,
  appVersion: string,
): Promise<{ manifest: PackManifest; bytes: Buffer } | PackProblem[]> {
  const obj = objects.get(PACK_MANIFEST_FILE)
  if (!obj)
    return [{ path: PACK_MANIFEST_FILE, message: 'missing: a pack has pack.json at its root' }]
  const bytes = await inflateEntry(
    obj,
    raw.get(PACK_MANIFEST_FILE)!,
    budget.limits.maxManifestBytes,
    budget,
  )
  if (!Buffer.isBuffer(bytes)) return [bytes]
  let data: unknown
  try {
    data = JSON.parse(bytes.toString('utf8'))
  } catch (e) {
    return [{ path: PACK_MANIFEST_FILE, message: `not valid JSON: ${(e as Error).message}` }]
  }
  const header = checkHeader(data, appVersion)
  if (header) return [header]
  const parsed = PackManifest.safeParse(data)
  if (parsed.success) return { manifest: parsed.data, bytes }
  return parsed.error.issues.map((i) => ({
    path: PACK_MANIFEST_FILE,
    message: `${i.path.length ? `${i.path.join('.')}: ` : ''}${i.message}`,
  }))
}

function compareEntries(
  manifest: PackManifest,
  objects: Map<string, JSZip.JSZipObject>,
): PackProblem[] {
  const listed = new Set(manifest.files.map((f) => f.path))
  const problems: PackProblem[] = []
  for (const name of objects.keys())
    if (name !== PACK_MANIFEST_FILE && !listed.has(name))
      problems.push({ path: name, message: 'in the archive but not listed in pack.json files' })
  for (const f of manifest.files)
    if (!objects.has(f.path))
      problems.push({
        path: f.path,
        message: 'listed in pack.json files but missing from the archive',
      })
  return problems
}

async function readFiles(
  manifest: PackManifest,
  objects: Map<string, JSZip.JSZipObject>,
  raw: Map<string, RawZipEntry>,
  budget: InflateBudget,
): Promise<Map<string, Buffer> | PackProblem[]> {
  const files = new Map<string, Buffer>()
  const problems: PackProblem[] = []
  for (const f of manifest.files) {
    const bytes = await inflateEntry(
      objects.get(f.path)!,
      raw.get(f.path)!,
      budget.limits.maxFileBytes,
      budget,
    )
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
  const objects = await openZip(buf, entries)
  if (!(objects instanceof Map)) return fail([objects])
  const raw = new Map(entries.filter((e) => !e.dir).map((e) => [e.name, e]))
  const budget: InflateBudget = { total: 0, limits }
  const read = await readManifest(objects, raw, budget, opts.appVersion)
  if (Array.isArray(read)) return fail(read)
  const { manifest } = read
  const mismatch = compareEntries(manifest, objects)
  if (mismatch.length) return fail(mismatch)
  const files = await readFiles(manifest, objects, raw, budget)
  if (Array.isArray(files)) return fail(files)
  const content = checkPackContent(manifest, files, opts.builtins ?? (await loadBuiltins()))
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
