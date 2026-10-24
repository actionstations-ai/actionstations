// Domain profile registry (ADR-0014, ADR-0018 #263): the built-in profiles plus the profiles
// of enabled packs. Main fills the pack set from the installed packs (src/main/domains);
// the renderer fills its own copy from `domains:list`. Pure module state, no Node imports.
import { DOMAIN_PROFILES, domainKey } from './builtins'
import { DomainProfile } from './schema'

/** Where a listed profile comes from. */
export type ProfileSource =
  { kind: 'builtin' } | { kind: 'pack'; packId: string; packVersion: string; packName: string }

export interface PackProfileEntry {
  profile: DomainProfile
  packId: string
  packVersion: string
  packName: string
}

export interface ListedProfile {
  profile: DomainProfile
  source: ProfileSource
}

const builtinKeys = new Map<string, DomainProfile>()
for (const p of DOMAIN_PROFILES) {
  builtinKeys.set(p.id, p)
  for (const a of p.aliases) builtinKeys.set(domainKey(a), p)
}

let packEntries: readonly PackProfileEntry[] = []
let packKeys = new Map<string, PackProfileEntry>()
let revision = 0
const listeners = new Set<() => void>()

/** Every key (id and aliases) a profile answers to. */
const keysOf = (p: DomainProfile): string[] => [
  ...new Set([p.id, ...p.aliases.map(domainKey)].filter(Boolean)),
]

function claimKey(next: Map<string, PackProfileEntry>, key: string, entry: PackProfileEntry) {
  const id = entry.profile.id
  const builtin = builtinKeys.get(key)
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

/**
 * Replace the set of pack profiles. Throws (and keeps the previous set) when a pack profile
 * reuses a built-in id or alias, or two pack profiles share an id or alias: a pack may not
 * silently change how existing projects extract facts and lint (ADR-0018).
 */
export function registerPackProfiles(entries: readonly PackProfileEntry[]): void {
  const next = new Map<string, PackProfileEntry>()
  const parsed = entries.map((e) => ({ ...e, profile: DomainProfile.parse(e.profile) }))
  for (const entry of parsed) for (const key of keysOf(entry.profile)) claimKey(next, key, entry)
  packEntries = parsed
  packKeys = next
  revision++
  for (const l of listeners) l()
}

/** The registered pack profiles, in registration order. */
export const packProfileEntries = (): readonly PackProfileEntry[] => packEntries

/** The built-in profile a key names, if any. */
export const builtinByKey = (orgType: string | undefined): DomainProfile | undefined =>
  builtinKeys.get(domainKey(orgType))

/** The registered pack profile a key names, if any. */
export const packEntryByKey = (orgType: string | undefined): PackProfileEntry | undefined =>
  packKeys.get(domainKey(orgType))

const packSource = (e: PackProfileEntry): ProfileSource => ({
  kind: 'pack',
  packId: e.packId,
  packVersion: e.packVersion,
  packName: e.packName,
})

/** Built-in profiles, then pack profiles, each with where it comes from. */
export function listProfiles(): ListedProfile[] {
  return [
    ...DOMAIN_PROFILES.map((profile) => ({ profile, source: { kind: 'builtin' as const } })),
    ...packEntries.map((e) => ({ profile: e.profile, source: packSource(e) })),
  ]
}

/** Changes on every registerPackProfiles call (for useSyncExternalStore in the renderer). */
export const profilesRevision = (): number => revision

export function subscribeProfiles(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
