/**
 * A `SessionObject` under the shim, as the shared conformance suite's server and as the room
 * the object-specific tests drive directly. Connections follow the connection contract: `?client=`
 * plus the `as-live.v1`, `j.`, `r.` subprotocols, or a bearer controller token.
 */
import { toBase64Url } from '@shared/live/bytes'
import type { SessionHubOptions } from '@shared/live/hub'
import type { ConnectOptions, ServerFactory } from '@shared/live/server-conformance'
import type { Transport } from '@shared/live/transport'
import { randomId, WS_SUBPROTOCOL } from '@actionstations/relay-core'
import type { Env } from '../src/env'
import { SessionObject } from '../src/session-object'
import { FakeState, socketOf, transportOf, type FakeSocket } from './shim'

export interface Room {
  state: FakeState
  env: Env
  object: SessionObject
  sessionId: string
  controllerToken: string
  clock: { now: number }
  /** A fresh object on the same state: what the runtime does after hibernation. */
  wake(): SessionObject
  action(action: string, body?: unknown, token?: string): Promise<Response>
  connect(
    opts: ConnectOptions,
    over?: { protocols?: string; query?: Record<string, string>; controllerToken?: string },
  ): Promise<Response>
  lastIndex(): number
  connected(): string[]
}

export const START = Date.UTC(2026, 9, 28, 12, 0, 0)

export function fakeEnv(): Env {
  const unused = () => {
    throw new Error('not used by the session object')
  }
  return {
    RELAY_VERSION: 'test',
    SESSIONS: { idFromName: unused, get: unused } as unknown as DurableObjectNamespace,
    QUOTA: { idFromName: unused, get: unused } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: unused } as unknown as Fetcher,
  }
}

export interface RoomOptions {
  sessionId?: string
  joinTokenHash?: string
  hub?: Partial<SessionHubOptions>
}

export async function createRoom(options: RoomOptions = {}): Promise<Room> {
  const state = new FakeState()
  const env = fakeEnv()
  const clock = { now: START }
  const make = () => {
    const object = new SessionObject(state.asState(), env, () => clock.now, options.hub ?? {})
    state.bind(object)
    return object
  }
  const sessionId = options.sessionId ?? randomId()
  const room: Room = {
    state,
    env,
    object: make(),
    sessionId,
    controllerToken: '',
    clock,
    wake() {
      room.object = make()
      return room.object
    },
    action(action, body, token = room.controllerToken) {
      return room.object.fetch(
        new Request(`https://relay/v1/sessions/${sessionId}/${action}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: body === undefined ? null : JSON.stringify(body),
        }),
      )
    },
    connect(opts, over = {}) {
      const query = new URLSearchParams({ client: opts.clientId, ...over.query })
      const protocols = [WS_SUBPROTOCOL]
      if (opts.joinToken) protocols.push(`j.${toBase64Url(opts.joinToken)}`)
      if (opts.resumeToken) protocols.push(`r.${toBase64Url(opts.resumeToken)}`)
      const headers: Record<string, string> = {
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': over.protocols ?? protocols.join(', '),
        'CF-Connecting-IP': '203.0.113.7',
      }
      if (opts.controller) {
        headers.Authorization = `Bearer ${over.controllerToken ?? room.controllerToken}`
      }
      return room.object.fetch(
        new Request(`https://relay/v1/sessions/${sessionId}/ws?${query}`, { headers }),
      )
    },
    lastIndex() {
      const rows = state.sql.exec(`SELECT COALESCE(MAX(idx), 0) AS n FROM envelopes`).toArray()
      return Number(rows[0]!.n)
    },
    connected() {
      return [...state.sockets]
        .filter((s) => s.readyState === 1)
        .map((s) => (s.deserializeAttachment() as { clientId: string }).clientId)
    },
  }
  const created = await room.object.fetch(
    new Request(`https://relay/v1/sessions/${sessionId}/create`, {
      method: 'POST',
      body: JSON.stringify({
        v: 1,
        ...(options.joinTokenHash ? { joinTokenHash: options.joinTokenHash } : {}),
      }),
    }),
  )
  if (created.status !== 201) throw new Error(`create failed: ${created.status}`)
  room.controllerToken = ((await created.json()) as { controllerToken: string }).controllerToken
  return room
}

/** A transport that was refused before the handshake: one close, no frames. */
function refusedTransport(code: number): Transport {
  return {
    send: () => {},
    close: () => {},
    onFrame: () => () => {},
    onClose: (cb) => {
      queueMicrotask(() => cb(code, 'refused before the handshake'))
      return () => {}
    },
  }
}

export async function connectTransport(
  room: Room,
  opts: ConnectOptions,
  over: { controllerToken?: string } = {},
): Promise<Transport> {
  const res = await room.connect(opts, over)
  if (res.status !== 101) return refusedTransport(res.status === 403 ? 4005 : 1008)
  return transportOf(socketOf(res))
}

/** The Durable Object as the shared conformance suite's server. */
export const sessionObjectFactory: ServerFactory = async (opts) => {
  const {
    sessionId,
    joinTokenHash,
    framesPerMinute,
    limits,
    storedEnvelopes,
    storedBytes,
    rowWriteBudget,
    catchupBytes,
  } = opts
  const room = await createRoom({
    sessionId,
    joinTokenHash,
    hub: {
      framesPerMinute,
      limits,
      storedEnvelopes,
      storedBytes,
      rowWriteBudget,
      catchupBytes,
      kind: opts.kind,
    },
  })
  let coToken: string | undefined
  const coControllerToken = async (): Promise<string> => {
    if (!coToken) {
      const minted = await room.action('controllers')
      coToken = ((await minted.json()) as { controllerToken: string }).controllerToken
    }
    return coToken
  }
  return {
    connect: async (o) =>
      o.controller && o.host === false
        ? connectTransport(room, o, { controllerToken: await coControllerToken() })
        : connectTransport(room, o),
    kick: (id) => void room.action('kick', { client: id }),
    end: () => void room.action('end'),
    // The suite expects the rotation to be in effect at once: write the hub's state row directly.
    setJoinTokenHash: (hex) => {
      room.state.sql.exec(
        `INSERT INTO state (key, value) VALUES ('hub', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        JSON.stringify({ joinTokenHash: hex, ended: false }),
      )
    },
    get lastIndex() {
      return room.lastIndex()
    },
    get connected() {
      return room.connected()
    },
    stop: async () => {
      for (const s of [...room.state.sockets] as FakeSocket[]) s.close(1001, 'stop')
    },
  }
}
