/**
 * Who a released MSEL row goes to (spec 0412 FR-2). Pure, so the Facilitate page shows the same
 * chips the main process sends to.
 */
import type { Role } from '../schemas/project'
import type { MselRow } from '../schemas/scenario'
import { rolesOfTeams } from '../facilitator/recipients'
import { Destination } from './schemas/envelope'

/** The `team:` slug of a team name, or undefined for a role with no team. */
export function teamSlug(team: string): string | undefined {
  const slug = team
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || undefined
}

const isDestination = (d: string): boolean => Destination.safeParse(d).success

/**
 * FR-2: the destinations a row goes to. Rows for everyone, the main screen, and rows naming
 * nobody go to `all`; otherwise each role, with a whole team collapsed to `team:<slug>`.
 */
export function resolveTargets(
  row: Pick<MselRow, 'toRoleIds' | 'toLabel'> & { toTeams?: readonly string[] | undefined },
  deliveryMode: string | undefined,
  roles: readonly Pick<Role, 'id' | 'team'>[],
): Destination[] {
  const label = row.toLabel?.trim().toLowerCase()
  const ids = [...new Set([...row.toRoleIds, ...rolesOfTeams(row.toTeams ?? [], roles)])].filter(
    (id) => isDestination(`role:${id}`),
  )
  if (deliveryMode === 'display_main_screen' || label === 'all' || ids.length === 0) return ['all']
  const wanted = new Set(ids)
  const teams = new Map<string, string[]>()
  for (const r of roles) {
    const slug = teamSlug(r.team)
    if (slug) teams.set(slug, [...(teams.get(slug) ?? []), r.id])
  }
  const out: Destination[] = []
  const covered = new Set<string>()
  for (const [slug, members] of teams) {
    if (
      members.length > 1 &&
      members.every((m) => wanted.has(m)) &&
      isDestination(`team:${slug}`)
    ) {
      out.push(`team:${slug}`)
      members.forEach((m) => covered.add(m))
    }
  }
  for (const id of ids) if (!covered.has(id)) out.push(`role:${id}`)
  return out
}
