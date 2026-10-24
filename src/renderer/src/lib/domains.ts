// Renderer helpers for domain profiles and threat families (ADR-0014, #169): picker groups and
// search, how a stored orgType resolves, and the threat family a brief would get and why.
import {
  THREAT_FAMILIES,
  baseProfile,
  builtinProfile,
  bundledProfileEntries,
  bundledProfiles,
  chooseThreatFamily,
  domainKey,
  packProfileEntries,
  snapshotStatus,
  threatFamily,
  type DomainProfile,
  type DomainProfileSnapshot,
  type ThreatFamily,
  type ThreatFamilyId,
} from '@shared/domains'
import type { ScenarioIdea } from '@shared/schemas/scenario'
import type { Provenance } from './provenance'

export interface ProfileGroup {
  label: string
  profiles: DomainProfile[]
}

/**
 * Picker sections for the bundled profiles (ADR-0020); a bundled profile no section names
 * (a domain pack added later) is listed under "More domains".
 */
export const PROFILE_GROUP_IDS: readonly { label: string; ids: readonly string[] }[] = [
  { label: 'Transportation', ids: ['airport', 'transit', 'port_maritime', 'unmanned_systems'] },
  {
    label: 'Utilities and industry',
    ids: ['water_dam', 'water_utility', 'energy_utility', 'industrial', 'food_agriculture'],
  },
  {
    label: 'Public and community',
    ids: [
      'healthcare',
      'campus',
      'k12_schools',
      'stadium_venue',
      'commercial_facilities',
      'municipal',
    ],
  },
  {
    label: 'Communications, IT and finance',
    ids: ['telecom', 'data_center_it', 'financial_services'],
  },
  { label: 'Any organization', ids: ['generic'] },
]

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[_\s-]+/g, ' ')
    .trim()

/** Whether a profile matches a search: label, description, id or alias. */
export function profileMatches(profile: DomainProfile, query: string): boolean {
  const q = normalize(query)
  if (!q) return true
  const haystack = [profile.label, profile.description, profile.id, ...profile.aliases]
    .map(normalize)
    .join(' | ')
  return q.split(' ').every((word) => haystack.includes(word))
}

export const PACK_GROUP_LABEL = 'From packs'
export const MORE_GROUP_LABEL = 'More domains'

/**
 * The profiles of the "From packs" group: every enabled pack's, plus the project's snapshot
 * when its pack is no longer installed (so the project's current choice stays visible).
 */
function packGroupProfiles(snapshot?: DomainProfileSnapshot): DomainProfile[] {
  const installed = packProfileEntries().map((e) => e.profile)
  if (snapshot && !installed.some((p) => p.id === snapshot.profile.id))
    installed.push(snapshot.profile)
  return installed
}

/**
 * Groups with the profiles that match `query`; empty groups are dropped. Only the profiles of
 * enabled bundled packs are offered, plus `keep` (the current choice) when its pack is off.
 */
export function profileGroups(
  query = '',
  snapshot?: DomainProfileSnapshot,
  keep?: string,
): ProfileGroup[] {
  const offered = bundledProfiles().filter(
    (p) => p.id === keep || bundledProfiles({ enabledOnly: true }).includes(p),
  )
  const byId = new Map(offered.map((p) => [p.id, p]))
  const grouped = new Set(PROFILE_GROUP_IDS.flatMap((g) => g.ids))
  const matches = (p: DomainProfile | undefined): p is DomainProfile =>
    !!p && profileMatches(p, query)
  const builtin = PROFILE_GROUP_IDS.map((g) => ({
    label: g.label,
    profiles: g.ids.map((id) => byId.get(id)).filter(matches),
  }))
  const more = {
    label: MORE_GROUP_LABEL,
    profiles: offered.filter((p) => !grouped.has(p.id)).filter(matches),
  }
  const packs = {
    label: PACK_GROUP_LABEL,
    profiles: packGroupProfiles(snapshot).filter((p) => profileMatches(p, query)),
  }
  // "More domains" sits before "Any organization"; installed packs' profiles come last.
  return [...builtin.slice(0, -1), more, ...builtin.slice(-1), packs].filter(
    (g) => g.profiles.length > 0,
  )
}

/**
 * Where a non-built-in profile comes from, for its ProvenanceBadge (#269): "Pack: Freight Rail
 * 1.0.0" for an enabled pack's profile; for the project's own snapshot (its copy, #263) "From
 * Freight Rail 1.0.0", marked not installed when the pack is gone or update available when the
 * installed pack has another version of the profile.
 */
export function profileProvenance(
  profileId: string,
  snapshot?: DomainProfileSnapshot,
): Provenance | undefined {
  if (snapshot?.profile.id === profileId) {
    const status = snapshotStatus(snapshot)
    const packName = snapshot.packName ?? status.entry?.packName
    return {
      origin: 'copy',
      packId: snapshot.packId,
      ...(packName ? { packName } : {}),
      version: snapshot.version,
      packMissing: !status.installed,
      updateAvailable: status.updateAvailable,
      ...(status.entry ? { installedVersion: status.entry.packVersion } : {}),
    }
  }
  const entry = packProfileEntries().find((e) => e.profile.id === profileId)
  if (entry)
    return {
      origin: 'pack',
      packId: entry.packId,
      packName: entry.packName,
      version: entry.packVersion,
    }
  const bundled = bundledProfileEntries().find((e) => e.profile.id === profileId)
  if (!bundled) return undefined
  return {
    origin: 'pack',
    bundled: true,
    packId: bundled.packId,
    packName: bundled.packName,
  }
}

export interface ResolvedOrgType {
  profile: DomainProfile
  /** The stored value is not the profile id (a legacy value, an alias, or free text). */
  differs: boolean
  /** The stored value names no profile, alias or snapshot; it falls back to generic. */
  unknown: boolean
}

/** How a stored orgType resolves ("hospital" → Healthcare, "utility" → Energy utility). */
export function resolveOrgType(orgType: string, snapshot?: DomainProfileSnapshot): ResolvedOrgType {
  const profile = baseProfile(orgType, snapshot)
  const key = domainKey(orgType)
  const known = key === profile.id || profile.aliases.some((a) => domainKey(a) === key)
  return { profile, differs: orgType !== profile.id, unknown: !known }
}

export const profileLabel = (id: string): string => builtinProfile(id).label

// ---- threat families ----------------------------------------------------------------------

export const threatFamiliesFor = (profile: DomainProfile): ThreatFamily[] =>
  profile.threatFamilies.map((id) => threatFamily(id))

export const threatLabel = (id: ThreatFamilyId): string =>
  THREAT_FAMILIES.find((t) => t.id === id)?.label ?? id

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The family's keywords that appear as whole words in `text` (same rule as the pipeline). */
export function matchedKeywords(id: ThreatFamilyId, text: string): string[] {
  const t = text.toLowerCase().replace(/\s+/g, ' ')
  return threatFamily(id).keywords.filter((k) => new RegExp(`\\b${escapeRe(k.trim())}\\b`).test(t))
}

export type SuggestionReason =
  { kind: 'idea' } | { kind: 'keywords'; words: string[] } | { kind: 'default' }

export interface ThreatSuggestion {
  id: ThreatFamilyId
  reason: SuggestionReason
}

export interface BriefText {
  userPrompt: string
  learningObjectives: string[]
  constraints: string[]
}

const ideaText = (idea: ScenarioIdea) =>
  [idea.title, idea.hook, idea.threat, ...idea.systemsAffected].join('\n')

/**
 * The family generation would settle on when the designer picks none (mirrors the main
 * process's briefWithThreat): the idea's family when the profile supports it, else keyword
 * hits in the idea and brief, else the profile's default.
 */
export function suggestThreat(
  profile: DomainProfile,
  brief: BriefText,
  idea?: ScenarioIdea | null,
): ThreatSuggestion {
  if (idea?.threatFamily && profile.threatFamilies.includes(idea.threatFamily))
    return { id: idea.threatFamily, reason: { kind: 'idea' } }
  const text = [
    idea ? ideaText(idea) : '',
    brief.userPrompt,
    ...brief.learningObjectives,
    ...brief.constraints,
  ].join('\n')
  const id = chooseThreatFamily(profile, text)
  const words = matchedKeywords(id, text)
  return { id, reason: words.length ? { kind: 'keywords', words } : { kind: 'default' } }
}

/** One sentence saying why a family was suggested. */
export function suggestionWhy(s: ThreatSuggestion, profile: DomainProfile): string {
  if (s.reason.kind === 'idea') return 'the idea you are developing describes this kind of incident'
  if (s.reason.kind === 'keywords') {
    const words = s.reason.words.slice(0, 4).map((w) => `“${w}”`)
    return `the brief mentions ${words.join(', ')}`
  }
  return `nothing in the brief points elsewhere, and it is the default for ${profile.label} projects`
}

/** The family an idea card shows: the idea's own, else what its text suggests. */
export function ideaFamily(idea: ScenarioIdea, profile: DomainProfile): ThreatFamilyId {
  if (idea.threatFamily) return idea.threatFamily
  return chooseThreatFamily(profile, ideaText(idea))
}
