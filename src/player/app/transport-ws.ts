/**
 * The browser WebSocket as a protocol `Transport`. One instance per connection attempt: the
 * session makes a new one on every reconnect. The join and resume tokens travel in the
 * subprotocol list (never in the URL); the server echoes the version entry. `opened` resolves
 * when the socket is open and rejects when it closed before opening (the cue to try the fetch
 * transport).
 */
import type { Transport } from '../../shared/live/transport'

export interface BrowserSocket {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((ev: Event) => unknown) | null
  onmessage: ((ev: MessageEvent) => unknown) | null
  onclose: ((ev: CloseEvent) => unknown) | null
  onerror: ((ev: Event) => unknown) | null
}

export type SocketFactory = (url: string, protocols: string[]) => BrowserSocket

export interface WebSocketTransport extends Transport {
  kind: 'websocket'
  /** Resolves once open; rejects when the socket closed first. */
  opened: Promise<void>
}

const OPEN = 1

export function createWebSocketTransport(
  url: string,
  protocols: string[],
  factory: SocketFactory = (u, p) => new WebSocket(u, p),
): WebSocketTransport {
  const socket = factory(url, protocols)
  const frameCbs = new Set<(frame: string) => void>()
  const closeCbs = new Set<(code: number, reason: string) => void>()
  const pending: string[] = []
  let open = false
  let closed: [number, string] | undefined
  let resolveOpen!: () => void
  let rejectOpen!: (e: Error) => void
  const opened = new Promise<void>((resolve, reject) => {
    resolveOpen = resolve
    rejectOpen = reject
  })
  // A rejection nobody awaits must not surface as an unhandled rejection.
  opened.catch(() => {})

  socket.onopen = () => {
    open = true
    for (const frame of pending.splice(0)) socket.send(frame)
    resolveOpen()
  }
  socket.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return
    for (const cb of frameCbs) cb(ev.data)
  }
  socket.onerror = () => {
    // The close event that follows carries the code; nothing to do here.
  }
  socket.onclose = (ev) => {
    if (closed) return
    closed = [ev.code, ev.reason]
    if (!open) rejectOpen(new Error(`WebSocket closed before opening (${ev.code})`))
    for (const cb of closeCbs) cb(ev.code, ev.reason)
  }

  return {
    kind: 'websocket',
    opened,
    send(frame) {
      if (closed) return
      if (open && socket.readyState === OPEN) socket.send(frame)
      else pending.push(frame)
    },
    close(code = 1000, reason = '') {
      if (closed) return
      try {
        socket.close(code, reason)
      } catch {
        // an invalid code: close without one
        socket.close()
      }
    },
    onFrame(cb) {
      frameCbs.add(cb)
      return () => frameCbs.delete(cb)
    },
    onClose(cb) {
      closeCbs.add(cb)
      if (closed) cb(...closed)
      return () => closeCbs.delete(cb)
    },
  }
}
