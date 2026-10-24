// Example-project catalog (#169): `<folder>/<slug>/example.json` + `project/`.
// The app's own examples ship in its bundled domain packs (ADR-0020): an enabled bundled pack
// lists them like an installed pack (#266), from app-resources/packs/<id>/examples/<slug>/
// (packaged) or the repo's examples/ folder (unpackaged). Every pack example is addressed by
// { slug, packId }; a bare { slug } finds the enabled bundled pack that has it.
// TTX_EXAMPLES_DIR (tests, e2e) lists a plain folder of examples instead of the bundled ones.
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { ExampleManifest, type ExampleInfo } from '@shared/ipc/examples'
import { SafeId } from '@shared/schemas/common'
import { AppError, toAppError } from '../lib/errors'
import { exists, readJson, safeJoin } from '../lib/fs'
import {
  bundledPacks,
  contentPacks,
  packById,
  packItemPath,
  type InstalledPack,
} from '../packs/layers'

export const MANIFEST_FILE = 'example.json'
export const PROJECT_DIR = 'project'

/** A plain examples folder (TTX_EXAMPLES_DIR, tests and e2e), or undefined: bundled packs. */
export function examplesDir(): string | undefined {
  return process.env.TTX_EXAMPLES_DIR ? resolve(process.env.TTX_EXAMPLES_DIR) : undefined
}

/** The folder of one example; the slug must be a SafeId naming a real directory. */
export async function exampleFolder(slug: string, dir: string): Promise<string> {
  if (!SafeId.safeParse(slug).success) throw new AppError('VALIDATION', `Invalid example: ${slug}`)
  const folder = safeJoin(dir, slug)
  const stat = await fs.lstat(folder).catch(() => null)
  if (!stat?.isDirectory()) throw new AppError('NOT_FOUND', `No example named ${slug}`)
  return folder
}

/** Read and validate one example's manifest. */
export async function readManifest(slug: string, dir: string): Promise<ExampleManifest> {
  const folder = await exampleFolder(slug, dir)
  return readJson(join(folder, MANIFEST_FILE), ExampleManifest)
}

async function listOne(slug: string, dir: string): Promise<ExampleInfo | null> {
  try {
    const manifest = await readManifest(slug, dir)
    if (!(await exists(join(dir, slug, PROJECT_DIR, 'project.json'))))
      throw new AppError('NOT_FOUND', `${slug} has no ${PROJECT_DIR}/project.json`)
    return { ...manifest, slug }
  } catch (err) {
    console.warn(`[examples] skipping ${slug}: ${toAppError(err).message}`)
    return null
  }
}

const byTitle = (a: ExampleInfo, b: ExampleInfo): number => a.title.localeCompare(b.title)

/** Every valid example of a folder, ordered by title. Folders without a valid manifest are skipped. */
export async function listExamples(dir: string): Promise<ExampleInfo[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const slugs = entries
    .filter((e) => e.isDirectory() && SafeId.safeParse(e.name).success)
    .map((e) => e.name)
  const found = await Promise.all(slugs.map((s) => listOne(s, dir)))
  return found.filter((e): e is ExampleInfo => e !== null).sort(byTitle)
}

/** Which example to open: one of an enabled pack (installed or bundled), or by slug alone. */
export interface ExampleRef {
  slug: string
  packId?: string | undefined
}

/** An example's folder (holding example.json and project/), its manifest and its pack. */
export interface ResolvedExample {
  slug: string
  folder: string
  manifest: ExampleManifest
  pack?: InstalledPack
}

function packFolder(pack: InstalledPack, slug: string): string {
  if (!SafeId.safeParse(slug).success) throw new AppError('VALIDATION', `Invalid example: ${slug}`)
  return packItemPath(pack, 'examples', slug)
}

/** The enabled bundled pack that ships example `slug` (a ref without packId). */
const bundledExamplePack = (slug: string): InstalledPack | undefined =>
  bundledPacks().find((p) => p.enabled !== false && p.manifest.contents.examples.includes(slug))

/**
 * Find an example; a pack example needs its pack installed (or bundled) and enabled. A ref
 * without packId names an example of the `dir` folder (TTX_EXAMPLES_DIR), else of an enabled
 * bundled pack. Throws NOT_FOUND.
 */
export async function resolveExample(
  ref: ExampleRef,
  dir: string | undefined = examplesDir(),
): Promise<ResolvedExample> {
  const { slug } = ref
  let packId = ref.packId
  if (packId === undefined && dir !== undefined) {
    const folder = await exampleFolder(slug, dir)
    return { slug, folder, manifest: await readManifest(slug, dir) }
  }
  packId ??= bundledExamplePack(slug)?.id
  if (packId === undefined) throw new AppError('NOT_FOUND', `No example named ${slug}`)
  const pack = packById(packId)
  if (!pack) throw new AppError('NOT_FOUND', `Pack ${packId} is not installed or is disabled`)
  const folder = packFolder(pack, slug)
  const manifest = await readJson(join(folder, MANIFEST_FILE), ExampleManifest)
  return { slug, folder, manifest, pack }
}

/** The gallery fields of a pack example: where it comes from and under which license. */
export const packFields = (
  pack: InstalledPack,
): Pick<ExampleInfo, 'packId' | 'packVersion' | 'packName' | 'packLicense' | 'bundled'> => ({
  packId: pack.id,
  packVersion: pack.version,
  packName: pack.name,
  packLicense: pack.manifest.license,
  ...(pack.bundled ? { bundled: true } : {}),
})

async function listPackOne(pack: InstalledPack, slug: string): Promise<ExampleInfo | null> {
  try {
    const { folder, manifest } = await resolveExample({ slug, packId: pack.id })
    if (!(await exists(join(folder, PROJECT_DIR, 'project.json'))))
      throw new AppError('NOT_FOUND', `${slug} has no ${PROJECT_DIR}/project.json`)
    return { ...manifest, slug, ...packFields(pack) }
  } catch (err) {
    console.warn(`[examples] skipping ${pack.id}/${slug}: ${toAppError(err).message}`)
    return null
  }
}

/**
 * The examples of every enabled installed pack and enabled bundled pack (invalid ones skipped
 * and logged). With a TTX_EXAMPLES_DIR folder, that folder stands in for the bundled ones.
 */
export async function listPackExamples(): Promise<ExampleInfo[]> {
  const packs = contentPacks().filter((p) => !(p.bundled && examplesDir()))
  const items = packs.flatMap((pack) => pack.manifest.contents.examples.map((id) => ({ pack, id })))
  const found = await Promise.all(items.map((i) => listPackOne(i.pack, i.id)))
  return found.filter((e): e is ExampleInfo => e !== null)
}

/** The gallery: the examples folder (tests) plus those of enabled packs, ordered by title. */
export async function listAllExamples(dir = examplesDir()): Promise<ExampleInfo[]> {
  const [builtin, fromPacks] = await Promise.all([
    dir ? listExamples(dir) : Promise.resolve([]),
    listPackExamples(),
  ])
  return [...builtin, ...fromPacks].sort(
    (a, b) => byTitle(a, b) || (a.packId ?? '').localeCompare(b.packId ?? ''),
  )
}
