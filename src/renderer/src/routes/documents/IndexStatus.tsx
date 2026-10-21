import { Link } from 'react-router'
import type { EmbeddingStatus } from '@shared/schemas/document'
import { Badge, ProgressBar } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import type { LiveProgress } from './job-progress'

const MODE_LABELS: Record<EmbeddingStatus['mode'], string> = {
  'local-onnx': 'local model',
  hash: 'keyword-hash fallback',
  provider: 'provider',
}

function describe(s: EmbeddingStatus): string {
  const base = `${s.model} (${MODE_LABELS[s.mode]}, ${s.dims} dims)`
  return s.message ? `${base}. ${s.message}` : base
}

/** Embedding model status plus live progress for an index rebuild. */
export function IndexStatus({ rebuild }: { rebuild: LiveProgress | undefined }) {
  const status = useIpcQuery('embeddings:status', undefined)
  return (
    <div className="index-status" aria-live="polite">
      <div className="index-status__line">
        <span className="index-status__label">Embeddings</span>
        {status.isPending && <span className="muted">Checking…</span>}
        {status.isError && <span className="muted">Status unavailable.</span>}
        {status.data && (
          <>
            <Badge tone={status.data.ready ? 'ok' : 'warn'}>
              {status.data.ready ? 'Ready' : 'Not ready'}
            </Badge>
            <span className="muted">{describe(status.data)}</span>
          </>
        )}
        <Link to="/settings" className="index-status__link">
          Embedding settings
        </Link>
      </div>
      {rebuild && (
        <div className="index-status__rebuild">
          <span>Rebuilding index: {rebuild.message || 'working'}</span>
          <ProgressBar value={rebuild.progress} label="Index rebuild progress" />
        </div>
      )}
    </div>
  )
}
