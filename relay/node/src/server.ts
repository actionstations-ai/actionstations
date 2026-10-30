/**
 * The listening server (spec 0409 "Server"): HTTPS (or HTTP behind a proxy), the WebSocket
 * upgrade on `/v1/sessions/:id/ws`, the allow-list and per-address connection rate on the TCP
 * connection before TLS, request limits, and a graceful stop that closes sockets with 1001
 * within 10 s. WebSocket and SSE connections are the LAN server's (`ws.ts`, `fallback.ts`):
 * one implementation of the transport for every server.
 */
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import type { Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { SlidingWindow, bearerToken, sessionRoute } from '@actionstations/relay-core'
import { Base64Url22 } from '@shared/live/schemas/envelope'
import { parseConnectParams } from '@main/live/transport/lan/connect-params'
import type { Peers } from '@main/live/transport/lan/peers'
import { remoteOf, sendError } from '@main/live/transport/lan/respond'
import { attachWebSocket, createWebSocketServer, type WsParams } from '@main/live/transport/lan/ws'
import { AllowList } from './allowlist'
import type { Config } from './config'
import type { ServerLogs } from './logs'
import { handleRequest, type RouteContext } from './routes'
import type { LiveSession, SessionRegistry } from './sessions'
import type { AssetMap } from './static'
import type { TlsMaterial } from './tls'

export interface RelayServerOptions {
  config: Config
  registry: SessionRegistry
  peers: Peers
  tls: TlsMaterial | undefined
  assets: AssetMap
  logs: ServerLogs
  version: string
  now?: () => number
}

export interface RelayServer {
  start(): Promise<{ port: number; address: string }>
  stop(timeoutMs?: number): Promise<void>
  readonly urls: string[]
  readonly connections: number
  readonly port: number | undefined
}

/** Connections per address per second at the TCP layer (spec 0409 "Request limits"). */
export const CONNECTIONS_PER_ADDRESS_PER_SECOND = 20
export const MAX_CONNECTIONS = 1000

export function createRelayServer(opts: RelayServerOptions): RelayServer {
  const { config, registry, logs, peers } = opts
  const now = opts.now ?? (() => Date.now())
  const allow = new AllowList(config.allow)
  const connectRate = new SlidingWindow<string>(CONNECTIONS_PER_ADDRESS_PER_SECOND, 1000)
  const refusalLogged = new Map<string, number>()
  const ctx: RouteContext = {
    registry,
    assets: opts.assets,
    dataDir: config.dataDir,
    version: opts.version,
    tls: opts.tls !== undefined,
    ...(opts.tls?.selfSigned ? { fingerprintSha256: opts.tls.fingerprintSha256 } : {}),
    now,
  }
  let port: number | undefined

  const onRequest = (req: IncomingMessage, res: ServerResponse) => {
    handleRequest(ctx, req, res).catch((err: unknown) => {
      logs.warn('request failed', { path: req.url?.split('?')[0], error: (err as Error).message })
      if (!res.headersSent) sendError(res, 'BAD_REQUEST', 'Something went wrong on the server.')
      else res.end()
    })
  }

  const server: Server = opts.tls
    ? createHttpsServer(
        { cert: opts.tls.cert, key: opts.tls.key, minVersion: 'TLSv1.2', honorCipherOrder: true },
        onRequest,
      )
    : createHttpServer(onRequest)
  server.maxConnections = MAX_CONNECTIONS
  server.requestTimeout = 30_000
  server.headersTimeout = 10_000
  server.keepAliveTimeout = 65_000
  server.on('clientError', (_err, socket) => socket.destroy())

  /** Before TLS: the allow-list and the per-address rate. Refused sockets are destroyed. */
  const onConnection = (socket: Socket) => {
    const address = socket.remoteAddress ?? ''
    if (!allow.allows(address)) return refuse(socket, address, 'not on the allow-list')
    if (!connectRate.hit(address, now()).ok) return refuse(socket, address, 'too many connections')
  }
  server.on('connection', onConnection)

  function refuse(socket: Socket, address: string, why: string): void {
    socket.destroy()
    const last = refusalLogged.get(address) ?? 0
    if (now() - last >= 60_000) {
      refusalLogged.set(address, now())
      logs.warn(`connection refused: ${why}`, { remote: address })
      logs.connection({ event: 'refused', remote: address, reason: why })
    }
  }

  const wss = createWebSocketServer(registry.limits.envelopeBytes)

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    void upgrade(req, socket, head).catch(() => socket.destroy())
  })

  async function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const remote = remoteOf(req)
    const reject = (status: number, reason: string) => {
      logs.connection({ event: 'upgrade-rejected', remote, status, reason })
      socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
      socket.destroy()
    }
    // A page from another origin (a phishing site) never gets a socket.
    const origin = req.headers.origin
    if (origin !== undefined && !sameHost(origin, req.headers.host)) return reject(403, 'Forbidden')
    const url = new URL(req.url ?? '/', 'http://relay')
    const route = sessionRoute(url.pathname)
    const session = route?.action === 'ws' ? registry.get(route.sessionId) : undefined
    if (!session) return reject(404, 'Not Found')
    const params = await connectParams(req, url, session)
    if (params === 'unauthorized') return reject(401, 'Unauthorized')
    if (!params) return reject(400, 'Bad Request')
    attachWebSocket(wss, req, socket, head, params, remote, {
      hub: session.hub,
      peers,
      log: session.log,
    })
  }

  /** A controller presents its token in `Authorization`; a device its tokens in the subprotocols. */
  async function connectParams(
    req: IncomingMessage,
    url: URL,
    session: LiveSession,
  ): Promise<WsParams | 'unauthorized' | undefined> {
    const bearer = bearerToken(req.headers.authorization)
    if (bearer === undefined) {
      const parsed = parseConnectParams({
        search: url.searchParams,
        protocols: req.headers['sec-websocket-protocol'] ?? '',
      })
      return parsed.ok ? parsed.params : undefined
    }
    const clientId = url.searchParams.get('client')
    if (!clientId || !Base64Url22.safeParse(clientId).success) return undefined
    const role = await registry.controllerRole(session, bearer)
    if (!role) return 'unauthorized'
    return { clientId, controller: true, host: role === 'host' }
  }

  const scheme = opts.tls ? 'https' : 'http'

  return {
    get urls() {
      return config.host.map(
        (h) =>
          `${scheme}://${h.includes(':') && !h.startsWith('[') ? `[${h}]` : h}:${port ?? config.port}`,
      )
    },
    get connections() {
      return peers.count
    },
    get port() {
      return port
    },
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(config.port, config.bind, () => {
          const address = server.address()
          port = typeof address === 'object' && address ? address.port : config.port
          resolve({ port, address: config.bind })
        })
      })
    },
    async stop(timeoutMs = 10_000) {
      const deadline = new Promise<void>((r) => setTimeout(r, timeoutMs).unref())
      const closed = new Promise<void>((resolve) => {
        server.close(() => resolve())
        registry.closeAll()
        for (const ws of wss.clients) ws.close(1001, 'Server stopping')
        server.closeIdleConnections()
        setTimeout(() => server.closeAllConnections(), Math.min(1000, timeoutMs)).unref()
      })
      await Promise.race([closed, deadline])
      peers.terminateAll()
      wss.close()
    },
  }
}

/** Whether an `Origin` header names the host the request was sent to. */
function sameHost(origin: string, host: string | undefined): boolean {
  try {
    return host !== undefined && new URL(origin).host === host
  } catch {
    return false
  }
}
