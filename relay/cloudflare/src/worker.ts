/**
 * The Worker: routes the API to the session objects, counts sessions against the daily quota,
 * answers `/v1/health`, and hands everything else to the static assets (the player page).
 *
 * Nothing here reads a frame. The Worker sees request metadata, the Durable Object sees sealed
 * frames, and neither holds a key (spec 0406 "What each party sees").
 */
import {
  CreateSessionBody,
  LIMITS,
  PROTOCOL_VERSION,
  SlidingWindow,
  apiError,
  randomId,
  sessionRoute,
  type HealthResponse,
} from '@actionstations/relay-core'
import manifest from '../public/manifest.json'
import {
  CREATES_PER_IP_PER_MINUTE,
  QUOTA_OBJECT_NAME,
  UPGRADES_PER_IP_PER_MINUTE,
  type Env,
} from './env'
import { dailyLimitResponse, errorResponse, json } from './errors'
import type { QuotaResult } from './quota-object'

export { QuotaObject } from './quota-object'
export { SessionObject } from './session-object'

/** Best-effort caps per address, in this isolate's memory; Cloudflare's own limits sit behind them. */
const creates = new SlidingWindow<string>(CREATES_PER_IP_PER_MINUTE, 60_000)
const upgrades = new SlidingWindow<string>(UPGRADES_PER_IP_PER_MINUTE, 60_000)

export function health(env: Env): HealthResponse {
  return {
    kind: 'relay',
    version: env.RELAY_VERSION ?? 'dev',
    protocol: [PROTOCOL_VERSION],
    caps: LIMITS.relay,
    playerBundleSha256: manifest.playerBundleSha256,
  }
}

function tooMany(retryAfterMs: number): Response {
  return json(apiError('RATE_LIMITED', 'Too many requests from this address'), 429, {
    'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
  })
}

async function createSession(request: Request, env: Env, now: number): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const allowed = creates.hit(ip, now)
  if (!allowed.ok) return tooMany(allowed.retryAfterMs)
  const text = await request.text()
  let raw: unknown
  try {
    raw = text.length <= 4096 ? JSON.parse(text) : undefined
  } catch {
    raw = undefined
  }
  const body = CreateSessionBody.safeParse(raw)
  if (!body.success) return json(apiError('INVALID', 'Bad request body'), 400)
  const quota = env.QUOTA.get(env.QUOTA.idFromName(QUOTA_OBJECT_NAME))
  const taken = (await (
    await quota.fetch('https://quota/take', { method: 'POST' })
  ).json()) as QuotaResult
  if (!taken.ok) return dailyLimitResponse(now)
  const sessionId = randomId()
  const object = env.SESSIONS.get(env.SESSIONS.idFromName(sessionId))
  return object.fetch(`https://session/v1/sessions/${sessionId}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body.data),
  })
}

export async function handle(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(request.url)
  const { pathname } = url
  if (pathname === '/v1/health') {
    if (request.method !== 'GET') return json(apiError('METHOD_NOT_ALLOWED', 'GET only'), 405)
    return json(health(env))
  }
  if (pathname === '/v1/sessions') {
    if (request.method !== 'POST') return json(apiError('METHOD_NOT_ALLOWED', 'POST only'), 405)
    return createSession(request, env, now)
  }
  const route = sessionRoute(pathname)
  if (route) {
    if (route.action === 'ws') {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      const allowed = upgrades.hit(ip, now)
      if (!allowed.ok) return tooMany(allowed.retryAfterMs)
    }
    const object = env.SESSIONS.get(env.SESSIONS.idFromName(route.sessionId))
    return object.fetch(request)
  }
  if (pathname.startsWith('/v1/')) return json(apiError('NOT_FOUND', 'No such route'), 404)
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(apiError('METHOD_NOT_ALLOWED', 'GET only'), 405)
  }
  return env.ASSETS.fetch(request)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env)
    } catch (err) {
      return errorResponse(err)
    }
  },
}
