// Open an example (#169): copy `examples/<slug>/project` to a new folder the user owns, mark
// it with `.example.json` (the banner text) and open the copy. Never overwrites a folder:
// the target name is claimed with a non-recursive mkdir, which fails if anything is there.
// Pack examples (#266) are copied the same way from the installed (read-only) pack folder; the
// marker records the pack, and a pack domain is snapshotted into the copy.
import { promises as fs } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { OpenProject } from '@shared/schemas'
import { ExampleMarker, type ExampleManifest } from '@shared/ipc/examples'
import { AppError } from '../lib/errors'
import { ensureDir, slugify, writeJsonAtomic } from '../lib/fs'
import { documentsDir } from '../lib/paths'
import { defaultProjectsDir } from '../lib/rename-migration'
import { newId, nowIso } from '../lib/ids'
import { getSettings } from '../settings/store'
import { isDerivedPath } from '../project/duplicate'
import { openProject, PROJECT_EXT, updateProject } from '../project/store'
import { ensureIndex } from '../project/ensure-index'
import { applyDomainSnapshot } from '../project/patch'
import type { InstalledPack } from '../packs/layers'
import { examplesDir, PROJECT_DIR, resolveExample, type ExampleRef } from './catalog'

export const MARKER_FILE = '.example.json'
const MAX_SUFFIX = 99

/** Where examples are copied when the request names no folder. */
export async function defaultExampleParent(): Promise<string> {
  const settings = await getSettings()
  if (settings.defaultProjectsDir) return settings.defaultProjectsDir
  return defaultProjectsDir(documentsDir())
}

/**
 * Claim `<parent>/<slug(title)>.asproj`, else `-2`, `-3`… The returned folder was created
 * empty by this call, so nothing that existed before is ever written into.
 */
export async function claimFolder(
  parent: string,
  title: string,
): Promise<{ path: string; n: number }> {
  await ensureDir(parent)
  const base = slugify(title)
  for (let n = 1; n <= MAX_SUFFIX; n++) {
    const path = resolve(parent, `${base}${n === 1 ? '' : `-${n}`}${PROJECT_EXT}`)
    try {
      await fs.mkdir(path)
      return { path, n }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
  throw new AppError('CONFLICT', `Too many copies of "${title}" in ${parent}`)
}

/** Copy filter: no derived data, no marker from the source, no symlinks (they could point out). */
export async function shouldCopy(sourceRoot: string, src: string): Promise<boolean> {
  if (src === sourceRoot) return true
  const rel = relative(sourceRoot, src)
  if (isDerivedPath(rel) || rel === MARKER_FILE) return false
  const stat = await fs.lstat(src)
  return stat.isDirectory() || stat.isFile()
}

export function markerFor(
  slug: string,
  manifest: ExampleManifest,
  pack?: Pick<InstalledPack, 'id' | 'version' | 'name'>,
): ExampleMarker {
  return ExampleMarker.parse({
    slug,
    title: manifest.title,
    notice: manifest.notice,
    domainProfile: manifest.domainProfile,
    ...(pack ? { packId: pack.id, packVersion: pack.version, packName: pack.name } : {}),
  })
}

/** Installed pack files are read-only (0444); the user's copy must be editable. */
async function makeWritable(dir: string): Promise<void> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const path = join(dir, e.name)
    if (e.isDirectory()) await makeWritable(path)
    else if (e.isFile()) {
      const { mode } = await fs.stat(path)
      if ((mode & 0o200) === 0) await fs.chmod(path, (mode & 0o777) | 0o200)
    }
  }
}

async function copyInto(source: string, target: string): Promise<void> {
  const stat = await fs.lstat(source).catch(() => null)
  if (!stat?.isDirectory()) throw new AppError('NOT_FOUND', `Example has no ${PROJECT_DIR} folder`)
  // The target folder exists (claimFolder made it), so copy entry by entry into it.
  for (const name of await fs.readdir(source)) {
    await fs.cp(join(source, name), join(target, name), {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: (src) => shouldCopy(source, src),
    })
  }
  await makeWritable(target)
}

/** Give the copy its own identity; a numbered folder gets a numbered name. */
async function rename(target: string, n: number): Promise<void> {
  const now = nowIso()
  await updateProject(target, (p) => {
    p.id = newId()
    if (n > 1) p.name = `${p.name} (${n})`
    p.archived = false
    p.createdAt = now
    // Privacy settings are chosen on this computer, never inherited from a copied example (#433).
    delete p.privacy
    // An example on a pack domain keeps a copy of the profile (ADR-0018, #263).
    applyDomainSnapshot(p)
  })
}

/** Copy a built-in example (`{ slug }`) or a pack example (`{ slug, packId }`) and open it. */
export async function openExample(
  ref: ExampleRef,
  parentDir?: string,
  dir: string | undefined = examplesDir(),
): Promise<OpenProject> {
  const { slug, folder, manifest, pack } = await resolveExample(ref, dir)
  const source = join(folder, PROJECT_DIR)
  const parent = resolve(parentDir ?? (await defaultExampleParent()))
  const { path: target, n } = await claimFolder(parent, manifest.title)
  try {
    await copyInto(source, target)
    await writeJsonAtomic(join(target, MARKER_FILE), markerFor(slug, manifest, pack))
    await rename(target, n)
  } catch (err) {
    await fs.rm(target, { recursive: true, force: true })
    throw err
  }
  const opened = await openProject(target)
  await ensureIndex(target, opened.project)
  return opened
}
