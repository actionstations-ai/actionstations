// Pure helpers for the Packs screen (#268): labels, catalog filtering, install state.
import type {
  CachedCatalogView,
  InstalledPackView,
  PackInstallAction,
  PackUpdateView,
} from '@shared/ipc'
import {
  PACK_KINDS,
  compareSemver,
  type PackCatalogEntry,
  type PackInstallSource,
  type PackItemSummary,
  type PackKind,
} from '@shared/schemas/pack'

export const KIND_LABEL: Record<PackKind, { one: string; many: string }> = {
  templates: { one: 'template', many: 'Templates' },
  prompts: { one: 'prompt', many: 'Prompts' },
  domains: { one: 'domain profile', many: 'Domain profiles' },
  workflows: { one: 'ComfyUI workflow', many: 'ComfyUI workflows' },
  documents: { one: 'document set', many: 'Reference documents' },
  examples: { one: 'example project', many: 'Example projects' },
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} bytes`
}

/** Where a pack came from, as one line. A registry rebuilt from the folder has no origin. */
export function sourceText(source: PackInstallSource): string {
  switch (source.kind) {
    case 'file':
      return `File: ${source.name}`
    case 'url':
      return `URL: ${source.url}`
    case 'catalog':
      return `Catalog: ${source.url}`
    case 'unknown':
      return 'Not recorded (the pack list was rebuilt from the installed files)'
    case 'bundled':
      return 'Included with the app'
  }
}

/** The archive sha256, or why there is none. */
export function archiveShaText(sha: string): string {
  return sha === 'unknown' ? 'Not recorded (the original archive is no longer known)' : sha
}

/** Items grouped by kind in the format's kind order; kinds with no items are left out. */
export function itemsByKind(items: readonly PackItemSummary[]): [PackKind, PackItemSummary[]][] {
  return PACK_KINDS.map(
    (k) => [k, items.filter((i) => i.kind === k)] as [PackKind, PackItemSummary[]],
  ).filter(([, list]) => list.length > 0)
}

/** "3 templates, 1 prompt" style summary of an item list. */
export function countsText(items: readonly PackItemSummary[]): string {
  return itemsByKind(items)
    .map(([k, list]) => `${list.length} ${KIND_LABEL[k].one}${list.length === 1 ? '' : 's'}`)
    .join(', ')
}

export interface BrowseEntry {
  entry: PackCatalogEntry
  catalogUrl: string
  catalogName: string
}

/** The newest version of each pack per catalog (a catalog may list several versions). */
export function latestEntries(catalogs: readonly CachedCatalogView[]): BrowseEntry[] {
  const out = new Map<string, BrowseEntry>()
  for (const c of catalogs)
    for (const entry of c.entries) {
      const key = `${c.url}\n${entry.id}`
      const prev = out.get(key)
      if (!prev || compareSemver(entry.version, prev.entry.version) > 0)
        out.set(key, { entry, catalogUrl: c.url, catalogName: c.name })
    }
  return [...out.values()].sort(
    (a, b) =>
      a.entry.name.localeCompare(b.entry.name) || a.catalogName.localeCompare(b.catalogName),
  )
}

export interface BrowseFilter {
  query: string
  kind: PackKind | ''
  domain: string
  tag: string
}

export const NO_FILTER: BrowseFilter = { query: '', kind: '', domain: '', tag: '' }

export function filterEntries(list: readonly BrowseEntry[], f: BrowseFilter): BrowseEntry[] {
  const q = f.query.trim().toLowerCase()
  return list.filter(({ entry: e }) => {
    if (f.kind && !e.kinds.includes(f.kind)) return false
    if (f.domain && !e.domains.includes(f.domain)) return false
    if (f.tag && !e.tags.includes(f.tag)) return false
    if (!q) return true
    return [e.name, e.summary, e.id, e.author.name, ...e.tags].some((s) =>
      s.toLowerCase().includes(q),
    )
  })
}

/** Distinct domains and tags across entries, sorted, for the filter selects. */
export function facets(list: readonly BrowseEntry[]): { domains: string[]; tags: string[] } {
  const domains = new Set<string>()
  const tags = new Set<string>()
  for (const { entry } of list) {
    entry.domains.forEach((d) => domains.add(d))
    entry.tags.forEach((t) => tags.add(t))
  }
  return { domains: [...domains].sort(), tags: [...tags].sort() }
}

export type EntryState =
  | { kind: 'available' }
  | { kind: 'installed'; version: string }
  | { kind: 'update'; installed: string }
  | { kind: 'newer-installed'; installed: string }

/** A catalog entry against what is installed. */
export function entryState(
  entry: PackCatalogEntry,
  installed: readonly InstalledPackView[],
): EntryState {
  const have = installed.find((p) => p.id === entry.id)
  if (!have) return { kind: 'available' }
  const cmp = compareSemver(entry.version, have.version)
  if (cmp === 0) return { kind: 'installed', version: have.version }
  return cmp > 0
    ? { kind: 'update', installed: have.version }
    : { kind: 'newer-installed', installed: have.version }
}

export const updateFor = (
  id: string,
  updates: readonly PackUpdateView[] | undefined,
): PackUpdateView | undefined => updates?.find((u) => u.id === id)

export const isPackFile = (path: string): boolean => /\.aspack$/i.test(path)

/** The review's install button. */
export function actionLabel(action: PackInstallAction, version: string): string {
  switch (action) {
    case 'install':
      return 'Install'
    case 'reinstall':
      return 'Reinstall'
    case 'update':
      return `Update to ${version}`
    case 'downgrade':
      return `Downgrade to ${version}`
  }
}

/** "Replaces Action Stations Core: tweet" (ADR-0020), or the older "Replaces built-in …". */
export function replacesText(
  item: Pick<PackItemSummary, 'id' | 'replacesPack'>,
  kindOne: string,
): string {
  return item.replacesPack
    ? `Replaces ${item.replacesPack.name}: ${item.id}`
    : `Replaces built-in ${kindOne}`
}
