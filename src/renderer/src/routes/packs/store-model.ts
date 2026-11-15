// The pack store (#1152): included, installed and catalog packs as one list, each with its
// kind, field and category (src/shared/packs/store.json), its state and what it contains.
// Pure; the components only render it.
import type { CachedCatalogView, InstalledPackView, PackUpdateView } from '@shared/ipc'
import { PACK_KINDS, compareSemver, type PackKind } from '@shared/schemas/pack'
import {
  ALL_CATEGORIES,
  STORE_KINDS,
  STORE_KIND_LABEL,
  categoryOf,
  packField,
  storeKind,
  type StoreCategory,
  type StoreKind,
} from '@shared/packs/store'
import { latestEntries, updateFor, type BrowseEntry } from './pack-format'

export type StoreState =
  | { kind: 'included'; enabled: boolean; core: boolean }
  | { kind: 'installed'; enabled: boolean }
  | { kind: 'update'; enabled: boolean; latest: string }
  | { kind: 'available' }
  | { kind: 'broken' }

export interface StorePack {
  id: string
  name: string
  summary: string
  version: string
  kind: StoreKind
  field: string | undefined
  category: StoreCategory
  author: string | undefined
  /** Contributor names, for search. */
  credits: string[]
  tags: string[]
  /** Item counts by kind; a catalog entry not installed names its kinds only (count unknown). */
  counts: Partial<Record<PackKind, number | undefined>>
  state: StoreState
  installed: InstalledPackView | undefined
  entry: BrowseEntry | undefined
  update: PackUpdateView | undefined
}

function countsOf(p: InstalledPackView): Partial<Record<PackKind, number>> {
  const out: Partial<Record<PackKind, number>> = {}
  for (const i of p.items) out[i.kind] = (out[i.kind] ?? 0) + 1
  return out
}

function stateOf(p: InstalledPackView, update: PackUpdateView | undefined): StoreState {
  if (p.broken) return { kind: 'broken' }
  if (p.bundled) return { kind: 'included', enabled: p.enabled, core: !!p.core }
  if (update) return { kind: 'update', enabled: p.enabled, latest: update.latest.version }
  return { kind: 'installed', enabled: p.enabled }
}

function fromInstalled(
  p: InstalledPackView,
  entry: BrowseEntry | undefined,
  update: PackUpdateView | undefined,
): StorePack {
  const counts = countsOf(p)
  const kinds = PACK_KINDS.filter((k) => counts[k])
  const shape = { id: p.id, kinds, domains: p.domains, core: p.core }
  const field = packField(shape)
  return {
    id: p.id,
    name: p.name,
    summary: p.summary,
    version: p.version,
    kind: storeKind(shape),
    field,
    category: categoryOf(field),
    author: p.author?.name,
    credits: (p.contributors ?? []).map((c) => c.name),
    tags: p.tags,
    counts,
    state: stateOf(p, update),
    installed: p,
    entry,
    update,
  }
}

function fromEntry(item: BrowseEntry): StorePack {
  const e = item.entry
  const field = packField(e)
  return {
    id: e.id,
    name: e.name,
    summary: e.summary,
    version: e.version,
    kind: storeKind(e),
    field,
    category: categoryOf(field),
    author: e.author.name,
    credits: e.contributors.map((c) => c.name),
    tags: e.tags,
    counts: Object.fromEntries(e.kinds.map((k) => [k, undefined])),
    state: { kind: 'available' },
    installed: undefined,
    entry: item,
    update: undefined,
  }
}

/** A catalog entry newer than the installed pack, as an update (bundled packs update with the app). */
function newerIn(p: InstalledPackView, b: BrowseEntry | undefined): PackUpdateView | undefined {
  if (!b || p.bundled || compareSemver(b.entry.version, p.version) <= 0) return undefined
  return { id: p.id, installed: p.version, latest: b.entry, catalogUrl: b.catalogUrl }
}

/** Every pack once: installed ones (with their catalog entry when listed), then catalog-only. */
export function buildStore(
  installed: readonly InstalledPackView[],
  catalogs: readonly CachedCatalogView[],
  updates: readonly PackUpdateView[] | undefined,
): StorePack[] {
  // One entry per pack id: the newest version any catalog lists.
  const byId = new Map<string, BrowseEntry>()
  for (const b of latestEntries(catalogs)) {
    const prev = byId.get(b.entry.id)
    if (!prev || compareSemver(b.entry.version, prev.entry.version) > 0) byId.set(b.entry.id, b)
  }
  const have = new Set(installed.map((p) => p.id))
  return [
    ...installed.map((p) => {
      const entry = byId.get(p.id)
      return fromInstalled(p, entry, updateFor(p.id, updates) ?? newerIn(p, entry))
    }),
    ...[...byId.values()].filter((b) => !have.has(b.entry.id)).map(fromEntry),
  ]
}

/** Store order: by kind (fields first), then name. */
export function storeOrder(a: StorePack, b: StorePack): number {
  return (
    STORE_KINDS.indexOf(a.kind) - STORE_KINDS.indexOf(b.kind) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )
}

export interface StoreFilter {
  query: string
  category: string
  kind: StoreKind | ''
}

export const NO_STORE_FILTER: StoreFilter = { query: '', category: '', kind: '' }

export const isFiltered = (f: StoreFilter): boolean => !!(f.query.trim() || f.category || f.kind)

/** The field's display name: its field pack's name, else the domain id in words. */
export function fieldLabel(field: string, packs: readonly StorePack[]): string {
  const own = packs.find((p) => p.kind === 'field' && p.field === field)
  if (own) return own.name
  const words = field.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function haystack(p: StorePack): string {
  return [
    p.name,
    p.summary,
    p.author ?? '',
    ...p.credits,
    p.id,
    p.category.label,
    STORE_KIND_LABEL[p.kind].one,
    ...p.tags,
    p.field?.replace(/_/g, ' ') ?? '',
  ]
    .join('\n')
    .toLowerCase()
}

export function filterStore(packs: readonly StorePack[], f: StoreFilter): StorePack[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean)
  return packs
    .filter((p) => !f.category || p.category.id === f.category)
    .filter((p) => !f.kind || p.kind === f.kind)
    .filter((p) => {
      if (!words.length) return true
      const h = haystack(p)
      return words.every((w) => h.includes(w))
    })
    .sort(storeOrder)
}

export interface Shelf {
  category: StoreCategory
  packs: StorePack[]
}

/** One shelf per category that has packs, in category order. */
export function shelves(packs: readonly StorePack[]): Shelf[] {
  return ALL_CATEGORIES.map((category) => ({
    category,
    packs: packs.filter((p) => p.category.id === category.id).sort(storeOrder),
  })).filter((s) => s.packs.length > 0)
}

/** The other packs of the same field (field pack, toolkits, reference library). */
export function sameField(pack: StorePack, packs: readonly StorePack[]): StorePack[] {
  if (!pack.field) return []
  return packs.filter((p) => p.id !== pack.id && p.field === pack.field).sort(storeOrder)
}

/** The tile's one-word state. */
export function stateLabel(s: StoreState): string {
  switch (s.kind) {
    case 'included':
      return s.core ? 'Always on' : s.enabled ? 'On' : 'Off'
    case 'installed':
      return s.enabled ? 'Installed' : 'Installed, off'
    case 'update':
      return 'Update'
    case 'available':
      return 'Get'
    case 'broken':
      return 'Needs repair'
  }
}

/** "17 templates · 1 toolkit · 1 example project" (known counts only). */
export function contentsLine(
  counts: StorePack['counts'],
  labels: Record<PackKind, { one: string; many: string }>,
): string {
  return PACK_KINDS.filter((k) => k in counts)
    .map((k) => {
      const n = counts[k]
      if (n === undefined) return labels[k].many
      return `${n} ${n === 1 ? labels[k].one : labels[k].many.toLowerCase()}`
    })
    .join(' · ')
}
