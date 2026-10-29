/**
 * A real server on 127.0.0.1 for the tests: components wired as `serve.ts` wires them, with
 * injectable caps, plus small HTTP and WebSocket clients (the tests are allowed to connect out;
 * the server is not).
 */
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionHubOptions } from '@shared/live/hub'
import type { Limits } from '@shared/live/protocol'
import { Peers } from '@main/live/transport/lan/peers'
import { resolveConfig, type Config } from '../src/config'
import { openLogs } from '../src/logs'
import { createRelayServer, type RelayServer } from '../src/server'
import { readServerKeyHash, rotateServerKey } from '../src/server-key'
import { SessionRegistry } from '../src/sessions'
import { RelayDatabase } from '../src/sqlite-store'
import { placeholderAssets } from '../src/static'
import { loadPem, selfSignedFor, type TlsMaterial } from '../src/tls'

export interface TestServerOptions {
  dataDir?: string
  tls?: 'self-signed' | 'none' | { cert: string; key: string }
  allow?: string[]
  maxSessions?: number
  maxClients?: number
  limits?: Partial<Limits>
  hubOverrides?: Partial<SessionHubOptions>
  serverKey?: string
  retentionHours?: number
  now?: () => number
}

export interface TestServer {
  url: string
  wsUrl: string
  port: number
  dataDir: string
  serverKey: string
  config: Config
  server: RelayServer
  registry: SessionRegistry
  db: RelayDatabase
  tls: TlsMaterial | undefined
  stop(): Promise<void>
  /** Stop and remove the data directory. */
  destroy(): Promise<void>
}

export function tmpDir(prefix = 'relay-node-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export async function startTestServer(opts: TestServerOptions = {}): Promise<TestServer> {
  const dataDir = opts.dataDir ?? tmpDir()
  let serverKey = opts.serverKey ?? ''
  if (!readServerKeyHash(dataDir)) serverKey = await rotateServerKey(dataDir)
  const tlsMode = opts.tls ?? 'none'
  const config = resolveConfig(
    {
      dataDir,
      port: 0,
      bind: '127.0.0.1',
      host: ['127.0.0.1'],
      tls:
        tlsMode === 'none'
          ? undefined
          : tlsMode === 'self-signed'
            ? 'self-signed'
            : `${tlsMode.cert},${tlsMode.key}`,
      insecureHttp: tlsMode === 'none',
      allow: opts.allow ?? [],
      maxSessions: opts.maxSessions ?? 20,
      maxClients: opts.maxClients ?? 60,
      logLevel: 'warn',
      ...(opts.retentionHours ? { retentionHours: opts.retentionHours } : {}),
    },
    {},
  )
  const tls =
    config.tls.mode === 'none'
      ? undefined
      : config.tls.mode === 'pem'
        ? loadPem(config.tls.cert, config.tls.key)
        : await selfSignedFor(dataDir, config.host)
  const logs = openLogs(join(dataDir, 'logs'), 'warn')
  const db = RelayDatabase.open(dataDir, 'db')
  const peers = new Peers()
  const registry = new SessionRegistry({
    db,
    config,
    peers,
    logs,
    version: 'test',
    now: opts.now,
    limitsOverride: opts.limits,
    hubOverrides: opts.hubOverrides,
  })
  const server = createRelayServer({
    config,
    registry,
    peers,
    tls,
    assets: placeholderAssets(),
    logs,
    version: 'test',
  })
  const { port } = await server.start()
  const scheme = tls ? 'https' : 'http'
  let stopped = false
  const stop = async () => {
    if (stopped) return
    stopped = true
    await server.stop()
    db.close()
    logs.close()
  }
  return {
    url: `${scheme}://127.0.0.1:${port}`,
    wsUrl: `${tls ? 'wss' : 'ws'}://127.0.0.1:${port}`,
    port,
    dataDir,
    serverKey,
    config,
    server,
    registry,
    db,
    tls,
    stop,
    destroy: async () => {
      await stop()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

export interface HttpResult {
  status: number
  headers: Record<string, string | string[] | undefined>
  text: string
  json<T = unknown>(): T
  /** The server certificate's SHA-256 fingerprint, for TLS connections. */
  peerFingerprint?: string
}

export function http(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const fn = u.protocol === 'https:' ? httpsRequest : httpRequest
    const req = fn(
      u,
      {
        method: init.method ?? 'GET',
        headers: {
          ...(init.body !== undefined
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(init.body) }
            : {}),
          ...init.headers,
        },
        rejectUnauthorized: false,
      },
      (res) => {
        const socket = res.socket as unknown as {
          getPeerCertificate?: () => { fingerprint256?: string }
        }
        const peerFingerprint = socket.getPeerCertificate?.()?.fingerprint256
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text,
            json: <T>() => JSON.parse(text) as T,
            peerFingerprint,
          })
        })
      },
    )
    req.on('error', reject)
    if (init.body !== undefined) req.write(init.body)
    req.end()
  })
}

export interface Created {
  sessionId: string
  controllerToken: string
  caps: Record<string, number>
  expiresAt: number
}

export async function createSession(s: TestServer, joinTokenHash?: string): Promise<Created> {
  const res = await http(`${s.url}/v1/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.serverKey}` },
    body: JSON.stringify({ v: 1, ...(joinTokenHash ? { joinTokenHash } : {}) }),
  })
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${res.text}`)
  return res.json<Created>()
}

export function action(
  s: TestServer,
  sessionId: string,
  name: string,
  token: string,
  body?: unknown,
): Promise<HttpResult> {
  return http(`${s.url}/v1/sessions/${sessionId}/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: body === undefined ? '' : JSON.stringify(body),
  })
}
