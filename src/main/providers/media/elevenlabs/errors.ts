// ElevenLabs errors in plain words. The service answers with { detail: { status, message } }
// (or a validation list on 422); the status string is more reliable than the HTTP code.
import { AppError } from '../../../lib/errors'

const has = (text: string, ...needles: RegExp[]): boolean => needles.some((n) => n.test(text))

export function friendlyElevenLabsError(err: unknown, what: string): Error {
  if (!(err instanceof AppError) || err.code !== 'PROVIDER') return err as Error
  const status = (err.details as { status?: number } | undefined)?.status
  const text = err.message
  const fail = (msg: string): AppError => new AppError('PROVIDER', msg, err.details)
  if (has(text, /quota_exceeded|insufficient|credits/i) || status === 402)
    return fail('Your ElevenLabs credits are used up. Add credits or wait for the monthly reset.')
  if (has(text, /voice_not_found|voice.*not found/i) || status === 404)
    return fail(`ElevenLabs does not know the voice chosen for ${what}. Pick another in Voices.`)
  if (has(text, /content_against_policy|moderation|violat|safety/i))
    return fail(`ElevenLabs refused ${what}: the text breaks its content rules.`)
  if (status === 429 || has(text, /too_many_concurrent|rate.?limit|system_busy/i))
    return fail('ElevenLabs is rate limiting requests. Wait a minute and try again.')
  if (status === 401 || has(text, /invalid_api_key|invalid api key/i))
    return fail('ElevenLabs rejected the API key. Check the key in Providers.')
  if (status === 403 || has(text, /pro tier|subscription|plan/i))
    return fail(
      'Your ElevenLabs plan does not allow this audio format. Set the sample rate to 24 kHz in the provider settings.',
    )
  return err
}
