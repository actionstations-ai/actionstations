// Re-verify an installed pack folder against its registry entry (#260). At startup every
// entry gets the quick check (pack.json parses and matches the entry's content hash, every
// listed file exists with its size and stays inside the folder, small files are re-hashed);
// packs:verify runs the deep check (every file re-hashed). A pack that fails is "broken":
// listed on the Packs screen, never loaded into a layer.
import { createHash } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import { isAbsolute, relative, sep } from 'node:path'
import { DomainProfile } from '@shared/domains'
import {
  PACK_MANIFEST_FILE,
  PackManifest,
  type PackManifest as PackManifestT,
  type PackRegistryEntry,
} from '@shared/schemas/pack'
import { safeJoin } from '../lib/fs'
import { contentSha256 } from './reader'

/** Files up to this size are re-hashed by the quick (startup) check. */
export const QUICK_HASH_MAX_BYTES = 256 * 1024

export type VerifiedInstall =
  { ok: true; manifest: PackManifestT; domains: DomainProfile[] } | { ok: false; problem: string }

const inside = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

async function readManifest(dir: string): Promise<PackManifestT | string> {
  let raw: string
  try {
    raw = await fs.readFile(safeJoin(dir, PACK_MANIFEST_FILE), 'utf8')
  } catch {
    return 'The pack folder or its pack.json is missing'
  }
  try {
    const parsed = PackManifest.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
  } catch {
    // fall through
  }
  return 'pack.json in the pack folder is damaged'
}

async function checkFile(
  realDir: string,
  dir: string,
  file: { path: string; sha256: string; size: number },
  deep: boolean,
): Promise<string | undefined> {
  const abs = safeJoin(dir, ...file.path.split('/'))
  const st = await fs.lstat(abs).catch(() => null)
  if (!st) return `${file.path} is missing`
  if (!st.isFile()) return `${file.path} is not a regular file`
  if (!inside(realDir, await fs.realpath(abs))) return `${file.path} is outside the pack folder`
  if (st.size !== file.size) return `${file.path} changed size`
  if ((deep || file.size <= QUICK_HASH_MAX_BYTES) && (await hashFile(abs)) !== file.sha256)
    return `${file.path} changed since it was installed`
  return undefined
}

async function readDomains(
  dir: string,
  manifest: PackManifestT,
): Promise<DomainProfile[] | string> {
  const out: DomainProfile[] = []
  for (const id of manifest.contents.domains) {
    try {
      const raw = await fs.readFile(safeJoin(dir, 'domains', `${id}.json`), 'utf8')
      out.push(DomainProfile.parse(JSON.parse(raw)))
    } catch {
      return `domains/${id}.json cannot be read`
    }
  }
  return out
}

/**
 * Check a pack folder against its pack.json: every listed file exists with its size, is a
 * regular file inside the folder, and (small files, or all with `deep`) has its sha256; then
 * read its domain profiles. Never throws. Bundled packs (ADR-0020) use this directly.
 */
export async function verifyPackFolder(
  dir: string,
  manifest: PackManifestT,
  opts: { deep?: boolean } = {},
): Promise<VerifiedInstall> {
  try {
    const realDir = await fs.realpath(dir)
    for (const f of manifest.files) {
      const problem = await checkFile(realDir, dir, f, !!opts.deep)
      if (problem) return { ok: false, problem }
    }
    const domains = await readDomains(dir, manifest)
    if (typeof domains === 'string') return { ok: false, problem: domains }
    return { ok: true, manifest, domains }
  } catch (e) {
    return { ok: false, problem: `The pack folder cannot be read: ${(e as Error).message}` }
  }
}

/** Read and parse pack.json of a pack folder; a string says what is wrong. */
export const readFolderManifest = (dir: string): Promise<PackManifestT | string> =>
  readManifest(dir)

/** Check one installed pack folder against its registry entry. Never throws. */
export async function verifyInstall(
  dir: string,
  entry: PackRegistryEntry,
  opts: { deep?: boolean } = {},
): Promise<VerifiedInstall> {
  const manifest = await readManifest(dir)
  if (typeof manifest === 'string') return { ok: false, problem: manifest }
  if (manifest.id !== entry.id || manifest.version !== entry.version)
    return { ok: false, problem: 'pack.json does not match the installed id and version' }
  if (contentSha256(manifest.files) !== entry.contentSha256)
    return { ok: false, problem: 'pack.json changed since the pack was installed' }
  return verifyPackFolder(dir, manifest, opts)
}
