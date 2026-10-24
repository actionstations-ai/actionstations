// Recommended models for this machine (ADR-0021, #334): each is its own opt-in download with
// its size, pulled through the tool's own mechanism as a job with progress and Cancel.
import type { RecommendedModel, ToolView } from '@shared/schemas/setup'
import { errorText } from '../../lib/errors'
import { isRunning } from '../../state/jobs'
import { CancelJobButton } from '../CancelJobButton'
import { Badge, Button, ProgressBar } from '../ui'
import { formatSize, modelKey, startPull, useKeyedJob } from './use-local-tools'

const ROLE_LABEL: Record<RecommendedModel['role'], string> = {
  text: 'Text model',
  embedding: 'Embedding model',
  image: 'Image model',
  video: 'Video model',
}

function ModelRow(props: { model: RecommendedModel; tool: ToolView }) {
  const m = props.model
  const job = useKeyedJob('model-pull', modelKey(m.id))
  const pulling = isRunning(job)
  const blocked = m.needsRunning && props.tool.state !== 'running'
  const size = `${m.approximate ? 'about ' : ''}${formatSize(m.sizeBytes)}`
  return (
    <li className="lt-model">
      <div className="lt-model__text">
        <span>
          <strong>{ROLE_LABEL[m.role]}:</strong> <span className="mono">{m.name}</span>
        </span>
        <span className="muted">
          {size} · {m.license}
          {m.note ? ` · ${m.note}` : ''}
        </span>
        {pulling && job && (
          <div className="stack lt-progress" aria-live="polite">
            <ProgressBar value={job.progress} label={`Downloading ${m.name}`} />
            <span className="muted">{job.message}</span>
          </div>
        )}
        {job?.status === 'error' && (
          <p className="field__error" role="alert">
            {errorText(job.error ?? 'The download failed.')}
          </p>
        )}
        {blocked && !m.installed && (
          <span className="muted">Start {props.tool.name} to download this model.</span>
        )}
      </div>
      {m.installed || job?.status === 'done' ? (
        <Badge tone="ok">Installed</Badge>
      ) : pulling && job ? (
        <CancelJobButton jobId={job.id} ariaLabel={`Cancel downloading ${m.name}`} />
      ) : (
        <Button
          size="sm"
          disabled={blocked}
          aria-label={`Download ${m.name} (${size})`}
          onClick={() => void startPull(m.id)}
        >
          Download ({size})
        </Button>
      )}
    </li>
  )
}

export function ModelList(props: { models: RecommendedModel[]; tools: ToolView[] }) {
  const rows = props.models
    .map((m) => ({ m, tool: props.tools.find((t) => t.id === m.tool) }))
    .filter(
      (r): r is { m: RecommendedModel; tool: ToolView } => !!r.tool && r.tool.state !== 'missing',
    )
  if (!rows.length)
    return <p className="muted">Models are offered here once a local tool is installed.</p>
  return (
    <ul className="lt-models" aria-label="Recommended models">
      {rows.map(({ m, tool }) => (
        <ModelRow key={m.id} model={m} tool={tool} />
      ))}
    </ul>
  )
}
