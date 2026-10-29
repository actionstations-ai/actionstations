/**
 * The LAN session server (spec 0407): HTTPS (per-session self-signed certificate) or HTTP on one
 * chosen address, serving the player bundle, `/v1/health`, the WebSocket and the SSE + POST
 * fallback, and sealed blobs. Everything protocol-side is the shared `SessionHub`; this file is
 * the listener, the fixed route table and the caps on connections. It exists only between
 * `startLanServer()` and `stop()`.
 */
import { createReadStream } from 'node:fs'
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import type { Duplex } from 'node:stream'
import type { WebSocketServer } from 'ws'
import { fromBase64Url } from '@shared/live/bytes'
import type { SessionHub } from '@shared/live/hub'
import { PROTOCOL_VERSION } from '@shared/live/protocol'
import { Base64Url22 } from '@shared/live/schemas/envelope'
import type { LanServerStatus, LanTls } from '@shared/schemas/live'
import { createSessionCertificate } from './cert'
import { parseConnectParams, parseJoinToken } from './connect-params'
import { HttpFallback } from './fallback'
import type { LanLog } from './log'
import { Flood, Peers } from './peers'
import {
  applyCommonHeaders,
  drained,
  htmlCsp,
  remoteOf,
  sendError,
  sendHtml,
  sendJson,
} from './respond'
import { loadPlayerBundle, PLACEHOLDER_HTML, ROOT_HTML, type PlayerBundle } from './static'
import { attachWebSocket, createWebSocketServer } from './ws'

export const DEFAULT_PORT = 8485
export const PORT_RANGE_END = 8495
const REQUEST_TIMEOUT_MS = 30_000
const HEADERS_TIMEOUT_MS = 10_000
const KEEP_ALIVE_TIMEOUT_MS = 65_000
/** Sockets the listener accepts at once; the hub's client cap is below this. */
const MAX_SOCKETS = 200
/** Blob downloads one remote address may run at once. */
const MAX_BLOB_DOWNLOADS_PER_REMOTE = 2

export interface LanServerOptions {
  /** One of `listLanAddresses()` (or a loopback address in tests); never `0.0.0.0`. */
  address: string
  /** Default 8485; busy → next free in 8485–8495 → OS-assigned. */
  port?: number
  tls: LanTls
  hub: SessionHub
  /** Folder of the player bundle; a missing folder serves the placeholder page. */
  bundleDir: string
  log: LanLog
  version: string
}

export interface LanServer {
  readonly status: LanServerStatus
  /** Devices attached over any transport (the controller is in-process and not counted). */
  readonly connected: number
  /** Whether a device has ever attached since start (the "no connections" guidance). */
  readonly everConnected: boolean
  onConnectedChange(cb: (count: number) => void): () => void
  stop(): Promise<void>
}

type Routed = { kind: 'static'; path: string } | { kind: 'v1'; route: string; sessionId: string }

const SESSION_ROUTE =
  /^\/v1\/sessions\/([A-Za-z0-9_-]{22})\/(ws|events|send|blobs\/([A-Za-z0-9_-]{22}))$/
const PLAYER_PAGE = /^\/s\/([A-Za-z0-9_-]{22})$/

/** Decide what a path is before any handler runs; anything else is a 404. */
export function routeOf(pathname: string): Routed | undefined {
  if (pathname === '/' || pathname === '/v1/health' || PLAYER_PAGE.test(pathname)) {
    return { kind: 'static', path: pathname }
  }
  if (pathname.startsWith('/assets/') && !pathname.includes('..') && !pathname.includes('//')) {
    return { kind: 'static', path: pathname }
  }
  const m = SESSION_ROUTE.exec(pathname)
  if (m) return { kind: 'v1', route: m[2]!, sessionId: m[1]! }
  return undefined
}

/** Listen on `address`: the requested port, else the next free one in the range, else any. */
async function listenWithFallback(server: Server, address: string, port: number | undefined) {
  const candidates = port !== undefined ? [port] : []
  if (port === undefined || port === DEFAULT_PORT) {
    for (let p = DEFAULT_PORT; p <= PORT_RANGE_END; p++)
      if (!candidates.includes(p)) candidates.push(p)
  }
  candidates.push(0)
  for (const candidate of candidates) {
    // Any other error (an address that vanished, EADDRNOTAVAIL) rejects: the caller reports
    // it and the session never starts; it must not reach the process as an uncaught error.
    const ok = await new Promise<boolean>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.off('listening', onListening)
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') return resolve(false)
        reject(err)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve(true)
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen({ host: address, port: candidate, exclusive: true })
    })
    if (ok) return
  }
  throw new Error(`No free port on ${address}`)
}

/** Bytes a base64url string decodes to, without decoding it. */
function decodedLength(b64url: string): number {
  return Math.floor((b64url.length * 3) / 4)
}

export async function startLanServer(opts: LanServerOptions): Promise<LanServer> {
  const { hub, log } = opts
  const bundle = await loadPlayerBundle(opts.bundleDir)
  const cert =
    opts.tls === 'self-signed'
      ? await createSessionCertificate(opts.address, hub.sessionId)
      : undefined
  const peers = new Peers()
  const flood = new Flood()
  const fallback = new HttpFallback({ hub, peers, log })
  const wss = createWebSocketServer(hub.limits.envelopeBytes)
  const router = new Router(opts, bundle, fallback, wss, peers, flood)
  const server = cert
    ? createHttpsServer({ cert: cert.cert, key: cert.key, minVersion: 'TLSv1.2' }, router.request)
    : createHttpServer(router.request)
  server.requestTimeout = REQUEST_TIMEOUT_MS
  server.headersTimeout = HEADERS_TIMEOUT_MS
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS
  server.maxConnections = MAX_SOCKETS
  server.on('upgrade', router.upgrade)
  server.on('clientError', (_err, socket) => socket.destroy())
  try {
    await listenWithFallback(server, opts.address, opts.port)
  } catch (err) {
    wss.close()
    throw err
  }
  const bound = server.address()
  const port = typeof bound === 'object' && bound ? bound.port : 0
  const scheme = cert ? 'https' : 'http'
  router.host = `${opts.address}:${port}`
  router.origin = `${scheme}://${router.host}`
  router.wsOrigin = `${cert ? 'wss' : 'ws'}://${router.host}`
  const startedAt = new Date().toISOString()
  const sweep = setInterval(() => {
    flood.sweep()
    hub.sweepBlobs()
  }, 60_000)
  void log.write({ event: 'listen', remote: `${opts.address}:${port}`, reason: scheme })

  const status = (): LanServerStatus => ({
    url: `${router.origin}/s/${hub.sessionId}`,
    address: opts.address,
    port,
    tls: opts.tls,
    ...(cert ? { fingerprintSha256: cert.fingerprintSha256 } : {}),
    connected: peers.count,
    startedAt,
  })

  let stopped = false
  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    clearInterval(sweep)
    router.closing = true
    fallback.closeAll()
    peers.terminateAll()
    for (const ws of wss.clients) ws.terminate()
    wss.close()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    void log.write({ event: 'stop', remote: `${opts.address}:${port}` })
    await log.flush()
  }

  return {
    get status() {
      return status()
    },
    get connected() {
      return peers.count
    },
    get everConnected() {
      return peers.everConnected
    },
    onConnectedChange: (cb) => peers.onChange(cb),
    stop,
  }
}

/** The route table. Request strings decide a branch; they never become a file path. */
class Router {
  /** `address:port`; every request must name it (a DNS-rebinding page cannot). */
  host = ''
  origin = ''
  wsOrigin = ''
  closing = false
  private readonly blobDownloads = new Map<string, number>()

  constructor(
    private readonly opts: LanServerOptions,
    private readonly bundle: PlayerBundle,
    private readonly fallback: HttpFallback,
    private readonly wss: WebSocketServer,
    private readonly peers: Peers,
    private readonly flood: Flood,
  ) {}

  private url(req: IncomingMessage): URL | undefined {
    try {
      return new URL(req.url ?? '/', 'http://lan')
    } catch {
      return undefined
    }
  }

  /** The Host header must be the bound `address:port` (spec 0407 Security; #457 review L1). */
  private hostOk(req: IncomingMessage): boolean {
    return req.headers.host === this.host
  }

  request = (req: IncomingMessage, res: ServerResponse): void => {
    const url = this.url(req)
    if (!url || this.closing) return sendError(res, 'NOT_FOUND', 'Not found')
    if (!this.hostOk(req)) return sendError(res, 'MISDIRECTED', 'Wrong host')
    const routed = routeOf(url.pathname)
    if (!routed) return sendError(res, 'NOT_FOUND', 'Not found')
    if (routed.kind === 'static') return this.serveStatic(req, res, routed.path)
    if (routed.sessionId !== this.opts.hub.sessionId)
      return sendError(res, 'NOT_FOUND', 'No such session')
    void this.serveSession(req, res, url, routed.route)
  }

  private serveStatic(req: IncomingMessage, res: ServerResponse, path: string): void {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendError(res, 'METHOD_NOT_ALLOWED', 'Use GET')
    }
    const csp = htmlCsp(this.wsOrigin)
    if (path === '/') return sendHtml(res, ROOT_HTML, csp)
    if (path === '/v1/health') return this.health(res)
    if (path.startsWith('/s/')) return sendHtml(res, this.bundle.indexHtml ?? PLACEHOLDER_HTML, csp)
    const file = this.bundle.files.get(path.slice(1))
    if (!file) return sendError(res, 'NOT_FOUND', 'Not found')
    applyCommonHeaders(res, 'public, max-age=31536000, immutable')
    res.writeHead(200, { 'Content-Type': file.contentType, 'Content-Length': file.size })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const stream = createReadStream(file.path)
    stream.on('error', () => res.destroy())
    stream.pipe(res)
  }

  /** No session information: kind, version, protocol and caps only. */
  private health(res: ServerResponse): void {
    sendJson(res, 200, {
      kind: 'lan',
      version: this.opts.version,
      protocol: [PROTOCOL_VERSION],
      caps: this.opts.hub.limits,
    })
  }

  private async serveSession(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    route: string,
  ): Promise<void> {
    const remote = remoteOf(req)
    if (route.startsWith('blobs/')) return this.blob(req, res, url, route.slice(6))
    if (route === 'ws') return sendError(res, 'BAD_REQUEST', 'This path is a WebSocket endpoint')
    const parsed = parseConnectParams({ search: url.searchParams, headers: req.headers })
    if (!parsed.ok) {
      return parsed.reason === 'TOKEN_IN_QUERY'
        ? sendError(
            res,
            'BAD_REQUEST',
            'Tokens go in the X-AS-Join and X-AS-Resume headers, not the URL',
          )
        : sendError(res, 'UNAUTHORIZED', 'Missing or malformed join parameters')
    }
    const { params } = parsed
    if (route === 'events') {
      if (req.method !== 'GET') return sendError(res, 'METHOD_NOT_ALLOWED', 'Use GET')
      if (this.flood.hit(remote)) return this.flooded(res, remote)
      return this.fallback.events(req, res, params, remote)
    }
    if (req.method !== 'POST') return sendError(res, 'METHOD_NOT_ALLOWED', 'Use POST')
    if (this.flood.hit(remote)) return this.flooded(res, remote)
    return this.fallback.send(req, res, params, this.opts.hub.limits.envelopeBytes)
  }

  /**
   * `GET …/blobs/:id` with `X-AS-Join`: the sealed bytes as one body (the fetch fallback's blob path),
   * streamed chunk by chunk with back-pressure; at most two downloads per address at once.
   */
  private async blob(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    blobId: string,
  ): Promise<void> {
    if (req.method !== 'GET') return sendError(res, 'METHOD_NOT_ALLOWED', 'Use GET')
    const remote = remoteOf(req)
    if (this.flood.hit(remote)) return this.flooded(res, remote)
    if (url.searchParams.has('j')) {
      return sendError(
        res,
        'BAD_REQUEST',
        'The join token goes in the X-AS-Join header, not the URL',
      )
    }
    const token = parseJoinToken(req.headers)
    if (!token || !(await this.opts.hub.checkJoinToken(token))) {
      return sendError(res, 'UNAUTHORIZED', 'Bad join token')
    }
    if (!Base64Url22.safeParse(blobId).success) return sendError(res, 'NOT_FOUND', 'No such blob')
    const chunks = this.opts.hub.blobChunks(blobId)
    if (!chunks) return sendError(res, 'NOT_FOUND', 'No such blob')
    const active = this.blobDownloads.get(remote) ?? 0
    if (active >= MAX_BLOB_DOWNLOADS_PER_REMOTE) {
      return sendError(res, 'RATE_LIMITED', 'Too many downloads at once')
    }
    this.blobDownloads.set(remote, active + 1)
    try {
      const total = chunks.reduce((n, c) => n + decodedLength(c), 0)
      applyCommonHeaders(res)
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': total })
      for (const c of chunks) {
        if (res.destroyed) return
        // A reader that disconnects mid-download never drains: the wait ends on close too, so
        // the per-address slot is released in `finally`.
        if (!res.write(Buffer.from(fromBase64Url(c)))) await drained(res)
      }
      res.end()
    } finally {
      this.blobDownloads.set(remote, (this.blobDownloads.get(remote) ?? 1) - 1)
    }
  }

  private flooded(res: ServerResponse, remote: string): void {
    void this.opts.log.write({ event: 'flood', remote })
    sendError(res, 'RATE_LIMITED', 'Too many connection attempts')
  }

  upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const remote = remoteOf(req)
    const reject = (status: number, reason: string) => {
      void this.opts.log.write({ event: 'upgrade-rejected', remote, path: req.url, status, reason })
      socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
      socket.destroy()
    }
    if (this.closing) return reject(503, 'Stopping')
    if (!this.hostOk(req)) return reject(421, 'Misdirected Request')
    // A page from another origin (a phishing site, a rebinding attack) never gets a socket.
    const origin = req.headers.origin
    if (origin !== undefined && origin !== this.origin) return reject(403, 'Forbidden')
    if (this.flood.hit(remote)) {
      void this.opts.log.write({ event: 'flood', remote })
      return reject(429, 'Too Many Requests')
    }
    const url = this.url(req)
    const routed = url && routeOf(url.pathname)
    if (!url || !routed || routed.kind !== 'v1' || routed.route !== 'ws')
      return reject(404, 'Not Found')
    if (routed.sessionId !== this.opts.hub.sessionId) return reject(404, 'Not Found')
    const parsed = parseConnectParams({
      search: url.searchParams,
      protocols: req.headers['sec-websocket-protocol'] ?? '',
    })
    if (!parsed.ok) return reject(400, 'Bad Request')
    attachWebSocket(this.wss, req, socket, head, parsed.params, remote, {
      hub: this.opts.hub,
      peers: this.peers,
      log: this.opts.log,
    })
  }
}
