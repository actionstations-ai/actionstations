/**
 * The three things the Workers runtime has and Node does not: a `WebSocketPair`, a `101`
 * response carrying a socket, and the auto-response pair. Behind this module so the tests in
 * `relay/cloudflare/test` can run the objects under plain Node with a stand-in.
 */
import { PING_REQUEST, PING_RESPONSE } from './env'

export function websocketPair(): { client: WebSocket; server: WebSocket } {
  const pair = new WebSocketPair()
  return { client: pair[0], server: pair[1] }
}

export function upgradeResponse(client: WebSocket): Response {
  return new Response(null, { status: 101, webSocket: client })
}

export function pingPongPair(): WebSocketRequestResponsePair {
  return new WebSocketRequestResponsePair(PING_REQUEST, PING_RESPONSE)
}
