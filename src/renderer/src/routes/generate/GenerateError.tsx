import { Link } from 'react-router'
import { isProviderError } from './brief-form'

/** Inline error; provider/routing problems link to the Providers screen. */
export function GenerateError({ error }: { error: { code?: string; message: string } | null }) {
  if (!error) return null
  const provider = isProviderError(error)
  const unavailable = error.code === 'NOT_IMPLEMENTED'
  return (
    <div className="generate-error" role="alert">
      <p>
        <strong>
          {provider
            ? 'No text model is set up for generation.'
            : unavailable
              ? 'Generation is not available in this build yet.'
              : 'Generation could not start.'}
        </strong>{' '}
        {error.message}
      </p>
      {provider && (
        <p>
          <Link to="/providers">Set up a provider</Link> and route the generation stages to it, then
          try again.
        </p>
      )}
    </div>
  )
}
