// Pack layer API (ADR-0018 "Registration per kind", #260): the one read-only view of installed
// packs that the template, prompt, workflow, document, example and Packs-screen code uses.
//
//   enabledPacks()                 enabled, verified packs, sorted by id (same array until a change)
//   packById(id)                   one of those, or undefined (disabled, broken or not installed)
//   onPacksChanged(listener)       called after every install / enable / disable / update /
//                                  uninstall / startup load; returns an unsubscribe function.
//                                  The renderer gets the `packs:changed` event at the same time.
//   packsRevision()                increments on every change (cache key for layer loaders)
//   packItemPath(pack, kind, id)   absolute path of an item: its folder (templates, documents,
//                                  examples) or its file (prompts/<id>.md, domains/<id>.json,
//                                  workflows/<id>.json); realpath-checked inside the pack folder
//   packFilePath(pack, path)       absolute path of one file listed in pack.json files[]
//   packItemFiles(pack, kind, id)  the item's files[] entries ({ path, sha256, size }), e.g. to
//                                  copy an item into a project and record packs.json hashes
//   enabledItems(kind)             every { pack, id } of a kind across enabled packs
//   packAppliesToDomain(pack, d)   manifest.domains is empty or lists d (scopes pack prompts)
//
// Bundled packs (ADR-0020: included with the app, read from its resources) are not in
// enabledPacks(): they are each loader's lowest layer, below the installed packs.
//   bundledPacks()                 every usable bundled pack, enabled or not (map order)
//   bundledPackById(id)            one of those, enabled or not
//   bundledItem(kind, id)          { pack, path } of the bundled pack providing an item, enabled
//                                  or not (a project keeps using a disabled pack's items)
//   corePack()                     ai.actionstations.core (always enabled)
//   contentPacks()                 enabled installed packs, then enabled bundled packs: what
//                                  "Add from pack" and the examples gallery offer
//   packById(id)                   also answers an enabled bundled pack
//
// Two enabled packs never provide the same kind + id (conflicts install disabled), so callers
// need no ordering between packs. Precedence with the other layers is the caller's: project >
// user > installed packs > bundled packs. Files under pack.dir are read-only; never write there.
import {
  classifyPackPath,
  PACK_MANIFEST_FILE,
  type PackFile,
  type PackItemSummary,
  type PackKind,
  type PackManifest,
} from '@shared/schemas/pack'
import { AppError } from '../lib/errors'
import { safeJoinReal } from '../lib/fs'
import { isActive, loadedBundled, loadedPacks, onLoadedChange, packsRevision } from './state'
import { CORE_PACK_ID } from './bundled-map'

export { packsRevision }

export interface InstalledPack {
  id: string
  version: string
  name: string
  /** userData/packs/<id>/<version>; for a bundled pack its resources folder */
  dir: string
  manifest: PackManifest
  items: readonly PackItemSummary[]
  /** Included with the app (ADR-0020). */
  bundled?: boolean
  /** The core bundled pack (always enabled). */
  core?: boolean
  /** Bundled packs: the user's choice (installed packs listed here are always enabled). */
  enabled?: boolean
  /** Source-mode bundled packs: where a path inside the pack is in the repo. */
  resolve?: (packPath: string) => string
}

let cache: { revision: number; packs: readonly InstalledPack[] } | undefined
let bundledCache: { revision: number; packs: readonly InstalledPack[] } | undefined

/** Enabled, verified packs in a stable order (by id). */
export function enabledPacks(): readonly InstalledPack[] {
  const revision = packsRevision()
  if (cache?.revision === revision) return cache.packs
  const packs = Object.freeze(
    loadedPacks()
      .filter(isActive)
      .map((p): InstalledPack => ({
        id: p.entry.id,
        version: p.entry.version,
        name: p.manifest!.name,
        dir: p.dir,
        manifest: p.manifest!,
        items: p.entry.items,
      })),
  )
  cache = { revision, packs }
  return packs
}

/** Every usable bundled pack (enabled or not; damaged ones left out), in map order. */
export function bundledPacks(): readonly InstalledPack[] {
  const revision = packsRevision()
  if (bundledCache?.revision === revision) return bundledCache.packs
  const packs = Object.freeze(
    loadedBundled()
      .filter((p) => !p.broken)
      .map((p): InstalledPack => ({
        id: p.id,
        version: p.version,
        name: p.name,
        dir: p.dir,
        manifest: p.manifest,
        items: p.items,
        bundled: true,
        core: p.core,
        enabled: p.enabled,
        ...(p.resolve ? { resolve: p.resolve } : {}),
      })),
  )
  bundledCache = { revision, packs }
  return packs
}

/** A usable bundled pack by id, enabled or not. */
export const bundledPackById = (id: string): InstalledPack | undefined =>
  bundledPacks().find((p) => p.id === id)

/** The core bundled pack, if it loaded. */
export const corePack = (): InstalledPack | undefined => bundledPackById(CORE_PACK_ID)

/** Enabled installed packs, then enabled bundled packs (documents and examples offered). */
export const contentPacks = (): InstalledPack[] => [
  ...enabledPacks(),
  ...bundledPacks().filter((p) => p.enabled),
]

/** An enabled pack by id: installed, else bundled. */
export const packById = (id: string): InstalledPack | undefined =>
  enabledPacks().find((p) => p.id === id) ?? bundledPacks().find((p) => p.id === id && p.enabled)

/** Subscribe to pack changes; returns the unsubscribe function. */
export const onPacksChanged = (listener: () => void): (() => void) => onLoadedChange(listener)

const ITEM_PATH: Record<PackKind, (id: string) => string> = {
  templates: (id) => `templates/${id}`,
  prompts: (id) => `prompts/${id}.md`,
  domains: (id) => `domains/${id}.json`,
  workflows: (id) => `workflows/${id}.json`,
  documents: (id) => `documents/${id}`,
  examples: (id) => `examples/${id}`,
}

function assertItem(pack: InstalledPack, kind: PackKind, id: string): void {
  if (!pack.manifest.contents[kind].includes(id))
    throw new AppError('NOT_FOUND', `${pack.name} has no ${kind} item "${id}"`)
}

/** A path inside the pack on disk (source-mode bundled packs map it into the repo). */
const resolveIn = (pack: InstalledPack, path: string): string =>
  pack.resolve ? pack.resolve(path) : safeJoinReal(pack.dir, ...path.split('/'))

/** Absolute path of an item's folder or main file (see the header). Throws NOT_FOUND. */
export function packItemPath(pack: InstalledPack, kind: PackKind, id: string): string {
  assertItem(pack, kind, id)
  return resolveIn(pack, ITEM_PATH[kind](id))
}

/** Absolute path of a file listed in pack.json (or pack.json itself). Throws NOT_FOUND. */
export function packFilePath(pack: InstalledPack, path: string): string {
  if (path !== PACK_MANIFEST_FILE && !pack.manifest.files.some((f) => f.path === path))
    throw new AppError('NOT_FOUND', `${pack.name} has no file ${path}`)
  if (pack.resolve && path === PACK_MANIFEST_FILE)
    throw new AppError('NOT_FOUND', `${pack.name} is read from the repo and has no pack.json`)
  return resolveIn(pack, path)
}

/**
 * The bundled pack that provides an item (enabled or not) and the item's path, or undefined.
 * Bundled packs never share an item (the build refuses it).
 */
export function bundledItem(
  kind: PackKind,
  id: string,
): { pack: InstalledPack; path: string } | undefined {
  const pack = bundledPacks().find((p) => p.manifest.contents[kind].includes(id))
  if (!pack) return undefined
  try {
    return { pack, path: packItemPath(pack, kind, id) }
  } catch {
    return undefined
  }
}

/** The files[] entries of one item (paths relative to pack.dir). Throws NOT_FOUND. */
export function packItemFiles(pack: InstalledPack, kind: PackKind, id: string): PackFile[] {
  assertItem(pack, kind, id)
  return pack.manifest.files.filter((f) => {
    const c = classifyPackPath(f.path)
    return 'kind' in c && c.kind === kind && c.item === id
  })
}

/** Every item of one kind across the enabled packs, in pack order. */
export function enabledItems(kind: PackKind): { pack: InstalledPack; id: string }[] {
  return enabledPacks().flatMap((pack) => pack.manifest.contents[kind].map((id) => ({ pack, id })))
}

/** Whether a pack applies to a project's domain (its prompts are scoped this way). */
export const packAppliesToDomain = (pack: InstalledPack, domainId: string | undefined): boolean =>
  pack.manifest.domains.length === 0 ||
  (domainId !== undefined && pack.manifest.domains.includes(domainId))
