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
import type { ClientId, ClockState } from '@shared/live/schemas'
import { MemoryServer } from '@shared/live/transport-memory'
import type {
  Attribution,
  LanServerStatus,
  LiveConnection,
  LiveSession,
  LiveSessionStatus,
} from '@shared/schemas/live'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import { safeJoin, writeJsonAtomic } from '../lib/fs'
import { playerBundleDir, userDataPath } from '../lib/paths'
import { readFacilitatorState } from '../facilitator/state'
import { requireProject } from '../project/guard'
import { scenarioLayout } from '../scenario/layout'
import { getScenario } from '../scenario/store'
import { inviteViews } from './invites'
import { LogWriter } from './log'
import { deleteSessionKeys, writeSessionKeys } from './keys'
import { Seats } from './seats'
import { chooseAddress, listLanAddresses } from './transport/lan/addresses'
import { LanLog } from './transport/lan/log'
import { startLanServer, type LanServer } from './transport/lan/server'

/** Frames a participant may send per minute on the LAN (spec 0407 Security). */
const LAN_FRAMES_PER_MINUTE = 60

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
  /** Per-session salt for `clientRef`; memory only, so refs are unlinkable after the session. */
  salt: Uint8Array
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
}

const sessionDir = (root: string, scenarioId: string, sessionId: string): string =>
  safeJoin(scenarioLayout(root, scenarioId).dir, 'live', sessionId)

/** The bind address: `TTX_LIVE_BIND` (tests), else the chosen or recommended LAN address. */
function bindAddress(requested: string | undefined): string {
  const override = process.env.TTX_LIVE_BIND
  if (override) return override
  const chosen = chooseAddress(listLanAddresses(), requested)
  if (!chosen) {
    throw new AppError(
      'VALIDATION',
      requested
        ? `${requested} is not one of this computer's addresses`
        : 'This computer is not on a network',
    )
  }
  return chosen.address
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

function emitChanged(reason: 'started' | 'stopped' | 'presence' | 'error', message?: string) {
  emit('live:changed', {
    reason,
    ...(active ? { sessionId: active.session.id } : {}),
    connected: active?.lan?.connected ?? 0,
    ...(message ? { message } : {}),
  })
}

/** Log first, then answer (spec 0418: the log is the source of truth, state follows it). */
async function onJoin(a: Active, msg: Opened<'join'>): Promise<void> {
  const seating = await a.seats.seat(msg)
  const ref = await clientRef(a, msg.from)
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
  const address = bindAddress(req.connection.address)
  const dir = sessionDir(root, req.scenarioId, sessionId)
  const log = await LogWriter.open(join(dir, 'log.jsonl'), req.attribution)
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
    }),
    salt: crypto.random(16),
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
  const bound = bindAddress(address)
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
