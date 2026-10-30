/**
 * What a caller sees when something inside the relay throws. On the free plan Cloudflare fails
 * an operation past a daily limit with an error, and nothing is billed (spec 0408 FR-4): that
 * becomes `503 DAILY_LIMIT` with a `Retry-After` at the next UTC midnight. Anything else is a
 * `500 INTERNAL` with no detail, so no internal message reaches a client.
 */
import { API_HEADERS, apiError } from '@actionstations/relay-core'
import { nextUtcMidnight } from './env'

export const DAILY_LIMIT_MESSAGE =
  'The Action Stations relay has reached today’s limit. Switch this session to This computer or Your server, or try after 00:00 UTC.'

/**
 * The runtime's own wording for a plan limit: an "exceeded"/"reached" with a "limit" or "quota"
 * in a plain `Error` (never a TypeError or RangeError, which are bugs). Developers' docs for
 * Durable Objects limits and Workers limits use these words; a programming error does not.
 */
const LIMIT_WORDS =
  /\b(limit|quota)\b.*\b(exceeded|reached)\b|\b(exceeded|exceeds)\b.*\b(limit|quota)\b/i

export function isLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err instanceof TypeError || err instanceof RangeError || err instanceof SyntaxError)
    return false
  return LIMIT_WORDS.test(err.message)
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
