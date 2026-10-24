// Domain profiles (ADR-0014). `resolveProfile(orgType, overrides, snapshot)` is what the
// pipeline, the lints, the facility-fact extractor and the media planner all go through.
// Profiles come from the bundled packs (ADR-0020) and from enabled installed packs
// (registry.ts, ADR-0018 #263).
import { GENERIC_PROFILE } from './builtins'
import { builtinByKey, packEntryByKey } from './registry'
import {
  DomainProfile,
  type DomainProfileOverrides,
  type DomainProfileSnapshot,
  type ThreatFamily,
  type ThreatFamilyId,
} from './schema'
import { snapshotMatches } from './snapshot'
import { inferThreatFamily, isThreatFamilyId, threatFamily } from './threats'

export * from './schema'
export { THREAT_FAMILIES, inferThreatFamily, isThreatFamilyId, threatFamily } from './threats'
export { GENERIC_PROFILE, domainKey } from './builtins'
export {
  builtinByKey,
  bundledDomainIds,
  bundledEntryByKey,
  bundledProfileEntries,
  bundledProfiles,
  listProfiles,
  packEntryByKey,
  packProfileEntries,
  profilesRevision,
  registerBundledProfiles,
  registerPackProfiles,
  subscribeProfiles,
  type BundledProfileEntry,
  type ListedProfile,
  type PackProfileEntry,
  type ProfileSource,
} from './registry'
export {
  nextDomainSnapshot,
  packSnapshotFor,
  profileFieldDiff,
  snapshotMatches,
  snapshotStatus,
  type ProfileFieldChange,
  type SnapshotStatus,
} from './snapshot'

/**
 * The registered profile an orgType names (a bundled pack's, enabled or not, or an enabled
 * installed pack's, by id or alias, case-insensitive); generic otherwise.
 */
export function builtinProfile(orgType: string | undefined): DomainProfile {
  return builtinByKey(orgType) ?? packEntryByKey(orgType)?.profile ?? GENERIC_PROFILE
}

/** Whether a value names a registered profile (bundled or enabled pack) by id or alias. */
export const isDomainId = (v: unknown): v is string =>
  typeof v === 'string' && (!!builtinByKey(v) || !!packEntryByKey(v))

/**
 * The profile a project starts from: its snapshot when the snapshot is the profile orgType
 * names (a pack domain keeps working after the pack is gone), else the registry's.
 */
export function baseProfile(
  orgType: string | undefined,
  snapshot?: DomainProfileSnapshot,
): DomainProfile {
  return snapshotMatches(orgType, snapshot) ? snapshot.profile : builtinProfile(orgType)
}

/**
 * The effective profile of a project: the snapshot (when it is the profile orgType names),
 * else the registered profile, with the project's overrides applied field by field on top
 * (an override replaces the whole field). The profile keeps its id so templates, lints and
 * tags keyed by domain id still apply.
 */
export function resolveProfile(
  orgType: string | undefined,
  overrides?: DomainProfileOverrides,
  snapshot?: DomainProfileSnapshot,
): DomainProfile {
  const base = baseProfile(orgType, snapshot)
  if (!overrides) return base
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined))
  return DomainProfile.parse({ ...base, ...defined, id: base.id, aliases: base.aliases })
}

/** The threat family a scenario exercises: the brief's, else the profile's default. */
export function resolveThreat(
  profile: DomainProfile,
  threatFamilyId: string | undefined,
): ThreatFamily {
  if (isThreatFamilyId(threatFamilyId)) return threatFamily(threatFamilyId)
  return threatFamily(profile.threatFamilies[0]!)
}

/**
 * Pick the threat family for a new scenario from its brief and idea text, among the families
 * the profile supports; the profile's default when the text names none.
 */
export function chooseThreatFamily(profile: DomainProfile, text: string): ThreatFamilyId {
  return inferThreatFamily(text, profile.threatFamilies, profile.threatFamilies[0]!)
}
