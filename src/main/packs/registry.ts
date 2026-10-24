// Installed-pack registry on disk (ADR-0018, #260): userData/packs/registry.json lists every
// installed pack ({ id, version, enabled, installedAt, source, archiveSha256, contentSha256,
// items }); the files live in userData/packs/<id>/<version>/. Written atomically (temp file +
// rename). A registry that cannot be parsed is moved aside, never overwritten in place, and
// the app starts with no packs.
import { promises as fs } from 'node:fs'
import {
  PACK_REGISTRY_VERSION,
  PackId,
  PackRegistry,
  SemVer,
  type PackRegistryEntry,
} from '@shared/schemas/pack'
import { AppError } from '../lib/errors'
import { safeJoin, writeJsonAtomic } from '../lib/fs'
import { userDataPath } from '../lib/paths'

export const packsRoot = (): string => userDataPath('packs')
export const registryPath = (): string => userDataPath('packs', 'registry.json')
/** userData/packs/.staging: downloads and extraction in progress (download.ts writes here too). */
export const packsStagingDir = (): string => userDataPath('packs', '.staging')

/** userData/packs/<id>/<version> for a valid id and version (refuses anything else). */
export function packVersionDir(id: string, version: string): string {
  if (!PackId.safeParse(id).success || !SemVer.safeParse(version).success)
    throw new AppError('VALIDATION', `Not a pack id and version: ${id} ${version}`)
  return safeJoin(packsRoot(), id, version)
}

/** userData/packs/<id> (all versions of one pack). */
export function packIdDir(id: string): string {
  if (!PackId.safeParse(id).success) throw new AppError('VALIDATION', `Not a pack id: ${id}`)
  return safeJoin(packsRoot(), id)
}

const empty = (): PackRegistry => ({
  registryVersion: PACK_REGISTRY_VERSION,
  packs: [],
  bundledDisabled: [],
})

/** The disabled bundled packs as last read or written (writeRegistry keeps them). */
let bundledDisabled: string[] = []

/**
 * How registry.json read: `clean` (parsed), `missing` (no file) or `damaged` (moved to
 * registry.json.damaged-<time>). Only a clean read may be used to delete unlisted folders.
 */
export type RegistryReadStatus = 'clean' | 'missing' | 'damaged'

export async function readRegistryState(): Promise<{
  registry: PackRegistry
  status: RegistryReadStatus
}> {
  let raw: string
  try {
    raw = await fs.readFile(registryPath(), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      bundledDisabled = []
      return { registry: empty(), status: 'missing' }
    }
    throw e
  }
  let parsed: ReturnType<typeof PackRegistry.safeParse>
  try {
    parsed = PackRegistry.safeParse(JSON.parse(raw))
  } catch {
    parsed = PackRegistry.safeParse(undefined)
  }
  if (parsed.success) {
    bundledDisabled = parsed.data.bundledDisabled
    return { registry: parsed.data, status: 'clean' }
  }
  bundledDisabled = []
  const aside = `${registryPath()}.damaged-${Date.now()}`
  await fs.rename(registryPath(), aside).catch(() => undefined)
  console.error(`[packs] registry.json could not be read; moved to ${aside}`)
  return { registry: empty(), status: 'damaged' }
}

/** Read registry.json; missing or damaged → empty (see readRegistryState). */
export async function readRegistry(): Promise<PackRegistry> {
  return (await readRegistryState()).registry
}

/**
 * Write the installed packs and the disabled bundled packs (default: unchanged since the last
 * read or write).
 */
export async function writeRegistry(
  packs: readonly PackRegistryEntry[],
  disabled: readonly string[] = bundledDisabled,
): Promise<void> {
  const registry = PackRegistry.parse({
    registryVersion: PACK_REGISTRY_VERSION,
    packs,
    bundledDisabled: [...new Set(disabled)].sort(),
  })
  await writeJsonAtomic(registryPath(), registry)
  bundledDisabled = registry.bundledDisabled
}

/** Bundled pack ids the user disabled, as last read or written. */
export const disabledBundledIds = (): readonly string[] => bundledDisabled
