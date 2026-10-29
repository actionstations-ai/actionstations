// Pure helpers of the hot wash capture and decision log (#419).
import type { Scenario } from '@shared/schemas/scenario'

/** A role's abbreviation or name; the id itself when the role is gone. Never a person. */
export function roleLabelOf(scenario: Scenario, roleId: string | undefined): string {
  if (!roleId) return ''
  const r = scenario.roles.find((x) => x.id === roleId)
  return r ? r.abbreviation || r.name : roleId
}
