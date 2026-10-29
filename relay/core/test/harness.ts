/**
 * Conformance harnesses that need no sockets: `MemoryServer` (the reference in
 * `src/shared/live`) and `SessionHub` over an in-process connection pair on any store.
 */
import { toBase64Url } from '@shared/live/bytes'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import type { Transport } from '@shared/live/transport'
import { MemoryServer } from '@shared/live/transport-memory'
import {
  isControllerAuth,
  SessionHub,
  type AcceptAuth,
  type Connection,
  type LogEvent,
} from '../src/hub'
import { announcedLimits, HUB_LIMITS, type HubLimits } from '../src/limits'
import { MemoryStore, type SessionStore } from '../src/store'
import { randomId } from '../src/tokens'
import type { ConformanceFactory, ConformanceServer, ConnectOptions } from './conformance'

const crypto = createWebCryptoProvider()

export const memoryServerFactory: ConformanceFactory = async ({ kind }) => {
  const server = new MemoryServer({ sessionId: randomId(), kind, joinTokenHash: '', crypto })
  return {
    sessionId: server.sessionId,
    limits: server.limits,
    connect: (opts) => server.connect(opts),
    kick: (id) => server.kick(id),
    setJoinTokenHash: (hex) => server.setJoinTokenHash(hex),
    end: () => server.end(),
    storedCount: () => server.stored.length,
  }
}

/** A `Transport` and its server-side `Connection`, joined in memory with buffering before subscribe. */
export function connectionPair(
  clientId: string,
  controller: boolean,
  onFrame: (conn: Connection, frame: string) => void,
  onClose: (conn: Connection, code: number) => void,
): { transport: Transport; conn: Connection } {
  const frameCbs = new Set<(f: string) => void>()
  const closeCbs = new Set<(code: number, reason: string) => void>()
  const pending: string[] = []
  let pendingClose: [number, string] | undefined
  let open = true
  const conn: Connection = {
    clientId,
    controller,
    send(frame) {
      if (!open) return
      if (frameCbs.size === 0) pending.push(frame)
      for (const cb of frameCbs) cb(frame)
    },
    close(code, reason) {
      if (!open) return
      open = false
      if (closeCbs.size === 0) pendingClose = [code, reason]
      for (const cb of closeCbs) cb(code, reason)
      queueMicrotask(() => onClose(conn, code))
    },
  }
  const transport: Transport = {
    send: (frame) => queueMicrotask(() => open && onFrame(conn, frame)),
    close: (code = 1000, reason = '') => {
      if (!open) return
      open = false
      for (const cb of closeCbs) cb(code, reason)
      queueMicrotask(() => onClose(conn, code))
    },
    onFrame: (cb) => {
      frameCbs.add(cb)
      for (const f of pending.splice(0)) cb(f)
      return () => frameCbs.delete(cb)
    },
    onClose: (cb) => {
      closeCbs.add(cb)
      if (pendingClose) cb(...pendingClose)
      return () => closeCbs.delete(cb)
    },
  }
  return { transport, conn }
}

export interface HubHarnessOptions {
  store?: SessionStore
  log?: (e: LogEvent) => void
  now?: () => number
}

/** The hub as a `ConformanceServer`; also used by the Node and Cloudflare tests as a model. */
export function hubFactory(options: HubHarnessOptions = {}): ConformanceFactory {
  return async ({ kind, limits }) => {
    const store = options.store ?? new MemoryStore()
    const hub = new SessionHub({
      sessionId: randomId(),
      store,
      kind,
      limits: { ...HUB_LIMITS[kind], ...limits } as HubLimits,
      log: options.log,
      now: options.now,
    })
    const { controllerToken } = await hub.create()
    const server: ConformanceServer = {
      sessionId: hub.sessionId,
      limits: announcedLimits(hub.limits),
      async connect(opts: ConnectOptions) {
        const auth: AcceptAuth = opts.controller
          ? { clientId: opts.clientId, controllerToken }
          : {
              clientId: opts.clientId,
              joinToken: opts.joinToken ? toBase64Url(opts.joinToken) : undefined,
              resumeToken: opts.resumeToken ? toBase64Url(opts.resumeToken) : undefined,
            }
        const { transport, conn } = connectionPair(
          opts.clientId,
          isControllerAuth(auth),
          (c, f) => hub.onFrame(c, f),
          (c, code) => hub.onClose(c, code),
        )
        await hub.accept(conn, auth)
        return transport
      },
      kick: (id) => hub.kick(id),
      setJoinTokenHash: (hex) => hub.setJoinTokenHash(hex),
      end: () => hub.end(),
      storedCount: () => store.count(),
    }
    return server
  }
}
