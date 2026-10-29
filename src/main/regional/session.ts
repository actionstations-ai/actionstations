// The joint live session of a regional exercise (spec 0440 FR-19 to FR-22). Two pure parts:
//   buildRoster   the signed controller roster payload the host sends (spec 0406): each
//                 organization's pinned live key, scoped to its row prefix and roles
//   sliceLog      the part of the host's session log one organization receives at the end:
//                 exercise-wide events, events of its roles and rows, and messages in the
//                 cross-organization channels it takes part in
import { ControllerRosterPayload } from '@shared/live/schemas'
import type { SessionLogEntry } from '@shared/schemas/live'
import type { RegionalState } from '@shared/schemas/regional'

export interface RosterRole {
  id: string
  owner?: string
}

/** Co-controllers for every organization whose live key is pinned; the host is not listed. */
export function buildRoster(
  state: Pick<RegionalState, 'orgs' | 'hostOrg'>,
  roles: readonly RosterRole[],
  revision = 1,
): ControllerRosterPayload {
  const controllers = state.orgs
    .filter((o) => o.orgId !== state.hostOrg && o.liveKey)
    .map((o) => ({
      id: o.orgId,
      name: o.name,
      publicKey: o.liveKey!,
      scope: {
        rowPrefixes: [o.prefix],
        roleIds: roles.filter((r) => r.owner === o.orgId).map((r) => r.id),
      },
    }))
  return ControllerRosterPayload.parse({ revision, controllers })
}

/** Organizations that cannot be added to the roster yet: no pinned live key. */
export const orgsWithoutLiveKey = (state: Pick<RegionalState, 'orgs' | 'hostOrg'>): string[] =>
  state.orgs.filter((o) => o.orgId !== state.hostOrg && !o.liveKey).map((o) => o.orgId)

const EXERCISE_WIDE = new Set<SessionLogEntry['kind']>([
  'session.start',
  'session.resume',
  'session.end',
  'clock.state',
])

export interface LogSliceContext {
  prefix: string
  roleIds: ReadonlySet<string>
  /** Channels (id or label) that include one of the organization's roles. */
  channels: ReadonlySet<string>
}

export function sliceContext(
  state: Pick<RegionalState, 'orgs' | 'crossOrgChannels'>,
  roles: readonly RosterRole[],
  orgId: string,
): LogSliceContext {
  const org = state.orgs.find((o) => o.orgId === orgId)
  const roleIds = new Set(roles.filter((r) => r.owner === orgId).map((r) => r.id))
  const channels = new Set<string>()
  for (const c of state.crossOrgChannels)
    if (c.roleIds.some((r) => roleIds.has(r))) {
      channels.add(c.id)
      channels.add(c.label)
    }
  return { prefix: org?.prefix ?? '', roleIds, channels }
}

const inPrefix = (id: string | undefined, prefix: string): boolean =>
  !!id && !!prefix && (id === prefix || id.startsWith(`${prefix}-`) || id.startsWith(`${prefix}_`))

function channelOf(e: SessionLogEntry): string | undefined {
  const fromData = e.data['channel']
  return e.ref?.channel ?? (typeof fromData === 'string' ? fromData : undefined)
}

export function inLogSlice(e: SessionLogEntry, ctx: LogSliceContext): boolean {
  if (EXERCISE_WIDE.has(e.kind)) return true
  if (inPrefix(e.ref?.rowId, ctx.prefix)) return true
  const role = e.actor.seat?.roleId
  if (role && ctx.roleIds.has(role)) return true
  const channel = channelOf(e)
  if (!channel) return false
  if (ctx.channels.has(channel)) return true
  return channel.startsWith('role:') && ctx.roleIds.has(channel.slice(5))
}

/** One organization's slice of the host's log, in the original order. */
export function sliceLog(
  entries: readonly SessionLogEntry[],
  ctx: LogSliceContext,
): SessionLogEntry[] {
  return entries.filter((e) => inLogSlice(e, ctx))
}

/** Per-organization slices; the full log goes to everyone only when the frame says so (FR-22). */
export function sliceLogsFor(
  entries: readonly SessionLogEntry[],
  state: Pick<RegionalState, 'orgs' | 'crossOrgChannels' | 'shareFullLog'>,
  roles: readonly RosterRole[],
): Map<string, SessionLogEntry[]> {
  return new Map(
    state.orgs.map((o) => [
      o.orgId,
      state.shareFullLog ? [...entries] : sliceLog(entries, sliceContext(state, roles, o.orgId)),
    ]),
  )
}
