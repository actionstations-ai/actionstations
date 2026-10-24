// The compiled-in generic profile (ADR-0020). Domain profiles are data in the bundled packs
// (packs/domains/<id>.json, registered at startup); generic is also compiled in as the
// fallback for code that runs before the bundled packs are registered (main before startup,
// the renderer before domains:list answers, tests) and for an orgType nothing answers to.
import generic from '../../../packs/domains/generic.json' with { type: 'json' }
import { DomainProfile } from './schema'

export const GENERIC_PROFILE: DomainProfile = DomainProfile.parse(generic)

/** How an orgType or alias is compared: trimmed, lower case, spaces and dashes as `_`. */
export const domainKey = (v: string | undefined): string =>
  (v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
