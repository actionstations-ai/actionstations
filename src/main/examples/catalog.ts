// Example-project catalog (#169): `<resources>/examples/<slug>/example.json` + `project/`.
// Packaged builds read app-resources/examples (electron-builder extraResources); unpackaged
// runs read the repo's examples/ folder. TTX_EXAMPLES_DIR overrides both (tests, e2e).
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { ExampleManifest, type ExampleInfo } from '@shared/ipc/examples'
import { SafeId } from '@shared/schemas/common'
import { AppError, toAppError } from '../lib/errors'
import { exists, readJson, safeJoin } from '../lib/fs'
import { resourcePath } from '../lib/paths'

export const MANIFEST_FILE = 'example.json'
export const PROJECT_DIR = 'project'

export function examplesDir(): string {
  if (process.env.TTX_EXAMPLES_DIR) return resolve(process.env.TTX_EXAMPLES_DIR)
  return resourcePath('examples')
}

/** The folder of one example; the slug must be a SafeId naming a real directory. */
export async function exampleFolder(slug: string, dir = examplesDir()): Promise<string> {
  if (!SafeId.safeParse(slug).success) throw new AppError('VALIDATION', `Invalid example: ${slug}`)
  const folder = safeJoin(dir, slug)
  const stat = await fs.lstat(folder).catch(() => null)
  if (!stat?.isDirectory()) throw new AppError('NOT_FOUND', `No example named ${slug}`)
  return folder
}

/** Read and validate one example's manifest. */
export async function readManifest(slug: string, dir = examplesDir()): Promise<ExampleManifest> {
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

/** Every valid example, ordered by title. Folders without a valid manifest are skipped. */
export async function listExamples(dir = examplesDir()): Promise<ExampleInfo[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const slugs = entries
    .filter((e) => e.isDirectory() && SafeId.safeParse(e.name).success)
    .map((e) => e.name)
  const found = await Promise.all(slugs.map((s) => listOne(s, dir)))
  return found
    .filter((e): e is ExampleInfo => e !== null)
    .sort((a, b) => a.title.localeCompare(b.title))
}
