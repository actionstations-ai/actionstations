// Domain profile registry (ADR-0014). `resolveProfile(orgType, overrides)` is what the
// pipeline, the lints, the facility-fact extractor and the media planner all go through.
import { airport } from './profiles/airport'
import { campus } from './profiles/campus'
import { energy_utility } from './profiles/energy_utility'
import { generic } from './profiles/generic'
import { healthcare } from './profiles/healthcare'
import { industrial } from './profiles/industrial'
import { municipal } from './profiles/municipal'
import { port_maritime } from './profiles/port_maritime'
import { stadium_venue } from './profiles/stadium_venue'
import { transit } from './profiles/transit'
import { unmanned_systems } from './profiles/unmanned_systems'
import { water_dam } from './profiles/water_dam'
import { water_utility } from './profiles/water_utility'
import {
  DomainProfile,
  type DomainProfileOverrides,
  type ThreatFamily,
  type ThreatFamilyId,
} from './schema'
import { inferThreatFamily, isThreatFamilyId, threatFamily } from './threats'

export * from './schema'
export { THREAT_FAMILIES, inferThreatFamily, isThreatFamilyId, threatFamily } from './threats'

/** Built-in profiles, in the order a picker should list them. */
export const DOMAIN_PROFILES: readonly DomainProfile[] = [
  airport,
  transit,
  water_dam,
  water_utility,
  energy_utility,
  healthcare,
  campus,
  stadium_venue,
  port_maritime,
  municipal,
  industrial,
  unmanned_systems,
  generic,
].map((p) => DomainProfile.parse(p))

export const DOMAIN_IDS = DOMAIN_PROFILES.map((p) => p.id)

const byIdOrAlias = new Map<string, DomainProfile>()
for (const p of DOMAIN_PROFILES) {
  byIdOrAlias.set(p.id, p)
  for (const a of p.aliases) byIdOrAlias.set(a, p)
}

/** The built-in profile an orgType names (by id or alias, case-insensitive); generic otherwise. */
export function builtinProfile(orgType: string | undefined): DomainProfile {
  const key = (orgType ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return byIdOrAlias.get(key) ?? generic
}

export const isDomainId = (v: unknown): v is string =>
  typeof v === 'string' &&
  byIdOrAlias.has(
    v
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_'),
  )

/**
 * The effective profile of a project: the built-in one for its orgType with the project's
 * overrides applied field by field (an override replaces the whole field). The profile keeps
 * its built-in id so templates, lints and tags keyed by domain id still apply.
 */
export function resolveProfile(
  orgType: string | undefined,
  overrides?: DomainProfileOverrides,
): DomainProfile {
  const base = builtinProfile(orgType)
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
