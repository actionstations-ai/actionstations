// In-memory view of the installed packs (#260), shared by the installer (install.ts), the
// read-only layer API (layers.ts) and the packs:* handlers. Every change goes through
// `withPacksLock` (one mutation at a time) and ends in `commitLoaded`, which recomputes
// conflicts, registers the enabled packs' domain profiles, and tells layers and the renderer.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { DomainProfile } from '@shared/domains'
import { PackId, type PackManifest, type PackRegistryEntry } from '@shared/schemas/pack'
import { setPackDomainProfiles } from '../domains/registry'
import { emit } from '../lib/events'
import {
  builtinDomainConflicts,
  conflictReason,
  findConflicts,
  type ConflictSubject,
  type PackConflict,
} from './conflicts'
import {
  packIdDir,
  packVersionDir,
  packsRoot,
  packsStagingDir,
  readRegistryState,
  writeRegistry,
} from './registry'
import { rebuildEntries } from './rebuild'
import { removeTree } from './tree'
import { verifyInstall } from './verify'

/** One registry entry with what was read from its folder. */
export interface LoadedPack {
  entry: PackRegistryEntry
  dir: string
  /** Undefined when the folder is missing or damaged (then `broken` says why). */
  manifest?: PackManifest
  domains: DomainProfile[]
  broken?: string
  /** For a pack that is not active: what an enabled pack (or a built-in) already provides. */
  conflicts: PackConflict[]
}

/** Enabled, not broken: the packs layers load. */
export const isActive = (p: LoadedPack): boolean => p.entry.enabled && !p.broken && !!p.manifest

export const subjectOf = (p: {
  entry: { id: string }
  manifest?: PackManifest
  domains: readonly DomainProfile[]
}): ConflictSubject | undefined =>
  p.manifest
    ? { id: p.entry.id, name: p.manifest.name, manifest: p.manifest, domains: p.domains }
    : undefined

let loaded: LoadedPack[] = []
let loadedFrom: string | undefined
let revision = 0
const listeners = new Set<() => void>()
let lock: Promise<unknown> = Promise.resolve()

/** Run `fn` after every earlier pack mutation has finished. */
export function withPacksLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn)
  lock = run.catch(() => undefined)
  return run
}

export const loadedPacks = (): readonly LoadedPack[] => loaded
export const packsRevision = (): number => revision

export function onLoadedChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Conflicts of `p` with the active packs other than itself, and with built-in domains. */
export function conflictsFor(
  p: { entry: { id: string }; manifest?: PackManifest; domains: readonly DomainProfile[] },
  among: readonly LoadedPack[] = loaded,
): PackConflict[] {
  const subject = subjectOf(p)
  if (!subject) return []
  const others = among
    .filter((o) => isActive(o) && o.entry.id !== p.entry.id)
    .map((o) => subjectOf(o)!)
  return [...builtinDomainConflicts(subject), ...findConflicts(subject, others)]
}

export const conflictText = (p: LoadedPack): string | undefined => conflictReason(p.conflicts)

function applyDomains(active: readonly LoadedPack[]): void {
  try {
    setPackDomainProfiles(
      active.flatMap((p) =>
        p.domains.map((profile) => ({
          profile,
          packId: p.entry.id,
          packVersion: p.entry.version,
          packName: p.manifest!.name,
        })),
      ),
    )
  } catch (e) {
    // The conflict checks run before a pack is enabled, so this means a bug, not bad input.
    console.error('[packs] domain profiles not registered:', (e as Error).message)
  }
}

/**
 * Replace the loaded set (sorted by id), recompute conflicts of the inactive packs, register
 * the active packs' domains and notify. Every install, enable, disable, update, uninstall and
 * load ends here.
 */
export function commitLoaded(next: readonly LoadedPack[]): void {
  const sorted = [...next].sort((a, b) => (a.entry.id < b.entry.id ? -1 : 1))
  for (const p of sorted) p.conflicts = isActive(p) ? [] : conflictsFor(p, sorted)
  loaded = sorted
  revision++
  const active = sorted.filter(isActive)
  applyDomains(active)
  for (const l of listeners) {
    try {
      l()
    } catch (e) {
      console.error('[packs] change listener failed:', e)
    }
  }
  emit('packs:changed', { installed: sorted.length, enabled: active.length })
}

/** Read one registry entry's folder (quick check). */
export async function loadEntry(entry: PackRegistryEntry): Promise<LoadedPack> {
  const dir = packVersionDir(entry.id, entry.version)
  const v = await verifyInstall(dir, entry)
  if (!v.ok) return { entry, dir, domains: [], broken: v.problem, conflicts: [] }
  const p: LoadedPack = { entry, dir, manifest: v.manifest, domains: v.domains, conflicts: [] }
  const builtin = builtinDomainConflicts(subjectOf(p)!)
  if (builtin.length) p.broken = conflictReason(builtin)
  return p
}

/**
 * Two enabled packs that conflict (a registry edited by hand, or written by another build):
 * keep the first by id enabled, disable the rest. Returns whether anything changed.
 */
function disableConflicting(list: LoadedPack[]): boolean {
  let changed = false
  const kept: LoadedPack[] = []
  for (const p of [...list].sort((a, b) => (a.entry.id < b.entry.id ? -1 : 1))) {
    if (!isActive(p)) continue
    if (conflictsFor(p, kept).length) {
      p.entry = { ...p.entry, enabled: false }
      changed = true
    } else kept.push(p)
  }
  return changed
}

/** Remove folders under userData/packs/ that the registry does not list (a crashed install). */
async function removeUnregistered(entries: readonly PackRegistryEntry[]): Promise<void> {
  const dirents = await fs.readdir(packsRoot(), { withFileTypes: true }).catch(() => [])
  for (const d of dirents) {
    const id = d.name
    // Folders named like a pack id only: not registry.json (a valid id!), .staging, catalogs.
    if (!d.isDirectory() || !PackId.safeParse(id).success) continue
    const entry = entries.find((e) => e.id === id)
    if (!entry) {
      await removeTree(packIdDir(id))
      continue
    }
    for (const version of await fs.readdir(packIdDir(id)).catch(() => [] as string[]))
      if (version !== entry.version) await removeTree(join(packIdDir(id), version))
  }
}

/**
 * Read the registry; when it is missing or damaged, rebuild entries from the pack folders
 * (rebuild.ts) instead of losing the installed packs. Unlisted folders are removed only when
 * `removeOrphans` is set and the registry read cleanly.
 */
async function loadUnlocked(removeOrphans: boolean): Promise<void> {
  const { registry, status } = await readRegistryState()
  let entries = registry.packs
  if (status === 'clean') {
    if (removeOrphans) await removeUnregistered(entries)
  } else {
    entries = await rebuildEntries()
    if (entries.length) {
      await writeRegistry(entries)
      console.error(`[packs] rebuilt ${entries.length} registry entries from the pack folders`)
    }
  }
  const list = await Promise.all(entries.map(loadEntry))
  if (disableConflicting(list)) await writeRegistry(list.map((p) => p.entry))
  loadedFrom = packsRoot()
  commitLoaded(list)
}

/** Load the registry and verify every pack (no staging cleanup; safe at any time). */
export function loadPacks(): Promise<void> {
  return withPacksLock(() => loadUnlocked(false))
}

/** Load once per userData folder (handlers call this; main calls initPacks at startup). */
export async function ensurePacksLoaded(): Promise<void> {
  if (loadedFrom !== packsRoot()) await loadPacks()
}

/**
 * Startup: delete everything left in userData/packs/.staging (downloads and extractions of a
 * previous run), load the registry (rebuilding it from the folders when it is missing or
 * damaged) and, only after a clean read, remove unregistered pack folders. Main calls this once
 * before the window opens.
 */
export async function initPacks(): Promise<void> {
  await withPacksLock(async () => {
    await removeTree(packsStagingDir())
    await loadUnlocked(true)
  })
}
