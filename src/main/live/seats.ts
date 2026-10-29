/**
 * Who is in the room: the controller's view of each joined device and the `welcome` it answers
 * (spec 0406 lifecycle, 0411 handshake). A first `join` with no `requestedRole` gets a lobby
 * welcome: no `role`, the `seats` a device may pick (the scenario's roles plus the evaluator
 * and observer seats) with how many devices hold each. A `join` naming a seat gets the seated
 * welcome; a device the controller already seated gets its seat back on a later join. A staff
 * claim without a valid proof is refused. Other devices appear in `roster` under per-session
 * pseudonyms, never their client ids (#457 review L4).
 */
import type { Opened } from '@shared/live/codec'
import type { SessionKeys } from '@shared/live/crypto/keys'
import { verifyJoin } from '@shared/live/join'
import {
  RESERVED_ROLE_IDS,
  type ClientId,
  type ClientKind,
  type ClockState,
  type JoinPayload,
  type Seat as SeatDef,
  type WelcomePayload,
} from '@shared/live/schemas'
import { teamSlug } from '@shared/live/targets'
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
  /**
   * A per-session pseudonym for a client id (22 base64url characters): what other devices see
   * in `welcome.roster`, so a player page never learns real client ids.
   */
  pseudonym: (clientId: ClientId) => Promise<ClientId>
}

export type Seating =
  | { ok: true; seat: Seat; welcome: WelcomePayload; lobby: boolean }
  | { ok: false; welcome: WelcomePayload; reason: 'not_allowed' | 'role_taken' | 'full' }

type SeatShape = Omit<SeatDef, 'taken'>

function seatOfRole(role: Role): SeatShape {
  const team = teamSlug(role.team)
  return {
    id: role.id,
    name: role.name.slice(0, 80),
    ...(role.abbreviation ? { abbreviation: role.abbreviation.slice(0, 12) } : {}),
    ...(team ? { teamId: team, teamName: role.team.slice(0, 80) } : {}),
    kind: 'player',
  }
}

const STAFF_SEAT_KINDS: ReadonlySet<ClientKind> = new Set(['evaluator', 'simcell'])
const FEATURES = { messages: true, votes: true, hotwash: false, surveys: false, eval: true }

export class Seats {
  readonly byClient = new Map<ClientId, Seat>()
  private readonly defs: SeatShape[]

  constructor(private readonly ctx: SeatingContext) {
    this.defs = [
      ...ctx.roles.map(seatOfRole),
      { id: RESERVED_ROLE_IDS[0], name: 'Evaluator', kind: 'evaluator' },
      { id: RESERVED_ROLE_IDS[1], name: 'Observer', kind: 'observer' },
    ]
  }

  get connected(): number {
    return [...this.byClient.values()].filter((s) => s.online).length
  }

  /** The seats with how many connected devices hold each (`taken`). */
  seats(): SeatDef[] {
    return this.defs.map((d) => ({ ...d, taken: this.takenBy(d.id) }))
  }

  private takenBy(roleId: string, except?: ClientId): number {
    let n = 0
    for (const s of this.byClient.values()) {
      if (s.online && s.roleId === roleId && s.clientId !== except) n += 1
    }
    return n
  }

  private base(clientId: ClientId, kind: ClientKind): Omit<WelcomePayload, 'roster'> {
    return {
      client: clientId,
      kind,
      attribution: this.ctx.attribution,
      sessionName: this.ctx.sessionName,
      scenarioTitle: this.ctx.scenarioTitle,
      clock: this.ctx.clock(),
      seats: this.seats(),
      features: FEATURES,
    }
  }

  /** Seated, online devices under pseudonyms: roles and (in a named session) names, never ids. */
  private async roster(): Promise<WelcomePayload['roster']> {
    const online = [...this.byClient.values()]
      .filter((s) => s.online && s.roleId && s.kind !== 'observer')
      .slice(0, 200)
    return Promise.all(
      online.map(async (s) => ({
        client: await this.ctx.pseudonym(s.clientId),
        name: this.ctx.attribution === 'named' ? s.name : '',
        ...(s.roleId ? { roleId: s.roleId } : {}),
        kind: s.kind,
      })),
    )
  }

  private roleEntry(roleId: string): WelcomePayload['role'] {
    const def = this.defs.find((d) => d.id === roleId)
    if (!def) return undefined
    const { kind: _kind, ...role } = def
    return role
  }

  /** Decide a seat for a `join` and build the `welcome` to answer with. */
  async seat(msg: Opened<'join'>, now = Date.now()): Promise<Seating> {
    const verdict = await verifyJoin(this.ctx.keys, msg)
    const join = msg.payload as JoinPayload
    const existing = this.byClient.get(msg.from)
    const refuse = (reason: 'not_allowed' | 'role_taken' | 'full', message: string): Seating => ({
      ok: false,
      reason,
      welcome: { ...this.base(msg.from, join.kind), roster: [], rejected: { reason, message } },
    })
    if (verdict.claimedStaff && !verdict.staff) {
      return refuse('not_allowed', 'This link does not open a staff seat. Ask for the staff link.')
    }
    const requested = join.requestedRole
    const def = requested ? this.defs.find((d) => d.id === requested) : undefined
    if (requested && !def) return refuse('not_allowed', 'That seat is not in this exercise.')
    if (def) {
      if (def.kind !== join.kind) {
        return refuse('not_allowed', 'That seat is for another kind of participant.')
      }
      if (STAFF_SEAT_KINDS.has(def.kind) && !verdict.staff) {
        return refuse('not_allowed', 'That seat needs the staff link.')
      }
    }
    const roleId = def?.id ?? existing?.roleId
    const seat: Seat = {
      clientId: msg.from,
      kind: join.kind,
      ...(roleId ? { roleId } : {}),
      name: join.name,
      staff: verdict.staff,
      ecdhPub: verdict.ecdhPub,
      joinedAt: existing?.joinedAt ?? now,
      online: true,
    }
    this.byClient.set(msg.from, seat)
    const role = roleId ? this.roleEntry(roleId) : undefined
    const welcome: WelcomePayload = {
      ...this.base(msg.from, join.kind),
      ...(role ? { role } : {}),
      roster: await this.roster(),
    }
    return { ok: true, seat, welcome, lobby: !roleId }
  }

  presence(clientId: ClientId, online: boolean): Seat | undefined {
    const seat = this.byClient.get(clientId)
    if (seat) seat.online = online
    return seat
  }
}
