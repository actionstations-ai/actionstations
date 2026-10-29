// Writes an .asexercise bundle (spec 0440, docs/exercise-bundle-format.md): validates the
// content with the strict schemas, refuses any path outside the allow-list, lists every file in
// bundle.json with its sha256, signs the canonical bundle.json and zips deterministically.
import { createHash } from 'node:crypto'
import {
  EXERCISE_FORMAT,
  EXERCISE_FORMAT_VERSION,
  ExerciseBundleManifest,
  Frame,
  Slice,
  type BundleKind,
} from '@shared/schemas/regional'
import { zipTree } from '../packs/archive'
import {
  BUNDLE_FILE,
  FRAME_FILE,
  SIGNATURE_FILE,
  ShareError,
  assertShareable,
  sliceFile,
} from './allowlist'
import { canonicalJson } from './canonical'
import { signBytes } from './keys'

export interface BundleSigner {
  /** base64 PKCS#8 DER. */
  privateKey: string
  /** base64 SPKI DER. */
  publicKey: string
}

export interface BundleInput {
  kind: BundleKind
  exerciseId: string
  title: string
  frameVersion: number
  final?: boolean
  appVersion: string
  from: ExerciseBundleManifest['from']
  frame?: unknown
  /** Slices by organization prefix. */
  slices?: ReadonlyMap<string, unknown>
  /** Bundle path → bytes, for every asset the injects name. */
  media?: ReadonlyMap<string, Buffer>
  createdAt?: string
}

export interface WrittenBundle {
  buffer: Buffer
  sha256: string
  manifest: ExerciseBundleManifest
}

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
const json = (v: unknown): Buffer => Buffer.from(JSON.stringify(v, null, 2) + '\n', 'utf8')

function checkShape(input: BundleInput): void {
  const slices = input.slices?.size ?? 0
  const hasFrame = input.frame !== undefined
  if (input.kind === 'frame' && (!hasFrame || slices > 0))
    throw new ShareError('A frame bundle holds the frame and no slices')
  if (input.kind === 'slice' && (hasFrame || slices !== 1))
    throw new ShareError('A slice bundle holds exactly one slice and no frame')
  if (input.kind === 'merged' && (!hasFrame || slices < 1))
    throw new ShareError('A merged bundle holds the frame and every slice')
}

/** Every media path a slice's injects name must be in the bundle, and the reverse. */
function checkMedia(slices: Map<string, Slice>, media: ReadonlyMap<string, Buffer>): void {
  const named = new Set<string>()
  for (const s of slices.values())
    for (const i of s.injects) for (const a of i.assets) named.add(a.path)
  for (const p of named) if (!media.has(p)) throw new ShareError(`Missing media file ${p}`)
  for (const p of media.keys())
    if (!named.has(p)) throw new ShareError(`Media file ${p} is not used by any inject`)
}

export async function writeBundle(
  input: BundleInput,
  signer: BundleSigner,
): Promise<WrittenBundle> {
  checkShape(input)
  const entries = new Map<string, Buffer>()
  if (input.frame !== undefined) entries.set(FRAME_FILE, json(Frame.parse(input.frame)))
  const parsedSlices = new Map<string, Slice>()
  const revisions: Record<string, number> = {}
  for (const [prefix, raw] of input.slices ?? []) {
    const slice = Slice.parse(raw)
    parsedSlices.set(prefix, slice)
    revisions[slice.orgId] = slice.revision
    entries.set(sliceFile(prefix), json(slice))
  }
  const media = input.media ?? new Map<string, Buffer>()
  checkMedia(parsedSlices, media)
  for (const [path, bytes] of media) entries.set(path, bytes)
  assertShareable(entries.keys())

  const manifest = ExerciseBundleManifest.parse({
    format: EXERCISE_FORMAT,
    formatVersion: EXERCISE_FORMAT_VERSION,
    kind: input.kind,
    exerciseId: input.exerciseId,
    title: input.title,
    from: input.from,
    frameVersion: input.frameVersion,
    sliceRevisions: revisions,
    final: input.final ?? false,
    createdAt: input.createdAt ?? new Date().toISOString(),
    minAppVersion: input.appVersion,
    files: [...entries].map(([path, b]) => ({ path, sha256: sha(b), size: b.length })),
  })
  entries.set(BUNDLE_FILE, json(manifest))
  const signature = signBytes(signer.privateKey, Buffer.from(canonicalJson(manifest)))
  entries.set(SIGNATURE_FILE, json({ alg: 'ed25519', publicKey: signer.publicKey, signature }))
  const buffer = await zipTree(entries)
  return { buffer, sha256: sha(buffer), manifest }
}
