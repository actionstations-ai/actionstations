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
// Two enabled packs never provide the same kind + id (conflicts install disabled), so callers
// need no ordering between packs. Precedence with the other layers is the caller's: project >
// user > pack > built-in. Files under pack.dir are read-only; never write there.
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
import { isActive, loadedPacks, onLoadedChange, packsRevision } from './state'

export { packsRevision }

export interface InstalledPack {
  id: string
  version: string
  name: string
  /** userData/packs/<id>/<version> */
  dir: string
  manifest: PackManifest
  items: readonly PackItemSummary[]
}

let cache: { revision: number; packs: readonly InstalledPack[] } | undefined

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

/** An enabled, verified pack by id. */
export const packById = (id: string): InstalledPack | undefined =>
  enabledPacks().find((p) => p.id === id)

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

/** Absolute path of an item's folder or main file (see the header). Throws NOT_FOUND. */
export function packItemPath(pack: InstalledPack, kind: PackKind, id: string): string {
  assertItem(pack, kind, id)
  return safeJoinReal(pack.dir, ...ITEM_PATH[kind](id).split('/'))
}

/** Absolute path of a file listed in pack.json (or pack.json itself). Throws NOT_FOUND. */
export function packFilePath(pack: InstalledPack, path: string): string {
  if (path !== PACK_MANIFEST_FILE && !pack.manifest.files.some((f) => f.path === path))
    throw new AppError('NOT_FOUND', `${pack.name} has no file ${path}`)
  return safeJoinReal(pack.dir, ...path.split('/'))
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
