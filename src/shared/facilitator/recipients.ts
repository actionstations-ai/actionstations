/**
 * Who an MSEL row goes to (spec 0428 FR-5): the listed roles plus every role on a listed team.
 * Pure, so the timeline, the hand-out label and the live release agree.
 */
import type { Role } from '../schemas/project'
import type { MselRow } from '../schemas/scenario'

type RoleLike = Pick<Role, 'id' | 'team'> & Partial<Pick<Role, 'name' | 'abbreviation'>>
type RowLike = Pick<MselRow, 'toRoleIds' | 'toLabel'> & { toTeams?: readonly string[] | undefined }

export interface Recipients {
  roleIds: string[]
  /** Teams named on the row (as written on the roles). */
  teams: string[]
  label: string
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const roleName = (r: RoleLike) => r.abbreviation || r.name || r.id

/** Role ids on the named teams, in role order. */
export function rolesOfTeams(teams: readonly string[], roles: readonly RoleLike[]): string[] {
  return roles.filter((r) => r.team && teams.some((t) => same(t, r.team))).map((r) => r.id)
}

/** "Ops team, PIO": whole teams first, then the roles not already covered by them. */
function describeRecipients(
  roleIds: string[],
  teams: string[],
  roles: readonly RoleLike[],
): string {
  const covered = new Set(rolesOfTeams(teams, roles))
  const names = roleIds
    .filter((id) => !covered.has(id))
    .map((id) => {
      const r = roles.find((x) => x.id === id)
      return r ? roleName(r) : id
    })
  return [...teams.map((t) => `${t} team`), ...names].join(', ')
}

/**
 * The resolved recipients of a row. `override` (role ids chosen for one delivery) replaces the
 * plan. A row that names nobody goes to everyone, so its role list is empty and the label is
 * the row's own `toLabel` (or a dash).
 */
export function recipients(
  row: RowLike,
  roles: readonly RoleLike[],
  override?: readonly string[],
): Recipients {
  if (override) {
    const roleIds = [...new Set(override)]
    return { roleIds, teams: [], label: describeRecipients(roleIds, [], roles) || '—' }
  }
  const teams = (row.toTeams ?? []).filter((t) => roles.some((r) => same(r.team, t)))
  const roleIds = [...new Set([...row.toRoleIds, ...rolesOfTeams(teams, roles)])]
  const label = row.toLabel || describeRecipients(row.toRoleIds, teams, roles) || '—'
  return { roleIds, teams, label }
}

/** Whether a row is addressed to the team or role (for the timeline filter). */
export function addressedTo(
  row: RowLike,
  roles: readonly RoleLike[],
  filter: { team?: string; roleId?: string },
): boolean {
  const { roleIds } = recipients(row, roles)
  // A row that names nobody (or "All") goes to everyone, so it shows under every filter.
  if (roleIds.length === 0) return true
  if (filter.roleId) return roleIds.includes(filter.roleId)
  if (filter.team) {
    const members = rolesOfTeams([filter.team], roles)
    return members.some((m) => roleIds.includes(m))
  }
  return true
}

/** Team names in use, sorted. */
export function teamNames(roles: readonly Pick<Role, 'team'>[]): string[] {
  return [...new Set(roles.map((r) => r.team.trim()).filter(Boolean))].sort()
}
