/**
 * Who is in the room: the controller's view of each joined device and the `welcome` it answers
 * (spec 0406 lifecycle; the full roster with reseating is 0411's). A staff claim without a valid
 * proof is refused; a player's `requestedRole` must be one of the scenario's roles.
 */
import type { Opened } from '@shared/live/codec'
import type { SessionKeys } from '@shared/live/crypto/keys'
import { verifyJoin } from '@shared/live/join'
import type {
  ClientId,
  ClientKind,
  ClockState,
  JoinPayload,
  WelcomePayload,
} from '@shared/live/schemas'
import type { Attribution } from '@shared/schemas/live'
import type { Role } from '@shared/schemas/project'

export interface Seat {
  clientId: ClientId
  kind: ClientKind
  roleId?: string
  name: string
  /** Proven holder of the staff key (not the claim). */
  staff: boolean
  ecdhPub: Uint8Array
  joinedAt: number
  online: boolean
}

export interface SeatingContext {
  keys: SessionKeys
  roles: Role[]
  attribution: Attribution
  sessionName: string
  scenarioTitle: string
  clock: () => ClockState
}

export type Seating =
  | { ok: true; seat: Seat; welcome: WelcomePayload }
  | { ok: false; welcome: WelcomePayload; reason: 'not_allowed' | 'role_taken' | 'full' }

function teamId(role: Role): string | undefined {
  const slug = role.team
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || undefined
}

function roleEntry(role: Role): NonNullable<WelcomePayload['role']> {
  const team = teamId(role)
  return {
    id: role.id,
    name: role.name,
    ...(role.abbreviation ? { abbreviation: role.abbreviation.slice(0, 12) } : {}),
    ...(team ? { teamId: team, teamName: role.team } : {}),
  }
}

const FEATURES = { messages: false, votes: false, hotwash: false, surveys: false, eval: false }

export class Seats {
  readonly byClient = new Map<ClientId, Seat>()

  constructor(private readonly ctx: SeatingContext) {}

  get connected(): number {
    return [...this.byClient.values()].filter((s) => s.online).length
  }

  private base(clientId: ClientId, kind: ClientKind): Omit<WelcomePayload, 'roster'> {
    return {
      client: clientId,
      kind,
      attribution: this.ctx.attribution,
      sessionName: this.ctx.sessionName,
      scenarioTitle: this.ctx.scenarioTitle,
      clock: this.ctx.clock(),
      features: FEATURES,
    }
  }

  private roster(): WelcomePayload['roster'] {
    return [...this.byClient.values()]
      .filter((s) => s.online)
      .slice(0, 200)
      .map((s) => ({
        client: s.clientId,
        name: this.ctx.attribution === 'named' ? s.name : '',
        ...(s.roleId ? { roleId: s.roleId } : {}),
        kind: s.kind,
      }))
  }

  /** Decide a seat for a `join` and build the `welcome` to answer with. */
  async seat(msg: Opened<'join'>, now = Date.now()): Promise<Seating> {
    const verdict = await verifyJoin(this.ctx.keys, msg)
    const join = msg.payload as JoinPayload
    const refuse = (reason: 'not_allowed' | 'role_taken' | 'full', message: string): Seating => ({
      ok: false,
      reason,
      welcome: { ...this.base(msg.from, join.kind), roster: [], rejected: { reason, message } },
    })
    if (verdict.claimedStaff && !verdict.staff) {
      return refuse('not_allowed', 'This link does not open a staff seat. Ask for the staff link.')
    }
    const role = join.requestedRole
      ? this.ctx.roles.find((r) => r.id === join.requestedRole)
      : undefined
    if (join.requestedRole && !role)
      return refuse('not_allowed', 'That role is not in this exercise.')
    const existing = this.byClient.get(msg.from)
    const seat: Seat = {
      clientId: msg.from,
      kind: join.kind,
      ...(role ? { roleId: role.id } : {}),
      name: join.name,
      staff: verdict.staff,
      ecdhPub: verdict.ecdhPub,
      joinedAt: existing?.joinedAt ?? now,
      online: true,
    }
    this.byClient.set(msg.from, seat)
    const welcome: WelcomePayload = {
      ...this.base(msg.from, join.kind),
      ...(role ? { role: roleEntry(role) } : {}),
      roster: this.roster(),
    }
    return { ok: true, seat, welcome }
  }

  presence(clientId: ClientId, online: boolean): Seat | undefined {
    const seat = this.byClient.get(clientId)
    if (seat) seat.online = online
    return seat
  }
}
