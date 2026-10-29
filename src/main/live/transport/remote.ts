/**
 * What the relay client and the self-hosted client share (specs 0408, 0409, 0410): validating a
 * server address, one JSON request with certificate pinning, and the controller's WebSocket as a
 * `Transport`. Nothing here runs on its own; every call is made by a probe or a session the
 * facilitator started (Project rules 3).
 *
 * TLS: a pinned fingerprint replaces CA validation (the certificate must match the pin exactly);
 * with no pin the certificate must validate against the system roots. `inspect` is the one
 * exception: a health request that records the certificate of an unknown server so the facilitator
 * can confirm it; it carries no credentials and its answer is never trusted for anything else.
 */
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import type { TLSSocket } from 'node:tls'
import { WebSocket } from 'ws'
import { WS_SUBPROTOCOL } from '@shared/live/connect-url'
import type { Transport } from '@shared/live/transport'
import { AppError } from '../../lib/errors'

export const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 64 * 1024

export const CERT_CHANGED_MESSAGE =
  "The server's certificate changed. Confirm the new fingerprint with your IT team before continuing."

/** What identifies a server and how to trust it. */
export interface RemoteTarget {
  /** Origin plus any path prefix, no trailing slash. */
  base: string
  /** Pinned SHA-256 certificate fingerprint, `AA:BB:…`. */
  fingerprintSha256?: string
}

export function isLoopbackOrPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true
  if (isIP(host) === 4) {
    const [a, b] = host.split('.').map(Number) as [number, number]
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  return host.startsWith('fc') || host.startsWith('fd') || host.endsWith('.local')
}

/**
 * The base URL of a server the facilitator typed. https only; `http://` needs the explicit tick
 * and a loopback or private host. No credentials, query or fragment in the address.
 */
export function normalizeServerUrl(raw: string, insecureHttp = false): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new AppError(
      'VALIDATION',
      'Enter the server address, for example https://live.example.org',
    )
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new AppError(
      'VALIDATION',
      'The server address must not contain a login, query or fragment',
    )
  }
  if (url.protocol === 'http:') {
    if (!insecureHttp || !isLoopbackOrPrivateHost(url.hostname)) {
      throw new AppError(
        'VALIDATION',
        'Use an https address. Plain http is accepted only for a server on this computer or a private network, with "This server has no TLS" ticked.',
      )
    }
  } else if (url.protocol !== 'https:') {
    throw new AppError('VALIDATION', 'The server address must start with https://')
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

const sameFingerprint = (a: string, b: string): boolean => a.toUpperCase() === b.toUpperCase()

interface TlsOptions {
  rejectUnauthorized?: boolean
  agent?: HttpsAgent
}

/**
 * An agent that accepts exactly one certificate. Node skips `checkServerIdentity` once chain
 * validation has failed (a self-signed certificate always fails it), so the pin is checked here,
 * on `secureConnect`. Writes are corked until then: no header, and so no bearer token, reaches a
 * server whose certificate is not the pinned one.
 */
class PinnedAgent extends HttpsAgent {
  constructor(private readonly pin: string) {
    super({ rejectUnauthorized: false })
  }

  override createConnection(...args: Parameters<HttpsAgent['createConnection']>) {
    const socket = super.createConnection(...args) as TLSSocket
    socket.cork()
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate()
      if (cert?.fingerprint256 && sameFingerprint(cert.fingerprint256, this.pin)) socket.uncork()
      else socket.destroy(new AppError('FORBIDDEN', CERT_CHANGED_MESSAGE))
    })
    return socket
  }
}

/** Pinned: the certificate must be exactly the pinned one. Otherwise: system roots. */
function tlsOptions(target: RemoteTarget, inspect: boolean): TlsOptions {
  if (target.fingerprintSha256) return { agent: new PinnedAgent(target.fingerprintSha256) }
  return inspect ? { rejectUnauthorized: false } : {}
}

export interface JsonResponse {
  status: number
  body: unknown
  headers: IncomingMessage['headers']
  /** The certificate the server presented (https only). */
  certificate?: { fingerprint256: string; authorized: boolean }
}

export interface JsonRequest {
  method: 'GET' | 'POST'
  path: string
  bearer?: string
  body?: unknown
  /** Record the certificate of a server with no pin, even when it does not validate. */
  inspect?: boolean
  timeoutMs?: number
}

const UNREACHABLE = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH']

function networkError(err: unknown, target: RemoteTarget): AppError {
  if (err instanceof AppError) return err
  const code = (err as NodeJS.ErrnoException)?.code ?? ''
  if (code === 'ABORT_TIMEOUT') {
    return new AppError('PROVIDER', 'The server did not answer within 10 seconds.', { code })
  }
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/.test(code)) {
    return new AppError(
      'FORBIDDEN',
      target.fingerprintSha256
        ? CERT_CHANGED_MESSAGE
        : "The server's certificate is not trusted. If it is self-signed, test the connection and confirm its fingerprint.",
      { code },
    )
  }
  if (UNREACHABLE.includes(code)) {
    return new AppError(
      'PROVIDER',
      'Could not reach the server. Check the address and the network.',
      { code },
    )
  }
  return new AppError('PROVIDER', 'The connection to the server failed.', { code })
}

function parseBody(chunks: Buffer[]): unknown {
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

function certificateOf(res: IncomingMessage): JsonResponse['certificate'] {
  const sock = res.socket as TLSSocket
  const cert = sock.getPeerCertificate?.()
  return cert?.fingerprint256
    ? { fingerprint256: cert.fingerprint256, authorized: sock.authorized }
    : undefined
}

/** One JSON request, capped at 64 KiB and 10 s, with the target's TLS rules. */
export function requestJson(target: RemoteTarget, req: JsonRequest): Promise<JsonResponse> {
  const url = new URL(target.base + req.path)
  const secure = url.protocol === 'https:'
  const payload = req.body === undefined ? undefined : JSON.stringify(req.body)
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(payload !== undefined
      ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) }
      : {}),
    ...(req.bearer ? { Authorization: `Bearer ${req.bearer}` } : {}),
  }
  return new Promise((resolve, reject) => {
    const send = secure ? httpsRequest : httpRequest
    const call = send(
      url,
      { method: req.method, headers, ...(secure ? tlsOptions(target, req.inspect === true) : {}) },
      (res) => {
        // The socket is released by the time the body ends, so the certificate is read now.
        const certificate = secure ? certificateOf(res) : undefined
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (c: Buffer) => {
          size += c.length
          if (size > MAX_RESPONSE_BYTES) return call.destroy(new Error('response too large'))
          chunks.push(c)
        })
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: parseBody(chunks),
            headers: res.headers,
            ...(certificate ? { certificate } : {}),
          })
        })
      },
    )
    call.setTimeout(req.timeoutMs ?? REQUEST_TIMEOUT_MS, () =>
      call.destroy(Object.assign(new Error('timeout'), { code: 'ABORT_TIMEOUT' })),
    )
    call.on('error', (err) => reject(networkError(err, target)))
    if (payload !== undefined) call.write(payload)
    call.end()
  })
}

/** The server's own words for a refusal, with a friendlier line for the cases that have one. */
export function describeRefusal(res: JsonResponse): AppError {
  const err = (res.body as { error?: { code?: string; message?: string } } | undefined)?.error
  const code = err?.code ?? ''
  if (res.status === 503 && code === 'DAILY_LIMIT') {
    return new AppError(
      'PROVIDER',
      err?.message ||
        'The relay reached its free daily limit. Try again tomorrow or use another connection.',
      { code },
    )
  }
  if (res.status === 401 || code === 'UNAUTHORIZED') {
    return new AppError(
      'FORBIDDEN',
      'The server refused the server key. Check the key with your administrator.',
      { code },
    )
  }
  if (res.status === 429) {
    return new AppError(
      'PROVIDER',
      'The server is limiting requests from this computer. Wait a minute and try again.',
      { code },
    )
  }
  return new AppError(
    'PROVIDER',
    err?.message || `The server answered with status ${res.status}.`,
    {
      code,
      status: res.status,
    },
  )
}

/** A Transport whose subscribers may attach after frames arrived. */
function buffered() {
  const frames: string[] = []
  const frameCbs = new Set<(f: string) => void>()
  const closeCbs = new Set<(code: number, reason: string) => void>()
  let closed: [number, string] | undefined
  return {
    frame(f: string) {
      if (frameCbs.size === 0) frames.push(f)
      for (const cb of frameCbs) cb(f)
    },
    close(code: number, reason: string) {
      if (closed) return
      closed = [code, reason]
      for (const cb of closeCbs) cb(code, reason)
    },
    onFrame(cb: (f: string) => void) {
      frameCbs.add(cb)
      for (const f of frames.splice(0)) cb(f)
      return () => frameCbs.delete(cb)
    },
    onClose(cb: (code: number, reason: string) => void) {
      closeCbs.add(cb)
      if (closed) cb(...closed)
      return () => closeCbs.delete(cb)
    },
  }
}

export interface ControllerSocket {
  sessionId: string
  controllerToken: string
  clientId: string
}

/** The controller's WebSocket: `Authorization: Bearer`, the version subprotocol, the target's TLS rules. */
export function connectController(target: RemoteTarget, who: ControllerSocket): Promise<Transport> {
  const wsBase = target.base.replace(/^http/, 'ws')
  const url = `${wsBase}/v1/sessions/${who.sessionId}/ws?client=${encodeURIComponent(who.clientId)}`
  const secure = url.startsWith('wss:')
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, [WS_SUBPROTOCOL], {
      headers: { Authorization: `Bearer ${who.controllerToken}` },
      handshakeTimeout: REQUEST_TIMEOUT_MS,
      perMessageDeflate: false,
      ...(secure ? tlsOptions(target, false) : {}),
    })
    const buf = buffered()
    ws.on('message', (data, isBinary) => {
      if (!isBinary) buf.frame(data.toString())
    })
    ws.on('close', (code, reason) => buf.close(code, reason.toString()))
    ws.once('open', () =>
      resolve({
        send: (frame) => {
          if (ws.readyState === ws.OPEN) ws.send(frame)
        },
        close: (code, reason) => ws.close(code ?? 1000, reason),
        onFrame: buf.onFrame,
        onClose: buf.onClose,
      }),
    )
    ws.once('error', (err) => reject(networkError(err, target)))
    ws.once('unexpected-response', (_req, res) => {
      res.resume()
      reject(
        res.statusCode === 401
          ? new AppError('FORBIDDEN', 'The server refused the controller connection.')
          : new AppError(
              'PROVIDER',
              `The server refused the connection (status ${res.statusCode}).`,
            ),
      )
    })
  })
}
