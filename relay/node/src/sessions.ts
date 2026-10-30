/**
 * Several sessions in one process (spec 0409 FR-2, FR-6): a `SessionHub` per live session over
 * its rows in the shared database, lazily rehydrated after a restart (sockets are gone, stored
 * frames remain), a cap on live sessions, and the sweeper that deletes sessions past their
 * retention or an hour past their end. The hub is the shared one (`src/shared/live/hub.ts`);
 * this file adds what a server owns: controller tokens, retention, the registry.
 */
import {
  controllerRoleOf,
  hashBearerToken,
  matchesAny,
  randomId,
  randomToken,
} from '@actionstations/relay-core'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { SessionHub, STORE_DEFAULTS, type HubEvent, type SessionHubOptions } from '@shared/live/hub'
import { LIMITS, type Limits } from '@shared/live/protocol'
import type { ConnectionLog, LanLogRecord } from '@main/live/transport/lan/log'
import { HttpFallback } from '@main/live/transport/lan/fallback'
import type { Peers } from '@main/live/transport/lan/peers'
import type { Config } from './config'
import type { ServerLogs } from './logs'
import type { RelayDatabase, SessionRecord, SqliteHubStore } from './sqlite-store'

/** A session is deleted this long after it is created, and an hour after it ends. */
export const RETENTION_MS = 72 * 3600_000
export const TOMBSTONE_MS = 3600_000

/** Controller tokens a session may hold (the host plus co-controllers). */
export const MAX_CONTROLLER_TOKENS = 8

export interface RegistryOptions {
  db: RelayDatabase
  config: Pick<Config, 'maxSessions' | 'maxClients' | 'retentionHours' | 'limits'>
  peers: Peers
  logs: ServerLogs
  version: string
  now?: () => number
  /** Tests: caps below what the settings allow. */
  limitsOverride?: Partial<Limits>
  /** Tests: any other hub option (kind, frame budgets, catch-up page size). */
  hubOverrides?: Partial<SessionHubOptions>
}

export interface RegistryStatus {
  liveSessions: number
  endedSessions: number
  connectedClients: number
  maxSessions: number
}

export type CreateResult =
  | { ok: true; sessionId: string; controllerToken: string; expiresAt: number }
  | { ok: false; reason: 'FULL' }

/** What the transports need for one session. */
export interface LiveSession {
  hub: SessionHub
  fallback: HttpFallback
  log: ConnectionLog
  store: SqliteHubStore
}

/** The effective caps: the self-hosted defaults, the operator's overrides, the client cap. */
export function limitsFor(config: RegistryOptions['config']): Limits {
  const base = LIMITS['self-hosted']
  const { storedEnvelopes: _stored, ...overrides } = config.limits
  const limits: Limits = { ...base, clients: config.maxClients, ...overrides }
  // One size rule for every frame: a chunk frame must fit under the envelope cap.
  limits.chunkBytes = Math.min(base.chunkBytes, Math.floor((limits.envelopeBytes - 4096) * 0.75))
  return limits
}

export class SessionRegistry {
  readonly limits: Limits
  private readonly live = new Map<string, LiveSession>()
  private readonly now: () => number
  private readonly retentionMs: number

  constructor(private readonly opts: RegistryOptions) {
    this.limits = { ...limitsFor(opts.config), ...opts.limitsOverride }
    this.now = opts.now ?? (() => Date.now())
    this.retentionMs = Math.min(RETENTION_MS, opts.config.retentionHours * 3600_000)
  }

  /** The session's hub and fallback, rehydrated from the database; `undefined` when unknown. */
  get(sessionId: string): LiveSession | undefined {
    const known = this.live.get(sessionId)
    if (known) return known
    const store = this.opts.db.storeFor(sessionId)
    const record = store.record()
    if (!record) return undefined
    const session = this.build(sessionId, store)
    this.live.set(sessionId, session)
    return session
  }

  private build(sessionId: string, store: SqliteHubStore, joinHash = ''): LiveSession {
    const log = this.logFor(sessionId)
    const hub = new SessionHub({
      sessionId,
      kind: 'self-hosted',
      joinTokenHash: joinHash,
      crypto: createWebCryptoProvider(),
      store,
      limits: this.limits,
      version: this.opts.version,
      now: this.now,
      storedEnvelopes: this.opts.config.limits.storedEnvelopes ?? STORE_DEFAULTS.envelopes,
      // Devices behind a gateway or proxy share an address; the client cap is the bound here.
      maxIdentitiesPerRemote: this.limits.clients,
      onEvent: (event) => this.onHubEvent(sessionId, event),
      ...this.opts.hubOverrides,
    })
    return { hub, fallback: new HttpFallback({ hub, peers: this.opts.peers, log }), log, store }
  }

  /** The hub's own events that no transport sees: refusals and a full store. Never a payload. */
  private onHubEvent(sessionId: string, event: HubEvent): void {
    if (event.type === 'refused' || event.type === 'store_full' || event.type === 'send_failed') {
      this.opts.logs.connection({
        event: event.type,
        session: sessionId,
        clientId: event.clientId,
        ...('code' in event ? { code: event.code } : {}),
        ...('reason' in event ? { reason: safeReason(event.reason) } : {}),
      })
    }
  }

  /** A connection log that stamps every record with the session id. */
  private logFor(sessionId: string): ConnectionLog {
    return {
      write: (r: LanLogRecord) => {
        this.opts.logs.connection({
          event: r.event,
          session: sessionId,
          ...(r.remote ? { remote: r.remote } : {}),
          ...(r.clientId ? { clientId: r.clientId } : {}),
          ...(r.code !== undefined ? { code: r.code } : {}),
          ...(r.reason ? { reason: safeReason(r.reason) } : {}),
          ...(r.transport ? { transport: r.transport } : {}),
        })
      },
    }
  }

  async create(joinTokenHash?: string, sessionId = randomId()): Promise<CreateResult> {
    if (this.liveCount() >= this.opts.config.maxSessions) return { ok: false, reason: 'FULL' }
    const controllerToken = randomToken()
    const createdAt = this.now()
    const store = this.opts.db.storeFor(sessionId)
    const record: SessionRecord = {
      sessionId,
      createdAt,
      expiresAt: createdAt + this.retentionMs,
      controllerTokenHashes: [await hashBearerToken(controllerToken)],
    }
    store.setRecord(record)
    this.live.set(sessionId, this.build(sessionId, store, joinTokenHash ?? ''))
    return { ok: true, sessionId, controllerToken, expiresAt: record.expiresAt }
  }

  private liveCount(): number {
    return this.opts.db.records().filter((r) => r.endedAt === undefined).length
  }

  async isController(session: LiveSession, token: string | undefined): Promise<boolean> {
    const record = session.store.record()
    if (!record || !token) return false
    return matchesAny(await hashBearerToken(token), record.controllerTokenHashes)
  }

  /** `host` for the token the session was created with, `co` for a co-controller's (#517). */
  async controllerRole(
    session: LiveSession,
    token: string | undefined,
  ): Promise<'host' | 'co' | undefined> {
    const record = session.store.record()
    if (!record || !token) return undefined
    return controllerRoleOf(await hashBearerToken(token), record.controllerTokenHashes)
  }

  /** A further controller token (co-controller); `undefined` at the cap. */
  async addController(session: LiveSession): Promise<string | undefined> {
    const record = session.store.record()
    if (!record || record.controllerTokenHashes.length >= MAX_CONTROLLER_TOKENS) return undefined
    const token = randomToken()
    record.controllerTokenHashes.push(await hashBearerToken(token))
    session.store.setRecord(record)
    return token
  }

  /** Ends the session now: sockets closed, rows cleared, tombstone for an hour. */
  end(sessionId: string): void {
    const session = this.get(sessionId)
    const record = session?.store.record()
    if (!session || !record || record.endedAt !== undefined) return
    session.hub.end()
    record.endedAt = this.now()
    session.store.setRecord(record)
  }

  /** Ends sessions past their retention and forgets ended ones an hour after their end. */
  sweep(): { ended: string[]; deleted: string[]; vacuumed: boolean } {
    const now = this.now()
    const ended: string[] = []
    const deleted: string[] = []
    for (const record of this.opts.db.records()) {
      if (record.endedAt !== undefined) {
        if (now >= record.endedAt + TOMBSTONE_MS) {
          this.live.delete(record.sessionId)
          this.opts.db.deleteSession(record.sessionId)
          deleted.push(record.sessionId)
        }
      } else if (now >= Math.min(record.expiresAt, record.createdAt + this.retentionMs)) {
        this.end(record.sessionId)
        ended.push(record.sessionId)
      }
    }
    return { ended, deleted, vacuumed: this.opts.db.vacuumIfNeeded() }
  }

  /** Closes every socket with `1001` (going away) without ending the sessions: a restart. */
  closeAll(): void {
    for (const { hub, fallback } of this.live.values()) {
      for (const clientId of hub.connected) hub.disconnect(clientId, 1001, 'Server stopping')
      fallback.closeAll()
    }
  }

  status(): RegistryStatus {
    const records = this.opts.db.records()
    return {
      liveSessions: records.filter((r) => r.endedAt === undefined).length,
      endedSessions: records.filter((r) => r.endedAt !== undefined).length,
      connectedClients: this.opts.peers.count,
      maxSessions: this.opts.config.maxSessions,
    }
  }
}

/** Printable ASCII, 120 characters: a close reason can come from the network. */
export function safeReason(reason: string): string {
  return reason.replace(/[^\x20-\x7e]/g, '?').slice(0, 120)
}
