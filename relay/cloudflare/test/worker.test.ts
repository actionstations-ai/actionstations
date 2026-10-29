/**
 * The Worker's routing with in-memory Durable Object namespaces: health, session creation
 * through the quotas (and the checks that it comes from the app), forwarding to the right
 * object, the edge rate limits, static assets and error mapping.
 */
import { describe, expect, it, vi } from 'vitest'
import { IDS } from '@shared/live/fixtures/payloads'
import { LIMITS } from '@shared/live/protocol'
import { collect, until } from '@shared/live/server-conformance'
import { SESSIONS_PER_ADDRESS_PER_DAY, SESSIONS_PER_DAY, type Env } from '../src/env'
import { QuotaObject } from '../src/quota-object'
import { SessionObject } from '../src/session-object'
import worker, { handle, health } from '../src/worker'
import { START } from './do-harness'
import { FakeState, socketOf, transportOf } from './shim'

vi.mock('../src/platform', async () => (await import('./shim')).platformShim)

interface World {
  env: Env
  clock: { now: number }
  sessions: Map<string, SessionObject>
  assets: ReturnType<typeof vi.fn>
}

/** Namespaces whose stubs call in-memory objects, one per name, as the runtime would. */
function world(options: { throwOnSession?: () => Error } = {}): World {
  const clock = { now: START }
  const sessions = new Map<string, SessionObject>()
  const quotas = new Map<string, QuotaObject>()
  const assets = vi.fn(async () => new Response('asset', { status: 200 }))
  const env = {} as Env
  const namespace = (make: (name: string) => { fetch(r: Request): Promise<Response> }) =>
    ({
      idFromName: (name: string) => ({ name, toString: () => name }),
      get: (id: { name: string }) => ({
        fetch: (input: Request | string, init?: RequestInit) =>
          make(id.name).fetch(new Request(input, init)),
      }),
    }) as unknown as DurableObjectNamespace
  env.SESSIONS = namespace((name) => {
    if (options.throwOnSession) throw options.throwOnSession()
    let object = sessions.get(name)
    if (!object) {
      const state = new FakeState()
      object = new SessionObject(state.asState(), env, () => clock.now)
      state.bind(object)
      sessions.set(name, object)
    }
    return object
  })
  env.QUOTA = namespace((name) => {
    let object = quotas.get(name)
    if (!object) {
      object = new QuotaObject(new FakeState().asState(), env, undefined, () => clock.now)
      quotas.set(name, object)
    }
    return object
  })
  env.ASSETS = { fetch: assets } as unknown as Fetcher
  env.RELAY_VERSION = '9.9.9'
  return { env, clock, sessions, assets }
}

let ipCounter = 0
/** A fresh address per call, so the per-address windows (module state) do not leak between tests. */
function ip(): string {
  ipCounter += 1
  return `198.51.100.${(ipCounter % 250) + 1}`.replace(
    '198.51.100',
    `198.51.${100 + Math.floor(ipCounter / 250)}`,
  )
}

function create(
  w: World,
  body: unknown = { v: 1 },
  from = ip(),
  headers: Record<string, string> = {},
) {
  return handle(
    new Request('https://relay.example/v1/sessions', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': from, 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    w.env,
    w.clock.now,
  )
}

describe('worker: health', () => {
  it('reports the relay kind, version, protocol, caps and bundle hash, and nothing about sessions', async () => {
    const w = world()
    const res = await handle(new Request('https://relay.example/v1/health'), w.env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({
      kind: 'relay',
      version: '9.9.9',
      protocol: [1],
      caps: LIMITS.relay,
      playerBundleSha256: health(w.env).playerBundleSha256,
    })
    expect(body.playerBundleSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(
      (await handle(new Request('https://relay.example/v1/health', { method: 'POST' }), w.env))
        .status,
    ).toBe(405)
  })
})

describe('worker: sessions', () => {
  it('creates a session through the quota and returns the id, the token, the caps and the deadline', async () => {
    const w = world()
    const res = await create(w)
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.sessionId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(body.controllerToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.caps).toEqual(LIMITS.relay)
    expect(body.expiresAt).toBe(START + 72 * 3600_000)
    expect(w.sessions.has(body.sessionId as string)).toBe(true)
  })

  it('accepts a creation only as JSON from the app: text/plain is 415, an Origin header is 403, and neither costs the quota', async () => {
    const w = world()
    const plain = await create(w, '{"v":1}', ip(), { 'Content-Type': 'text/plain' })
    expect(plain.status).toBe(415)
    const page = await create(w, { v: 1 }, ip(), { Origin: 'https://evil.example' })
    expect(page.status).toBe(403)
    expect(w.sessions.size).toBe(0)
    expect((await create(w, { v: 2 })).status).toBe(400)
    expect((await create(w, 'not json')).status).toBe(400)
    expect((await create(w, { v: 1, name: 'x' })).status).toBe(400)
    expect((await handle(new Request('https://relay.example/v1/sessions'), w.env)).status).toBe(405)
    expect((await handle(new Request('https://relay.example/v1/other'), w.env)).status).toBe(404)
    expect(w.sessions.size).toBe(0)
  })

  it(`lets one address create ${SESSIONS_PER_ADDRESS_PER_DAY} sessions a day and the account ${SESSIONS_PER_DAY}; the rest wait for UTC midnight`, async () => {
    const w = world()
    const one = ip()
    for (let i = 0; i < SESSIONS_PER_ADDRESS_PER_DAY; i++)
      expect((await create(w, { v: 1 }, one)).status).toBe(201)
    const mine = await create(w, { v: 1 }, one)
    expect(mine.status).toBe(429)
    expect(Number(mine.headers.get('Retry-After'))).toBe(12 * 3600)
    expect(w.sessions.size).toBe(SESSIONS_PER_ADDRESS_PER_DAY)
    // IPv6 addresses count by their /64.
    expect((await create(w, { v: 1 }, '2001:db8:1:2::1')).status).toBe(201)
    expect((await create(w, { v: 1 }, '2001:db8:1:2::2')).status).toBe(201)
    expect((await create(w, { v: 1 }, '2001:db8:1:2:ffff::3')).status).toBe(201)
    expect((await create(w, { v: 1 }, '2001:db8:1:2::4')).status).toBe(429)
    let created = w.sessions.size
    while (created < SESSIONS_PER_DAY) {
      expect((await create(w)).status).toBe(201)
      created += 1
    }
    const over = await create(w)
    expect(over.status).toBe(503)
    expect(over.headers.get('Retry-After')).toBe(String(12 * 3600))
    const body = (await over.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('DAILY_LIMIT')
    expect(body.error.message).toContain('00:00 UTC')
    w.clock.now = START + 12 * 3600_000
    expect((await create(w, { v: 1 }, one)).status).toBe(201)
  })

  it('limits session creations per address at the edge as well', async () => {
    const w = world()
    const from = ip()
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) statuses.push((await create(w, { v: 1 }, from)).status)
    expect(statuses.slice(0, SESSIONS_PER_ADDRESS_PER_DAY)).toEqual([201, 201, 201])
    expect(statuses[10]).toBe(429)
  })

  it('forwards /v1/sessions/:id/* to that session’s object and upgrades its sockets with the subprotocol', async () => {
    const w = world()
    const { sessionId, controllerToken } = (await (await create(w)).json()) as {
      sessionId: string
      controllerToken: string
    }
    const upgrade = await handle(
      new Request(`https://relay.example/v1/sessions/${sessionId}/ws?client=${IDS.controller}`, {
        headers: {
          Upgrade: 'websocket',
          'Sec-WebSocket-Protocol': 'as-live.v1',
          Authorization: `Bearer ${controllerToken}`,
          'CF-Connecting-IP': ip(),
        },
      }),
      w.env,
    )
    expect(upgrade.status).toBe(101)
    const got = collect(transportOf(socketOf(upgrade)))
    await until(() => got.of('relay.hello').length === 1)
    expect((got.of('relay.hello')[0]!.payload as { index: number }).index).toBe(0)
    const unknown = await handle(
      new Request(`https://relay.example/v1/sessions/${'u'.repeat(22)}/kick`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${controllerToken}` },
        body: '{}',
      }),
      w.env,
    )
    expect(unknown.status).toBe(404)
    // The fallback routes are not mounted on the relay.
    expect(
      (
        await handle(
          new Request(
            `https://relay.example/v1/sessions/${sessionId}/events?client=${IDS.playerA}`,
          ),
          w.env,
        )
      ).status,
    ).toBe(404)
  })
})

describe('worker: everything else', () => {
  it('hands GET and HEAD for other paths to the static assets and refuses other methods', async () => {
    const w = world()
    const page = await handle(new Request('https://relay.example/s/abc'), w.env)
    expect(await page.text()).toBe('asset')
    expect(w.assets).toHaveBeenCalledTimes(1)
    expect(
      (await handle(new Request('https://relay.example/s/abc', { method: 'POST' }), w.env)).status,
    ).toBe(405)
    expect(w.assets).toHaveBeenCalledTimes(1)
  })

  it('maps the runtime’s limit errors to 503 DAILY_LIMIT and everything else to a bare 500', async () => {
    const limit = world({
      throwOnSession: () => new Error('Durable Object storage write limit exceeded for today'),
    })
    const res = await worker.fetch(
      new Request(`https://relay.example/v1/sessions/${'a'.repeat(22)}/end`, { method: 'POST' }),
      limit.env,
    )
    expect(res.status).toBe(503)
    const bug = world({
      throwOnSession: () => new TypeError('exceeded the limit of my patience at /secret'),
    })
    const res2 = await worker.fetch(
      new Request(`https://relay.example/v1/sessions/${'a'.repeat(22)}/end`, { method: 'POST' }),
      bug.env,
    )
    expect(res2.status).toBe(500)
    expect(await res2.text()).not.toContain('/secret')
  })
})
