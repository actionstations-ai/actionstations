import { RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '../../components/ui'
import { describeError, type UserError } from '../../lib/errors'
import { isProviderError } from './brief-form'

type ErrorLike = { code?: string; message: string }

/** Heading for the failure: which part of generation broke, not a guess at the text model. */
function headline(error: ErrorLike, d: UserError): string {
  if (d.task === 'Embeddings') return 'Document search failed, so generation stopped.'
  if (d.source) return `${d.source} failed.`
  if (error.code === 'NOT_IMPLEMENTED') return 'Generation is not available in this build yet.'
  if (isProviderError(error)) return 'No text model is set up for generation.'
  return 'Generation could not start.'
}

/**
 * Inline error for starting or running generation. Provider and routing problems link to the
 * Providers screen (and, for document search, to the Embeddings setting); jobs can be retried.
 */
export function GenerateError(props: { error: ErrorLike | null; onRetry?: () => void }) {
  const { error } = props
  if (!error) return null
  const described = describeError(error)
  const toProviders = described.action?.to === '/providers' || isProviderError(error)
  return (
    <div className="generate-error" role="alert">
      <p>
        <strong>{headline(error, described)}</strong> {described.detail ?? described.message}
      </p>
      {(toProviders || described.task === 'Embeddings' || props.onRetry) && (
        <p className="row">
          {toProviders && <Link to="/providers">Set up a provider</Link>}
          {described.task === 'Embeddings' && <Link to="/settings">Embedding settings</Link>}
          {props.onRetry && (
            <Button size="sm" onClick={props.onRetry}>
              <RotateCcw size={14} aria-hidden /> Retry
            </Button>
          )}
        </p>
      )}
    </div>
  )
}
