/**
 * `actionstations-relay serve` without the argument parsing: opens the data directory, the
 * database, the key, the certificate and the logs, starts the listener, the admin socket and
 * the sweeper, and stops them all in order. Tests start it in-process; the CLI adds signals.
 */
import { mkdirSync } from 'node:fs'
import type { Server as NetServer } from 'node:net'
import { dirname, join } from 'node:path'
import { Peers } from '@main/live/transport/lan/peers'
import { adminSocketPath, startAdmin, type AdminStatus } from './admin'
import { describeConfig, type Config } from './config'
import { openLogs, type ServerLogs } from './logs'
import { createRelayServer, type RelayServer } from './server'
import { readServerKeyHash, rotateServerKey } from './server-key'
import { SessionRegistry } from './sessions'
import { RelayDatabase } from './sqlite-store'
import { loadAssets } from './static'
import { loadPem, selfSignedFor, type TlsMaterial } from './tls'
import { PROGRAM, VERSION } from './version'

export const SWEEP_INTERVAL_MS = 5 * 60_000

export interface ServeOptions {
  config: Config
  /** Where to print the banner and the one-time key; silent when absent. */
  print?: (line: string) => void
  now?: () => number
  admin?: boolean
  sweepIntervalMs?: number
  programDir?: string
}

export interface RunningRelay {
  config: Config
  server: RelayServer
  registry: SessionRegistry
  db: RelayDatabase
  logs: ServerLogs
  tls: TlsMaterial | undefined
  /** Set when this start generated the server key (first start): shown once. */
  newServerKey: string | undefined
  adminPath: string | undefined
  startedAt: number
  status(): AdminStatus
  stop(): Promise<void>
}

export function programDir(): string {
  const sea = process.getBuiltinModule?.('node:sea') as { isSea(): boolean } | undefined
  if (sea?.isSea()) return dirname(process.execPath)
  return process.argv[1] ? dirname(process.argv[1]) : process.cwd()
}

export async function startRelay(opts: ServeOptions): Promise<RunningRelay> {
  const { config } = opts
  const now = opts.now ?? (() => Date.now())
  const print = opts.print ?? (() => {})
  mkdirSync(config.dataDir, { recursive: true })
  const logs = openLogs(config.logDir ?? join(config.dataDir, 'logs'), config.logLevel, now, print)
  logs.info(`${PROGRAM} ${VERSION} starting`, { settings: describeConfig(config) })

  let newServerKey: string | undefined
  if (!readServerKeyHash(config.dataDir)) {
    newServerKey = await rotateServerKey(config.dataDir)
    logs.info('server key generated')
  }
  const tls =
    config.tls.mode === 'none'
      ? undefined
      : config.tls.mode === 'pem'
        ? loadPem(config.tls.cert, config.tls.key)
        : await selfSignedFor(config.dataDir, config.host, now())
  if (!tls)
    logs.warn('plain HTTP: use only behind a proxy that terminates TLS or on a trusted network')

  const db = RelayDatabase.open(config.dataDir, config.blobs)
  const peers = new Peers()
  const registry = new SessionRegistry({ db, config, peers, logs, version: VERSION, now })
  const assets = loadAssets(config.publicDir, opts.programDir ?? programDir())
  const server = createRelayServer({
    config,
    registry,
    peers,
    tls,
    assets,
    logs,
    version: VERSION,
    now,
  })
  await server.start()
  const startedAt = now()

  const status = (): AdminStatus => {
    const s = registry.status()
    const use = db.storageUse()
    return {
      version: VERSION,
      uptimeSec: Math.round((now() - startedAt) / 1000),
      urls: server.urls,
      ...(tls?.selfSigned ? { fingerprintSha256: tls.fingerprintSha256 } : {}),
      sessions: { live: s.liveSessions, ended: s.endedSessions, max: s.maxSessions },
      clients: s.connectedClients,
      storage: {
        databaseBytes: use.databaseBytes,
        envelopes: use.envelopes,
        blobBytes: use.blobBytes,
      },
      dataDir: config.dataDir,
    }
  }

  let admin: NetServer | undefined
  let adminPath: string | undefined
  if (opts.admin !== false) {
    adminPath = adminSocketPath(config.dataDir)
    try {
      admin = await startAdmin(adminPath, status)
    } catch (err) {
      logs.warn('admin socket unavailable', { error: (err as Error).message })
      adminPath = undefined
    }
  }

  const sweeper = setInterval(() => {
    const swept = registry.sweep()
    if (swept.ended.length || swept.deleted.length) {
      logs.info('sweep', {
        ended: swept.ended.length,
        deleted: swept.deleted.length,
        vacuumed: swept.vacuumed,
      })
    }
  }, opts.sweepIntervalMs ?? SWEEP_INTERVAL_MS)
  sweeper.unref()

  for (const url of server.urls) print(`Listening on ${url}`)
  if (tls?.selfSigned)
    print(`Certificate fingerprint (SHA-256), to confirm in the app: ${tls.fingerprintSha256}`)
  if (newServerKey) {
    print(`Server key (shown once; enter it in the app under "Your server"): ${newServerKey}`)
    print(`To get a new one later: ${PROGRAM} rotate-key`)
  }
  print(`Data directory: ${config.dataDir}`)
  logs.info('listening', { urls: server.urls, port: server.port })

  return {
    config,
    server,
    registry,
    db,
    logs,
    tls,
    newServerKey,
    adminPath,
    startedAt,
    status,
    async stop() {
      clearInterval(sweeper)
      await server.stop()
      registry.closeAll()
      await new Promise<void>((resolve) => (admin ? admin.close(() => resolve()) : resolve()))
      db.checkpoint()
      db.close()
      logs.info('stopped')
      logs.close()
    },
  }
}
