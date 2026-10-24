// Rebuild registry entries from the pack folders on disk (#260): when registry.json is missing
// or damaged, installed packs are not thrown away. Each userData/packs/<id>/<version>/ whose
// pack.json parses and whose files pass the quick check becomes an entry with source
// "unknown", archive sha256 "unknown" and enabled = false (the user re-enables it). When one
// id has several valid versions, the highest is kept; the others stay on disk until a start
// with a cleanly read registry removes them.
import { promises as fs } from 'node:fs'
import {
  PACK_MANIFEST_FILE,
  PackId,
  PackManifest,
  SemVer,
  compareSemver,
  type PackRegistryEntry,
} from '@shared/schemas/pack'
import { safeJoin } from '../lib/fs'
import { loadBuiltins, type PackBuiltins } from './builtins'
import { checkPackContent } from './content'
import { contentSha256 } from './reader'
import { packIdDir, packVersionDir, packsRoot } from './registry'
import { verifyInstall } from './verify'

async function subdirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

async function readManifest(dir: string): Promise<PackManifest | undefined> {
  try {
    const raw = await fs.readFile(safeJoin(dir, PACK_MANIFEST_FILE), 'utf8')
    const parsed = PackManifest.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/** The review item list, recomputed from the installed files (empty if that fails). */
async function itemsOf(
  dir: string,
  manifest: PackManifest,
  builtins: PackBuiltins,
): Promise<PackRegistryEntry['items']> {
  try {
    const files = new Map<string, Buffer>()
    for (const f of manifest.files)
      files.set(f.path, await fs.readFile(safeJoin(dir, ...f.path.split('/'))))
    const { problems, items } = checkPackContent(manifest, files, builtins)
    return problems.length ? [] : items
  } catch {
    return []
  }
}

async function entryFor(
  id: string,
  version: string,
  builtins: () => Promise<PackBuiltins>,
): Promise<PackRegistryEntry | undefined> {
  const dir = packVersionDir(id, version)
  const manifest = await readManifest(dir)
  if (!manifest || manifest.id !== id || manifest.version !== version) return undefined
  const st = await fs.stat(dir)
  const entry: PackRegistryEntry = {
    id,
    version,
    enabled: false,
    installedAt: st.mtime.toISOString(),
    source: { kind: 'unknown' },
    archiveSha256: 'unknown',
    contentSha256: contentSha256(manifest.files),
    items: [],
  }
  if (!(await verifyInstall(dir, entry)).ok) return undefined
  return { ...entry, items: await itemsOf(dir, manifest, await builtins()) }
}

/** One disabled entry per pack id found on disk (highest valid version), sorted by id. */
export async function rebuildEntries(): Promise<PackRegistryEntry[]> {
  let cached: Promise<PackBuiltins> | undefined
  const builtins = () => (cached ??= loadBuiltins())
  const out: PackRegistryEntry[] = []
  for (const id of (await subdirs(packsRoot())).sort()) {
    if (!PackId.safeParse(id).success) continue
    const versions = (await subdirs(packIdDir(id)))
      .filter((v) => SemVer.safeParse(v).success)
      .sort((a, b) => compareSemver(b, a))
    for (const version of versions) {
      const entry = await entryFor(id, version, builtins)
      if (entry) {
        out.push(entry)
        break
      }
    }
  }
  return out
}
