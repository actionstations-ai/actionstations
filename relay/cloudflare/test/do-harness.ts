/**
 * A `SessionObject` under the shim, as the conformance suite's `ConformanceServer` and as the
 * room the object-specific tests drive directly.
 */
import { toBase64Url } from '@shared/live/bytes'
import { announcedLimits, HUB_LIMITS, randomId, type HubLimits } from '@actionstations/relay-core'
import type { ConformanceFactory, ConnectOptions } from '../../core/test/conformance'
import type { Env } from '../src/env'
import { SessionObject } from '../src/session-object'
import { FakeState, socketOf, transportOf } from './shim'

export interface Room {
  state: FakeState
  env: Env
  object: SessionObject
  sessionId: string
  controllerToken: string
  clock: { now: number }
  limits: HubLimits
  /** A fresh object on the same state: what the runtime does after hibernation. */
  wake(): SessionObject
  action(action: string, body?: unknown, token?: string): Promise<Response>
  connect(opts: ConnectOptions): Promise<Response>
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

export async function createRoom(
  options: {
    limits?: Partial<HubLimits>
    joinTokenHash?: string
  } = {},
): Promise<Room> {
  const state = new FakeState()
  const env = fakeEnv()
  const clock = { now: START }
  const limits: HubLimits = { ...HUB_LIMITS.relay, ...options.limits }
  const make = () => {
    const object = new SessionObject(state.asState(), env, () => clock.now, limits)
    state.bind(object)
    return object
  }
  const sessionId = randomId()
  const room: Room = {
    state,
    env,
    object: make(),
    sessionId,
    controllerToken: '',
    clock,
    limits,
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
    connect(opts) {
      const query = new URLSearchParams({ c: opts.clientId })
      if (opts.joinToken) query.set('j', toBase64Url(opts.joinToken))
      if (opts.resumeToken) query.set('r', toBase64Url(opts.resumeToken))
      const headers: Record<string, string> = {
        Upgrade: 'websocket',
        'CF-Connecting-IP': '203.0.113.7',
      }
      if (opts.controller) headers.Authorization = `Bearer ${room.controllerToken}`
      return room.object.fetch(
        new Request(`https://relay/v1/sessions/${sessionId}/ws?${query}`, { headers }),
      )
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

export const sessionObjectFactory: ConformanceFactory = async ({ limits }) => {
  const room = await createRoom({ limits })
  return {
    sessionId: room.sessionId,
    limits: announcedLimits(room.limits),
    async connect(opts) {
      return transportOf(socketOf(await room.connect(opts)))
    },
    async kick(clientId) {
      await room.action('kick', { client: clientId })
    },
    async setJoinTokenHash(hex) {
      await room.action('join-token', { joinTokenHash: hex })
    },
    async end() {
      await room.action('end')
    },
    storedCount: () => room.state.sql.count('envelopes'),
  }
}
