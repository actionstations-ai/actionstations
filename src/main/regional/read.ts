// Opens and verifies an .asexercise bundle (spec 0440). Reuses the pack archive rules: one
// reading of the zip (zip.ts), the pack path rules, entry and byte limits (reader.ts). Order:
// archive size → zip layout → entry names → manifest schema → signature → signer fingerprint →
// archive entries = manifest files → every file's size and sha256 → per-file schemas.
// Pinning (is this the key we expect?) is a separate step: pinning.ts.
import { createHash } from 'node:crypto'
import { isAppCompatible, type PackProblem } from '@shared/schemas/pack'
import {
  BundleSignature,
  EXERCISE_FORMAT_VERSION,
  ExerciseBundleManifest,
  Frame,
  Slice,
} from '@shared/schemas/regional'
import { checkEntries, crossCheckJszip, loadSource, type PackSource } from '../packs/reader'
import {
  DEFAULT_READ_LIMITS,
  ZipFormatError,
  inflateEntry,
  scanCentralDirectory,
  type InflateBudget,
  type PackReadLimits,
  type RawZipEntry,
} from '../packs/zip'
import { BUNDLE_FILE, FRAME_FILE, SIGNATURE_FILE, classifyPath, sliceFile } from './allowlist'
import { canonicalJson } from './canonical'
import { fingerprintOf, verifyBytes } from './keys'

/** 8 organizations x 1000 rows stay far below this; a bundle is mostly media. */
export const BUNDLE_LIMITS: PackReadLimits = {
  ...DEFAULT_READ_LIMITS,
  maxArchiveBytes: 500 * 1024 * 1024,
  maxFiles: 5000,
}

export interface VerifiedBundle {
  manifest: ExerciseBundleManifest
  signature: BundleSignature
  /** Fingerprint of the key that signed (equals manifest.from.fingerprint). */
  signerFingerprint: string
  frame?: Frame
  /** By organization prefix. */
  slices: ReadonlyMap<string, Slice>
  media: ReadonlyMap<string, Buffer>
  archiveSha256: string
}

export type ReadBundleResult =
  { ok: true; bundle: VerifiedBundle } | { ok: false; problems: PackProblem[] }

export interface ReadBundleOptions {
  appVersion: string
  limits?: Partial<PackReadLimits>
}

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
const fail = (...problems: PackProblem[]): ReadBundleResult => ({ ok: false, problems })
const issues = (path: string, error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues.map((i) => ({
    path,
    message: `${i.path.length ? `${i.path.map(String).join('.')}: ` : ''}${i.message}`,
  }))

async function readJsonEntry(
  buf: Buffer,
  raw: Map<string, RawZipEntry>,
  path: string,
  budget: InflateBudget,
): Promise<{ value: unknown; bytes: Buffer } | PackProblem> {
  const entry = raw.get(path)
  if (!entry) return { path, message: 'missing from the archive' }
  const bytes = await inflateEntry(buf, entry, budget.limits.maxManifestBytes, budget)
  if (!Buffer.isBuffer(bytes)) return bytes
  try {
    return { value: JSON.parse(bytes.toString('utf8')) as unknown, bytes }
  } catch (e) {
    return { path, message: `not valid JSON: ${(e as Error).message}` }
  }
}

const isProblem = (v: unknown): v is PackProblem => !!v && typeof v === 'object' && 'message' in v

async function readManifest(
  buf: Buffer,
  raw: Map<string, RawZipEntry>,
  budget: InflateBudget,
  appVersion: string,
): Promise<{ manifest: ExerciseBundleManifest; signature: BundleSignature } | PackProblem[]> {
  const m = await readJsonEntry(buf, raw, BUNDLE_FILE, budget)
  if (isProblem(m)) return [m]
  const version = (m.value as { formatVersion?: unknown } | null)?.formatVersion
  if (typeof version === 'number' && version > EXERCISE_FORMAT_VERSION)
    return [
      {
        path: BUNDLE_FILE,
        message: `This bundle needs a newer version of Action Stations (bundle format ${version}). Update the app to open it.`,
      },
    ]
  const manifest = ExerciseBundleManifest.safeParse(m.value)
  if (!manifest.success) return issues(BUNDLE_FILE, manifest.error)
  if (!isAppCompatible(manifest.data.minAppVersion, appVersion))
    return [
      {
        path: BUNDLE_FILE,
        message: `This bundle needs Action Stations ${manifest.data.minAppVersion} or later (this is ${appVersion}). Update the app to open it.`,
      },
    ]
  const s = await readJsonEntry(buf, raw, SIGNATURE_FILE, budget)
  if (isProblem(s)) return [s]
  const signature = BundleSignature.safeParse(s.value)
  if (!signature.success) return issues(SIGNATURE_FILE, signature.error)
  return { manifest: manifest.data, signature: signature.data }
}

/** The signature covers the canonical manifest; the signer's fingerprint must be the one it names. */
function checkSignature(
  manifest: ExerciseBundleManifest,
  signature: BundleSignature,
): PackProblem[] {
  const ok = verifyBytes(
    signature.publicKey,
    Buffer.from(canonicalJson(manifest)),
    signature.signature,
  )
  if (!ok)
    return [
      {
        path: SIGNATURE_FILE,
        message:
          'The signature is not valid: the bundle was changed or is not signed by the key it names',
      },
    ]
  if (fingerprintOf(signature.publicKey) !== manifest.from.fingerprint)
    return [
      {
        path: SIGNATURE_FILE,
        message: 'The signing key does not match the fingerprint in bundle.json',
      },
    ]
  return []
}

function checkListing(
  manifest: ExerciseBundleManifest,
  raw: Map<string, RawZipEntry>,
): PackProblem[] {
  const problems: PackProblem[] = []
  const listed = new Set<string>()
  for (const f of manifest.files) {
    if (listed.has(f.path)) problems.push({ path: f.path, message: 'listed twice in bundle.json' })
    listed.add(f.path)
    if (!classifyPath(f.path) || f.path === BUNDLE_FILE || f.path === SIGNATURE_FILE)
      problems.push({ path: f.path, message: 'not a file an exercise bundle may contain' })
    else if (!raw.has(f.path))
      problems.push({ path: f.path, message: 'listed in bundle.json but missing from the archive' })
  }
  for (const name of raw.keys()) {
    if (name === BUNDLE_FILE || name === SIGNATURE_FILE) continue
    if (!classifyPath(name))
      problems.push({ path: name, message: 'not a file an exercise bundle may contain' })
    else if (!listed.has(name))
      problems.push({ path: name, message: 'in the archive but not listed in bundle.json' })
  }
  return problems
}

async function readFiles(
  buf: Buffer,
  manifest: ExerciseBundleManifest,
  raw: Map<string, RawZipEntry>,
  budget: InflateBudget,
): Promise<Map<string, Buffer> | PackProblem[]> {
  const files = new Map<string, Buffer>()
  const problems: PackProblem[] = []
  for (const f of manifest.files) {
    const bytes = await inflateEntry(buf, raw.get(f.path)!, budget.limits.maxFileBytes, budget)
    if (!Buffer.isBuffer(bytes)) return [...problems, bytes]
    if (bytes.length !== f.size)
      problems.push({
        path: f.path,
        message: `size is ${bytes.length} bytes; bundle.json says ${f.size}`,
      })
    else if (sha(bytes) !== f.sha256)
      problems.push({ path: f.path, message: 'sha256 does not match bundle.json' })
    files.set(f.path, bytes)
  }
  return problems.length ? problems : files
}

function parseJsonFile<S extends { safeParse(v: unknown): { success: boolean } }>(
  path: string,
  bytes: Buffer,
  schema: S,
): { data: unknown } | PackProblem[] {
  let value: unknown
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch (e) {
    return [{ path, message: `not valid JSON: ${(e as Error).message}` }]
  }
  const parsed = schema.safeParse(value) as
    | { success: true; data: unknown }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } }
  return parsed.success ? { data: parsed.data } : issues(path, parsed.error)
}

/** Per-file schema checks and the rules that tie files to the manifest. */
function checkContent(
  manifest: ExerciseBundleManifest,
  files: Map<string, Buffer>,
): { frame?: Frame; slices: Map<string, Slice> } | PackProblem[] {
  const problems: PackProblem[] = []
  let frame: Frame | undefined
  const slices = new Map<string, Slice>()
  const frameBytes = files.get(FRAME_FILE)
  if (frameBytes) {
    const r = parseJsonFile(FRAME_FILE, frameBytes, Frame)
    if (Array.isArray(r)) problems.push(...r)
    else frame = r.data as Frame
  }
  for (const [path, bytes] of files) {
    const c = classifyPath(path)
    if (c?.type !== 'slice') continue
    const r = parseJsonFile(path, bytes, Slice)
    if (Array.isArray(r)) problems.push(...r)
    else slices.set(c.prefix, r.data as Slice)
  }
  if (problems.length) return problems
  problems.push(...checkKind(manifest, frame, slices, files))
  return problems.length ? problems : { frame, slices }
}

function checkKind(
  manifest: ExerciseBundleManifest,
  frame: Frame | undefined,
  slices: Map<string, Slice>,
  files: Map<string, Buffer>,
): PackProblem[] {
  const problems: PackProblem[] = []
  const { kind, from } = manifest
  if (kind !== 'slice' && !frame)
    problems.push({ path: FRAME_FILE, message: `A ${kind} bundle needs frame.json` })
  if (kind === 'frame' && slices.size) problems.push({ message: 'A frame bundle holds no slices' })
  if (kind === 'slice') {
    if (frame) problems.push({ path: FRAME_FILE, message: 'A slice bundle holds no frame' })
    if (slices.size !== 1 || !slices.has(from.prefix))
      problems.push({
        path: sliceFile(from.prefix),
        message: 'A slice bundle holds exactly the sender’s slice',
      })
  }
  if (kind === 'merged' && slices.size < 1)
    problems.push({ message: 'A merged bundle needs at least one slice' })
  for (const [prefix, slice] of slices) {
    if (frame && frame.orgs.find((o) => o.orgId === slice.orgId)?.prefix !== prefix)
      problems.push({
        path: sliceFile(prefix),
        message: 'slice belongs to a different organization than its file name',
      })
    if (manifest.sliceRevisions[slice.orgId] !== slice.revision)
      problems.push({ path: sliceFile(prefix), message: 'revision differs from bundle.json' })
    for (const i of slice.injects)
      for (const a of i.assets)
        if (!files.has(a.path) || classifyPath(a.path)?.type !== 'media')
          problems.push({
            path: sliceFile(prefix),
            message: `inject ${i.id}: media ${a.path} is not in the bundle`,
          })
  }
  return problems
}

/** Open and fully verify a bundle. Never throws for a bad bundle; problems describe it. */
export async function readBundle(
  source: PackSource,
  opts: ReadBundleOptions,
): Promise<ReadBundleResult> {
  const limits: PackReadLimits = { ...BUNDLE_LIMITS, ...opts.limits }
  const buf = await loadSource(source, limits.maxArchiveBytes)
  if (!Buffer.isBuffer(buf)) return fail(buf)
  let entries: RawZipEntry[]
  try {
    entries = scanCentralDirectory(buf)
  } catch (e) {
    if (e instanceof ZipFormatError) return fail({ message: `${e.message}.` })
    throw e
  }
  const entryProblems = checkEntries(entries, limits.maxFiles)
  if (entryProblems.length) return fail(...entryProblems)
  const disagreement = await crossCheckJszip(buf, entries)
  if (disagreement) return fail(disagreement)
  const raw = new Map(entries.filter((e) => !e.dir).map((e) => [e.name, e]))
  const budget: InflateBudget = { total: 0, limits }
  const head = await readManifest(buf, raw, budget, opts.appVersion)
  if (Array.isArray(head)) return fail(...head)
  const sig = checkSignature(head.manifest, head.signature)
  if (sig.length) return fail(...sig)
  const listing = checkListing(head.manifest, raw)
  if (listing.length) return fail(...listing)
  const files = await readFiles(buf, head.manifest, raw, budget)
  if (Array.isArray(files)) return fail(...files)
  const content = checkContent(head.manifest, files)
  if (Array.isArray(content)) return fail(...content)
  const media = new Map([...files].filter(([p]) => classifyPath(p)?.type === 'media'))
  return {
    ok: true,
    bundle: {
      manifest: head.manifest,
      signature: head.signature,
      signerFingerprint: fingerprintOf(head.signature.publicKey),
      ...(content.frame ? { frame: content.frame } : {}),
      slices: content.slices,
      media,
      archiveSha256: sha(buf),
    },
  }
}
