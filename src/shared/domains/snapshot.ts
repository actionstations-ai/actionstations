// Per-project snapshots of pack domain profiles (ADR-0018, #263). A project that picks a pack
// domain keeps a copy in project.json; resolveProfile uses that copy before the registry, so
// the project lints and extracts facts the same way after the pack is updated or uninstalled.
import { domainKey } from './builtins'
import { builtinByKey, packEntryByKey, packProfileEntries, type PackProfileEntry } from './registry'
import type { DomainProfile, DomainProfileSnapshot } from './schema'

/** Whether a snapshot is the profile an orgType names (by id or alias). */
export function snapshotMatches(
  orgType: string | undefined,
  snapshot: DomainProfileSnapshot | undefined,
): snapshot is DomainProfileSnapshot {
  if (!snapshot) return false
  const key = domainKey(orgType)
  return key === snapshot.profile.id || snapshot.profile.aliases.some((a) => domainKey(a) === key)
}

/** A fresh snapshot of the registered pack profile an orgType names; undefined otherwise. */
export function packSnapshotFor(orgType: string | undefined): DomainProfileSnapshot | undefined {
  const entry = packEntryByKey(orgType)
  if (!entry) return undefined
  return {
    profile: structuredClone(entry.profile),
    packId: entry.packId,
    version: entry.packVersion,
    packName: entry.packName,
  }
}

/**
 * The snapshot a project holds once its orgType is `orgType`: none for a built-in profile or
 * an unknown value; the current one when it already is that profile (never refreshed
 * silently); else a new copy from the registry.
 */
export function nextDomainSnapshot(
  orgType: string | undefined,
  current: DomainProfileSnapshot | undefined,
): DomainProfileSnapshot | undefined {
  if (builtinByKey(orgType)) return undefined
  if (snapshotMatches(orgType, current)) return current
  return packSnapshotFor(orgType)
}

export interface SnapshotStatus {
  /** The pack that provided the snapshot is installed, enabled and still has this domain. */
  installed: boolean
  /** The installed pack's version differs from the snapshot's ("Update profile from pack"). */
  updateAvailable: boolean
  /** The installed entry, when installed. */
  entry?: PackProfileEntry
}

export function snapshotStatus(snapshot: DomainProfileSnapshot): SnapshotStatus {
  const entry = packProfileEntries().find(
    (e) => e.packId === snapshot.packId && e.profile.id === snapshot.profile.id,
  )
  if (!entry) return { installed: false, updateAvailable: false }
  return { installed: true, updateAvailable: entry.packVersion !== snapshot.version, entry }
}

/** One top-level profile field that differs between two versions of a profile. */
export interface ProfileFieldChange {
  field: keyof DomainProfile
  label: string
  /** For list fields: items only in the newer version (roles by name, categories by label). */
  added: string[]
  /** For list fields: items only in the older version. */
  removed: string[]
  /** For text and object fields: the older and newer text (JSON for objects). */
  before?: string
  after?: string
}

const FIELD_LABELS: Record<keyof DomainProfile, string> = {
  id: 'Id',
  label: 'Name',
  description: 'Description',
  aliases: 'Aliases',
  vocabulary: 'Vocabulary',
  factCategories: 'Facility fact categories',
  systems: 'Systems',
  roles: 'Player roles',
  outsideParties: 'Outside parties',
  mediaChannels: 'Media channels',
  sceneAnchors: 'Image scene settings',
  injectTypes: 'Preferred inject types',
  threatFamilies: 'Threat families',
  noiseExamples: 'Noise examples',
  pressureExamples: 'Pressure examples',
  rolePatterns: 'Role patterns',
  agencyPattern: 'Agency pattern',
}

/** A list field's items as names the diff can compare. */
function itemNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((v: unknown) => {
    if (typeof v === 'string') return v
    const o = v as { name?: string; label?: string; id?: string }
    return o.name ?? o.label ?? o.id ?? JSON.stringify(v)
  })
}

function systemsNames(s: DomainProfile['systems']): string[] {
  return [...s.it.map((x) => `IT: ${x}`), ...s.ot.map((x) => `OT: ${x}`)]
}

const asText = (v: unknown): string | undefined =>
  v === undefined ? undefined : typeof v === 'string' ? v : JSON.stringify(v)

/** The fields that differ between two profiles, for the "Update profile from pack" review. */
export function profileFieldDiff(
  before: DomainProfile,
  after: DomainProfile,
): ProfileFieldChange[] {
  const fields = Object.keys(FIELD_LABELS) as (keyof DomainProfile)[]
  const changes: ProfileFieldChange[] = []
  for (const field of fields) {
    const a = before[field]
    const b = after[field]
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    const label = FIELD_LABELS[field]
    const listA = field === 'systems' ? systemsNames(before.systems) : itemNames(a)
    const listB = field === 'systems' ? systemsNames(after.systems) : itemNames(b)
    if (listA && listB) {
      const added = listB.filter((x) => !listA.includes(x))
      const removed = listA.filter((x) => !listB.includes(x))
      changes.push({ field, label, added, removed })
    } else {
      changes.push({ field, label, added: [], removed: [], before: asText(a), after: asText(b) })
    }
  }
  return changes
}
