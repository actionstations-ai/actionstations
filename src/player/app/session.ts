/**
 * The player's session: parses the invite, derives the keys, keeps one device identity, and
 * runs one `LiveClient` per connection over whichever transport works (WebSocket first, the
 * fetch stream when a socket cannot open). It reconnects with backoff, re-joins with
 * `resume`, catches up through the client's replay-guarded path, and turns opened frames into
 * store state the screens render. Browser globals are injected so the whole machine runs in
 * Vitest against the in-memory server.
 */
import { LiveClient, type LiveClientState } from '../../shared/live/client'
import type { Opened } from '../../shared/live/codec'
import { SessionKeys } from '../../shared/live/crypto/keys'
import type { CryptoProvider, KeyPair } from '../../shared/live/crypto/provider'
import { fromBase64Url, toBase64Url } from '../../shared/live/bytes'
import {
  forgetIdentity,
  loadOrCreateIdentity,
  type ClientIdentity,
} from '../../shared/live/identity'
import { InviteError, parseInvite, type Invite } from '../../shared/live/invite'
import { CLOSE_CODES, PROTOCOL_VERSION, type KeyKind } from '../../shared/live/protocol'
import type {
  ClientKind,
  ClockState,
  Seat,
  SessionEndPayload,
  WelcomePayload,
} from '../../shared/live/schemas'
import type { KeyValue, Transport } from '../../shared/live/transport'
import type { Announcer } from './a11y'
import { elapsedMinutes } from './clock'
import { insertItem, isInboxItem, itemFromMessage, type Item, type SeatView } from './items'
import type { Prefs } from './prefs'
import { createOutboxStore, Outbox, type OutboxStore } from './queue'
import {
  RECONNECTING_AFTER_MS,
  BACK_FOR_MS,
  ReconnectScheduler,
  terminalReason,
  type Timers,
} from './reconnect'
import { Store } from './store'
import { STRINGS } from './strings'
import {
  connectHeaders,
  eventsUrl,
  sendUrl,
  webSocketProtocols,
  webSocketUrl,
  type ConnectParams,
} from '../../shared/live/connect-url'

export type Phase =
  | 'loading'
  | 'invalid-link'
  | 'connecting'
  | 'lobby'
  | 'seated'
  | 'ended'
  | 'removed'
  | 'update-required'
  | 'link-invalid'
  | 'device-conflict'

/** `dropped` is the first two seconds after a drop: the header still says connected. */
export type Connection = 'connecting' | 'connected' | 'dropped' | 'reconnecting' | 'offline'
export type TransportKind = 'websocket' | 'fetch'

export interface SessionInfo {
  sessionName: string
  scenarioTitle: string
  attribution: 'role' | 'named'
  features: WelcomePayload['features']
  seats: Seat[]
  hotwash?: WelcomePayload['hotwash']
}

export interface SeatInfo {
  kind: ClientKind
  role?: NonNullable<WelcomePayload['role']>
}

export interface PlayerState {
  phase: Phase
  connection: Connection
  transport?: TransportKind
  server?: { kind: string; version: string }
  clientId: string
  sessionId: string
  linkKind?: KeyKind
  roleHint?: string
  linkError?: string
  info?: SessionInfo
  seat?: SeatInfo
  roster: WelcomePayload['roster']
  clock?: ClockState
  /** Controller wall clock minus this device's, from the last welcome. */
  clockOffsetMs: number
  items: Item[]
  read: ReadonlySet<string>
  dismissed: ReadonlySet<string>
  joining: boolean
  joinError?: NonNullable<WelcomePayload['rejected']>['reason']
  catchingUp: boolean
  /** Shown while the server keeps refusing for a reason that may clear. */
  retryNotice?: 'session-full' | 'rate-limited'
  ended?: SessionEndPayload
  /** Until when "You're back" shows. */
  backUntil?: number
  attempts: number
  displayName: string
}

export interface ConnectedTransport extends Transport {
  kind: TransportKind
  opened: Promise<void>
}

export interface SessionDeps {
  url: string
  crypto: CryptoProvider
  /** `sessionStorage` in the browser: identity, `seq`, last index, rotated roots. */
  storage: KeyValue
  connect: (kind: TransportKind, params: ConnectParams, after: number) => ConnectedTransport
  announcer: Announcer
  prefs: () => Prefs
  bundleVersion: string
  now?: () => number
  timers?: Timers
  random?: () => number
  online?: () => boolean
  ua?: string
  outboxStore?: OutboxStore
  /** Called on a new inbox item when the preferences allow a cue. */
  cue?: (prefs: Prefs) => void
  /** How long a connection may stay silent (no hello) before it counts as failed. */
  helloTimeoutMs?: number
}

const PROBE_TIMEOUT_MS = 5_000
const DEFAULT_HELLO_TIMEOUT_MS = 10_000

function epochKey(sessionId: string): string {
  return `as-live:${sessionId}:epoch`
}
function wsBrokenKey(sessionId: string): string {
  return `as-live:${sessionId}:ws-broken`
}

export class PlayerSession {
  readonly store: Store<PlayerState>
  private invite: Invite | undefined
  private keys: SessionKeys | undefined
  private identity: ClientIdentity | undefined
  private ecdh: KeyPair | undefined
  private client: LiveClient | undefined
  private transport: ConnectedTransport | undefined
  private readonly scheduler: ReconnectScheduler
  private readonly timers: Timers
  private readonly now: () => number
  private dropTimer: unknown
  private helloTimer: unknown
  private probeTimer: unknown
  private stopped = false
  private seatRequest: { seatId: string; kind: ClientKind } | undefined
  outbox: Outbox | undefined

  constructor(private readonly deps: SessionDeps) {
    this.timers = deps.timers ?? globalThis
    this.now = deps.now ?? (() => Date.now())
    this.scheduler = new ReconnectScheduler({
      attempt: () => void this.connect(),
      timers: this.timers,
      random: deps.random ?? Math.random,
    })
    this.store = new Store<PlayerState>({
      phase: 'loading',
      connection: 'connecting',
      clientId: '',
      sessionId: '',
      roster: [],
      clockOffsetMs: 0,
      items: [],
      read: new Set(),
      dismissed: new Set(),
      joining: false,
      catchingUp: false,
      attempts: 0,
      displayName: '',
    })
  }

  get state(): PlayerState {
    return this.store.get()
  }

  /** Parse the link, derive the keys, load the identity and make the first connection. */
  async start(): Promise<void> {
    try {
      this.invite = parseInvite(this.deps.url)
    } catch (err) {
      const message = err instanceof InviteError ? err.message : STRINGS.link.invalid
      this.store.set({ phase: 'invalid-link', linkError: message })
      return
    }
    const { crypto, storage } = this.deps
    const inv = this.invite
    this.keys = new SessionKeys(inv.sessionId, crypto, { controllerEcdhPub: inv.controllerEcdhPub })
    await this.keys.addEpoch(inv.epoch, inv.key.kind, inv.key.root)
    await this.restoreRotatedEpoch()
    this.identity = loadOrCreateIdentity(crypto, storage, inv.sessionId)
    this.ecdh = await crypto.ecdhGenerate()
    this.outbox = new Outbox(
      this.deps.outboxStore ?? createOutboxStore(),
      inv.sessionId,
      (action) => this.sendAction(action.type, action.to, action.payload),
      () => this.state.connection === 'connected' && this.state.phase === 'seated',
    )
    this.store.set({
      phase: 'connecting',
      clientId: this.identity.clientId,
      sessionId: inv.sessionId,
      linkKind: inv.key.kind,
      ...(inv.roleHint ? { roleHint: inv.roleHint } : {}),
    })
    await this.connect()
  }

  /** A root from a rotation this tab already applied survives a reload (same tab, same session). */
  private async restoreRotatedEpoch(): Promise<void> {
    const saved = this.deps.storage.get(epochKey(this.invite!.sessionId))
    if (!saved || !this.keys) return
    const [epoch, kind, root] = saved.split('.')
    try {
      const n = Number(epoch)
      if (n > this.keys.currentEpoch && (kind === 'players' || kind === 'staff') && root)
        await this.keys.addEpoch(n, kind, fromBase64Url(root))
    } catch {
      // a damaged entry: the link's epoch stands
    }
  }

  private saveCurrentEpoch(): void {
    const keys = this.keys
    if (!keys || !this.invite) return
    const epoch = keys.currentEpoch
    if (epoch <= this.invite.epoch) return
    const kind: KeyKind = keys.hasStaff ? 'staff' : 'players'
    const root = keys.root(kind, epoch)
    if (root)
      this.deps.storage.set(
        epochKey(this.invite.sessionId),
        `${epoch}.${kind}.${toBase64Url(root)}`,
      )
  }

  private get wsBroken(): boolean {
    return this.deps.storage.get(wsBrokenKey(this.state.sessionId)) === '1'
  }

  /** The last catch-up index the client persisted (the stream resumes after it). */
  private lastIndex(): number {
    const { sessionId, clientId } = this.state
    return Number(this.deps.storage.get(`as-live:${sessionId}:${clientId}:index`) ?? 0)
  }

  private async connectParams(): Promise<ConnectParams> {
    return {
      base: this.invite!.base,
      sessionId: this.invite!.sessionId,
      joinToken: await this.keys!.joinToken(),
      clientId: this.identity!.clientId,
      resumeToken: this.identity!.resumeToken,
    }
  }

  /** One connection attempt. Failures schedule the next one; terminal closes stop everything. */
  private async connect(): Promise<void> {
    if (this.stopped || !this.keys || !this.identity) return
    this.teardownClient()
    this.store.set((s) => ({ attempts: s.attempts + 1 }))
    const params = await this.connectParams()
    const kind: TransportKind = this.wsBroken || this.tryingFallback ? 'fetch' : 'websocket'
    this.attach(this.deps.connect(kind, params, this.lastIndex()))
  }

  /** Set while the fetch stream is tried right after a socket that never opened. */
  private tryingFallback = false
  /** Clients whose server said hello (the client's own state is already `closed` on close). */
  private readonly greeted = new WeakSet<LiveClient>()
  /** Clients this page closed itself because no hello came: an outage, not a refused socket. */
  private readonly timedOut = new WeakSet<LiveClient>()

  private attach(transport: ConnectedTransport): void {
    this.transport = transport
    const client = new LiveClient({
      transport,
      keys: this.keys!,
      clientId: this.identity!.clientId,
      role: 'participant',
      crypto: this.deps.crypto,
      controllerPub: this.invite!.controllerPub,
      ecdh: this.ecdh!,
      storage: this.deps.storage,
      now: this.now,
    })
    this.client = client
    this.store.set({ transport: transport.kind })
    client.onState((state) => this.onClientState(client, state))
    client.onAny((msg) => this.onMessage(client, msg))
    transport.onClose((code, reason) => {
      if (this.client === client) this.onClosed(code, reason, transport, client)
    })
    this.helloTimer = this.timers.setTimeout(() => {
      if (this.client !== client || this.greeted.has(client)) return
      this.timedOut.add(client)
      transport.close(1000, 'No hello')
    }, this.deps.helloTimeoutMs ?? DEFAULT_HELLO_TIMEOUT_MS)
  }

  private teardownClient(): void {
    this.clearTimer('helloTimer')
    this.clearTimer('probeTimer')
    const t = this.transport
    this.transport = undefined
    this.client = undefined
    t?.close(1000, 'Replaced')
  }

  private clearTimer(name: 'helloTimer' | 'probeTimer' | 'dropTimer'): void {
    if (this[name] !== undefined) this.timers.clearTimeout(this[name])
    this[name] = undefined
  }

  private onClientState(client: LiveClient, state: LiveClientState): void {
    if (this.client !== client) return
    if (state === 'hello') void this.onHello(client)
  }

  /** The server greeted us: check versions, catch up, then join (lobby or resume). */
  private async onHello(client: LiveClient): Promise<void> {
    this.clearTimer('helloTimer')
    this.clearTimer('dropTimer')
    this.scheduler.connected()
    this.greeted.add(client)
    if (this.tryingFallback) {
      // The socket could not open but the stream did: stay on the stream for this tab.
      this.deps.storage.set(wsBrokenKey(this.state.sessionId), '1')
      this.tryingFallback = false
    }
    const wasDown = this.state.connection !== 'connecting'
    this.store.set((s) => ({
      connection: 'connected',
      retryNotice: undefined,
      ...(wasDown && s.phase === 'seated' ? { backUntil: this.now() + BACK_FOR_MS } : {}),
    }))
    this.store.set({ catchingUp: true })
    client.requestCatchup()
    const seat = this.state.seat
    if (seat) {
      await this.sendJoin(client, {
        kind: seat.kind,
        seatId: seat.role?.id,
        name: this.state.displayName,
        resume: true,
      })
    } else if (this.seatRequest) {
      await this.sendJoin(client, {
        ...this.seatRequest,
        name: this.state.displayName,
        resume: true,
      })
    } else {
      // The lobby join asks for nothing: the answer brings the seats (and, for a device the
      // controller already seated, its seat back). A role hint only preselects on the screen.
      await this.sendJoin(client, { kind: 'player', name: '' })
    }
    if (this.state.phase === 'connecting') this.store.set({ phase: 'lobby' })
  }

  private async sendJoin(
    client: LiveClient,
    opts: { kind: ClientKind; seatId?: string; name: string; resume?: boolean },
  ): Promise<void> {
    try {
      await client.send('join', 'controller', {
        name: opts.name,
        kind: opts.kind,
        ...(opts.seatId ? { requestedRole: opts.seatId } : {}),
        ecdhPub: toBase64Url(this.ecdh!.publicKey),
        ...(opts.resume ? { resume: true } : {}),
        ua: `${this.state.transport ?? 'unknown'}; ${(this.deps.ua ?? '').slice(0, 80)}`,
      })
    } catch {
      // the connection closed under us: the close handler takes over
    }
  }

  /** The player picked a seat (and maybe a name) on the join screen. */
  async chooseSeat(seatId: string, displayName: string): Promise<void> {
    const seat = this.state.info?.seats.find((s) => s.id === seatId)
    if (!seat || !this.client || this.client.state === 'closed') return
    const name = sanitizeName(displayName)
    this.seatRequest = { seatId, kind: seat.kind }
    this.store.set({ joining: true, joinError: undefined, displayName: name })
    await this.sendJoin(this.client, { kind: seat.kind, seatId, name })
  }

  private onMessage(client: LiveClient, msg: Opened): void {
    if (this.client !== client) return
    switch (msg.type) {
      case 'relay.hello':
        return this.applyHello(msg as Opened<'relay.hello'>)
      case 'catchup.batch':
        if ((msg as Opened<'catchup.batch'>).payload.done) {
          // An answered probe proves the connection is alive, whatever the browser said.
          this.clearTimer('probeTimer')
          this.clearTimer('dropTimer')
          this.store.set({ catchingUp: false, connection: 'connected' })
        }
        return
      case 'welcome':
        return this.applyWelcome(msg as Opened<'welcome'>)
      case 'clock.state':
        if (msg.signedBy === 'host')
          this.store.set({ clock: (msg as Opened<'clock.state'>).payload })
        break
      case 'session.end':
        return this.applyEnd((msg as Opened<'session.end'>).payload)
      case 'session.rekey':
        this.saveCurrentEpoch()
        return
      case 'relay.error':
        return this.applyRelayError((msg as Opened<'relay.error'>).payload)
      case 'presence':
      case 'relay.blob.chunk':
      case 'relay.blob.done':
        return
    }
    this.addItem(msg)
  }

  private applyHello(msg: Opened<'relay.hello'>): void {
    const { server } = msg.payload
    this.store.set({ server: { kind: server.kind, version: server.version } })
    if (!server.protocol.includes(PROTOCOL_VERSION)) this.terminal('update-required')
  }

  private applyWelcome(msg: Opened<'welcome'>): void {
    const p = msg.payload
    if (msg.signedBy !== 'host' || p.client !== this.state.clientId) return
    if (p.rejected) {
      this.seatRequest = undefined
      this.store.set({
        joining: false,
        joinError: p.rejected.reason,
        phase: 'lobby',
        seat: undefined,
      })
      return
    }
    const info: SessionInfo = {
      sessionName: p.sessionName,
      scenarioTitle: p.scenarioTitle,
      attribution: p.attribution,
      features: p.features,
      seats: p.seats ?? this.state.info?.seats ?? [],
      ...(p.hotwash ? { hotwash: p.hotwash } : {}),
    }
    const seated = p.role !== undefined
    this.store.set({
      info,
      roster: p.roster,
      clock: p.clock,
      clockOffsetMs: msg.ts - this.now(),
      joining: false,
      joinError: undefined,
      phase: seated ? 'seated' : 'lobby',
      seat: seated ? { kind: p.kind, role: p.role } : undefined,
    })
    if (seated) {
      this.seatRequest = undefined
      void this.outbox?.drain()
    }
  }

  private applyEnd(payload: SessionEndPayload): void {
    this.store.set({ ended: payload, items: [], info: undefined, roster: [] })
    this.terminal('ended')
  }

  private applyRelayError(error: Opened<'relay.error'>['payload']): void {
    switch (error.code) {
      case 'VERSION':
        return this.terminal('update-required')
      case 'SESSION_ENDED':
        return this.terminal('ended')
      case 'BAD_JOIN_TOKEN':
        return this.terminal('link-invalid')
      case 'SESSION_FULL':
        this.store.set({ retryNotice: 'session-full' })
        return
      case 'RATE_LIMITED':
        this.store.set({ retryNotice: 'rate-limited' })
        this.retryAfter = error.retryAfterMs
        return
      default:
        return
    }
  }
  private retryAfter: number | undefined

  private addItem(msg: Opened): void {
    const clock = this.state.clock
    const item = itemFromMessage(msg, (ts) => elapsedMinutes(clock, ts))
    if (!item) return
    const before = this.state.items
    const items = insertItem(before, item)
    if (items === before) return
    this.store.set({ items })
    const isNew = !before.some((x) => x.key === item.key)
    if (isNew && !this.state.catchingUp && isInboxItem(item, this.seatView())) {
      this.deps.announcer.announce(STRINGS.inbox.newItem(item.title))
      this.deps.cue?.(this.deps.prefs())
    }
  }

  seatView(): SeatView | undefined {
    const { seat, clientId } = this.state
    if (!seat) return undefined
    return {
      clientId,
      kind: seat.kind,
      ...(seat.role?.id ? { roleId: seat.role.id } : {}),
      ...(seat.role?.teamId ? { teamId: seat.role.teamId } : {}),
    }
  }

  private onClosed(
    code: number,
    _reason: string,
    transport: ConnectedTransport,
    client: LiveClient,
  ): void {
    this.clearTimer('helloTimer')
    this.clearTimer('probeTimer')
    this.client = undefined
    this.transport = undefined
    if (this.stopped) return
    const reason = terminalReason(code)
    if (reason) return this.terminal(reason)
    const online = this.deps.online?.() ?? true
    this.markDropped(online)
    // A socket that closed before any hello, while the page itself loaded fine: try the fetch
    // stream at once (Safari and a certificate it has not trusted, spec 0407 FR-5).
    const refused = !this.greeted.has(client) && !this.timedOut.has(client)
    if (transport.kind === 'websocket' && refused && !this.tryingFallback && !this.wsBroken) {
      this.tryingFallback = true
      void this.connect()
      return
    }
    this.tryingFallback = false
    this.scheduler.failed(this.retryAfter)
    this.retryAfter = undefined
  }

  /** The header keeps saying connected for two seconds; then it says reconnecting or offline. */
  private markDropped(online: boolean): void {
    this.store.set((s) => ({
      connection:
        s.connection === 'connected' || s.connection === 'connecting' ? 'dropped' : s.connection,
      joining: false,
    }))
    this.clearTimer('dropTimer')
    this.dropTimer = this.timers.setTimeout(() => {
      if (this.state.connection === 'dropped')
        this.store.set({ connection: online ? 'reconnecting' : 'offline' })
    }, RECONNECTING_AFTER_MS)
  }

  private terminal(
    phase: Exclude<Phase, 'loading' | 'connecting' | 'lobby' | 'seated' | 'invalid-link'>,
  ): void {
    this.stopped = true
    this.scheduler.stop()
    this.clearTimer('dropTimer')
    const t = this.transport
    this.client = undefined
    this.transport = undefined
    t?.close(1000, phase)
    if (phase === 'ended' || phase === 'removed') this.keys = undefined
    this.store.set({ phase, joining: false, catchingUp: false })
  }

  /**
   * The page woke up (visible again, back online, restored from the cache). Disconnected: retry
   * now. Connected: ask for a catch-up as a liveness probe; no answer in 5 s means the socket
   * died in the device's sleep, so close it and reconnect.
   */
  wake(): void {
    if (this.stopped) return
    const client = this.client
    if (!client || !this.greeted.has(client)) {
      // No live connection: retry now rather than after the backoff.
      if (!this.scheduler.wake() && !this.transport) void this.connect()
      return
    }
    if (this.probeTimer !== undefined) return
    client.requestCatchup()
    this.probeTimer = this.timers.setTimeout(() => {
      this.probeTimer = undefined
      if (this.client === client) this.transport?.close(1000, 'Probe timed out')
    }, PROBE_TIMEOUT_MS)
  }

  /**
   * The browser reports the network is gone: say so at once. The socket usually dies soon after;
   * if it did not, the probe on the next wake proves it and the header says connected again.
   */
  offline(): void {
    if (this.stopped) return
    this.clearTimer('dropTimer')
    this.store.set({ connection: 'offline' })
  }

  /** Send an action now, or queue it for the next connection (NFR-6). */
  async sendAction(
    type: Parameters<LiveClient['send']>[0],
    to: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const client = this.client
    if (!client || client.state !== 'joined') throw new Error('Not connected')
    await client.send(type, to as never, payload as never)
  }

  markRead(key: string): void {
    if (this.state.read.has(key)) return
    this.store.set((s) => ({ read: new Set([...s.read, key]) }))
  }

  dismiss(key: string): void {
    this.store.set((s) => ({ dismissed: new Set([...s.dismissed, key]) }))
  }

  /** Forget this device's id and keys for the session (About → Forget this device). */
  forgetDevice(): void {
    const sid = this.state.sessionId
    forgetIdentity(this.deps.storage, sid)
    this.deps.storage.set(epochKey(sid), '')
    this.deps.storage.set(wsBrokenKey(sid), '')
    this.stop()
  }

  stop(): void {
    this.stopped = true
    this.scheduler.stop()
    this.clearTimer('dropTimer')
    this.teardownClient()
  }

  // Exposed for tests.
  get currentClient(): LiveClient | undefined {
    return this.client
  }
}

/** The claim a role hint makes: `evaluator` and `observer` are kinds, anything else a role id. */
export function hintKind(hint: string | undefined): ClientKind {
  if (hint === 'evaluator' || hint === 'observer' || hint === 'simcell') return hint
  return 'player'
}

export function hintRole(hint: string | undefined): string | undefined {
  if (!hint || hint === 'evaluator' || hint === 'observer' || hint === 'simcell') return undefined
  return hint
}

// Control characters, zero-width marks and the Unicode line separators, escaped so the regex
// holds no literal line terminator.
/* eslint-disable no-control-regex */
const CONTROL_CHARS = new RegExp(
  '[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029]',
  'g',
)
/* eslint-enable no-control-regex */

/** 40 characters, no control characters, trimmed (spec: Security and privacy). */
export function sanitizeName(name: string): string {
  return name.replace(CONTROL_CHARS, '').trim().slice(0, 40)
}

/** The transports a browser offers, by kind. */
export function browserConnect(
  makeWs: (url: string, protocols: string[]) => ConnectedTransport,
  makeFetch: (events: string, send: string, headers: Record<string, string>) => ConnectedTransport,
): SessionDeps['connect'] {
  return (kind, params, after) =>
    kind === 'websocket'
      ? makeWs(webSocketUrl(params), webSocketProtocols(params))
      : makeFetch(eventsUrl(params, after), sendUrl(params), connectHeaders(params))
}

export { CLOSE_CODES }
