/**
 * Response helpers for the LAN server (spec 0407 FR-6): the hardening headers every response
 * carries, the HTML content security policy, JSON errors without stack traces.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

export const COMMON_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

/** `'self'` covers same-origin WebSockets in current browsers; the explicit origin helps older ones. */
export function htmlCsp(wsOrigin: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    'media-src blob:',
    `connect-src 'self' ${wsOrigin}`,
    "font-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function applyCommonHeaders(res: ServerResponse, cache = 'no-store'): void {
  for (const [k, v] of Object.entries(COMMON_HEADERS)) res.setHeader(k, v)
  res.setHeader('Cache-Control', cache)
}

export function sendHtml(res: ServerResponse, html: string, csp: string, status = 200): void {
  applyCommonHeaders(res)
  res.setHeader('Content-Security-Policy', csp)
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
  })
  res.end(html)
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  applyCommonHeaders(res)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

export type HttpErrorCode =
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'CONFLICT'
  | 'TOO_LARGE'
  | 'RATE_LIMITED'
  | 'SESSION_ENDED'
  | 'MISDIRECTED'
  | 'FORBIDDEN'

const STATUS: Record<HttpErrorCode, number> = {
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  CONFLICT: 409,
  TOO_LARGE: 413,
  RATE_LIMITED: 429,
  SESSION_ENDED: 410,
  MISDIRECTED: 421,
  FORBIDDEN: 403,
}

export function sendError(res: ServerResponse, code: HttpErrorCode, message: string): void {
  sendJson(res, STATUS[code], { error: { code, message } })
}

/** Read a request body up to `max` bytes; over it the request is answered 413 and dropped. */
export function readBody(req: IncomingMessage, max: number): Promise<Buffer | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const finish = (value: Buffer | undefined) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > max) {
        // Stop collecting and let the caller answer 413; the rest of the body is drained.
        req.removeAllListeners('data')
        req.resume()
        return finish(undefined)
      }
      chunks.push(chunk)
    })
    req.on('end', () => finish(Buffer.concat(chunks)))
    req.on('error', () => finish(undefined))
    req.on('close', () => finish(undefined))
  })
}

/** The peer's address for the log; IPv4-mapped IPv6 is shown as IPv4. */
export function remoteOf(req: IncomingMessage): string {
  const addr = req.socket.remoteAddress ?? 'unknown'
  return addr.startsWith('::ffff:') ? addr.slice(7) : addr
}
