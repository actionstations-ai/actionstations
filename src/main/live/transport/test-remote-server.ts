/**
 * A local stand-in for the relay and the self-hosted server, for tests only: the HTTP routes the
 * app-side clients call (`/v1/health`, `POST /v1/sessions`, `…/join-token|kick|end`, the key
 * check) and the controller's WebSocket, over the real `SessionHub` so a session behaves as on a
 * server. It speaks https with a self-signed certificate when asked, which is how the pinning
 * tests run. Not shipped: nothing in the app imports it.
 */
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { WebSocketServer } from 'ws'
import { fromBase64Url, toBase64Url } from '@shared/live/bytes'
import { parseConnectRequest, WS_SUBPROTOCOL } from '@shared/live/connect-url'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { SessionHub } from '@shared/live/hub'
import { LIMITS, PROTOCOL_VERSION } from '@shared/live/protocol'
import { createSessionCertificate } from './lan/cert'

export interface TestServerOptions {
  kind: 'relay' | 'self-hosted'
  tls?: boolean
  /** Self-hosted: the key `POST /v1/sessions` needs. */
  serverKey?: string
  /** Serve a dry-run `POST /v1/sessions/probe`. */
  probe?: boolean
  protocol?: number[]
  /** Answer `POST /v1/sessions` with the relay's daily-limit refusal. */
  dailyLimit?: boolean
  playerBundleSha256?: string
  /** Keep the session when the controller says `end`: stands in for an app that crashed. */
  keepOnEnd?: boolean
}

export interface TestServer {
  base: string
  fingerprintSha256?: string
  /** Requests seen, `METHOD path`, in order. */
  requests: string[]
  hubs: Map<string, SessionHub>
  close(): Promise<void>
}

const crypto = createWebCryptoProvider()
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
const bearer = (req: IncomingMessage): string | undefined =>
  /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1]

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

/** A device's tokens from the subprotocol list, as the real servers read them. */
function participantAttach(req: IncomingMessage, url: URL) {
  const parsed = parseConnectRequest({
    search: url.searchParams,
    protocols: req.headers['sec-websocket-protocol'] ?? '',
  })
  if (!parsed.ok) return undefined
  const { joinToken, resumeToken } = parsed.request
  return {
    controller: false,
    joinToken: fromBase64Url(joinToken),
    ...(resumeToken ? { resumeToken: fromBase64Url(resumeToken) } : {}),
  }
}

export async function startTestServer(opts: TestServerOptions): Promise<TestServer> {
  const requests: string[] = []
  const hubs = new Map<string, SessionHub>()
  /** Controller tokens per session: the first is the host's, the rest are co-controllers'. */
  const tokens = new Map<string, string[]>()
  const cert = opts.tls ? await createSessionCertificate('127.0.0.1', 'testserver') : undefined
  let fingerprint = cert?.fingerprintSha256

  const health = () => ({
    kind: opts.kind,
    version: '0.0.0-test',
    protocol: opts.protocol ?? [PROTOCOL_VERSION],
    caps: LIMITS[opts.kind],
    ...(opts.playerBundleSha256 ? { playerBundleSha256: opts.playerBundleSha256 } : {}),
    ...(fingerprint && opts.kind === 'self-hosted' ? { fingerprintSha256: fingerprint } : {}),
  })

  const keyOk = (req: IncomingMessage) => !opts.serverKey || bearer(req) === opts.serverKey

  async function create(req: IncomingMessage, res: ServerResponse) {
    if (opts.dailyLimit) {
      return json(res, 503, {
        error: { code: 'DAILY_LIMIT', message: 'The relay is at its daily limit.' },
      })
    }
    if (!keyOk(req)) return json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'key' } })
    const sessionId = toBase64Url(crypto.random(16))
    const controllerToken = toBase64Url(crypto.random(24))
    hubs.set(
      sessionId,
      new SessionHub({
        sessionId,
        kind: opts.kind,
        joinTokenHash: '0'.repeat(64),
        crypto,
        version: '0.0.0-test',
      }),
    )
    tokens.set(sessionId, [controllerToken])
    json(res, 200, {
      sessionId,
      controllerToken,
      caps: LIMITS[opts.kind],
      expiresAt: Date.now() + 1e6,
    })
  }

  async function sessionAction(req: IncomingMessage, res: ServerResponse, path: string) {
    const m = /^\/v1\/sessions\/([A-Za-z0-9_-]{22})\/(join-token|kick|end|controllers)$/.exec(path)
    const hub = m ? hubs.get(m[1]!) : undefined
    if (!m || !hub) return json(res, 404, { error: { code: 'NOT_FOUND', message: 'no' } })
    const list = tokens.get(m[1]!) ?? []
    const presented = bearer(req)
    if (!presented || !list.includes(presented)) {
      return json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'token' } })
    }
    if (presented !== list[0]) {
      return json(res, 403, { error: { code: 'FORBIDDEN', message: 'host only' } })
    }
    if (m[2] === 'controllers') {
      const token = toBase64Url(crypto.random(24))
      list.push(token)
      return json(res, 201, { controllerToken: token })
    }
    const body = (await readBody(req)) as { joinTokenHash?: string; client?: string }
    if (m[2] === 'join-token') hub.setJoinTokenHash(body.joinTokenHash!)
    else if (m[2] === 'kick') hub.kick(body.client!)
    else if (!opts.keepOnEnd) hub.end()
    res.writeHead(204)
    res.end()
  }

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    requests.push(`${req.method} ${path}`)
    try {
      if (path === '/v1/health' && req.method === 'GET') return json(res, 200, health())
      if (path === '/v1/sessions/probe' && req.method === 'POST') {
        if (!opts.probe) return json(res, 404, { error: { code: 'NOT_FOUND', message: 'no' } })
        return keyOk(req)
          ? (res.writeHead(204), res.end())
          : json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'key' } })
      }
      if (path === '/v1/sessions' && req.method === 'POST') return await create(req, res)
      if (req.method === 'POST') return await sessionAction(req, res, path)
      json(res, 404, { error: { code: 'NOT_FOUND', message: 'no' } })
    } catch {
      json(res, 500, { error: { code: 'INTERNAL', message: 'boom' } })
    }
  }

  const server: Server = cert
    ? createHttpsServer({ cert: cert.cert, key: cert.key }, handler)
    : createHttpServer(handler)
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (p) => (p.has(WS_SUBPROTOCOL) ? WS_SUBPROTOCOL : false),
  })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x')
    requests.push(`UPGRADE ${url.pathname}`)
    const id = /^\/v1\/sessions\/([A-Za-z0-9_-]{22})\/ws$/.exec(url.pathname)?.[1]
    const hub = id ? hubs.get(id) : undefined
    if (!id || !hub) {
      socket.write('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n')
      return socket.destroy()
    }
    const presented = bearer(req)
    const list = tokens.get(id) ?? []
    const attach = presented
      ? list.includes(presented)
        ? { controller: true, host: presented === list[0] }
        : undefined
      : participantAttach(req, url)
    if (!attach) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n')
      return socket.destroy()
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      void hub
        .attach(
          { send: (f) => ws.send(f), close: (c, r) => ws.close(c, r) },
          { clientId: url.searchParams.get('client')!, ...attach },
        )
        .then((client) => {
          ws.on('message', (d) => client.receive(d.toString()))
          ws.on('close', () => client.detach())
        })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return {
    base: `${cert ? 'https' : 'http'}://127.0.0.1:${port}`,
    ...(fingerprint ? { fingerprintSha256: fingerprint } : {}),
    requests,
    hubs,
    close: () =>
      new Promise<void>((resolve) => {
        for (const c of wss.clients) c.terminate()
        wss.close()
        server.closeAllConnections()
        server.close(() => resolve())
        fingerprint = undefined
      }),
  }
}
