/**
 * The Worker's routing with in-memory Durable Object namespaces: health, session creation
 * through the daily quota, forwarding to the right object, the edge rate limits, static assets
 * and error mapping.
 */
import { describe, expect, it, vi } from 'vitest'
import { IDS } from '@shared/live/fixtures/payloads'
import { LIMITS } from '@shared/live/protocol'
import { SESSIONS_PER_DAY, type Env } from '../src/env'
import { QuotaObject } from '../src/quota-object'
import { SessionObject } from '../src/session-object'
import worker, { handle, health } from '../src/worker'
import { START } from './do-harness'
import { FakeState, socketOf, transportOf } from './shim'
import { Inbox } from '../../core/test/conformance'

vi.mock('../src/platform', async () => (await import('./shim')).platformShim)

interface World {
  env: Env
  clock: { now: number }
  sessions: Map<string, SessionObject>
  assets: ReturnType<typeof vi.fn>
}

/** Namespaces whose stubs call in-memory objects, one per name, as the runtime would. */
function world(options: { throwOnSession?: string } = {}): World {
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
    if (options.throwOnSession) throw new Error(options.throwOnSession)
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
      object = new QuotaObject(new FakeState().asState(), env, SESSIONS_PER_DAY, () => clock.now)
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
  return `198.51.100.${ipCounter}`
}

function create(w: World, body: unknown = { v: 1 }, from = ip()) {
  return handle(
    new Request('https://relay.example/v1/sessions', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': from, 'Content-Type': 'application/json' },
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
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({
      kind: 'relay',
      version: '9.9.9',
      protocol: [1],
      caps: LIMITS.relay,
      playerBundleSha256: health(w.env).playerBundleSha256,
    })
    expect(typeof body.playerBundleSha256).toBe('string')
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

  it('refuses bad bodies, wrong methods and unknown API paths', async () => {
    const w = world()
    expect((await create(w, { v: 2 })).status).toBe(400)
    expect((await create(w, 'not json')).status).toBe(400)
    expect((await create(w, { v: 1, name: 'x' })).status).toBe(400)
    expect((await handle(new Request('https://relay.example/v1/sessions'), w.env)).status).toBe(405)
    expect((await handle(new Request('https://relay.example/v1/other'), w.env)).status).toBe(404)
    expect(
      (await handle(new Request('https://relay.example/v1/sessions/short/ws'), w.env)).status,
    ).toBe(404)
    expect(w.sessions.size).toBe(0)
  })

  it('forwards /v1/sessions/:id/* to that session’s object and upgrades its sockets', async () => {
    const w = world()
    const { sessionId, controllerToken } = (await (await create(w)).json()) as {
      sessionId: string
      controllerToken: string
    }
    const upgrade = await handle(
      new Request(`https://relay.example/v1/sessions/${sessionId}/ws?c=${IDS.controller}`, {
        headers: {
          Upgrade: 'websocket',
          Authorization: `Bearer ${controllerToken}`,
          'CF-Connecting-IP': ip(),
        },
      }),
      w.env,
    )
    const inbox = new Inbox(transportOf(socketOf(upgrade)))
    const [hello] = await inbox.nextOfType('relay.hello')
    expect(hello!.payload.index).toBe(0)
    const unknown = await handle(
      new Request(`https://relay.example/v1/sessions/${'u'.repeat(22)}/kick`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${controllerToken}` },
        body: '{}',
      }),
      w.env,
    )
    expect(unknown.status).toBe(404)
  })

  it(`stops at ${SESSIONS_PER_DAY} sessions a day with 503 DAILY_LIMIT and a Retry-After at UTC midnight`, async () => {
    const w = world()
    for (let i = 0; i < SESSIONS_PER_DAY; i++) expect((await create(w)).status).toBe(201)
    const over = await create(w)
    expect(over.status).toBe(503)
    expect(over.headers.get('Retry-After')).toBe(String(12 * 3600))
    const body = (await over.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('DAILY_LIMIT')
    expect(body.error.message).toContain('00:00 UTC')
    expect(w.sessions.size).toBe(SESSIONS_PER_DAY)
    w.clock.now = START + 12 * 3600_000
    expect((await create(w)).status).toBe(201)
  })

  it('limits session creations per address at the edge', async () => {
    const w = world()
    const from = ip()
    for (let i = 0; i < 10; i++) expect((await create(w, { v: 1 }, from)).status).toBe(201)
    const res = await create(w, { v: 1 }, from)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect((await create(w, { v: 1 }, ip())).status).toBe(201)
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

  it('maps a thrown limit error to 503 DAILY_LIMIT and anything else to a bare 500', async () => {
    const limit = world({ throwOnSession: 'Durable Object storage write limit exceeded' })
    const res = await worker.fetch(
      new Request(`https://relay.example/v1/sessions/${'a'.repeat(22)}/end`, { method: 'POST' }),
      limit.env,
    )
    expect(res.status).toBe(503)
    const bug = world({ throwOnSession: 'TypeError: something internal with a path /secret' })
    const res2 = await worker.fetch(
      new Request(`https://relay.example/v1/sessions/${'a'.repeat(22)}/end`, { method: 'POST' }),
      bug.env,
    )
    expect(res2.status).toBe(500)
    expect(await res2.text()).not.toContain('/secret')
  })
})
