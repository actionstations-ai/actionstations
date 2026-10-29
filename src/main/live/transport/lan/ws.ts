/**
 * A WebSocket as a hub connection (spec 0407 FR-7): frames in, frames out, the hub's close
 * codes on the wire. Ping every 25 s; a socket silent for 60 s is terminated, which the hub
 * reports as `presence offline`. A client whose send buffer stalls past 8 MiB is dropped so a
 * dead phone cannot hold frames for the whole room in memory.
 */
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import type { HubClient, SessionHub } from '@shared/live/hub'
import type { ConnectParams } from './connect-params'
import type { LanLog } from './log'
import type { Peers } from './peers'

export const PING_INTERVAL_MS = 25_000
export const IDLE_TIMEOUT_MS = 60_000
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024

export interface WsAttachContext {
  hub: SessionHub
  peers: Peers
  log: LanLog
  now?: () => number
}

export function createWebSocketServer(maxPayload: number): WebSocketServer {
  return new WebSocketServer({ noServer: true, maxPayload, perMessageDeflate: false })
}

/** Complete the upgrade and attach the socket to the hub; the hub answers (hello or refusal). */
export function attachWebSocket(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  params: ConnectParams,
  remote: string,
  ctx: WsAttachContext,
): void {
  wss.handleUpgrade(req, socket, head, (ws) => {
    void bind(ws, params, remote, ctx)
  })
}

async function bind(
  ws: WebSocket,
  params: ConnectParams,
  remote: string,
  ctx: WsAttachContext,
): Promise<void> {
  const now = ctx.now ?? (() => Date.now())
  let lastSeen = now()
  const attached: { client?: HubClient } = {}
  const peer = {
    transport: 'ws' as const,
    clientId: params.clientId,
    remote,
    terminate: () => ws.terminate(),
  }
  const pending: string[] = []
  const outgoing = (frame: string) => {
    if (ws.readyState !== ws.OPEN) return pending.push(frame)
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return ws.terminate()
    ws.send(frame)
  }
  const touch = () => {
    lastSeen = now()
  }
  ws.on('pong', touch)
  ws.on('message', (data, isBinary) => {
    touch()
    if (isBinary || !attached.client) return
    attached.client.receive(data.toString())
  })
  const ping = setInterval(() => {
    if (now() - lastSeen > IDLE_TIMEOUT_MS) return ws.terminate()
    if (ws.readyState === ws.OPEN) ws.ping()
  }, PING_INTERVAL_MS)
  ws.on('close', (code, reason) => {
    clearInterval(ping)
    ctx.peers.remove(peer)
    attached.client?.detach()
    void ctx.log.write({
      event: 'close',
      transport: 'ws',
      remote,
      clientId: params.clientId,
      code,
      reason: reason.toString(),
    })
  })
  ws.on('error', () => ws.terminate())
  const client = await ctx.hub.attach(
    {
      send: outgoing,
      close: (code, reason) => {
        if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close(code, reason)
      },
    },
    params,
  )
  attached.client = client
  if (!client.open) return // refused: the hub already sent relay.error and closed
  ctx.peers.add(peer)
  void ctx.log.write({ event: 'connect', transport: 'ws', remote, clientId: params.clientId })
  for (const frame of pending.splice(0)) outgoing(frame)
}
