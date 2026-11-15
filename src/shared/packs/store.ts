// The pack store's groups (store.json): what kind of pack each one is (field, toolkit, reference
// library…), which field it belongs to and that field's category. Shared by the Packs screen and,
// through the copied store.json, the website's catalog. Pure.
import type { PackKind } from '../schemas/pack'
import store from './store.json'

export type StoreKind = 'core' | 'field' | 'toolkit' | 'library' | 'templates'

export interface StoreCategory {
  id: string
  label: string
  blurb: string
  domains: string[]
}

export interface StoreFeature {
  title: string
  text: string
  packIds: string[]
}

export const STORE_CATEGORIES: readonly StoreCategory[] = store.categories
export const STORE_FEATURED: readonly StoreFeature[] = store.featured
const PACK_FIELDS: Readonly<Record<string, string>> = store.packFields

/** Category id for packs in no field (Core, generic templates). */
export const GENERAL_CATEGORY: StoreCategory = {
  id: 'general',
  label: 'General',
  blurb: 'Templates, prompts and workflows for any field.',
  domains: [],
}

export const STORE_KIND_LABEL: Record<StoreKind, { one: string; many: string }> = {
  core: { one: 'Core', many: 'Core' },
  field: { one: 'Field', many: 'Fields' },
  toolkit: { one: 'Toolkit', many: 'Toolkits' },
  library: { one: 'Reference library', many: 'Reference libraries' },
  templates: { one: 'Templates', many: 'Templates and media' },
}

/** Order kinds are listed in (filters, a field's packs). */
export const STORE_KINDS: readonly StoreKind[] = [
  'field',
  'toolkit',
  'library',
  'templates',
  'core',
]

export interface StorePackShape {
  id: string
  kinds: readonly PackKind[]
  domains: readonly string[]
  core?: boolean | undefined
}

/** What kind of pack this is in the store, from what it contains. */
export function storeKind(p: StorePackShape): StoreKind {
  if (p.core) return 'core'
  if (p.kinds.includes('domains')) return 'field'
  if (p.kinds.includes('toolkits')) return 'toolkit'
  if (p.kinds.length > 0 && p.kinds.every((k) => k === 'documents')) return 'library'
  return 'templates'
}

/** The field (a domain id) a pack belongs to: its first specific domain, or store.json's map. */
export function packField(p: Pick<StorePackShape, 'id' | 'domains'>): string | undefined {
  return p.domains.find((d) => d !== 'generic') ?? PACK_FIELDS[p.id]
}

/** The category of a field, or General for packs in no field. */
export function categoryOf(field: string | undefined): StoreCategory {
  if (!field) return GENERAL_CATEGORY
  return STORE_CATEGORIES.find((c) => c.domains.includes(field)) ?? GENERAL_CATEGORY
}

export function categoryById(id: string): StoreCategory | undefined {
  return id === GENERAL_CATEGORY.id ? GENERAL_CATEGORY : STORE_CATEGORIES.find((c) => c.id === id)
}

/** Every category in display order, General last. */
export const ALL_CATEGORIES: readonly StoreCategory[] = [...STORE_CATEGORIES, GENERAL_CATEGORY]

/** Two letters for a pack's tile: initials of its first two significant words. */
export function monogram(name: string): string {
  const words = name
    .replace(/^(Toolkit:|Action Stations)\s*/i, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !/^(and|the|of|for|to|a)$/i.test(w))
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}
