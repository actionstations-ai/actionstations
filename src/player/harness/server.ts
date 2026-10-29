/**
 * A development and test server for the player page: serves the built bundle from `out/player`
 * the way spec 0407's LAN server will (fixed route map from `manifest.json`, CSP header,
 * `/s/<id>` is the same `index.html` for every session), bridges WebSocket connections and the
 * SSE + POST fallback into the in-memory `MemoryServer`, and exposes the scripted controller's
 * actions under `/__harness/` so Playwright can drive a session. Loopback only, never shipped.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { AddressInfo } from 'node:net'
import { WebSocketServer, type WebSocket } from 'ws'
import { fromBase64Url } from '../../shared/live/bytes'
import { LIMITS, PROTOCOL_VERSION } from '../../shared/live/protocol'
import type { ClockState, Destination } from '../../shared/live/schemas'
import type { Transport } from '../../shared/live/transport'
import {
  parseConnectRequest,
  WS_SUBPROTOCOL,
  type ConnectParseResult,
  type ConnectRequest,
} from '../../shared/live/connect-url'
import type { HarnessController } from './controller'

export interface HarnessServerOptions {
  controller: HarnessController
  /** Where the built bundle is (`pnpm build:player`). */
  dist?: string
  host?: string
  port?: number
  /** False: refuse WebSocket upgrades (404) so the page falls back to the fetch transport. */
  websocket?: boolean
  /** Extra delay before frames reach a connection, to make races visible. */
  log?: (line: string) => void
}

export interface Harness {
  url: string
  port: number
  controller: HarnessController
  /** Players link (or staff link) with an optional role hint. */
  invite(kind?: 'players' | 'staff', roleHint?: string): string
  /** Sever one device's connection (code 1001), as a phone going to sleep does. */
  disconnect(clientId: string): boolean
  close(): Promise<void>
}

interface ManifestEntry {
  file: string
  type: string
  bytes: number
}

interface SseConn {
  transport: Transport
  res: ServerResponse
  keepalive: NodeJS.Timeout
}

const CSP = (origin: string) =>
  [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    `connect-src 'self' ${origin.replace(/^http/, 'ws')}`,
    "font-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(text)
}

function error(res: ServerResponse, status: number, code: string, message: string): void {
  json(res, status, { error: { code, message } })
}

function readBody(req: IncomingMessage, max: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > max) {
        resolve(undefined)
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(undefined))
  })
}

export async function startHarness(opts: HarnessServerOptions): Promise<Harness> {
  const { controller } = opts
  const host = opts.host ?? '127.0.0.1'
  const dist = resolve(opts.dist ?? 'out/player')
  const log = opts.log ?? (() => {})
  const manifestPath = join(dist, 'manifest.json')
  if (!existsSync(manifestPath))
    throw new Error(`${manifestPath} is missing: run pnpm build:player`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    files: Record<string, ManifestEntry>
  }
  // Fixed route map: served path → bytes. Request strings never reach the filesystem.
  const files = new Map<string, { type: string; body: Buffer }>()
  for (const [served, entry] of Object.entries(manifest.files)) {
    files.set(served, { type: entry.type, body: readFileSync(join(dist, entry.file)) })
  }
  const index = files.get('/index.html')!
  const sse = new Map<string, SseConn>()
  let origin = `http://${host}`

  const headers = (type: string, cache = 'no-store') => ({
    'content-type': type,
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'cross-origin-opener-policy': 'same-origin',
  })

  const servePage = (res: ServerResponse) => {
    res.writeHead(200, { ...headers(index.type), 'content-security-policy': CSP(origin) })
    res.end(index.body)
  }

  const sessionPath = (pathname: string) => {
    const m = /^\/v1\/sessions\/([A-Za-z0-9_-]{22})\/(ws|events|send)$/.exec(pathname)
    return m ? { id: m[1]!, kind: m[2] as 'ws' | 'events' | 'send' } : undefined
  }

  /** A connection for a parsed request; the memory server checks the tokens. */
  const connectFor = async (q: ConnectRequest) => {
    try {
      const transport = await controller.server.connect({
        clientId: q.clientId,
        joinToken: fromBase64Url(q.joinToken),
        ...(q.resumeToken ? { resumeToken: fromBase64Url(q.resumeToken) } : {}),
      })
      return { transport, clientId: q.clientId }
    } catch {
      return undefined
    }
  }

  /** The HTTP answer for a request that did not parse: a token in the query is refused outright. */
  const refuse = (res: ServerResponse, parsed: Exclude<ConnectParseResult, { ok: true }>) =>
    parsed.reason === 'TOKEN_IN_QUERY'
      ? error(res, 400, 'INVALID', 'Tokens go in headers or the subprotocol list, never in the URL')
      : error(res, 401, 'BAD_JOIN_TOKEN', `Missing connection parameters (${parsed.reason})`)

  const handleHarness = async (req: IncomingMessage, res: ServerResponse, action: string) => {
    if (req.method === 'GET' && action === 'state') return json(res, 200, controller.state())
    if (req.method !== 'POST') return error(res, 405, 'METHOD', 'POST only')
    const raw = await readBody(req, 64 * 1024)
    if (raw === undefined) return error(res, 413, 'TOO_LARGE', 'Body over 64 KiB')
    let body: Record<string, unknown>
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    } catch {
      return error(res, 400, 'INVALID', 'Bad JSON')
    }
    try {
      const result = await runAction(controller, action, body)
      return json(res, 200, { ok: true, result: result ?? null })
    } catch (err) {
      return error(res, 400, 'ACTION', (err as Error).message)
    }
  }

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', origin)
      const path = url.pathname
      log(`${req.method} ${path}`)
      if (path.startsWith('/__harness/'))
        return handleHarness(req, res, path.slice('/__harness/'.length))
      if (req.method !== 'GET' && req.method !== 'POST')
        return error(res, 405, 'METHOD', 'Not allowed')
      if (path === '/') {
        res.writeHead(200, {
          ...headers('text/html; charset=utf-8'),
          'content-security-policy': CSP(origin),
        })
        return res.end(
          '<!doctype html><meta charset="utf-8"><title>Action Stations</title><p>Scan the QR code the facilitator shows to join.</p>',
        )
      }
      if (/^\/s\/[A-Za-z0-9_-]{22}$/.test(path)) return servePage(res)
      const asset = path.startsWith('/assets/') ? files.get(path) : undefined
      if (asset) {
        res.writeHead(200, headers(asset.type, 'public, max-age=31536000, immutable'))
        return res.end(asset.body)
      }
      if (path === '/v1/health')
        return json(res, 200, {
          kind: 'lan',
          version: 'harness',
          protocol: [PROTOCOL_VERSION],
          caps: LIMITS.lan,
        })
      const s = sessionPath(path)
      if (!s) return error(res, 404, 'NOT_FOUND', 'No such path')
      if (s.id !== controller.sessionId) return error(res, 404, 'NOT_FOUND', 'No such session')
      if (s.kind === 'events' && req.method === 'GET') return serveEvents(url, req, res)
      if (s.kind === 'send' && req.method === 'POST') return serveSend(url, req, res)
      return error(res, 404, 'NOT_FOUND', 'No such path')
    })()
  })

  const serveEvents = async (url: URL, req: IncomingMessage, res: ServerResponse) => {
    const parsed = parseConnectRequest({ search: url.search, headers: req.headers })
    if (!parsed.ok) return refuse(res, parsed)
    const conn = await connectFor(parsed.request)
    if (!conn) return error(res, 401, 'BAD_JOIN_TOKEN', 'Bad connection parameters')
    res.writeHead(200, {
      ...headers('text/event-stream'),
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    res.write(': connected\n\n')
    const entry: SseConn = {
      transport: conn.transport,
      res,
      keepalive: setInterval(() => res.write(': keepalive\n\n'), 20_000),
    }
    sse.set(conn.clientId, entry)
    conn.transport.onFrame((frame) => res.write(`data: ${frame}\n\n`))
    conn.transport.onClose((code, reason) => {
      clearInterval(entry.keepalive)
      if (sse.get(conn.clientId) === entry) sse.delete(conn.clientId)
      res.write(`event: close\ndata: ${JSON.stringify({ code, reason })}\n\n`)
      res.end()
    })
    req.on('close', () => {
      clearInterval(entry.keepalive)
      if (sse.get(conn.clientId) === entry) sse.delete(conn.clientId)
      conn.transport.close(1001, 'Stream closed')
    })
  }

  const serveSend = async (url: URL, req: IncomingMessage, res: ServerResponse) => {
    const parsed = parseConnectRequest({ search: url.search, headers: req.headers })
    if (!parsed.ok) return refuse(res, parsed)
    const conn = sse.get(parsed.request.clientId)
    if (!conn) return error(res, 409, 'NO_STREAM', 'Open the event stream first')
    const body = await readBody(req, LIMITS.lan.envelopeBytes)
    if (body === undefined) return error(res, 413, 'TOO_LARGE', 'Frame over the size cap')
    conn.transport.send(body)
    res.writeHead(202, headers('text/plain; charset=utf-8'))
    res.end()
  }

  // The server echoes the version subprotocol only; the token entries never go back.
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: LIMITS.lan.envelopeBytes,
    handleProtocols: (protocols) => (protocols.has(WS_SUBPROTOCOL) ? WS_SUBPROTOCOL : false),
  })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', origin)
    const s = sessionPath(url.pathname)
    const reject = (status: number, text: string) => {
      socket.write(`HTTP/1.1 ${status} ${text}\r\nconnection: close\r\n\r\n`)
      socket.destroy()
    }
    if (opts.websocket === false || !s || s.kind !== 'ws' || s.id !== controller.sessionId)
      return reject(404, 'Not Found')
    const parsed = parseConnectRequest({
      search: url.search,
      protocols: req.headers['sec-websocket-protocol'],
    })
    if (!parsed.ok) return reject(parsed.reason === 'TOKEN_IN_QUERY' ? 400 : 401, 'Bad Request')
    wss.handleUpgrade(req, socket, head, (ws) => void bridge(ws, parsed.request))
  })

  const bridge = async (ws: WebSocket, request: ConnectRequest) => {
    const conn = await connectFor(request)
    if (!conn) return ws.close(4001, 'Bad join token')
    conn.transport.onFrame((frame) => {
      if (ws.readyState === ws.OPEN) ws.send(frame)
    })
    conn.transport.onClose((code, reason) => {
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close(code, reason)
    })
    ws.on('message', (data, isBinary) => {
      if (!isBinary) conn.transport.send(data.toString())
    })
    sockets.set(conn.clientId, ws)
    ws.on('close', () => {
      if (sockets.get(conn.clientId) === ws) sockets.delete(conn.clientId)
      conn.transport.close(1001, 'Socket closed')
    })
    ws.on('error', () => conn.transport.close(1006, 'Socket error'))
  }
  /** Live sockets by client id, so a test can sever one the way a sleeping phone does. */
  const sockets = new Map<string, WebSocket>()

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, host, () => resolve()))
  const port = (server.address() as AddressInfo).port
  origin = `http://${host}:${port}`
  controller.base = origin

  return {
    url: origin,
    port,
    controller,
    invite: (kind = 'players', roleHint) => controller.invite(kind, roleHint),
    disconnect: (clientId) => {
      const ws = sockets.get(clientId)
      if (ws) ws.close(1001, 'Going away')
      const stream = sse.get(clientId)
      if (stream) stream.transport.close(1001, 'Going away')
      return !!(ws || stream)
    },
    close: async () => {
      for (const conn of sse.values()) {
        clearInterval(conn.keepalive)
        conn.res.end()
      }
      for (const ws of wss.clients) ws.terminate()
      wss.close()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      server.closeAllConnections?.()
    },
  }
}

/** The controller actions reachable over `/__harness/<action>` (dev and tests only). */
async function runAction(
  controller: HarnessController,
  action: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : undefined)
  const targets = Array.isArray(body.targets) ? (body.targets as Destination[]) : undefined
  switch (action) {
    case 'notice':
      return controller.notice(str('text') ?? 'Notice', {
        level: str('level') as 'info' | 'warning' | 'urgent' | undefined,
        targets,
        dismissible: body.dismissible !== false,
        kind: str('kind') as 'text' | 'hotwash.open' | 'hotwash.close' | undefined,
      })
    case 'release':
      return controller.release(
        {
          title: str('title') ?? 'Inject',
          body: str('body') ?? '',
          ...(str('sender') ? { sender: str('sender') } : {}),
          ...(str('exerciseTime') ? { exerciseTime: str('exerciseTime') } : {}),
          ...(str('mselRowId') ? { mselRowId: str('mselRowId') } : {}),
        },
        targets,
      )
    case 'hotwash-open':
      return controller.hotwash.openOnDevices(body.review === true)
    case 'hotwash-close':
      return controller.hotwash.closeOnDevices()
    case 'clock':
      return controller.setClock(body.clock as ClockState)
    case 'reseat':
      return controller.reseat(str('clientId')!, str('roleId')!)
    case 'kick':
      return controller.kick(str('clientId')!)
    case 'end':
      return controller.end(
        (str('reason') as 'endex' | 'cancelled' | undefined) ?? 'endex',
        str('message'),
      )
    case 'burst': {
      // Many feed items at once, for the windowed-list check.
      const n = Math.min(Number(body.count ?? 100), 2000)
      for (let i = 1; i <= n; i++)
        await controller.release(
          {
            title: `Item ${i}`,
            body: `Feed item ${i} of ${n}.`,
            exerciseTime: `${Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}`,
          },
          targets ?? ['all'],
        )
      return n
    }
    default:
      throw new Error(`Unknown action ${action}`)
  }
}
