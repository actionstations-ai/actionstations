/**
 * The controller side of a live session (spec 0418, this part landed by #407): start, status
 * and end; the session keys and the controller signing key in memory; the controller's
 * `LiveClient` attached in-process to the session hub; the LAN listener; the session folder
 * `scenarios/<id>/live/<sessionId>/` with `session.json` and `log.jsonl`. One session per app
 * instance. Nothing listens before `startSession` and nothing after `endSession` or app quit.
 */
import { app, powerSaveBlocker } from 'electron'
import { join } from 'node:path'
import { fromBase64Url, toBase64Url, toHex } from '@shared/live/bytes'
import { LiveClient } from '@shared/live/client'
import type { Opened } from '@shared/live/codec'
import { SessionKeys } from '@shared/live/crypto/keys'
import type { CryptoProvider, KeyPair } from '@shared/live/crypto/provider'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { SessionHub } from '@shared/live/hub'
import type { Transport } from '@shared/live/transport'
import { LIMITS, PROTOCOL_VERSION } from '@shared/live/protocol'
import type { BlobRef, ClientId, ClockState, Destination } from '@shared/live/schemas'
import { MemoryServer } from '@shared/live/transport-memory'
import type {
  Attribution,
  LiveDevice,
  VoteDefinition,
  HotWashAction,
  LanServerStatus,
  LiveConnection,
  LiveSession,
  LiveSessionStatus,
} from '@shared/schemas/live'
import { LiveSession as LiveSessionSchema } from '@shared/schemas/live'
import type { Role } from '@shared/schemas/project'
import { AppError } from '../lib/errors'
import { emit, onEmit } from '../lib/events'
import { readJson, safeJoin, writeJsonAtomic } from '../lib/fs'
import { playerBundleDir, userDataPath } from '../lib/paths'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import { readFacilitatorState } from '../facilitator/state'
import { requireProject } from '../project/guard'
import { scenarioLayout } from '../scenario/layout'
import { getScenario } from '../scenario/store'
import { appendResponse, readSurvey } from '../surveys/store'
import { inviteViews } from './invites'
import { DEVICE_TARGET, teamSlug } from '@shared/live/targets'
import { Delivery, type DeliverySeat } from './releases'
import { LiveSurveys, type SurveySeat } from './surveys'
import { Votes, type VoteResult, type VoteSeat } from './votes'
import {
  emptyStage,
  formatClock,
  releaseRow,
  stageAll,
  stageStatus,
  type StageState,
} from './delivery-service'
import { storeAttachment } from './attachments'
import { HotWash, hotwashPrompts, type HotWashQuestion } from './hotwash'
import { Messages, type MessageRole, type MessageSeat } from './messages'
import { LiveEvaluation } from './evaluation'
import { upsertObservation } from '../evaluation/store'
import type { Calls, CallSeat } from './calls'
import { makeBridge, makeCalls, type LinkHost } from './simcell-link'
import { simcellFor } from '../simcell/registry'
import { LogWriter } from './log'
import { countEntries, readAll, sessionFolder } from './log-read'
import { deleteSessionKeys, readSessionKeys, writeSessionKeys } from './keys'
import {
  branchEntriesForLive,
  clockKey,
  clockPayload,
  listDevices,
  rotateKeys,
  sendStaffNotice,
  type StaffNotice,
} from './live-control'
import { trackClients } from './dashboard'
import { Seats, type Seat } from './seats'
import { runSessionEndHooks } from './end-hooks'
import { requireConsent, isRemote } from './connection'
import {
  attachController,
  createRemoteSession,
  reopenRemoteSession,
  endRemoteSession,
  type RemoteHandle,
} from './remote-session'
import { writeFacilitatorState } from '../facilitator/state'
import { chooseAddress, listLanAddresses } from './transport/lan/addresses'
import { LanLog } from './transport/lan/log'
import { startLanServer, type LanServer } from './transport/lan/server'

/** Frames a participant may send per minute on the LAN (spec 0407 Security). */
const LAN_FRAMES_PER_MINUTE = 60
/** `join` frames one device may send in a session before the rest are ignored (#457 review H1). */
const MAX_JOINS_PER_CLIENT = 20

export interface Active {
  session: LiveSession
  root: string
  crypto: CryptoProvider
  keys: SessionKeys
  signing: KeyPair
  /** In-process hub (LAN); a remote session's hub lives on the server. */
  hub?: SessionHub
  remote?: RemoteHandle
  client: LiveClient
  lan?: LanServer
  lanLog: LanLog
  log: LogWriter
  seats: Seats
  /** `join` frames seen per client, for the join throttle. */
  joins: Map<ClientId, number>
  /** Per-session salt for `clientRef`; memory only, so refs are unlinkable after the session. */
  salt: Uint8Array
  delivery: Delivery
  messages: Messages
  hotwash: HotWash
  calls: Calls
  votes: Votes
  surveys: LiveSurveys
  evaluation: LiveEvaluation
  stage: StageState
  mediaCache: Map<string, BlobRef>
  /** The clock last published to devices, to skip a save that did not move it. */
  clockKey?: string
  powerSave?: number
  unsubscribe: (() => void)[]
  dir: string
}

let active: Active | undefined
let ending: Promise<LiveSession> | undefined

export interface StartSessionRequest {
  projectPath: string
  scenarioId: string
  connection: LiveConnection
  attribution: Attribution
  name?: string
  /** The facilitator confirmed binding to a public (non-private) address. */
  allowPublicAddress?: boolean
  /** A session for surveys only (spec 0422 FR-7). */
  surveyOnly?: boolean
}

const sessionDir = (root: string, scenarioId: string, sessionId: string): string =>
  safeJoin(scenarioLayout(root, scenarioId).dir, 'live', sessionId)

/** The bind address: `TTX_LIVE_BIND` (unpackaged test runs only), else the chosen or recommended LAN address. */
function bindAddress(requested: string | undefined, allowPublic = false): string {
  const override = !app.isPackaged && process.env.TTX_LIVE_BIND
  if (override) return override
  const choice = chooseAddress(listLanAddresses(), requested, allowPublic)
  if (choice.ok) return choice.address.address
  const message = {
    unknown: `${requested} is not one of this computer's addresses`,
    none: 'This computer is not on a network',
    public: `${requested ?? 'The chosen address'} is a public address. Confirm that you want devices beyond the local network to reach this session.`,
  }[choice.reason]
  throw new AppError('VALIDATION', message, { reason: choice.reason })
}

/** A resumed session keeps its address when this computer still has it, else takes the best one. */
function bindResumed(requested: string | undefined): string {
  try {
    return bindAddress(requested)
  } catch {
    return bindAddress(undefined)
  }
}

/** A per-session pseudonym for a client id: SHA-256 with the session salt, 16 bytes, base64url. */
async function pseudonym(
  a: Pick<Active, 'crypto' | 'salt'>,
  clientId: ClientId,
): Promise<ClientId> {
  const bytes = new TextEncoder().encode(`roster:${clientId}`)
  const salted = new Uint8Array(a.salt.length + bytes.length)
  salted.set(a.salt)
  salted.set(bytes, a.salt.length)
  return toBase64Url((await a.crypto.sha256(salted)).slice(0, 16))
}

async function clientRef(a: Active, clientId: ClientId): Promise<string> {
  const bytes = new TextEncoder().encode(clientId)
  const salted = new Uint8Array(a.salt.length + bytes.length)
  salted.set(a.salt)
  salted.set(bytes, a.salt.length)
  return toHex(await a.crypto.sha256(salted)).slice(0, 8)
}

async function clockState(root: string, scenarioId: string): Promise<ClockState> {
  const state = await readFacilitatorState(root, scenarioId).catch(() => undefined)
  const runningSince = state?.runningSince ? Date.parse(state.runningSince) : undefined
  return {
    elapsedMin: state?.elapsedMin ?? 0,
    ...(runningSince && Number.isFinite(runningSince) ? { runningSince } : {}),
    rate: 1,
  }
}

/** Devices currently connected: the LAN listener's count, or the seats online on a remote server. */
function connectedCount(a: Active | undefined): number {
  return a ? (a.lan?.connected ?? a.seats.connected) : 0
}

function emitChanged(
  reason:
    | 'started'
    | 'stopped'
    | 'presence'
    | 'error'
    | 'receipts'
    | 'staging'
    | 'messages'
    | 'votes'
    | 'evaluation'
    | 'hotwash'
    | 'surveys',
  message?: string,
  threadId?: string,
) {
  emit('live:changed', {
    reason,
    ...(threadId ? { threadId } : {}),
    ...(active ? { sessionId: active.session.id } : {}),
    connected: connectedCount(active),
    ...(message ? { message } : {}),
  })
}

/** Log first, then answer (spec 0418: the log is the source of truth, state follows it). */
async function onJoin(a: Active, msg: Opened<'join'>): Promise<void> {
  const joins = (a.joins.get(msg.from) ?? 0) + 1
  a.joins.set(msg.from, joins)
  const ref = await clientRef(a, msg.from)
  if (joins > MAX_JOINS_PER_CLIENT) {
    // Logged once, then ignored: a device cannot grow the log or the roster by re-joining.
    if (joins === MAX_JOINS_PER_CLIENT + 1) {
      await a.log.append({
        kind: 'anomaly',
        actor: { kind: 'client', clientRef: ref },
        data: { what: 'join flood', ignoredAfter: MAX_JOINS_PER_CLIENT },
        env: { from: ref, seq: msg.seq },
      })
    }
    return
  }
  const seating = await a.seats.seat(msg)
  if (!seating.ok) {
    await a.log.append({
      kind: 'anomaly',
      actor: { kind: 'client', clientRef: ref },
      data: { what: 'join refused', reason: seating.reason },
      env: { from: ref, seq: msg.seq },
    })
  } else {
    const { seat } = seating
    await a.log.append({
      kind: 'client.join',
      actor: {
        kind: 'client',
        clientRef: ref,
        seat: { kind: seat.kind, ...(seat.roleId ? { roleId: seat.roleId } : {}) },
        displayName: seat.name,
      },
      data: { resume: msg.payload.resume ?? false, staff: seat.staff },
      env: { from: ref, seq: msg.seq },
    })
  }
  await a.client.send('welcome', `client:${msg.from}`, seating.welcome)
  if (seating.ok && seating.seat.kind === 'evaluator') await a.evaluation.onJoin(msg.from)
}

async function onPresence(a: Active, msg: Opened<'presence'>): Promise<void> {
  const seat = a.seats.presence(msg.payload.client, msg.payload.state === 'online')
  if (msg.payload.state === 'offline' && seat) {
    await a.log.append({
      kind: 'client.leave',
      actor: {
        kind: 'client',
        clientRef: await clientRef(a, seat.clientId),
        seat: { kind: seat.kind, ...(seat.roleId ? { roleId: seat.roleId } : {}) },
      },
      data: {},
    })
  }
  emitChanged('presence')
}

function wireClient(a: Active): void {
  a.unsubscribe.push(
    a.client.on('join', (msg) => void onJoin(a, msg).catch((e) => fail(a, e))),
    a.client.on('presence', (msg) => void onPresence(a, msg).catch((e) => fail(a, e))),
    a.client.on(
      'inject.receipt',
      (msg) => void a.delivery.onReceipt(msg.from, msg.seq, msg.payload).catch((e) => fail(a, e)),
    ),
    a.client.on('eval.observation', (msg) => {
      // Sealed to the controller: only a device's own frame to the controller is an observation.
      if (msg.to !== 'controller') return
      void a.evaluation.onObservation(msg.from, msg.seq, msg.payload).catch((e) => fail(a, e))
    }),
    a.client.on('message.send', (msg) => {
      // Only a device's own frame to the controller is a player message; anything else on the
      // channel (another device's echo, a forged frame) is not handled here.
      if (msg.to !== 'controller') return
      void a.messages.onPlayerMessage(msg.from, msg.seq, msg.payload).catch((e) => fail(a, e))
    }),
    a.client.on('call.answer', (msg) => {
      if (msg.to !== 'controller') return
      void a.calls.onAnswer(msg.from, msg.seq, msg.payload).catch((e) => fail(a, e))
    }),
    a.client.on('call.end', (msg) => {
      if (msg.to !== 'controller') return
      void a.calls.onPlayerEnd(msg.from, msg.seq, msg.payload).catch((e) => fail(a, e))
    }),
    a.client.on(
      'vote.cast',
      (msg) => void a.votes.onBallot(msg.from, msg.seq, msg.payload).catch((e) => fail(a, e)),
    ),
    a.client.on(
      'hotwash.item',
      (msg) => void a.hotwash.onItem(msg.from, msg.seq, msg.payload).catch((e) => fail(a, e)),
    ),
    a.client.on('survey.response', (msg) => {
      // Sealed to the controller; the sender is used to find its seat and is not kept.
      if (msg.to !== 'controller') return
      void a.surveys.onResponse(msg.from, msg.payload).catch((e) => fail(a, e))
    }),
    a.client.onDropped((reason, detail) => {
      if (reason === 'NOT_FOR_ME' || reason === 'STAFF_ONLY' || reason === 'CONTROLLER_ONLY') return
      void a.log
        .append({
          kind: 'anomaly',
          actor: { kind: 'system' },
          data: {
            what: 'frame dropped',
            reason,
            ...(detail ? { detail: detail.slice(0, 200) } : {}),
          },
        })
        .catch(() => undefined)
    }),
  )
}

function fail(a: Active, err: unknown): void {
  if (active !== a) return
  console.error('[live]', err)
  emitChanged('error', err instanceof Error ? err.message : String(err))
}

/** Delivery's view of the session: sending as the controller, the seated devices, the log. */
function makeDelivery(getActive: () => Active, roles: readonly Role[]): Delivery {
  const byId = new Map(roles.map((r) => [r.id, r]))
  return new Delivery({
    send: (type, to, payload, key) =>
      getActive().client.send(type, to as Destination, payload as never, { key }),
    log: { append: (input) => getActive().log.append(input) },
    clientRef: (id) => clientRef(getActive(), id),
    now: () => Date.now(),
    changed: () => emitChanged('receipts'),
    seats: () => {
      const a = getActive()
      return [...a.seats.byClient.values()].map((s): DeliverySeat => {
        const role = s.roleId ? byId.get(s.roleId) : undefined
        const team = role ? teamSlug(role.team) : undefined
        return {
          clientId: s.clientId,
          kind: s.kind,
          ...(s.roleId ? { roleId: s.roleId } : {}),
          ...(team ? { teamId: team } : {}),
          label:
            role?.name ??
            (s.kind === 'evaluator' ? 'Evaluator' : s.kind === 'observer' ? 'Observer' : s.kind),
          ...(a.session.attribution === 'named' && s.name ? { displayName: s.name } : {}),
        }
      })
    },
  })
}

/** Evaluation's view of the session: sending as the controller, seated devices, the log, the record. */
function makeEvaluation(getActive: () => Active): LiveEvaluation {
  const view = (s: Seat) => ({
    clientId: s.clientId,
    kind: s.kind,
    staff: s.staff,
    online: s.online,
    name: s.name,
  })
  return new LiveEvaluation({
    send: (type, to, payload) =>
      getActive().client.send(type, to, payload as never, { key: 'staff' }),
    log: { append: (input) => getActive().log.append(input) },
    seats: () => [...getActive().seats.byClient.values()].map(view),
    seatOf: (id) => {
      const s = getActive().seats.byClient.get(id)
      return s ? view(s) : undefined
    },
    clientRef: (id) => clientRef(getActive(), id),
    scenario: () => getScenario(getActive().root, getActive().session.scenarioId),
    save: (observation) =>
      upsertObservation(getActive().root, getActive().session.scenarioId, observation),
    attribution: () => getActive().session.attribution,
    now: () => Date.now(),
    newId: () => toBase64Url(getActive().crypto.random(16)),
    changed: () => emitChanged('evaluation'),
  })
}

/** Re-send assignments shortly after the scenario's evaluation guides are saved. */
function watchScenarioChanges(a: Active): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const off = onEmit((name, payload) => {
    const p = payload as { path?: string; what?: string; scenarioId?: string }
    if (name !== 'project:changed' || p.what !== 'scenario') return
    if (p.scenarioId !== a.session.scenarioId) return
    clearTimeout(timer)
    timer = setTimeout(() => void a.evaluation.refresh().catch(() => undefined), 400)
  })
  return () => {
    clearTimeout(timer)
    off()
  }
}

function messageRoles(roles: readonly Role[]): MessageRole[] {
  return roles.map((r) => {
    const team = teamSlug(r.team)
    return { id: r.id, name: r.name, ...(team ? { teamId: team, teamName: r.team } : {}) }
  })
}

/** Messages' view of the session: sending as the controller, seated devices, the log, blobs. */
function makeMessages(getActive: () => Active, roles: readonly Role[]): Messages {
  const byId = new Map(roles.map((r) => [r.id, r]))
  const label = (s: Seat): MessageSeat => {
    const role = s.roleId ? byId.get(s.roleId) : undefined
    const team = role ? teamSlug(role.team) : undefined
    return {
      clientId: s.clientId,
      kind: s.kind,
      ...(s.roleId ? { roleId: s.roleId } : {}),
      ...(team ? { teamId: team } : {}),
      label: role?.name ?? s.kind,
      ...(getActive().session.attribution === 'named' && s.name ? { displayName: s.name } : {}),
    }
  }
  return new Messages({
    send: (to, payload) =>
      getActive().client.send('message.send', to, payload as never, { key: 'players', sign: true }),
    log: { append: (input) => getActive().log.append(input) },
    roles: messageRoles(roles),
    seats: () => [...getActive().seats.byClient.values()].map(label),
    seatOf: (id) => {
      const s = getActive().seats.byClient.get(id)
      return s ? label(s) : undefined
    },
    clientRef: (id) => clientRef(getActive(), id),
    getBlob: (ref) => getActive().client.getBlob(ref),
    store: (ref, bytes) =>
      storeAttachment({
        sessionDir: getActive().dir,
        projectRoot: getActive().root,
        blobId: ref.blobId,
        bytes,
        claimedMime: ref.mime,
        claimedSha256: ref.sha256,
        maxBytes: getActive().client.limits.playerBlobBytes,
      }),
    clock: async () => {
      const a = getActive()
      const c = await clockState(a.root, a.session.scenarioId)
      return { time: formatClock(c, Date.now()), pre: c.elapsedMin === 0 && !c.runningSince }
    },
    now: () => Date.now(),
    newId: () => toBase64Url(getActive().crypto.random(16)),
    changed: (threadId) => emitChanged('messages', undefined, threadId),
    incoming: (m) =>
      void simcellFor(getActive().root, getActive().session.scenarioId)
        .onPlayerMessage({
          messageId: m.messageId,
          channel: m.channel,
          ...(m.replyTo ? { replyTo: m.replyTo } : {}),
        })
        .catch((e: unknown) => console.error('[simcell] routing:', e)),
  })
}

/** What the SimCell assistant and voice calls need from this session (spec 0429). */
function linkHost(getActive: () => Active, roles: readonly Role[]): LinkHost {
  const byId = new Map(roles.map((r) => [r.id, r]))
  const seatOf = (id: string): CallSeat | undefined => {
    const s = getActive().seats.byClient.get(id)
    if (!s) return undefined
    const role = s.roleId ? byId.get(s.roleId) : undefined
    const team = role ? teamSlug(role.team) : undefined
    return {
      clientId: s.clientId,
      kind: s.kind,
      ...(s.roleId ? { roleId: s.roleId } : {}),
      ...(team ? { teamId: team } : {}),
      label: role?.name ?? s.kind,
    }
  }
  return {
    get sessionId() {
      return getActive().session.id
    },
    get dir() {
      return getActive().dir
    },
    send: (type, to, payload) =>
      getActive().client.send(type, to, payload as never, { key: 'players', sign: true }),
    putBlob: (meta, bytes) => getActive().client.putBlob(meta, bytes),
    getBlob: (ref) => getActive().client.getBlob(ref),
    maxAnswerBytes: () => getActive().client.limits.playerBlobBytes,
    log: { append: (input) => getActive().log.append(input) },
    seatOf,
    clientRef: (id) => clientRef(getActive(), id),
    clock: async () => {
      const a = getActive()
      return formatClock(await clockState(a.root, a.session.scenarioId), Date.now())
    },
    newId: () => toBase64Url(getActive().crypto.random(16)),
    changed: () => emitChanged('messages'),
    get messages() {
      return getActive().messages
    },
    releases: async () => await getActive().delivery.summaries(),
  }
}

/** Votes' view of the session: sending as the controller, the seated devices, the log. */
function makeVotes(getActive: () => Active, roles: readonly Role[]): Votes {
  const byId = new Map(roles.map((r) => [r.id, r]))
  return new Votes({
    send: (type, to, payload) =>
      getActive().client.send(type, to, payload as never, { key: 'players' }),
    log: { append: (input) => getActive().log.append(input) },
    seats: () =>
      [...getActive().seats.byClient.values()].map((s): VoteSeat => {
        const role = s.roleId ? byId.get(s.roleId) : undefined
        const team = role ? teamSlug(role.team) : undefined
        return {
          clientId: s.clientId,
          kind: s.kind,
          ...(s.roleId ? { roleId: s.roleId } : {}),
          ...(team ? { teamId: team } : {}),
          label: role?.name ?? s.kind,
          online: s.online,
        }
      }),
    roleLabel: (id) => byId.get(id)?.name ?? id,
    now: () => Date.now(),
    changed: () => emitChanged('votes'),
    exerciseTime: async () => {
      const a = getActive()
      return formatClock(await clockState(a.root, a.session.scenarioId), Date.now())
    },
    onClosed: (result) => {
      for (const listener of closedListeners) listener(result)
    },
  })
}

/** Surveys' view of the session: sending as the controller, the seated devices, the log. */
function makeSurveys(
  getActive: () => Active,
  roles: readonly Role[],
  channel: 'live' | 'qr',
): LiveSurveys {
  const byId = new Map(roles.map((r) => [r.id, r]))
  return new LiveSurveys({
    send: (type, to, payload) =>
      getActive().client.send(type, to, payload as never, { key: 'players' }),
    log: { append: (input) => getActive().log.append(input) },
    load: async (surveyId) => {
      const a = getActive()
      return readSurvey(a.root, a.session.scenarioId, surveyId)
    },
    store: (response) => {
      const a = getActive()
      return appendResponse(a.root, a.session.scenarioId, response)
    },
    seats: () =>
      [...getActive().seats.byClient.values()].map((s): SurveySeat => {
        const role = s.roleId ? byId.get(s.roleId) : undefined
        const team = role ? teamSlug(role.team) : undefined
        return {
          clientId: s.clientId,
          kind: s.kind,
          ...(s.roleId ? { roleId: s.roleId } : {}),
          ...(team ? { teamId: team } : {}),
          label: role?.name ?? s.kind,
          online: s.online,
        }
      }),
    channel,
    now: () => Date.now(),
    changed: () => emitChanged('surveys'),
  })
}

/** The hot wash's view of the session: sending as the controller, the seated devices, the log. */
function makeHotWash(
  getActive: () => Active,
  roles: readonly Role[],
  questions: HotWashQuestion[],
): HotWash {
  const byId = new Map(roles.map((r) => [r.id, r]))
  return new HotWash({
    send: (type, to, payload) =>
      getActive().client.send(type, to, payload as never, { key: 'players', sign: true }),
    log: { append: (input) => getActive().log.append(input) },
    seatOf: (id) => {
      const s = getActive().seats.byClient.get(id)
      if (!s) return undefined
      const named = getActive().session.attribution === 'named' && s.name
      return {
        clientId: s.clientId,
        kind: s.kind,
        ...(s.roleId ? { roleId: s.roleId } : {}),
        label: (s.roleId ? byId.get(s.roleId)?.name : undefined) ?? SEAT_LABELS[s.kind],
        ...(named ? { displayName: s.name } : {}),
      }
    },
    clientRef: (id) => clientRef(getActive(), id),
    questions,
    clock: async () => {
      const a = getActive()
      return { time: formatClock(await clockState(a.root, a.session.scenarioId), Date.now()) }
    },
    now: () => Date.now(),
    newId: () => toBase64Url(getActive().crypto.random(16)),
    changed: () => emitChanged('hotwash'),
  })
}

const SEAT_LABELS = {
  player: 'Player',
  evaluator: 'Evaluator',
  observer: 'Observer',
  simcell: 'SimCell',
} as const

async function openLan(a: Active, address: string, tls: 'self-signed' | 'none', port?: number) {
  if (!a.hub) throw new AppError('INTERNAL', 'This session has no in-process hub')
  a.lan = await startLanServer({
    address,
    ...(port !== undefined ? { port } : {}),
    tls,
    hub: a.hub,
    bundleDir: playerBundleDir(),
    log: a.lanLog,
    version: app.getVersion(),
  })
  a.unsubscribe.push(a.lan.onConnectedChange(() => emitChanged('presence')))
}

async function writeSessionFile(a: Active): Promise<void> {
  a.session = { ...a.session, lastIndex: a.client.lastIndex }
  await writeJsonAtomic(join(a.dir, 'session.json'), a.session)
}

export async function startSession(req: StartSessionRequest): Promise<LiveSessionStatus> {
  if (active || ending) {
    throw new AppError(
      'CONFLICT',
      'A live session is already running. End it before starting another.',
    )
  }
  const root = await requireProject(req.projectPath)
  const scenario = await getScenario(root, req.scenarioId)
  if (isRemote(req.connection)) {
    requireConsent(await readFacilitatorState(root, req.scenarioId), req.connection)
  }
  const remote = isRemote(req.connection) ? await createRemoteSession(req.connection) : undefined
  try {
    return await startOn(req, root, scenario, remote)
  } catch (err) {
    if (remote) await endRemoteSession(remote)
    throw err
  }
}

/** What an interrupted session brings back: its record and the keys read from safeStorage. */
interface ResumeInput {
  session: LiveSession
  crypto: CryptoProvider
  keys: SessionKeys
  signing: KeyPair
}

async function restoreKeys(
  crypto: CryptoProvider,
  session: LiveSession,
  stored: NonNullable<Awaited<ReturnType<typeof readSessionKeys>>>,
): Promise<ResumeInput> {
  const ecdh = await crypto.ecdhImport(stored.ecdh.privateJwk as never)
  if (toBase64Url(ecdh.publicKey) !== stored.ecdh.publicKey) {
    throw new AppError('VALIDATION', 'The stored keys for this session do not match')
  }
  const keys = new SessionKeys(session.id, crypto, { controllerEcdh: ecdh })
  const epochs = Object.keys(stored.staffRoots).map(Number)
  for (const epoch of epochs.sort((x, y) => x - y)) {
    await keys.addEpoch(epoch, 'staff', fromBase64Url(stored.staffRoots[String(epoch)]!))
  }
  if (!keys.hasStaff) throw new AppError('VALIDATION', 'The stored keys for this session are empty')
  const signing = await crypto.ecdsaImport(stored.signing.privateJwk as never)
  return { session, crypto, keys, signing }
}

/**
 * Continue an interrupted session on the same address and port (spec 0417 FR-7). Devices rejoin
 * with the links they already have. Only the record and the keys come back: messages, votes and
 * hot wash items in memory restart empty, and what the log holds stays in the log.
 */
export async function resumeSession(
  projectPath: string,
  scenarioId: string,
  sessionId: string,
): Promise<LiveSessionStatus> {
  if (active || ending) {
    throw new AppError('CONFLICT', 'A live session is already running. End it first.')
  }
  const root = await requireProject(projectPath)
  const scenario = await getScenario(root, scenarioId)
  const dir = sessionFolder(root, scenarioId, sessionId)
  const session = await readJson(safeJoin(dir, 'session.json'), LiveSessionSchema)
  if (session.endedAt) throw new AppError('CONFLICT', 'This session has already ended.')
  const stored = await readSessionKeys(sessionId)
  if (!stored) {
    throw new AppError(
      'NOT_FOUND',
      'The keys for this session are not stored on this computer, so it cannot be resumed. Close it as ended.',
    )
  }
  const resume = await restoreKeys(createWebCryptoProvider(), session, stored)
  const remote = await reopenRemote(session, stored.controllerToken)
  return startOn(
    {
      projectPath,
      scenarioId,
      connection: session.connection,
      attribution: session.attribution,
      name: session.name,
      ...(session.surveyOnly ? { surveyOnly: true } : {}),
    },
    root,
    scenario,
    remote,
    resume,
  )
}

/** A remote session is reattached with the token stored at start; the server may have dropped it. */
async function reopenRemote(
  session: LiveSession,
  controllerToken: string | undefined,
): Promise<RemoteHandle | undefined> {
  if (!isRemote(session.connection)) return undefined
  if (!controllerToken) {
    throw new AppError(
      'NOT_FOUND',
      'This session was started before resume was possible on a server. Close it as ended and start a new one.',
    )
  }
  return reopenRemoteSession(session.connection, { sessionId: session.id, controllerToken })
}

/** Close what the restart cut off and say so in the log (state follows the log). */
async function logResume(a: Active, resume: ResumeInput): Promise<void> {
  const prior = await readAll(a.log.path)
  const openVotes = new Set<string>()
  for (const e of prior) {
    const id = e.ref?.voteId
    if (!id) continue
    if (e.kind === 'vote.open') openVotes.add(id)
    else if (e.kind === 'vote.close') openVotes.delete(id)
  }
  // Device references are salted per run, so devices seen before the restart are marked gone.
  for (const [clientRef, c] of trackClients(prior)) {
    if (c.state !== 'in') continue
    await a.log.append({
      kind: 'client.leave',
      actor: {
        kind: 'client',
        clientRef,
        seat: { kind: c.kind, ...(c.roleId ? { roleId: c.roleId } : {}) },
      },
      data: { reason: 'app restarted' },
    })
  }
  for (const voteId of openVotes) {
    await a.log.append({
      kind: 'vote.close',
      actor: { kind: 'controller' },
      ref: { voteId },
      data: { voteId, status: 'interrupted', reason: 'app restarted', results: {}, voted: 0 },
    })
  }
  const lost = Math.max(0, resume.session.lastIndex - (prior.at(-1)?.i ?? 0))
  await a.log.append({
    kind: 'session.resume',
    actor: { kind: 'controller' },
    data: { connection: a.session.connection.kind, lostEntries: lost, epoch: a.keys.currentEpoch },
  })
}

interface Parts {
  hub?: SessionHub
  transport: Transport
  limits: typeof LIMITS.lan
}

/** The controller's connection to the session server: in-process hub (LAN) or the remote socket. */
async function controllerParts(
  crypto: CryptoProvider,
  sessionId: string,
  keys: SessionKeys,
  controllerId: string,
  remote: RemoteHandle | undefined,
): Promise<Parts> {
  if (remote) {
    const transport = await attachController(remote, await keys.joinTokenHash(), controllerId)
    return { transport, limits: remote.limits }
  }
  const hub = new SessionHub({
    sessionId,
    kind: 'lan',
    joinTokenHash: await keys.joinTokenHash(),
    crypto,
    version: app.getVersion(),
    framesPerMinute: LAN_FRAMES_PER_MINUTE,
  })
  const transport = await new MemoryServer({ hub }).connect({
    clientId: controllerId,
    controller: true,
  })
  return { hub, transport, limits: LIMITS.lan }
}

async function startOn(
  req: StartSessionRequest,
  root: string,
  scenario: Awaited<ReturnType<typeof getScenario>>,
  remote: RemoteHandle | undefined,
  resume?: ResumeInput,
): Promise<LiveSessionStatus> {
  const prompts = hotwashPrompts(scenario.hotwash)
  const crypto = resume?.crypto ?? createWebCryptoProvider()
  const sessionId = resume?.session.id ?? remote?.auth.sessionId ?? toBase64Url(crypto.random(16))
  const keys = resume?.keys ?? (await SessionKeys.create(crypto, sessionId))
  const signing = resume?.signing ?? (await crypto.ecdsaGenerate())
  const controllerId = toBase64Url(crypto.random(16))
  const { hub, transport, limits } = await controllerParts(
    crypto,
    sessionId,
    keys,
    controllerId,
    remote,
  )
  const client = new LiveClient({
    transport,
    keys,
    clientId: controllerId,
    role: 'controller',
    crypto,
    controllerPub: signing.publicKey,
    signer: signing.privateKey,
    limits,
  })
  const requested = req.connection.kind === 'lan' ? req.connection.address : undefined
  const address = remote
    ? ''
    : resume
      ? bindResumed(requested)
      : bindAddress(requested, req.allowPublicAddress)
  const dir = sessionDir(root, req.scenarioId, sessionId)
  const log = await LogWriter.open(join(dir, 'log.jsonl'), req.attribution)
  const salt = crypto.random(16)
  const a: Active = {
    session: resume
      ? {
          ...resume.session,
          connection: remote
            ? resume.session.connection
            : ({ ...req.connection, address } as LiveConnection),
        }
      : {
          id: sessionId,
          scenarioId: req.scenarioId,
          name: req.name?.trim() || scenario.title,
          startedAt: new Date().toISOString(),
          connection:
            req.connection.kind === 'lan' ? { ...req.connection, address } : req.connection,
          joinUrlPublic: '',
          attribution: req.attribution,
          protocolVersion: PROTOCOL_VERSION,
          ...(req.surveyOnly ? { surveyOnly: true } : {}),
          lastIndex: 0,
        },
    root,
    crypto,
    keys,
    signing,
    ...(hub ? { hub } : {}),
    ...(remote ? { remote } : {}),
    client,
    lanLog: new LanLog(userDataPath('live', 'lan.log')),
    log,
    seats: new Seats({
      keys,
      roles: scenario.roles,
      attribution: req.attribution,
      sessionName: req.name?.trim() || scenario.title,
      scenarioTitle: scenario.title,
      hotwash: prompts,
      ...(req.surveyOnly ? { surveyOnly: true } : {}),
      clock: () => cachedClock,
      pseudonym: (id) => pseudonym({ crypto, salt }, id),
    }),
    joins: new Map(),
    salt,
    delivery: makeDelivery(() => a, scenario.roles),
    messages: makeMessages(() => a, scenario.roles),
    hotwash: makeHotWash(() => a, scenario.roles, prompts.questions),
    calls: makeCalls(
      linkHost(() => a, scenario.roles),
      simcellFor(root, req.scenarioId),
    ),
    votes: makeVotes(() => a, scenario.roles),
    surveys: makeSurveys(() => a, scenario.roles, req.surveyOnly ? 'qr' : 'live'),
    evaluation: makeEvaluation(() => a),
    stage: emptyStage(),
    mediaCache: new Map(),
    unsubscribe: [],
    dir,
  }
  let cachedClock = await clockState(root, req.scenarioId)
  a.unsubscribe.push(
    client.on('join', () => {
      void clockState(root, req.scenarioId).then((c) => (cachedClock = c))
    }),
  )
  try {
    if (req.connection.kind === 'lan') {
      await openLan(a, address, req.connection.tls, req.connection.port)
    }
  } catch (err) {
    client.close()
    hub?.end()
    await log.flush()
    throw err
  }
  a.session.joinUrlPublic = a.lan?.status.url ?? `${remote!.origin}/s/${sessionId}`
  if (a.lan && a.session.connection.kind === 'lan') {
    // Kept so a resumed session opens on the same port and the links already shared still work.
    a.session = { ...a.session, connection: { ...a.session.connection, port: a.lan.status.port } }
  }
  a.clockKey = clockKey(cachedClock)
  active = a
  wireClient(a)
  a.unsubscribe.push(watchScenarioChanges(a))
  const simcell = simcellFor(root, req.scenarioId)
  await simcell.attach(
    makeBridge(
      linkHost(() => a, scenario.roles),
      a.calls,
    ),
  )
  simcell.startClock()
  await writeSessionFile(a)
  if (resume) await logResume(a, resume)
  else {
    await log.append({
      kind: 'session.start',
      actor: { kind: 'controller' },
      data: {
        connection: req.connection.kind,
        ...(req.connection.kind === 'lan' ? { tls: req.connection.tls } : {}),
        attribution: req.attribution,
        protocol: PROTOCOL_VERSION,
      },
    })
  }
  await persistKeys(a)
  a.powerSave = powerSaveBlocker.start('prevent-app-suspension')
  await rememberConnection(root, req.scenarioId, req.connection)
  emitChanged('started')
  void stageAll(hostOf(a)).catch((e) => console.error('[live] staging:', (e as Error).message))
  return status(root, req.scenarioId)
}

/** The scenario remembers the connection it used, so the chooser opens on it next time. */
async function rememberConnection(
  root: string,
  scenarioId: string,
  connection: LiveConnection,
): Promise<void> {
  try {
    const state = await readFacilitatorState(root, scenarioId)
    await writeFacilitatorState(root, scenarioId, {
      ...state,
      live: { ...state.live, consented: state.live?.consented ?? [], connection },
    })
  } catch (err) {
    console.error('[live] could not remember the connection:', (err as Error).message)
  }
}

/** Best effort: without OS encryption the session still runs, it just cannot be resumed. */
async function persistKeys(a: Active): Promise<void> {
  try {
    const staffRoots: Record<string, string> = {}
    for (const epoch of a.keys.knownEpochs) {
      const root = a.keys.root('staff', epoch)
      if (root) staffRoots[String(epoch)] = toBase64Url(root)
    }
    await writeSessionKeys({
      sessionId: a.session.id,
      staffRoots,
      signing: {
        privateJwk: (await a.crypto.ecdsaExport(a.signing.privateKey)) as unknown as Record<
          string,
          unknown
        >,
        publicKey: toBase64Url(a.signing.publicKey),
      },
      ecdh: {
        privateJwk: (await a.crypto.ecdhExport(
          a.keys.controllerEcdh!.privateKey,
        )) as unknown as Record<string, unknown>,
        publicKey: toBase64Url(a.keys.controllerEcdhPub!),
      },
      lastSeq: 0,
      ...(a.remote ? { controllerToken: a.remote.auth.controllerToken } : {}),
    })
  } catch (err) {
    console.error('[live] could not store the session keys:', (err as Error).message)
  }
}

/** The running session's status when it belongs to this scenario; otherwise an empty status. */
export function status(root: string, scenarioId: string): LiveSessionStatus {
  const a = active
  if (!a || a.root !== root || a.session.scenarioId !== scenarioId) return { connected: 0 }
  const lan = a.lan?.status
  const origin = lan ? lan.url.slice(0, lan.url.indexOf('/s/')) : a.remote?.origin
  const invites = origin
    ? inviteViews({
        origin,
        sessionId: a.session.id,
        keys: a.keys,
        controllerPub: a.signing.publicKey,
      })
    : undefined
  const since = Date.now() - Date.parse(a.session.startedAt)
  return {
    session: a.session,
    ...(lan ? { lan } : {}),
    ...(a.remote ? { remote: a.remote.status } : {}),
    ...(invites ? { invites } : {}),
    connected: connectedCount(a),
    ...(a.lan && !a.lan.everConnected ? { noConnectionsForMs: Math.max(0, since) } : {}),
  }
}

/** What delivery needs from the running session. */
function hostOf(a: Active) {
  return {
    get root() {
      return a.root
    },
    scenarioId: a.session.scenarioId,
    client: a.client,
    delivery: a.delivery,
    get stage() {
      return a.stage
    },
    set stage(v: StageState) {
      a.stage = v
    },
    mediaCache: a.mediaCache,
    clock: () => clockState(a.root, a.session.scenarioId),
    alive: () => active === a,
    staging: () => emitChanged('staging'),
  }
}

function activeFor(root: string, scenarioId: string): Active {
  const a = active
  if (!a || a.root !== root || a.session.scenarioId !== scenarioId) {
    throw new AppError('NOT_FOUND', 'No live session is running for this scenario')
  }
  return a
}

/** `client:<ref>` from the UI becomes the wire destination `client:<clientId>`. */
async function wireTargets(a: Active, targets: Destination[]): Promise<Destination[]> {
  return Promise.all(
    targets.map(async (t) =>
      DEVICE_TARGET.test(t) ? `client:${(await seatByRef(a, t.slice(7))).clientId}` : t,
    ),
  )
}

export async function releaseInject(
  root: string,
  scenarioId: string,
  req: { rowId: string; targets?: Destination[]; showExpected?: boolean },
) {
  const a = activeFor(root, scenarioId)
  const targets = req.targets ? await wireTargets(a, req.targets) : undefined
  return releaseRow(hostOf(a), { ...req, ...(targets ? { targets } : {}) })
}

export async function resendInject(
  root: string,
  scenarioId: string,
  releaseId: string,
  t: Destination[],
) {
  const a = activeFor(root, scenarioId)
  return a.delivery.resend(releaseId, await wireTargets(a, t))
}

export const retractInject = (root: string, scenarioId: string, releaseId: string) =>
  activeFor(root, scenarioId).delivery.retract(releaseId)

export const releaseSummaries = (root: string, scenarioId: string) =>
  activeFor(root, scenarioId).delivery.summaries()

export const stageProgress = (root: string, scenarioId: string) =>
  stageStatus(activeFor(root, scenarioId))

export const hotwashBoard = (root: string, scenarioId: string) =>
  activeFor(root, scenarioId).hotwash.board()

export async function openHotwash(
  root: string,
  scenarioId: string,
  review: boolean,
  text?: string,
) {
  const h = activeFor(root, scenarioId).hotwash
  await h.openOnDevices(review, text)
  return h.board()
}

export async function closeHotwash(root: string, scenarioId: string) {
  const h = activeFor(root, scenarioId).hotwash
  await h.closeOnDevices()
  return h.board()
}

export function setHotwashReview(root: string, scenarioId: string, review: boolean) {
  const h = activeFor(root, scenarioId).hotwash
  h.setReview(review)
  return h.board()
}

export async function updateHotwash(
  root: string,
  scenarioId: string,
  req: {
    action: HotWashAction
    itemIds: string[]
    label?: string
    text?: string
    tags?: Parameters<HotWash['tagItems']>[1]
  },
) {
  const h = activeFor(root, scenarioId).hotwash
  const run = {
    accept: () => h.acceptItems(req.itemIds),
    hide: () => h.hideItems(req.itemIds),
    restore: () => h.restoreItems(req.itemIds),
    edit: () => h.editItem(req.itemIds[0]!, req.text ?? ''),
    group: () => h.groupItems(req.itemIds, req.label),
    ungroup: () => h.ungroupItems(req.itemIds),
    label: () => h.labelGroup(req.itemIds[0]!, req.label ?? ''),
    tag: () => h.tagItems(req.itemIds, req.tags ?? {}),
  }
  await run[req.action]()
  return h.board()
}

export async function promoteHotwash(root: string, scenarioId: string, id: string) {
  const h = activeFor(root, scenarioId).hotwash
  const entry = await h.promote(id)
  return { entry, board: h.board() }
}

export async function unpromoteHotwash(root: string, scenarioId: string, id: string) {
  const h = activeFor(root, scenarioId).hotwash
  const entryId = await h.unpromote(id)
  return { entryId, board: h.board() }
}

export const messageThreads = (root: string, scenarioId: string) =>
  activeFor(root, scenarioId).messages.summaries()

export const messageThread = (root: string, scenarioId: string, channel: string) =>
  activeFor(root, scenarioId).messages.thread(channel)

export const messageTargets = (root: string, scenarioId: string) =>
  activeFor(root, scenarioId).messages.targets()

export const openMessageThread = (root: string, scenarioId: string, channel: string) =>
  activeFor(root, scenarioId).messages.openThread(channel)

export const sendMessage = (
  root: string,
  scenarioId: string,
  req: Parameters<Messages['sendControllerMessage']>[0],
) => activeFor(root, scenarioId).messages.sendControllerMessage(req)

export const evaluationCoverage = (root: string, scenarioId: string) =>
  activeFor(root, scenarioId).evaluation.coverage()

export const setEvaluatorWatch = (
  root: string,
  scenarioId: string,
  ref: string,
  watch: Parameters<LiveEvaluation['setWatch']>[1],
) => activeFor(root, scenarioId).evaluation.setWatch(ref, watch)

export const askEvaluator = (root: string, scenarioId: string, ref: string, text: string) =>
  activeFor(root, scenarioId).evaluation.ask(ref, text)

export const showExpectedToEvaluators = (root: string, scenarioId: string, on: boolean) =>
  activeFor(root, scenarioId).evaluation.setShowExpected(on)

export const markMessageHandled = (root: string, scenarioId: string, messageId: string) =>
  activeFor(root, scenarioId).messages.markHandled(messageId)

export const starMessage = (root: string, scenarioId: string, messageId: string, on: boolean) =>
  activeFor(root, scenarioId).messages.star(messageId, on)

export const pinMessage = (root: string, scenarioId: string, messageId: string) =>
  activeFor(root, scenarioId).messages.pin(messageId)

/** True while a session for this scenario runs (Deliver also goes to devices then). */
/** Flush the running session's log so a read sees every entry; no-op when none runs. */
export async function flushActiveLog(root: string, scenarioId: string): Promise<void> {
  if (active && active.root === root && active.session.scenarioId === scenarioId) {
    await active.log.flush()
  }
}

/** Facilitator marks a release answered (spec 0417 FR-9); logged, then the Room refreshes. */
export async function markAnswered(
  root: string,
  scenarioId: string,
  releaseId: string,
  note?: string,
): Promise<void> {
  const a = active
  if (!a || a.root !== root || a.session.scenarioId !== scenarioId) {
    throw new AppError('NOT_FOUND', 'No live session is running for this scenario')
  }
  const rowId = (await releaseSummaries(root, scenarioId)).find(
    (r) => r.releaseId === releaseId,
  )?.rowId
  if (!rowId) throw new AppError('NOT_FOUND', 'No such release in this session')
  await a.log.append({
    kind: 'inject.answered',
    actor: { kind: 'controller' },
    ref: { rowId, releaseId },
    data: note ? { note: note.slice(0, 500) } : {},
  })
  emitChanged('receipts')
}

/** Publish the exercise clock to devices when a save moved it (spec 0428 task 7). */
export async function publishClock(
  root: string,
  scenarioId: string,
  state: FacilitatorState,
): Promise<void> {
  const a = active
  if (!a || a.root !== root || a.session.scenarioId !== scenarioId || a.session.surveyOnly) return
  const payload = clockPayload(state)
  const key = clockKey(payload)
  if (key === a.clockKey) return
  a.clockKey = key
  await a.client.send('clock.state', 'all', payload, { key: 'players' })
  await a.log.append({
    kind: 'clock.state',
    actor: { kind: 'controller' },
    data: { ...payload },
  })
}

/** A notice for evaluator devices only; the facilitator speaks to players. */
export async function sendEvaluatorNotice(
  root: string,
  scenarioId: string,
  notice: StaffNotice,
): Promise<void> {
  const a = activeFor(root, scenarioId)
  await sendStaffNotice(a.client, a.log, a.crypto, notice)
}

/** Branch decisions and proposals go into the live log beside the rest of the run (spec 0430). */
export async function logBranchEntries(
  root: string,
  scenarioId: string,
  entries: Parameters<typeof branchEntriesForLive>[0],
): Promise<void> {
  const a = active
  if (!a || a.root !== root || a.session.scenarioId !== scenarioId) return
  for (const input of branchEntriesForLive(entries)) await a.log.append(input)
}

function rotationDeps(a: Active) {
  const remote = a.remote
  return {
    client: a.client,
    keys: a.keys,
    seats: a.seats,
    hub: a.hub,
    ...(remote
      ? {
          remote: {
            kick: (id: string) => remote.client.kick(remote.auth, id),
            setJoinToken: (hex: string) => remote.client.setJoinToken(remote.auth, hex),
          },
        }
      : {}),
    log: a.log,
    refOf: (id: string) => clientRef(a, id),
    persist: () => persistKeys(a),
  }
}

/** Devices seated in the running session. */
export async function liveDevices(root: string, scenarioId: string): Promise<LiveDevice[]> {
  const a = activeFor(root, scenarioId)
  const scenario = await getScenario(root, scenarioId)
  const roleName = (id: string | undefined) => scenario.roles.find((r) => r.id === id)?.name
  return listDevices(a.seats, (id) => clientRef(a, id), roleName)
}

async function seatByRef(a: Active, ref: string): Promise<Seat> {
  for (const seat of a.seats.byClient.values()) {
    if ((await clientRef(a, seat.clientId)) === ref) return seat
  }
  throw new AppError('NOT_FOUND', 'That device is no longer in the session')
}

/** Remove one device and move everyone else to a new key, so the removed one cannot rejoin. */
export async function removeDevice(root: string, scenarioId: string, ref: string): Promise<void> {
  const a = activeFor(root, scenarioId)
  await rotateKeys(rotationDeps(a), [await seatByRef(a, ref)])
  emitChanged('presence')
}

/** Replace the keys with no one removed: links shared so far stop working for new devices. */
export async function replaceKeys(root: string, scenarioId: string): Promise<number> {
  const a = activeFor(root, scenarioId)
  const epoch = await rotateKeys(rotationDeps(a))
  emitChanged('started')
  return epoch
}

export function isLiveFor(root: string, scenarioId: string): boolean {
  return active?.root === root && active.session.scenarioId === scenarioId
}

/** The running session regardless of scenario (for the handler's conflict message). */
export function activeSession(): LiveSession | undefined {
  return active?.session
}

/** The LAN listener's port while a session runs (for the firewall text). */
export function activeLanPort(): number | undefined {
  return active?.lan?.status.port
}

/** Restart the LAN listener on another address with a new certificate (spec 0407 FR-4). */
export async function switchAddress(address: string): Promise<LanServerStatus> {
  const a = active
  if (!a || !a.lan || a.session.connection.kind !== 'lan') {
    throw new AppError('NOT_FOUND', 'No live session is running')
  }
  const bound = bindAddress(address, true)
  await a.lan.stop()
  await openLan(a, bound, a.session.connection.tls, a.session.connection.port)
  a.session = {
    ...a.session,
    connection: { ...a.session.connection, address: bound },
    joinUrlPublic: a.lan!.status.url,
  }
  await writeSessionFile(a)
  emitChanged('started')
  return a.lan!.status
}

async function teardown(a: Active, reason: 'endex' | 'cancelled'): Promise<LiveSession> {
  await a.surveys.closeAll().catch((e: unknown) => console.error('[live] surveys:', e))
  for (const call of a.calls.list())
    if (call.status !== 'ended') await a.calls.end(call.callId).catch(() => undefined)
  simcellFor(a.root, a.session.scenarioId).detach()
  await a.votes.closeInterrupted().catch((e: unknown) => console.error('[live] vote:', e))
  a.votes.dispose()
  for (const off of a.unsubscribe.splice(0)) off()
  try {
    if (a.client.state !== 'closed') {
      await a.client.send('session.end', 'all', { reason, at: Date.now() })
    }
  } catch (err) {
    console.error('[live] session.end not sent:', (err as Error).message)
  }
  a.hub?.end()
  if (a.remote) await endRemoteSession(a.remote)
  a.client.close()
  await a.lan?.stop().catch((e: unknown) => console.error('[live] stop:', e))
  a.lan = undefined
  if (a.powerSave !== undefined && powerSaveBlocker.isStarted(a.powerSave)) {
    powerSaveBlocker.stop(a.powerSave)
  }
  a.session = { ...a.session, endedAt: new Date().toISOString() }
  await a.log.append({ kind: 'session.end', actor: { kind: 'controller' }, data: { reason } })
  await a.log.flush()
  a.session = { ...a.session, summary: countEntries(await readAll(a.log.path)) }
  await writeSessionFile(a)
  await deleteSessionKeys(a.session.id).catch(() => undefined)
  return a.session
}

export async function endSession(root: string, scenarioId: string): Promise<LiveSession> {
  const a = active
  if (!a || a.root !== root || a.session.scenarioId !== scenarioId) {
    throw new AppError('NOT_FOUND', 'No live session is running for this scenario')
  }
  return stopActive('endex')
}

async function stopActive(reason: 'endex' | 'cancelled'): Promise<LiveSession> {
  if (ending) return ending
  const a = active
  if (!a) throw new AppError('NOT_FOUND', 'No live session is running')
  ending = teardown(a, reason)
    .then(async (session) => {
      if (reason === 'endex') await runSessionEndHooks(a.root, session.scenarioId, session.id)
      return session
    })
    .finally(() => {
      active = undefined
      ending = undefined
      emit('live:changed', { reason: 'stopped', sessionId: a.session.id, connected: 0 })
    })
  return ending
}

/** App quit and tests: end whatever runs; no listener survives the process. */
export async function stopLiveSession(): Promise<void> {
  if (!active && !ending) return
  await stopActive('cancelled').catch((e: unknown) => console.error('[live] stop:', e))
}

export const isSessionRunning = (): boolean => active !== undefined

const closedListeners = new Set<(result: VoteResult) => void>()

/** Listen for votes closing (scenario branching reads the result here). Returns the unsubscribe. */
export function onVoteClosed(listener: (result: VoteResult) => void): () => void {
  closedListeners.add(listener)
  return () => closedListeners.delete(listener)
}

export const openVote = (root: string, scenarioId: string, def: VoteDefinition, rowId?: string) =>
  activeFor(root, scenarioId).votes.open(def, rowId ? { rowId } : {})

export const closeVote = (root: string, scenarioId: string, voteId: string) =>
  activeFor(root, scenarioId).votes.close(voteId, 'facilitator')

export const reopenVote = (root: string, scenarioId: string, voteId: string) =>
  activeFor(root, scenarioId).votes.reopen(voteId)

export const listVotes = (root: string, scenarioId: string) =>
  activeFor(root, scenarioId).votes.list()

export const getVote = (root: string, scenarioId: string, voteId: string) =>
  activeFor(root, scenarioId).votes.get(voteId)

/** Roles in scope with fewer than `k` devices, for the warning before a by-role vote. */
export function voteScope(root: string, scenarioId: string, targets: string[], k: number) {
  const a = activeFor(root, scenarioId)
  const { eligible, small } = a.votes.scope(targets, k)
  const names = new Map(a.seats.seats().map((s) => [s.id, s.name]))
  return {
    eligible,
    smallRoles: small.map((r) => ({ ...r, label: names.get(r.roleId) ?? r.roleId })),
  }
}

/** Mark a closed vote as recorded and return the decision entry for the facilitator's log. */
export async function recordVote(root: string, scenarioId: string, voteId: string) {
  const a = activeFor(root, scenarioId)
  const at = formatClock(await clockState(root, scenarioId), Date.now())
  const { text, rowId } = await a.votes.markRecorded(voteId, at)
  return {
    id: `dec-${toHex(a.crypto.random(6))}`,
    at: new Date().toISOString(),
    exerciseTime: at,
    ...(rowId ? { rowId } : {}),
    text,
  }
}

/** Send a survey to devices (spec 0422 FR-5). */
export const openSurvey = (
  root: string,
  scenarioId: string,
  surveyId: string,
  opts: { targets?: string[]; durationSec?: number } = {},
) => activeFor(root, scenarioId).surveys.open(surveyId, opts)

export const closeSurvey = (root: string, scenarioId: string, deliveryId: string) =>
  activeFor(root, scenarioId).surveys.close(deliveryId)

/** Surveys sent in the running session; empty when no session runs for this scenario. */
export function liveSurveys(root: string, scenarioId: string) {
  const a = active
  if (!a || a.root !== root || a.session.scenarioId !== scenarioId) return []
  return a.surveys.list()
}
