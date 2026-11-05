// Plain-words messages for Replicate failures.
import { AppError } from '../../../lib/errors'

const SAFETY = /nsfw|flagged|sensitive|safety|content policy|moderat|violat|inappropriate/i

/** Seconds from "Expected available in 1 second" or "resets in ~30s", when the text has them. */
export function retryDelaySec(detail: string, headerSec?: number): number | undefined {
  if (headerSec !== undefined) return headerSec
  const m = /(\d+)\s*(?:s\b|sec)/i.exec(detail)
  return m ? Number(m[1]) : undefined
}

/** A failed HTTP call, put in plain words; the service's own text is kept for anything unusual. */
export function friendlyReplicateError(err: unknown): AppError {
  if (!(err instanceof AppError) || err.code !== 'PROVIDER') return err as AppError
  const details = err.details as { status?: number; retryAfterSec?: number } | undefined
  const status = details?.status
  const detail = err.message.replace(/^Replicate HTTP \d+( \(check the API key\))?:\s*/, '')
  if (status === 401)
    return new AppError('PROVIDER', 'Replicate rejected the API token. Check the token.', {
      status,
    })
  if (status === 402)
    return new AppError(
      'PROVIDER',
      `Replicate needs billing set up or more credit on the account: ${detail}`,
      { status },
    )
  if (status === 403)
    return new AppError('PROVIDER', `Replicate refused the request: ${detail}`, { status })
  if (status === 404)
    return new AppError('PROVIDER', 'Replicate does not have that model. Check the model name.', {
      status,
    })
  if (status === 429) {
    const sec = retryDelaySec(detail, details?.retryAfterSec)
    const when = sec !== undefined ? `Try again in about ${sec} seconds.` : 'Try again in a minute.'
    return new AppError('PROVIDER', `Replicate is rate limiting requests. ${when}`, { status })
  }
  if (status === 422 || status === 400)
    return new AppError('PROVIDER', `Replicate did not accept the request: ${detail}`, { status })
  return err
}

/** A prediction that ended as failed, in plain words (a safety refusal is called one). */
export function predictionFailed(kind: 'image' | 'video', error: unknown): AppError {
  const text = typeof error === 'string' && error.trim() ? error.trim().slice(0, 400) : ''
  if (SAFETY.test(text))
    return new AppError(
      'PROVIDER',
      `Replicate refused the content (its safety check flagged it): ${text}. Reword the description.`,
    )
  return new AppError('PROVIDER', `Replicate could not make the ${kind}${text ? `: ${text}` : ''}`)
}
