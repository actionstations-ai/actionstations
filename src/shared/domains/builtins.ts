// The thirteen built-in domain profiles (ADR-0014), parsed once at load.
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
import { DomainProfile } from './schema'

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

/** Ids of the built-in profiles only (pack profiles: `isDomainId`, `listProfiles`). */
export const DOMAIN_IDS = DOMAIN_PROFILES.map((p) => p.id)

export const GENERIC_PROFILE: DomainProfile = DOMAIN_PROFILES.find((p) => p.id === 'generic')!

/** How an orgType or alias is compared: trimmed, lower case, spaces and dashes as `_`. */
export const domainKey = (v: string | undefined): string =>
  (v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
