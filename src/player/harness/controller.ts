/**
 * A scripted facilitator for the player page: a real controller `LiveClient` over the in-memory
 * server that answers joins the way `src/main/live/session.ts` will (lobby welcome with the
 * seats, seated welcome or rejection, resume), keeps a roster from `join` and `presence`, and
 * exposes the facilitator actions the page must handle (notice, release, clock, reseat, kick,
 * end). Development and tests only; it never ships in the app.
 */
import { fromBase64Url, toBase64Url } from '../../shared/live/bytes'
import { LiveClient } from '../../shared/live/client'
import type { Opened } from '../../shared/live/codec'
import { SessionKeys } from '../../shared/live/crypto/keys'
import type { CryptoProvider, KeyPair } from '../../shared/live/crypto/provider'
import { buildInvite } from '../../shared/live/invite'
import { verifyJoin } from '../../shared/live/join'
import type { ConnectionKind, KeyKind } from '../../shared/live/protocol'
import type { RekeyClient } from '../../shared/live/rekey'
import {
  RESERVED_ROLE_IDS,
  type ClientId,
  type ClientKind,
  type ClockState,
  type Destination,
  type InjectReleasePayload,
  type Seat,
  type WelcomePayload,
} from '../../shared/live/schemas'
import { MemoryServer, settle } from '../../shared/live/transport-memory'

export interface RosterEntry {
  clientId: ClientId
  kind: ClientKind
  name: string
  roleId?: string
  ecdhPub: Uint8Array
  staff: boolean
  connected: boolean
  joins: number
  ua?: string
}

export type SeatDef = Omit<Seat, 'taken'>

export interface HarnessControllerOptions {
  crypto: CryptoProvider
  sessionId?: string
  connection?: ConnectionKind
  sessionName?: string
  scenarioTitle?: string
  attribution?: 'role' | 'named'
  seats?: SeatDef[]
  features?: WelcomePayload['features']
  clock?: ClockState
  now?: () => number
}

export const DEFAULT_SEATS: SeatDef[] = [
  {
    id: 'ops-director',
    name: 'Operations Director',
    abbreviation: 'OPS',
    teamId: 'ops',
    teamName: 'Operations',
    kind: 'player',
    capacity: 1,
  },
  {
    id: 'it-director',
    name: 'IT Director',
    abbreviation: 'IT',
    teamId: 'it',
    teamName: 'IT and cybersecurity',
    kind: 'player',
    capacity: 1,
  },
  {
    id: 'pio',
    name: 'Public Information Officer',
    abbreviation: 'PIO',
    teamId: 'ops',
    teamName: 'Operations',
    kind: 'player',
    capacity: 2,
  },
  {
    id: 'asc',
    name: 'Airport Security Coordinator',
    abbreviation: 'ASC',
    teamId: 'security',
    teamName: 'Security',
    kind: 'player',
  },
  { id: RESERVED_ROLE_IDS[0], name: 'Evaluator', kind: 'evaluator', capacity: 2 },
  { id: RESERVED_ROLE_IDS[1], name: 'Observer', kind: 'observer' },
]

// A client id is exactly 22 base64url characters.
const CONTROLLER_ID = 'harness-controller0000'

function newSessionId(crypto: CryptoProvider): string {
  return toBase64Url(crypto.random(16))
}

/** A message the harness saw or sent (spec 0413), for assertions. */
export interface HarnessMessage {
  messageId: string
  channel: string
  /** `player` for a seat's message, `controller` for a reply. */
  from: 'player' | 'controller'
  roleId?: string
  text: string
  persona?: string
  /** Sizes of the attachments the controller fetched and opened. */
  attachmentBytes: number[]
  at: number
}

export class HarnessController {
  readonly roster = new Map<ClientId, RosterEntry>()
  readonly seatDefs: SeatDef[]
  clock: ClockState
  base = 'http://127.0.0.1'
  /** Every frame the controller received, for assertions. */
  readonly received: Opened[] = []
  private releases = 0
  /** Messages in order, both directions. */
  readonly messageLog: HarnessMessage[] = []
  /** Message ids pinned to the hot wash (log-only, as the app does). */
  readonly pinned: string[] = []
  private readonly echoes = new Map<string, Record<string, unknown>>()

  private constructor(
    readonly crypto: CryptoProvider,
    readonly sessionId: string,
    readonly keys: SessionKeys,
    readonly signing: KeyPair,
    readonly server: MemoryServer,
    readonly client: LiveClient,
    private readonly opts: HarnessControllerOptions,
  ) {
    this.seatDefs = opts.seats ?? DEFAULT_SEATS
    this.clock = opts.clock ?? { elapsedMin: 0, rate: 1 }
    client.onAny((m) => this.received.push(m))
    client.on('join', (m) => void this.onJoin(m))
    client.on('message.send', (m) => void this.onMessage(m))
    client.on('presence', (m) => {
      const entry = this.roster.get(m.payload.client)
      if (entry) entry.connected = m.payload.state === 'online'
    })
  }

  static async create(opts: HarnessControllerOptions): Promise<HarnessController> {
    const sessionId = opts.sessionId ?? newSessionId(opts.crypto)
    const keys = await SessionKeys.create(opts.crypto, sessionId)
    const signing = await opts.crypto.ecdsaGenerate()
    const server = new MemoryServer({
      sessionId,
      kind: opts.connection ?? 'lan',
      joinTokenHash: await keys.joinTokenHash(),
      crypto: opts.crypto,
      version: 'harness',
      ...(opts.now ? { now: opts.now } : {}),
    })
    const client = new LiveClient({
      transport: await server.connect({ clientId: CONTROLLER_ID, controller: true }),
      keys,
      clientId: CONTROLLER_ID,
      role: 'controller',
      crypto: opts.crypto,
      controllerPub: signing.publicKey,
      signer: signing.privateKey,
      ...(opts.now ? { now: opts.now } : {}),
    })
    await settle()
    return new HarnessController(opts.crypto, sessionId, keys, signing, server, client, opts)
  }

  /** The invite link of one kind, optionally with a role hint (a per-role card). */
  invite(kind: KeyKind = 'players', roleHint?: string): string {
    return buildInvite({
      base: this.base,
      sessionId: this.sessionId,
      epoch: this.keys.currentEpoch,
      key: { kind, root: this.keys.root(kind)! },
      controllerPub: this.signing.publicKey,
      controllerEcdhPub: this.keys.controllerEcdhPub!,
      ...(roleHint ? { roleHint } : {}),
    })
  }

  /** Seats with how many connected devices hold each one. */
  seats(): Seat[] {
    return this.seatDefs.map((s) => ({ ...s, taken: this.takenBy(s.id) }))
  }

  private takenBy(roleId: string, except?: ClientId): number {
    let n = 0
    for (const e of this.roster.values()) if (e.roleId === roleId && e.clientId !== except) n += 1
    return n
  }

  private async onJoin(m: Opened<'join'>): Promise<void> {
    const verdict = await verifyJoin(this.keys, m)
    const existing = this.roster.get(m.from)
    const entry: RosterEntry = existing ?? {
      clientId: m.from,
      kind: m.payload.kind,
      name: '',
      ecdhPub: verdict.ecdhPub,
      staff: verdict.staff,
      connected: true,
      joins: 0,
    }
    entry.joins += 1
    entry.connected = true
    entry.ecdhPub = verdict.ecdhPub
    entry.staff = verdict.staff
    if (m.payload.ua) entry.ua = m.payload.ua
    this.roster.set(m.from, entry)

    const requested = m.payload.requestedRole
    if (!requested) {
      // A resume with no seat request keeps the seat; a first join is a lobby welcome.
      // A device the controller already seated gets its seat back (a reload, a resume).
      if (entry.roleId) return this.welcome(entry)
      return this.welcome(entry, { lobby: true })
    }
    const seat = this.seatDefs.find((s) => s.id === requested)
    if (!seat) return this.reject(entry, 'not_allowed', 'There is no such seat.')
    if (seat.kind !== m.payload.kind)
      return this.reject(entry, 'not_allowed', 'That seat is for another kind of participant.')
    if ((seat.kind === 'evaluator' || seat.kind === 'simcell') && !verdict.staff)
      return this.reject(entry, 'not_allowed', 'That seat needs the staff link.')
    if (seat.capacity !== undefined && this.takenBy(seat.id, m.from) >= seat.capacity)
      return this.reject(entry, 'full', 'That seat is full.')
    entry.kind = m.payload.kind
    entry.roleId = seat.id
    entry.name = m.payload.name
    return this.welcome(entry)
  }

  /** Seats and names only for players; staff welcomes also carry the client ids. */
  private rosterPayload(forStaff: boolean): WelcomePayload['roster'] {
    return [...this.roster.values()]
      .filter((e) => e.connected && e.roleId && e.kind !== 'observer')
      .map((e) => ({
        ...(forStaff ? { client: e.clientId } : {}),
        name: e.name,
        roleId: e.roleId!,
        kind: e.kind,
      }))
  }

  private async welcome(entry: RosterEntry, opts: { lobby?: boolean } = {}): Promise<void> {
    const seat = opts.lobby ? undefined : this.seatDefs.find((s) => s.id === entry.roleId)
    const payload: WelcomePayload = {
      client: entry.clientId,
      kind: entry.kind,
      attribution: this.opts.attribution ?? 'role',
      ...(seat
        ? {
            role: {
              id: seat.id,
              name: seat.name,
              ...(seat.abbreviation ? { abbreviation: seat.abbreviation } : {}),
              ...(seat.teamId ? { teamId: seat.teamId } : {}),
              ...(seat.teamName ? { teamName: seat.teamName } : {}),
            },
          }
        : {}),
      sessionName: this.opts.sessionName ?? 'Harness session',
      scenarioTitle: this.opts.scenarioTitle ?? 'Flight to Nowhere',
      clock: this.clock,
      roster: this.rosterPayload(entry.staff),
      seats: this.seats(),
      features: this.opts.features ?? {
        messages: true,
        votes: true,
        hotwash: true,
        surveys: true,
        eval: true,
      },
    }
    await this.client.send('welcome', `client:${entry.clientId}`, payload)
  }

  private async reject(
    entry: RosterEntry,
    reason: 'full' | 'role_taken' | 'not_allowed',
    message: string,
  ): Promise<void> {
    await this.client.send('welcome', `client:${entry.clientId}`, {
      client: entry.clientId,
      kind: entry.kind,
      attribution: this.opts.attribution ?? 'role',
      sessionName: this.opts.sessionName ?? 'Harness session',
      scenarioTitle: this.opts.scenarioTitle ?? 'Flight to Nowhere',
      clock: this.clock,
      roster: [],
      seats: this.seats(),
      features: this.opts.features ?? {
        messages: true,
        votes: true,
        hotwash: true,
        surveys: true,
        eval: true,
      },
      rejected: { reason, message },
    })
  }

  // ---- messages (spec 0413) ----

  private ownsChannel(entry: RosterEntry, channel: string): boolean {
    return channel === `role:${entry.roleId}` || channel === `client:${entry.clientId}`
  }

  /** A seat's message: check it owns the channel, open attachments, record, echo to the channel. */
  private async onMessage(m: Opened<'message.send'>): Promise<void> {
    const entry = this.roster.get(m.from)
    if (m.to !== 'controller' || !entry?.roleId || entry.kind !== 'player') return
    const p = m.payload
    if (!this.ownsChannel(entry, p.channel)) return
    const echo = this.echoes.get(p.messageId)
    if (echo) return void (await this.sendEcho(p.channel, echo))
    const attachmentBytes: number[] = []
    for (const ref of p.attachments) attachmentBytes.push((await this.client.getBlob(ref)).length)
    this.messageLog.push({
      messageId: p.messageId,
      channel: p.channel,
      from: 'player',
      roleId: entry.roleId,
      text: p.text,
      attachmentBytes,
      at: Date.now(),
    })
    const payload = {
      messageId: toBase64Url(this.crypto.random(16)),
      channel: p.channel,
      text: p.text,
      attachments: p.attachments,
      echoOf: p.messageId,
      fromRole: entry.roleId,
      ...(p.replyTo ? { replyTo: p.replyTo } : {}),
    }
    this.echoes.set(p.messageId, payload)
    await this.sendEcho(p.channel, payload)
  }

  private async sendEcho(channel: string, payload: Record<string, unknown>): Promise<void> {
    await this.client.send('message.send', channel as Destination, payload as never, {
      key: 'players',
      sign: true,
    })
  }

  /** Answer in a thread as a persona (signed, so the page trusts it). */
  async reply(
    channel: Destination,
    text: string,
    persona = 'SimCell',
    opts: { showPlayedBy?: boolean; replyTo?: string } = {},
  ): Promise<string> {
    const messageId = toBase64Url(this.crypto.random(16))
    await this.client.send(
      'message.send',
      channel,
      {
        messageId,
        channel,
        text,
        persona,
        showPlayedBy: opts.showPlayedBy ?? true,
        attachments: [],
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      },
      { key: 'players', sign: true },
    )
    this.messageLog.push({
      messageId,
      channel,
      from: 'controller',
      text,
      persona,
      attachmentBytes: [],
      at: Date.now(),
    })
    return messageId
  }

  /** Pin a message to the hot wash: recorded only, like the app's `message.pinned` log entry. */
  pin(messageId: string): void {
    this.pinned.push(messageId)
  }

  // ---- facilitator actions ----

  async notice(
    text: string,
    opts: {
      level?: 'info' | 'warning' | 'urgent'
      targets?: Destination[]
      dismissible?: boolean
      kind?: 'text' | 'hotwash.open' | 'hotwash.close'
    } = {},
  ): Promise<string> {
    const noticeId = toBase64Url(this.crypto.random(16))
    const targets = opts.targets ?? ['all']
    for (const to of targets) {
      await this.client.send(
        'controller.notice',
        to,
        {
          noticeId,
          kind: opts.kind ?? 'text',
          level: opts.level ?? 'info',
          text,
          targets,
          dismissible: opts.dismissible ?? true,
        },
        { key: 'players' },
      )
    }
    return noticeId
  }

  /** Release a text inject to one or more destinations (role:, team:, client:, all). */
  async release(
    inject: Partial<InjectReleasePayload> & { title: string; body: string },
    targets: Destination[] = ['all'],
    /** Copies sent to other destinations without naming them in `targets` (evaluators, observers). */
    alsoTo: Destination[] = [],
  ): Promise<string> {
    this.releases += 1
    const releaseId = toBase64Url(this.crypto.random(16))
    const payload: InjectReleasePayload = {
      releaseId,
      mselRowId: inject.mselRowId ?? `I-${String(this.releases).padStart(2, '0')}`,
      title: inject.title,
      injectType: inject.injectType ?? 'memo',
      deliveryMode: inject.deliveryMode ?? 'hand_to_role',
      ...(inject.sender ? { sender: inject.sender } : {}),
      text: inject.text ?? { body: inject.body, altText: inject.body.slice(0, 200) },
      exerciseTime: inject.exerciseTime ?? '0:00',
      targets,
      media: inject.media ?? [],
      ...(inject.captionsVtt ? { captionsVtt: inject.captionsVtt } : {}),
      ...(inject.expectsResponse !== undefined ? { expectsResponse: inject.expectsResponse } : {}),
    }
    for (const to of [...targets, ...alsoTo])
      await this.client.send('inject.release', to, payload, { key: 'players' })
    return releaseId
  }

  /** Withdraw a release (`inject.recall`) from its targets. */
  async recall(releaseId: string, targets: Destination[], mselRowId = 'I-01'): Promise<void> {
    for (const to of targets) {
      await this.client.send(
        'inject.recall',
        to,
        {
          releaseId,
          mselRowId,
          reason: 'withdrawn',
          text: 'Withdrawn by the facilitator',
          targets,
        },
        { key: 'players' },
      )
    }
  }

  async setClock(clock: ClockState): Promise<void> {
    this.clock = clock
    await this.client.send('clock.state', 'all', clock)
  }

  /** Move a device to another seat: a new signed welcome with the new role (FR-9). */
  async reseat(clientId: ClientId, roleId: string): Promise<void> {
    const entry = this.roster.get(clientId)
    const seat = this.seatDefs.find((s) => s.id === roleId)
    if (!entry || !seat) throw new Error('Unknown client or seat')
    entry.roleId = seat.id
    entry.kind = seat.kind
    await this.welcome(entry)
    await this.notice(`You are now seated as ${seat.name}.`, {
      targets: [`client:${clientId}`],
      kind: 'text',
      level: 'info',
      dismissible: true,
    })
  }

  /** Remove a device: rotate the key without it, then have the server close it with 4003. */
  async kick(clientId: ClientId): Promise<void> {
    const kept: RekeyClient[] = [...this.roster.values()]
      .filter((e) => e.clientId !== clientId && e.joins > 0)
      .map((e) => ({ clientId: e.clientId, ecdhPub: e.ecdhPub, staff: e.staff }))
    await this.client.rotate(kept, [clientId])
    this.server.setJoinTokenHash(await this.keys.joinTokenHash())
    this.roster.delete(clientId)
    this.server.kick(clientId)
  }

  async end(reason: 'endex' | 'cancelled' = 'endex', message?: string): Promise<void> {
    await this.client.send('session.end', 'all', {
      reason,
      at: Date.now(),
      ...(message ? { message } : {}),
    })
    await settle()
    this.server.end()
  }

  /** What the dashboard would show. */
  state() {
    return {
      sessionId: this.sessionId,
      epoch: this.keys.currentEpoch,
      stored: this.server.lastIndex,
      connected: this.server.connected.filter((c) => c !== CONTROLLER_ID),
      roster: [...this.roster.values()].map((e) => ({
        clientId: e.clientId,
        kind: e.kind,
        name: e.name,
        roleId: e.roleId,
        connected: e.connected,
        joins: e.joins,
        ua: e.ua,
      })),
      seats: this.seats(),
    }
  }

  /** Connect parameters as the servers parse them from a query string. */
  decode(params: { joinToken: string; clientId: string; resumeToken: string }) {
    return {
      clientId: params.clientId,
      joinToken: fromBase64Url(params.joinToken),
      resumeToken: fromBase64Url(params.resumeToken),
    }
  }
}
