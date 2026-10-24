// Domain profile registry (ADR-0014, ADR-0018 #263, ADR-0020 #314): the profiles of the packs
// included with the app (bundled) plus the profiles of enabled installed packs. Main fills both
// sets from the packs (src/main/domains); the renderer fills its own copy from `domains:list`.
// Pure module state, no Node imports.
//
// Bundled profiles are registered whether their pack is enabled or not: a project on a domain
// whose pack the user disabled still resolves, lints and extracts facts. Only the pickers ask
// for the enabled ones (`bundledProfiles({ enabledOnly: true })`). Until main registers them,
// only the compiled-in generic profile answers.
import { GENERIC_PROFILE, domainKey } from './builtins'
import { DomainProfile } from './schema'

/** Where a listed profile comes from: a pack included with the app, or an installed pack. */
export type ProfileSource =
  | { kind: 'bundled'; packId: string; packVersion: string; packName: string; enabled: boolean }
  | { kind: 'pack'; packId: string; packVersion: string; packName: string }

export interface PackProfileEntry {
  profile: DomainProfile
  packId: string
  packVersion: string
  packName: string
}

/** A profile of a bundled pack; `enabled` is false while the user has the pack turned off. */
export interface BundledProfileEntry extends PackProfileEntry {
  enabled: boolean
}

export interface ListedProfile {
  profile: DomainProfile
  source: ProfileSource
}

let bundledEntries: readonly BundledProfileEntry[] = []
let bundledKeys = new Map<string, BundledProfileEntry>()
let packEntries: readonly PackProfileEntry[] = []
let packKeys = new Map<string, PackProfileEntry>()
let revision = 0
const listeners = new Set<() => void>()

/** Every key (id and aliases) a profile answers to. */
const keysOf = (p: DomainProfile): string[] => [
  ...new Set([p.id, ...p.aliases.map(domainKey)].filter(Boolean)),
]

/** The compiled-in generic keys stay reserved even before (or without) the core pack. */
const genericKeys = new Set(keysOf(GENERIC_PROFILE))

function notify(): void {
  revision++
  for (const l of listeners) l()
}

/** The bundled profile a key names (enabled or not), or generic for its keys. */
function bundledByKey(key: string): DomainProfile | undefined {
  const entry = bundledKeys.get(key)
  if (entry) return entry.profile
  return genericKeys.has(key) ? GENERIC_PROFILE : undefined
}

function claimKey(next: Map<string, PackProfileEntry>, key: string, entry: PackProfileEntry) {
  const id = entry.profile.id
  const builtin = bundledByKey(key)
  if (builtin)
    throw new Error(
      `Pack ${entry.packId}: domain "${id}" may not reuse "${key}" of the built-in ${builtin.id} profile`,
    )
  const other = next.get(key)
  if (other?.profile.id === id)
    throw new Error(`Domain "${id}" is provided by both ${other.packId} and ${entry.packId}`)
  if (other)
    throw new Error(
      `Pack ${entry.packId}: domain "${id}" reuses "${key}" of ${other.packId} domain "${other.profile.id}"`,
    )
  next.set(key, entry)
}

function packKeyMap(entries: readonly PackProfileEntry[]): Map<string, PackProfileEntry> {
  const next = new Map<string, PackProfileEntry>()
  for (const entry of entries) for (const key of keysOf(entry.profile)) claimKey(next, key, entry)
  return next
}

/**
 * Replace the bundled profiles (every bundled pack's, enabled or not, in picker order). An id
 * wins over another profile's alias (water_dam keeps its old "water utility" alias, but
 * "water_utility" names the water utility profile). Throws (and keeps the previous set) when
 * two bundled profiles share an id, or two share an alias. Installed pack profiles that now
 * reuse a bundled key are dropped (main marks those packs broken).
 */
export function registerBundledProfiles(entries: readonly BundledProfileEntry[]): void {
  const parsed = entries.map((e) => ({ ...e, profile: DomainProfile.parse(e.profile) }))
  const next = new Map<string, BundledProfileEntry>()
  const clash = (entry: BundledProfileEntry, key: string, other: BundledProfileEntry) =>
    new Error(
      `Bundled domain "${entry.profile.id}" (${entry.packId}) reuses "${key}" of "${other.profile.id}" (${other.packId})`,
    )
  for (const entry of parsed) {
    const other = next.get(entry.profile.id)
    if (other) throw clash(entry, entry.profile.id, other)
    next.set(entry.profile.id, entry)
  }
  const ids = new Set(next.keys())
  for (const entry of parsed)
    for (const key of keysOf(entry.profile)) {
      if (ids.has(key)) continue
      const other = next.get(key)
      if (other && other !== entry) throw clash(entry, key, other)
      next.set(key, entry)
    }
  bundledEntries = parsed
  bundledKeys = next
  const kept = packEntries.filter((e) => keysOf(e.profile).every((k) => !bundledByKey(k)))
  if (kept.length !== packEntries.length) {
    packEntries = kept
    packKeys = packKeyMap(kept)
  }
  notify()
}

/**
 * Replace the set of installed pack profiles. Throws (and keeps the previous set) when a pack
 * profile reuses a bundled id or alias, or two pack profiles share an id or alias: a pack may
 * not silently change how existing projects extract facts and lint (ADR-0018, ADR-0020).
 */
export function registerPackProfiles(entries: readonly PackProfileEntry[]): void {
  const parsed = entries.map((e) => ({ ...e, profile: DomainProfile.parse(e.profile) }))
  const next = packKeyMap(parsed)
  packEntries = parsed
  packKeys = next
  notify()
}

/** The registered installed-pack profiles, in registration order. */
export const packProfileEntries = (): readonly PackProfileEntry[] => packEntries

/** The registered bundled profiles (enabled and disabled), in picker order. */
export const bundledProfileEntries = (): readonly BundledProfileEntry[] => bundledEntries

/**
 * Bundled profiles in picker order; with `enabledOnly`, only those of enabled packs (what a
 * picker offers for new use). Before registration: just the compiled-in generic profile.
 */
export function bundledProfiles(opts: { enabledOnly?: boolean } = {}): DomainProfile[] {
  if (!bundledEntries.length) return [GENERIC_PROFILE]
  return bundledEntries.filter((e) => !opts.enabledOnly || e.enabled).map((e) => e.profile)
}

/** Ids of the bundled profiles (pack profiles: `isDomainId`, `listProfiles`). */
export const bundledDomainIds = (): string[] => bundledProfiles().map((p) => p.id)

/** The bundled profile a key names (enabled or not), if any. */
export const builtinByKey = (orgType: string | undefined): DomainProfile | undefined =>
  bundledByKey(domainKey(orgType))

/** The bundled entry a key names (enabled or not), with its pack; undefined for generic. */
export const bundledEntryByKey = (orgType: string | undefined): BundledProfileEntry | undefined =>
  bundledKeys.get(domainKey(orgType))

/** The registered installed-pack profile a key names, if any. */
export const packEntryByKey = (orgType: string | undefined): PackProfileEntry | undefined =>
  packKeys.get(domainKey(orgType))

const packSource = (e: PackProfileEntry): ProfileSource => ({
  kind: 'pack',
  packId: e.packId,
  packVersion: e.packVersion,
  packName: e.packName,
})

const bundledSource = (e: BundledProfileEntry): ProfileSource => ({
  kind: 'bundled',
  packId: e.packId,
  packVersion: e.packVersion,
  packName: e.packName,
  enabled: e.enabled,
})

/** Bundled profiles (enabled and disabled), then installed pack profiles, with their source. */
export function listProfiles(): ListedProfile[] {
  return [
    ...bundledEntries.map((e) => ({ profile: e.profile, source: bundledSource(e) })),
    ...packEntries.map((e) => ({ profile: e.profile, source: packSource(e) })),
  ]
}

/** Changes on every registration (for useSyncExternalStore in the renderer). */
export const profilesRevision = (): number => revision

export function subscribeProfiles(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
