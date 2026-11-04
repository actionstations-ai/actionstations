/**
 * The page's transport interface over an in-memory server connection, for the practice session
 * the player apps ship (spec 0446). Frames sent before the connection opens are queued.
 */
import type { Transport } from '../../shared/live/transport'
import type { ConnectedTransport, TransportKind } from '../app/session'

export function memoryTransport(
  kind: TransportKind,
  pending: Promise<Transport>,
): ConnectedTransport {
  const frameCbs = new Set<(f: string) => void>()
  const closeCbs = new Set<(c: number, r: string) => void>()
  const queue: string[] = []
  let inner: Transport | undefined
  let closed: [number, string] | undefined
  const finish = (c: number, r: string) => {
    if (closed) return
    closed = [c, r]
    for (const cb of closeCbs) cb(c, r)
  }
  const opened = pending.then((t) => {
    inner = t
    t.onFrame((f) => frameCbs.forEach((cb) => cb(f)))
    t.onClose(finish)
    for (const f of queue.splice(0)) t.send(f)
  })
  opened.catch(() => finish(1006, 'refused'))
  return {
    kind,
    opened,
    send: (f) => (inner ? inner.send(f) : queue.push(f)),
    close: (c = 1000, r = '') => {
      inner?.close(c, r)
      finish(c, r)
    },
    onFrame: (cb) => (frameCbs.add(cb), () => frameCbs.delete(cb)),
    onClose: (cb) => {
      closeCbs.add(cb)
      if (closed) cb(...closed)
      return () => closeCbs.delete(cb)
    },
  }
}
