/**
 * Headless clients for the LAN server's tests: a `Transport` over a real WebSocket and one over
 * the SSE + POST fallback, built the way the player page (#411) builds its own. Test files only.
 */
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { WebSocket } from 'ws'
import { toBase64Url } from '@shared/live/bytes'
import type { Transport } from '@shared/live/transport'

export interface ClientParams {
  clientId: string
  joinToken?: Uint8Array
  resumeToken?: Uint8Array
}

export function connectQuery(p: ClientParams): string {
  const q = new URLSearchParams()
  if (p.joinToken) q.set('j', toBase64Url(p.joinToken))
  q.set('c', p.clientId)
  if (p.resumeToken) q.set('r', toBase64Url(p.resumeToken))
  return q.toString()
}

/** A Transport whose subscribers may attach after frames arrived (like the memory pair). */
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
    get isClosed() {
      return closed !== undefined
    },
  }
}

/** `wss://host:port/v1/sessions/<id>/ws?j=&c=&r=`; a self-signed certificate is accepted. */
export function wsTransport(
  origin: string,
  sessionId: string,
  p: ClientParams,
): Promise<Transport> {
  const url = `${origin.replace(/^http/, 'ws')}/v1/sessions/${sessionId}/ws?${connectQuery(p)}`
  const ws = new WebSocket(url, { rejectUnauthorized: false })
  const buf = buffered()
  const pending: string[] = []
  ws.on('message', (data) => buf.frame(data.toString()))
  ws.on('close', (code, reason) => buf.close(code, reason.toString()))
  ws.on('error', () => buf.close(1006, 'error'))
  ws.on('open', () => {
    for (const f of pending.splice(0)) ws.send(f)
  })
  const transport: Transport = {
    send: (f) => (ws.readyState === ws.OPEN ? ws.send(f) : pending.push(f)),
    close: (code = 1000, reason = '') => {
      if (ws.readyState === ws.OPEN) ws.close(code, reason)
      else ws.terminate()
    },
    onFrame: buf.onFrame,
    onClose: buf.onClose,
  }
  return Promise.resolve(transport)
}

function localError(sessionId: string, clientId: string, code: string): string {
  return JSON.stringify({
    v: 1,
    session: sessionId,
    seq: 0,
    from: 'server',
    to: `client:${clientId}`,
    type: 'relay.error',
    ts: Date.now(),
    payload: { code, message: 'Refused by the server' },
  })
}

function requester(origin: string) {
  return origin.startsWith('https') ? httpsRequest : httpRequest
}

/** Parse `text/event-stream` into frames and the final `event: close`. */
function parseSse(
  res: IncomingMessage,
  onData: (frame: string) => void,
  onClose: (code: number, reason: string) => void,
) {
  let rest = ''
  let event = ''
  let data: string[] = []
  const flush = () => {
    if (data.length === 0) return
    const text = data.join('\n')
    if (event === 'close') {
      const c = JSON.parse(text) as { code: number; reason: string }
      onClose(c.code, c.reason)
    } else onData(text)
    event = ''
    data = []
  }
  res.setEncoding('utf8')
  res.on('data', (chunk: string) => {
    rest += chunk
    let nl: number
    while ((nl = rest.indexOf('\n')) !== -1) {
      const line = rest.slice(0, nl)
      rest = rest.slice(nl + 1)
      if (line === '') flush()
      else if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
    }
  })
}

/** The fetch fallback: `GET …/events` as the connection, `POST …/send` per frame. */
export function sseTransport(
  origin: string,
  sessionId: string,
  p: ClientParams,
): Promise<Transport> {
  const req = requester(origin)
  const base = `${origin}/v1/sessions/${sessionId}`
  const buf = buffered()
  const query = connectQuery(p)
  return new Promise((resolve) => {
    const stream = req(`${base}/events?${query}`, { rejectUnauthorized: false }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        buf.close(res.statusCode ?? 1006, 'events refused')
        return
      }
      parseSse(res, buf.frame, buf.close)
      res.on('end', () => buf.close(1006, 'stream ended'))
      res.on('error', () => buf.close(1006, 'stream error'))
    })
    stream.on('error', () => buf.close(1006, 'connect error'))
    stream.end()
    resolve({
      send: (frame) => {
        const post = req(
          `${base}/send?${query}`,
          {
            method: 'POST',
            rejectUnauthorized: false,
            headers: { 'Content-Type': 'application/json' },
          },
          (res) => {
            res.resume()
            // The page maps a refused POST to the relay error the hub would have sent (413 → TOO_LARGE).
            if (res.statusCode === 413) buf.frame(localError(sessionId, p.clientId, 'TOO_LARGE'))
          },
        )
        post.on('error', () => undefined)
        post.end(frame)
      },
      close: () => {
        stream.destroy()
        buf.close(1000, 'closed by client')
      },
      onFrame: buf.onFrame,
      onClose: buf.onClose,
    })
  })
}

/** One request to the server; a self-signed certificate is accepted. */
export function httpGet(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{
  status: number
  headers: Record<string, string | string[] | undefined>
  body: Buffer
}> {
  const req = url.startsWith('https') ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const r = req(
      url,
      { method: init.method ?? 'GET', headers: init.headers, rejectUnauthorized: false },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        )
      },
    )
    r.on('error', reject)
    r.end(init.body)
  })
}
