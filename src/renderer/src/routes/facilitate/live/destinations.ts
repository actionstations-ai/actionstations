// The destinations a facilitator can pick for a live release (#412).
import type { Destination } from '@shared/live/schemas/envelope'
import { teamSlug } from '@shared/live/targets'
import type { Scenario } from '@shared/schemas/scenario'

export interface Choice {
  value: Destination
  label: string
}

/** Every destination a facilitator can pick: everyone, each team, each role. */
export function destinationChoices(roles: Scenario['roles']): Choice[] {
  const teams = new Map<string, string>()
  for (const r of roles) {
    const slug = teamSlug(r.team)
    if (slug) teams.set(slug, r.team)
  }
  return [
    { value: 'all', label: 'Everyone' },
    ...[...teams].map(([slug, name]) => ({
      value: `team:${slug}` as Destination,
      label: `Team: ${name}`,
    })),
    ...roles.map((r) => ({ value: `role:${r.id}` as Destination, label: r.name })),
  ]
}
