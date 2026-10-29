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
  BlobRef,
  ClientKind,
  ClockState,
  Seat,
  SessionEndPayload,
  WelcomePayload,
} from '../../shared/live/schemas'
import type { KeyValue, Transport } from '../../shared/live/transport'
import { MediaCache } from '../features/injects/media'
import {
  applyClose as applySurveyClose,
  applyOpen as applySurveyOpen,
  mayAnswer,
  wireAnswers,
  type Answers,
  type SurveyMap,
} from '../features/surveys/surveys'
import { applyClose, applyOpen, mayVote, type VoteMap } from '../features/votes/votes'
import {
  EMPTY_HOTWASH,
  addOwn,
  addPlusMine,
  applyUpdate as applyHotwashUpdate,
  canWithdraw,
  removeOwn,
  setOpen,
  type HotwashKind,
  type HotwashState,
} from '../features/hotwash/hotwash'
import type { Announcer } from './a11y'
import { elapsedMinutes, formatClock } from './clock'
import {
  addressedToSeat,
  insertItem,
  isInboxItem,
  itemFromMessage,
  type Item,
  type SeatView,
} from './items'
import { chatFromFrame, upsertMessage, type ChatMessage } from './messages'
import {
  applyEnd as applyCallEnd,
  applyRing,
  markAnswered,
  markHungUp,
  type CallMap,
} from '../features/calls/calls'
import type { PreparedImage } from '../features/messages/attach'
import { EvaluatorFeature } from '../features/evaluate/evaluator'
import { createObservationStore, type ObservationStore } from '../features/evaluate/observations'
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
  /** Messages with the SimCell for this seat, oldest first (spec 0413). */
  messages: ChatMessage[]
  /** The hot wash: whether it is open and the shared board (spec 0415). */
  hotwash: HotwashState
  /** An inject the player is replying to; the Messages tab opens on it. */
  compose?: { releaseId: string; title: string; nonce: number }
  /** Votes this device has heard of, by vote id (spec 0414). */
  votes: VoteMap
  /** Surveys this device has heard of, by delivery id (spec 0422). */
  surveys: SurveyMap
  /** Voice calls this device has heard of, by call id (spec 0429). */
  calls: CallMap
  read: ReadonlySet<string>
  dismissed: ReadonlySet<string>
  /** Release ids this device marked as actioned. */
  actioned: ReadonlySet<string>
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

/** What the composer hands over: text, prepared photos and the thing being replied to. */
export interface MessageDraft {
  channel: string
  text: string
  photos: PreparedImage[]
  replyTo?: string
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
  observationStore?: ObservationStore
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
  /** The evaluator form's state (#416); set once the session id is known. */
  evaluate: EvaluatorFeature | undefined
  /** Opened inject media for this page (`blob:` URLs, memory only). */
  readonly media = new MediaCache({ fetchBlob: (ref) => this.fetchBlob(ref) })

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
      messages: [],
      votes: {},
      surveys: {},
      hotwash: EMPTY_HOTWASH,
      calls: {},
      read: new Set(),
      dismissed: new Set(),
      actioned: new Set(),
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
      (action) =>
        this.sendAction(action.type, action.to, action.payload).then(() => this.afterSend(action)),
      () => this.state.connection === 'connected' && this.state.phase === 'seated',
    )
    this.evaluate = this.makeEvaluate(inv.sessionId)
    await this.evaluate.load().catch(() => undefined)
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
          // The outbox waits for 'connected'; the welcome can arrive before this point.
          void this.outbox?.drain()
        }
        return
      case 'welcome':
        return this.applyWelcome(msg as Opened<'welcome'>)
      case 'clock.state':
        if (msg.signedBy === 'host')
          this.store.set({ clock: (msg as Opened<'clock.state'>).payload })
        break
      case 'message.send':
        return this.addChat(msg as Opened<'message.send'>)
      case 'eval.assign':
        return this.addAssignment(msg as Opened<'eval.assign'>)
      case 'hotwash.update':
        if (msg.signedBy === 'host') this.applyHotwash(msg as Opened<'hotwash.update'>)
        return
      case 'controller.notice':
        this.applyHotwashNotice(msg as Opened<'controller.notice'>)
        break
      case 'session.end':
        return this.applyEnd((msg as Opened<'session.end'>).payload)
      case 'session.rekey':
        this.saveCurrentEpoch()
        return
      case 'relay.error':
        return this.applyRelayError((msg as Opened<'relay.error'>).payload)
      case 'vote.open':
        if (this.applyVoteOpen(msg as Opened<'vote.open'>)) return
        break
      case 'vote.close':
        this.applyVoteClose(msg as Opened<'vote.close'>)
        break
      case 'survey.open':
        this.applySurveyOpen(msg as Opened<'survey.open'>)
        break
      case 'survey.close':
        this.store.set((s) => ({
          surveys: applySurveyClose(s.surveys, msg as Opened<'survey.close'>),
        }))
        break
      case 'call.ring':
        return this.applyCallRing(msg as Opened<'call.ring'>)
      case 'call.end':
        this.store.set((st) => ({ calls: applyCallEnd(st.calls, msg as Opened<'call.end'>) }))
        return
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
    // Plan material belongs to the evaluator seat only; a reseated device drops it.
    if (!seated || p.kind !== 'evaluator') this.evaluate?.clearAssignment()
    if (seated) {
      this.seatRequest = undefined
      this.flushDelivered()
      void this.outbox?.drain()
    }
  }

  private applyEnd(payload: SessionEndPayload): void {
    this.evaluate?.end()
    this.media.dispose()
    this.store.set({
      ended: payload,
      items: [],
      messages: [],
      surveys: {},
      hotwash: EMPTY_HOTWASH,
      calls: {},
      info: undefined,
      roster: [],
    })
    this.terminal('ended')
  }

  private applyRelayError(error: Opened<'relay.error'>['payload']): void {
    switch (error.code) {
      case 'VERSION':
        return this.terminal('update-required')
      case 'SESSION_ENDED':
        // A visit after the end: the observations from the exercise are not kept on the device.
        void this.evaluate?.discard()
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
    if (msg.type === 'inject.recall')
      this.withdraw((msg as Opened<'inject.recall'>).payload.releaseId)
    const found = itemFromMessage(msg, (ts) => elapsedMinutes(clock, ts))
    if (!found) return
    const item =
      found.inject && this.withdrawnIds.has(found.inject.releaseId)
        ? { ...found, withdrawn: true }
        : found
    const before = this.state.items
    const items = insertItem(before, item)
    if (items === before) return
    this.store.set({ items })
    const view = this.seatView()
    const isNew = !before.some(
      (x) => x.key === item.key || (!!item.ref && x.ref === item.ref && isInboxItem(x, view)),
    )
    if (isNew && !this.state.catchingUp && isInboxItem(item, view)) {
      this.deps.announcer.announce(STRINGS.inbox.newItem(item.title))
      this.deps.cue?.(this.deps.prefs())
    }
    this.flushDelivered()
  }

  /** Release ids the facilitator withdrew (a recall can reach a device before the release does). */
  private readonly withdrawnIds = new Set<string>()
  /** Receipts already queued this page load, by `releaseId:status`. */
  private readonly receiptsQueued = new Set<string>()

  private withdraw(releaseId: string | undefined): void {
    if (!releaseId) return
    this.withdrawnIds.add(releaseId)
    this.store.set((s) => ({
      items: s.items.map((i) =>
        i.inject?.releaseId === releaseId ? { ...i, withdrawn: true } : i,
      ),
    }))
  }

  /** `delivered` for every inject in this seat's list that has no receipt yet (FR-9). */
  private flushDelivered(): void {
    const view = this.seatView()
    if (!view || this.state.phase !== 'seated') return
    for (const item of this.state.items) {
      if (item.inject && !item.withdrawn && addressedToSeat(item, view))
        void this.sendReceipt(item.inject.releaseId, 'delivered')
    }
  }

  /** Queue an `inject.receipt`; the outbox sends it now or on the next connection, once. */
  async sendReceipt(releaseId: string, status: 'delivered' | 'read' | 'actioned'): Promise<void> {
    const key = `${releaseId}:${status}`
    if (this.receiptsQueued.has(key) || !this.outbox) return
    this.receiptsQueued.add(key)
    if (status === 'actioned')
      this.store.set((s) => ({ actioned: new Set([...s.actioned, releaseId]) }))
    await this.outbox.enqueue({
      id: `receipt:${releaseId}:${status}`,
      type: 'inject.receipt',
      to: 'controller',
      payload: { releaseId, status, at: this.now() },
    })
  }

  // ---- evaluator observations (spec 0416) ----

  private makeEvaluate(sessionId: string): EvaluatorFeature {
    return new EvaluatorFeature({
      sessionId,
      store: this.deps.observationStore ?? createObservationStore(),
      newId: () => toBase64Url(this.deps.crypto.random(16)),
      now: () => this.now(),
      exerciseTime: () =>
        formatClock(elapsedMinutes(this.state.clock, this.now() + this.state.clockOffsetMs)),
      enqueue: ({ id, payload, createdAt }) =>
        this.outbox
          ? this.outbox.enqueue(
              { id, type: 'eval.observation', to: 'controller', payload },
              createdAt,
            )
          : Promise.resolve(),
    })
  }

  /** Exercise time now, for a new rating's default time. */
  exerciseTimeNow(): string {
    return formatClock(elapsedMinutes(this.state.clock, this.now() + this.state.clockOffsetMs))
  }

  /** Only the controller's `eval.assign` to this device, for an evaluator seat, is applied. */
  private addAssignment(msg: Opened<'eval.assign'>): void {
    if (msg.signedBy !== 'host' || this.state.seat?.kind !== 'evaluator') return
    if (msg.to !== `client:${this.state.clientId}`) return
    this.evaluate?.applyAssign(msg.payload)
  }

  // ---- messages with the SimCell (spec 0413) ----

  /** Photos still to send, and the uploads already done, by message id (memory only). */
  private readonly drafts = new Map<string, { draft: MessageDraft; refs: BlobRef[] }>()

  /** Largest photo this connection takes from a player. */
  get photoCap(): number {
    return this.client?.limits.playerBlobBytes ?? 1024 * 1024
  }

  /** Compose and send: the message shows at once as sending, then settles when echoed. */
  async sendMessage(draft: MessageDraft): Promise<void> {
    const id = toBase64Url(this.deps.crypto.random(16))
    const ts = this.now() + this.state.clockOffsetMs
    this.drafts.set(id, { draft, refs: [] })
    this.putChat({
      id,
      channel: draft.channel,
      mine: true,
      playedBy: false,
      text: draft.text,
      attachments: [],
      pendingPhotos: draft.photos.length,
      exerciseTime: formatClock(elapsedMinutes(this.state.clock, ts)),
      ts,
      ...(draft.replyTo ? { replyTo: draft.replyTo } : {}),
      status: 'sending',
    })
    await this.deliverMessage(id)
  }

  /** Try a message that failed again; photos already uploaded are not uploaded twice. */
  async retryMessage(id: string): Promise<void> {
    const m = this.state.messages.find((x) => x.id === id)
    if (!m || m.status !== 'failed' || !this.drafts.has(id)) return
    this.putChat({ ...m, status: 'sending' })
    await this.deliverMessage(id)
  }

  private async deliverMessage(id: string): Promise<void> {
    const entry = this.drafts.get(id)
    if (!entry) return
    const { draft, refs } = entry
    try {
      while (refs.length < draft.photos.length) {
        const photo = draft.photos[refs.length]!
        const client = this.client
        if (!client || client.state !== 'joined') throw new Error('Not connected')
        refs.push(
          await client.putBlob(
            {
              kind: 'image',
              mime: photo.mime,
              width: photo.width,
              height: photo.height,
              ...(photo.alt ? { name: photo.alt.slice(0, 120) } : {}),
            },
            photo.bytes,
          ),
        )
      }
      await this.outbox?.enqueue({
        id: `message:${id}`,
        type: 'message.send',
        to: 'controller',
        payload: {
          messageId: id,
          channel: draft.channel,
          text: draft.text,
          attachments: refs,
          ...(draft.replyTo ? { replyTo: draft.replyTo } : {}),
        },
      })
    } catch {
      const m = this.state.messages.find((x) => x.id === id)
      if (m && m.status !== 'sent') this.putChat({ ...m, status: 'failed' })
    }
  }

  private putChat(chat: ChatMessage): void {
    this.store.set((s) => ({ messages: upsertMessage(s.messages, chat) }))
  }

  private addChat(msg: Opened<'message.send'>): void {
    const clock = this.state.clock
    const chat = chatFromFrame(msg, this.seatView(), (ts) => elapsedMinutes(clock, ts))
    if (!chat) return
    if (chat.mine) this.drafts.delete(chat.id)
    const known = this.state.messages.some((m) => m.id === chat.id && m.status === 'sent')
    this.putChat(chat)
    if (!chat.mine && !known && !this.state.catchingUp) {
      this.deps.announcer.announce(
        STRINGS.messages.newMessage(chat.persona ?? STRINGS.messages.simcell),
      )
      this.deps.cue?.(this.deps.prefs())
    }
  }

  private applyHotwash(msg: Opened<'hotwash.update'>): void {
    const hotwash = applyHotwashUpdate(this.state.hotwash, msg.payload)
    if (hotwash !== this.state.hotwash) this.store.set({ hotwash })
  }

  private applyHotwashNotice(msg: Opened<'controller.notice'>): void {
    const kind = msg.payload.kind
    if (msg.signedBy !== 'host' || (kind !== 'hotwash.open' && kind !== 'hotwash.close')) return
    this.store.set((s) => ({ hotwash: setOpen(s.hotwash, kind === 'hotwash.open') }))
    if (!this.state.catchingUp)
      this.deps.announcer.announce(
        kind === 'hotwash.open' ? STRINGS.feed.hotwashOpen : STRINGS.feed.hotwashClosed,
      )
  }

  /** Add an item to the hot wash. It shows as waiting until the controller puts it on the board. */
  async postHotwash(draft: {
    kind: HotwashKind
    text: string
    anonymous: boolean
    questionId?: string
    mselRowId?: string
  }): Promise<void> {
    const text = draft.text.trim()
    if (!text || !this.state.hotwash.open || !this.outbox) return
    const itemId = toBase64Url(this.deps.crypto.random(16))
    const roleId = this.state.seat?.role?.id
    this.store.set((s) => ({
      hotwash: addOwn(
        s.hotwash,
        { itemId, ...draft, text, ...(roleId ? { roleId } : {}) },
        this.now(),
      ),
    }))
    await this.outbox.enqueue({
      id: `hotwash:${itemId}`,
      type: 'hotwash.item',
      to: 'controller',
      payload: {
        itemId,
        kind: draft.kind,
        text,
        anonymous: draft.anonymous,
        ...(draft.questionId ? { questionId: draft.questionId } : {}),
        ...(draft.mselRowId ? { mselRowId: draft.mselRowId } : {}),
      },
    })
  }

  /** +1 on someone else's item, once per item (spec 0415 FR-5). */
  async plusHotwash(itemId: string): Promise<void> {
    const item = this.state.hotwash.items[itemId]
    if (!item || item.mine || item.plusMine || !this.state.hotwash.open || !this.outbox) return
    this.store.set((s) => ({ hotwash: addPlusMine(s.hotwash, itemId) }))
    await this.outbox.enqueue({
      id: `hotwash-plus:${itemId}`,
      type: 'hotwash.item',
      to: 'controller',
      payload: {
        itemId: toBase64Url(this.deps.crypto.random(16)),
        kind: item.kind,
        text: '',
        anonymous: true,
        plusOneOf: itemId,
      },
    })
  }

  /** Take back an item within two minutes of posting it. */
  async withdrawHotwash(itemId: string): Promise<void> {
    const item = this.state.hotwash.items[itemId]
    if (!item || !this.outbox || !canWithdraw(item, this.now())) return
    this.store.set((s) => ({ hotwash: removeOwn(s.hotwash, itemId) }))
    await this.outbox.enqueue({
      id: `hotwash-retract:${itemId}`,
      type: 'hotwash.item',
      to: 'controller',
      payload: {
        itemId: toBase64Url(this.deps.crypto.random(16)),
        kind: item.kind,
        text: '',
        anonymous: true,
        retractOf: itemId,
      },
    })
  }

  // ---- voice calls (spec 0429) ----

  /** The longest spoken answer this connection takes, in bytes. */
  get answerCap(): number {
    return this.client?.limits.playerBlobBytes ?? 1024 * 1024
  }

  private applyCallRing(msg: Opened<'call.ring'>): void {
    const next = applyRing(this.state.calls, msg, this.seatView(), this.now())
    if (next.calls === this.state.calls) return
    this.store.set({ calls: next.calls })
    if (this.state.catchingUp) return
    this.deps.announcer.announce(
      next.isNew
        ? STRINGS.calls.incoming(msg.payload.persona.name)
        : STRINGS.calls.nextLine(msg.payload.persona.name),
    )
    this.deps.cue?.(this.deps.prefs())
  }

  /** Answer the open turn by text or with a recording (a 16 kHz mono WAV). Goes out now, or on reconnect. */
  async answerCall(
    callId: string,
    answer: { text?: string; audio?: { bytes: Uint8Array; durationSec: number } },
  ): Promise<void> {
    const call = this.state.calls[callId]
    if (!call || call.status !== 'ringing' || !this.outbox) return
    const text = answer.text?.trim()
    if (!text && !answer.audio) return
    const payload: Record<string, unknown> = { callId, turn: call.turn }
    if (answer.audio) {
      const client = this.client
      if (!client || client.state !== 'joined') throw new Error('Not connected')
      payload.audio = await client.putBlob(
        { kind: 'audio', mime: 'audio/wav', durationSec: Math.max(0.1, answer.audio.durationSec) },
        answer.audio.bytes,
      )
    } else {
      payload.text = text
    }
    this.store.set((s) => ({
      calls: markAnswered(s.calls, callId, text ?? STRINGS.calls.spokenAnswer),
    }))
    await this.outbox.enqueue({
      id: `call:${callId}:${call.turn}`,
      type: 'call.answer',
      to: 'controller',
      payload,
    })
  }

  async hangUp(callId: string): Promise<void> {
    const call = this.state.calls[callId]
    if (!call || call.status === 'ended' || !this.outbox) return
    this.store.set((s) => ({ calls: markHungUp(s.calls, callId) }))
    await this.outbox.enqueue({
      id: `call-end:${callId}`,
      type: 'call.end',
      to: 'controller',
      payload: { callId, turn: call.turn, reason: 'hangup', by: 'player' },
    })
  }

  /** "Reply to SimCell" on an inject: open the Messages tab with the inject quoted. */
  startReply(releaseId: string): void {
    const title = this.state.items.find((i) => i.inject?.releaseId === releaseId)?.title
    this.store.set((s) => ({
      compose: { releaseId, title: title ?? '', nonce: (s.compose?.nonce ?? 0) + 1 },
    }))
  }

  clearReply(): void {
    this.store.set({ compose: undefined })
  }

  /** A `vote.open`. Returns true for an update of a vote already known (no new feed entry). */
  private applyVoteOpen(msg: Opened<'vote.open'>): boolean {
    const { votes, isNew, reopened } = applyOpen(this.state.votes, msg, this.now())
    this.store.set({ votes })
    const seat = this.seatView()
    if ((isNew || reopened) && mayVote(votes[msg.payload.voteId]!, seat) && !this.state.catchingUp)
      this.deps.announcer.announce(STRINGS.votes.announceOpen(msg.payload.question))
    return !isNew && !reopened
  }

  private applySurveyOpen(msg: Opened<'survey.open'>): void {
    const { surveys, isNew } = applySurveyOpen(this.state.surveys, msg, this.now())
    this.store.set({ surveys })
    if (
      isNew &&
      mayAnswer(surveys[msg.payload.surveyId]!, this.seatView()) &&
      !this.state.catchingUp
    )
      this.deps.announcer.announce(STRINGS.surveys.announceOpen(msg.payload.title))
  }

  /** Send this device's answers (or changed answers) to the controller, now or on reconnect. */
  async submitSurvey(surveyId: string, answers: Answers): Promise<void> {
    const survey = this.state.surveys[surveyId]
    if (!survey || survey.status !== 'open' || !this.outbox) return
    const sending = wireAnswers(survey, answers)
    if (!sending.length) return
    this.store.set((s) => ({
      surveys: { ...s.surveys, [surveyId]: { ...survey, mine: answers, sent: false } },
    }))
    await this.outbox.enqueue({
      id: `survey:${surveyId}:${this.now()}`,
      type: 'survey.response',
      to: 'controller',
      payload: { surveyId, answers: sending },
    })
  }

  private applyVoteClose(msg: Opened<'vote.close'>): void {
    const votes = applyClose(this.state.votes, msg, this.now())
    this.store.set({ votes })
    if (!this.state.catchingUp) this.deps.announcer.announce(STRINGS.votes.announceClosed)
  }

  /** Cast or change this device's ballot. It goes out now, or on reconnect (spec 0414 NFR-5). */
  async castVote(voteId: string, optionId: string, rationale?: string): Promise<void> {
    const vote = this.state.votes[voteId]
    if (!vote || vote.status !== 'open' || !this.outbox) return
    if (vote.mine && !vote.allowChange) return
    if (!vote.options.some((o) => o.id === optionId)) return
    const reason = vote.rationalePrompt ? rationale?.trim().slice(0, 280) : undefined
    this.store.set((s) => ({
      votes: { ...s.votes, [voteId]: { ...vote, mine: optionId, ballotSent: false } },
    }))
    await this.outbox.enqueue({
      id: `vote:${voteId}:${this.now()}`,
      type: 'vote.cast',
      to: 'controller',
      payload: { voteId, optionId, ...(reason ? { rationale: reason } : {}) },
    })
  }

  /** Called after the outbox sent an action: a ballot that went out is no longer waiting. */
  private afterSend(action: { type: string; payload: Record<string, unknown> }): void {
    if (action.type === 'eval.observation') {
      const { observationId, revision } = action.payload as {
        observationId: string
        revision: number
      }
      void this.evaluate?.markSent(observationId, revision)
      return
    }
    if (action.type === 'survey.response') {
      const id = String(action.payload.surveyId)
      const survey = this.state.surveys[id]
      if (survey)
        this.store.set((s) => ({ surveys: { ...s.surveys, [id]: { ...survey, sent: true } } }))
      return
    }
    if (action.type !== 'vote.cast') return
    const id = String(action.payload.voteId)
    const vote = this.state.votes[id]
    if (!vote || vote.mine !== action.payload.optionId) return
    this.store.set((s) => ({ votes: { ...s.votes, [id]: { ...vote, ballotSent: true } } }))
  }

  /** Download and open an inject's media (sealed under the session key). */
  fetchBlob(ref: BlobRef): Promise<Uint8Array> {
    const client = this.client
    if (!client || client.state !== 'joined') return Promise.reject(new Error('Not connected'))
    return client.getBlob(ref)
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
    void this.evaluate?.discard()
    this.stop()
  }

  stop(): void {
    this.stopped = true
    this.scheduler.stop()
    this.clearTimer('dropTimer')
    this.media.dispose()
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
