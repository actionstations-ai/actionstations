/**
 * What a caller sees when something inside the relay throws. On the free plan Cloudflare fails
 * an operation past a daily limit with an error, and nothing is billed (spec 0408 FR-4): that
 * becomes `503 DAILY_LIMIT` with a `Retry-After` at the next UTC midnight. Anything else is a
 * `500 INTERNAL` with no detail, so no internal message reaches a client.
 */
import { API_HEADERS, apiError } from '@actionstations/relay-core'
import { nextUtcMidnight } from './env'

export const DAILY_LIMIT_MESSAGE =
  'The Action Stations relay has reached today’s free limit. Switch this session to This computer or Your server, or try after 00:00 UTC.'

const LIMIT_WORDS = /exceed|limit|quota|too many|out of|storage|overloaded|rate/i

/** Whether an error thrown by the runtime looks like a free-plan limit rather than a bug. */
export function isLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return LIMIT_WORDS.test(message)
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...API_HEADERS, 'Content-Type': 'application/json', ...headers },
  })
}

export function dailyLimitResponse(now = Date.now()): Response {
  const retryAfter = Math.max(1, Math.ceil((nextUtcMidnight(now) - now) / 1000))
  return json(apiError('DAILY_LIMIT', DAILY_LIMIT_MESSAGE), 503, {
    'Retry-After': String(retryAfter),
  })
}

export function errorResponse(err: unknown, now = Date.now()): Response {
  if (isLimitError(err)) return dailyLimitResponse(now)
  return json(apiError('INTERNAL', 'Something went wrong on the relay.'), 500)
}
