/**
 * The fetch-based transport (spec 0407 FR-5) for browsers that refuse a WebSocket to a
 * certificate the user clicked through (Safari): `GET …/events` is a server-sent event stream
 * that is the device's connection to the hub, and `POST …/send` carries one envelope per request
 * for that connection. The stream carries exactly what a WebSocket would: `data:` lines with
 * frames, a comment every 20 s to keep it open, and a final `event: close` with the close code.
 *
 * A POST is accepted only for an open stream with the same client id and the same resume
 * token, so knowing a client id does not let another device speak as it.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import type { HubClient, SessionHub } from '@shared/live/hub'
import type { ConnectParams } from './connect-params'
import type { LanLog } from './log'
import type { Peers } from './peers'
import { applyCommonHeaders, readBody, sendError, sendJson } from './respond'

export const SSE_KEEPALIVE_MS = 20_000
/** A stream whose reader stalls past this much queued output is dropped, like a WebSocket. */
export const SSE_MAX_BUFFERED_BYTES = 8 * 1024 * 1024

interface Stream {
  res: ServerResponse
  client: HubClient
  resumeToken: Uint8Array
  nextId: number
}

export interface FallbackContext {
  hub: SessionHub
  peers: Peers
  log: LanLog
}

export class HttpFallback {
  private readonly streams = new Map<string, Stream>()

  constructor(private readonly ctx: FallbackContext) {}

  get openStreams(): number {
    return this.streams.size
  }

  /** `GET /v1/sessions/:id/events`: the response is the connection. */
  async events(
    req: IncomingMessage,
    res: ServerResponse,
    params: ConnectParams,
    remote: string,
  ): Promise<void> {
    applyCommonHeaders(res)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write(': connected\n\n')
    const stream: Stream = {
      res,
      client: undefined as never,
      resumeToken: params.resumeToken,
      nextId: 1,
    }
    const peer = {
      transport: 'sse' as const,
      clientId: params.clientId,
      remote,
      terminate: () => res.destroy(),
    }
    const keepalive = setInterval(() => res.write(': keep-alive\n\n'), SSE_KEEPALIVE_MS)
    const cleanup = (code: number, reason: string) => {
      clearInterval(keepalive)
      if (this.streams.get(params.clientId) === stream) this.streams.delete(params.clientId)
      this.ctx.peers.remove(peer)
      void this.ctx.log.write({
        event: 'close',
        transport: 'sse',
        remote,
        clientId: params.clientId,
        code,
        reason,
      })
    }
    res.on('close', () => {
      stream.client?.detach()
      cleanup(1006, 'Stream closed')
    })
    stream.client = await this.ctx.hub.attach(
      {
        send: (frame) => {
          if (res.writableEnded) return
          if (res.writableLength > SSE_MAX_BUFFERED_BYTES) return res.destroy()
          res.write(`id: ${stream.nextId++}\ndata: ${frame}\n\n`)
        },
        close: (code, reason) => {
          if (res.writableEnded) return
          res.write(`event: close\ndata: ${JSON.stringify({ code, reason })}\n\n`)
          res.end()
          cleanup(code, reason)
        },
      },
      { ...params, remote },
    )
    if (!stream.client.open) return
    // A reconnect with the same id replaces the old stream, which the hub has already closed.
    this.streams.set(params.clientId, stream)
    this.ctx.peers.add(peer)
    void this.ctx.log.write({
      event: 'connect',
      transport: 'sse',
      remote,
      clientId: params.clientId,
    })
  }

  /** `POST /v1/sessions/:id/send`: one envelope for the stream that owns the client id. */
  async send(
    req: IncomingMessage,
    res: ServerResponse,
    params: ConnectParams,
    maxBytes: number,
  ): Promise<void> {
    const stream = this.streams.get(params.clientId)
    if (!stream || !stream.client.open) {
      return sendError(res, 'CONFLICT', 'Open the event stream before sending')
    }
    if (!sameToken(stream.resumeToken, params.resumeToken)) {
      return sendError(res, 'UNAUTHORIZED', 'Resume token does not match the stream')
    }
    const body = await readBody(req, maxBytes)
    if (body === undefined) return sendError(res, 'TOO_LARGE', 'Envelope over the size cap')
    if (body.length === 0) return sendError(res, 'BAD_REQUEST', 'Empty body')
    // The hub validates the frame itself and answers errors down the stream.
    stream.client.receive(body.toString('utf8'))
    sendJson(res, 202, { accepted: true })
  }

  /** Close every stream (stop). */
  closeAll(): void {
    for (const stream of [...this.streams.values()]) {
      if (!stream.res.writableEnded) stream.res.end()
      stream.res.destroy()
    }
    this.streams.clear()
  }
}

function sameToken(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}
