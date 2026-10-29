/**
 * The controller side of a live session (spec 0418, this part landed by #407): start, status
 * and end; the session keys and the controller signing key in memory; the controller's
 * `LiveClient` attached in-process to the session hub; the LAN listener; the session folder
 * `scenarios/<id>/live/<sessionId>/` with `session.json` and `log.jsonl`. One session per app
 * instance. Nothing listens before `startSession` and nothing after `endSession` or app quit.
 */
import { app, powerSaveBlocker } from 'electron'
import { join } from 'node:path'
import { toBase64Url, toHex } from '@shared/live/bytes'
import { LiveClient } from '@shared/live/client'
import type { Opened } from '@shared/live/codec'
import { SessionKeys } from '@shared/live/crypto/keys'
import type { CryptoProvider, KeyPair } from '@shared/live/crypto/provider'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { SessionHub } from '@shared/live/hub'
import { LIMITS, PROTOCOL_VERSION } from '@shared/live/protocol'
import type { BlobRef, ClientId, ClockState, Destination } from '@shared/live/schemas'
import { MemoryServer } from '@shared/live/transport-memory'
import type {
  Attribution,
  LanServerStatus,
  LiveConnection,
  LiveSession,
  LiveSessionStatus,
} from '@shared/schemas/live'
import type { Role } from '@shared/schemas/project'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import { safeJoin, writeJsonAtomic } from '../lib/fs'
import { playerBundleDir, userDataPath } from '../lib/paths'
import { readFacilitatorState } from '../facilitator/state'
import { requireProject } from '../project/guard'
import { scenarioLayout } from '../scenario/layout'
import { getScenario } from '../scenario/store'
import { inviteViews } from './invites'
import { teamSlug } from '@shared/live/targets'
import { Delivery, type DeliverySeat } from './releases'
import { emptyStage, releaseRow, stageAll, stageStatus, type StageState } from './delivery-service'
import { LogWriter } from './log'
import { deleteSessionKeys, writeSessionKeys } from './keys'
import { Seats } from './seats'
import { chooseAddress, listLanAddresses } from './transport/lan/addresses'
import { LanLog } from './transport/lan/log'
import { startLanServer, type LanServer } from './transport/lan/server'

/** Frames a participant may send per minute on the LAN (spec 0407 Security). */
const LAN_FRAMES_PER_MINUTE = 60
/** `join` frames one device may send in a session before the rest are ignored (#457 review H1). */
const MAX_JOINS_PER_CLIENT = 20

interface Active {
  session: LiveSession
  root: string
  crypto: CryptoProvider
  keys: SessionKeys
  signing: KeyPair
  hub: SessionHub
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
  stage: StageState
  mediaCache: Map<string, BlobRef>
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

function emitChanged(
  reason: 'started' | 'stopped' | 'presence' | 'error' | 'receipts' | 'staging',
  message?: string,
) {
  emit('live:changed', {
    reason,
    ...(active ? { sessionId: active.session.id } : {}),
    connected: active?.lan?.connected ?? 0,
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

async function openLan(a: Active, address: string, tls: 'self-signed' | 'none', port?: number) {
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
  if (req.connection.kind !== 'lan') {
    throw new AppError('NOT_IMPLEMENTED', 'Only "This computer" is available in this version.')
  }
  const root = await requireProject(req.projectPath)
  const scenario = await getScenario(root, req.scenarioId)
  const crypto = createWebCryptoProvider()
  const sessionId = toBase64Url(crypto.random(16))
  const keys = await SessionKeys.create(crypto, sessionId)
  const signing = await crypto.ecdsaGenerate()
  const hub = new SessionHub({
    sessionId,
    kind: 'lan',
    joinTokenHash: await keys.joinTokenHash(),
    crypto,
    version: app.getVersion(),
    framesPerMinute: LAN_FRAMES_PER_MINUTE,
  })
  const controllerId = toBase64Url(crypto.random(16))
  const transport = await new MemoryServer({ hub }).connect({
    clientId: controllerId,
    controller: true,
  })
  const client = new LiveClient({
    transport,
    keys,
    clientId: controllerId,
    role: 'controller',
    crypto,
    controllerPub: signing.publicKey,
    signer: signing.privateKey,
    limits: LIMITS.lan,
  })
  const address = bindAddress(req.connection.address, req.allowPublicAddress)
  const dir = sessionDir(root, req.scenarioId, sessionId)
  const log = await LogWriter.open(join(dir, 'log.jsonl'), req.attribution)
  const salt = crypto.random(16)
  const a: Active = {
    session: {
      id: sessionId,
      scenarioId: req.scenarioId,
      name: req.name?.trim() || scenario.title,
      startedAt: new Date().toISOString(),
      connection: { ...req.connection, address },
      joinUrlPublic: '',
      attribution: req.attribution,
      protocolVersion: PROTOCOL_VERSION,
      lastIndex: 0,
    },
    root,
    crypto,
    keys,
    signing,
    hub,
    client,
    lanLog: new LanLog(userDataPath('live', 'lan.log')),
    log,
    seats: new Seats({
      keys,
      roles: scenario.roles,
      attribution: req.attribution,
      sessionName: req.name?.trim() || scenario.title,
      scenarioTitle: scenario.title,
      clock: () => cachedClock,
      pseudonym: (id) => pseudonym({ crypto, salt }, id),
    }),
    joins: new Map(),
    salt,
    delivery: makeDelivery(() => a, scenario.roles),
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
    await openLan(a, address, req.connection.tls, req.connection.port)
  } catch (err) {
    client.close()
    hub.end()
    await log.flush()
    throw err
  }
  a.session.joinUrlPublic = a.lan!.status.url
  active = a
  wireClient(a)
  await writeSessionFile(a)
  await log.append({
    kind: 'session.start',
    actor: { kind: 'controller' },
    data: {
      connection: 'lan',
      tls: req.connection.tls,
      attribution: req.attribution,
      protocol: PROTOCOL_VERSION,
    },
  })
  await persistKeys(a)
  a.powerSave = powerSaveBlocker.start('prevent-app-suspension')
  emitChanged('started')
  void stageAll(hostOf(a)).catch((e) => console.error('[live] staging:', (e as Error).message))
  return status(root, req.scenarioId)
}

/** Best effort: without OS encryption the session still runs, it just cannot be resumed. */
async function persistKeys(a: Active): Promise<void> {
  try {
    const staffRoot = a.keys.root('staff')
    await writeSessionKeys({
      sessionId: a.session.id,
      staffRoots: staffRoot ? { [String(a.keys.currentEpoch)]: toBase64Url(staffRoot) } : {},
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
  const invites = lan
    ? inviteViews({
        origin: lan.url.slice(0, lan.url.indexOf('/s/')),
        sessionId: a.session.id,
        keys: a.keys,
        controllerPub: a.signing.publicKey,
      })
    : undefined
  const since = Date.now() - Date.parse(a.session.startedAt)
  return {
    session: a.session,
    ...(lan ? { lan } : {}),
    ...(invites ? { invites } : {}),
    connected: a.lan?.connected ?? 0,
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

export function releaseInject(
  root: string,
  scenarioId: string,
  req: { rowId: string; targets?: Destination[]; showExpected?: boolean },
) {
  return releaseRow(hostOf(activeFor(root, scenarioId)), req)
}

export const resendInject = (
  root: string,
  scenarioId: string,
  releaseId: string,
  t: Destination[],
) => activeFor(root, scenarioId).delivery.resend(releaseId, t)

export const retractInject = (root: string, scenarioId: string, releaseId: string) =>
  activeFor(root, scenarioId).delivery.retract(releaseId)

export const releaseSummaries = (root: string, scenarioId: string) =>
  activeFor(root, scenarioId).delivery.summaries()

export const stageProgress = (root: string, scenarioId: string) =>
  stageStatus(activeFor(root, scenarioId))

/** True while a session for this scenario runs (Deliver also goes to devices then). */
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
  for (const off of a.unsubscribe.splice(0)) off()
  try {
    if (a.client.state !== 'closed') {
      await a.client.send('session.end', 'all', { reason, at: Date.now() })
    }
  } catch (err) {
    console.error('[live] session.end not sent:', (err as Error).message)
  }
  a.hub.end()
  a.client.close()
  await a.lan?.stop().catch((e: unknown) => console.error('[live] stop:', e))
  a.lan = undefined
  if (a.powerSave !== undefined && powerSaveBlocker.isStarted(a.powerSave)) {
    powerSaveBlocker.stop(a.powerSave)
  }
  a.session = { ...a.session, endedAt: new Date().toISOString() }
  await a.log.append({ kind: 'session.end', actor: { kind: 'controller' }, data: { reason } })
  await a.log.flush()
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
  ending = teardown(a, reason).finally(() => {
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
