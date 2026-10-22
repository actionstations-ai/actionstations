// Ollama only: pull (download) a model by name as a background job, with byte progress.
import { useCallback, useId, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { JobDoneEvent } from '@shared/schemas/job'
import { Button, ProgressBar } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcMutation } from '../../lib/query'
import { useJob } from '../generate/use-job'
import { LiveStatus } from '../../components/LiveStatus'

const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/

function pullModelError(name: string): string | undefined {
  if (!name) return undefined
  return MODEL_NAME.test(name) ? undefined : 'Use an Ollama model name such as qwen3:4b'
}

function PullProgress(props: { jobId: string; model: string; onFinished: () => void }) {
  const qc = useQueryClient()
  const { model, onFinished } = props
  const onDone = useCallback(
    (e: JobDoneEvent) => {
      if (e.status === 'done') {
        toast.success(`Pulled ${model}`)
        void qc.invalidateQueries({ queryKey: ['providers:models'] })
      } else if (e.status === 'error') toast.error(`Could not pull ${model}`, e.error)
      onFinished()
    },
    [model, onFinished, qc],
  )
  const job = useJob(props.jobId, onDone)
  return (
    <div className="stack pull-model__progress">
      <ProgressBar value={job?.progress ?? 0} label={`Pulling ${model}`} />
      <LiveStatus text={`Pulling ${model}: ${job?.message ?? 'queued'}`} />
      <div className="row pull-model__status">
        <span className="muted mono">{job?.message ?? 'Queued'}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void call('jobs:cancel', { jobId: props.jobId })}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function PullModel({ providerId }: { providerId: string }) {
  const id = useId()
  const [name, setName] = useState('')
  const [running, setRunning] = useState<{ jobId: string; model: string } | null>(null)
  const pull = useIpcMutation('providers:pull-model')
  const error = pullModelError(name.trim())
  const finished = useCallback(() => setRunning(null), [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const model = name.trim()
    if (!model || error) return
    pull.mutate(
      { id: providerId, model },
      {
        onSuccess: ({ jobId }) => setRunning({ jobId, model }),
        onError: (err) => toast.error('Could not start the pull', err),
      },
    )
  }
  if (running)
    return <PullProgress jobId={running.jobId} model={running.model} onFinished={finished} />
  return (
    <form className="pull-model" onSubmit={submit} aria-label="Pull an Ollama model">
      <label className="field__label" htmlFor={`${id}-model`}>
        Pull a model
      </label>
      <div className="row pull-model__row">
        <input
          id={`${id}-model`}
          className="input mono"
          value={name}
          placeholder="qwen3:4b"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={!name.trim() || !!error || pull.isPending}>
          Pull
        </Button>
      </div>
      {error && (
        <span id={`${id}-err`} className="field__error">
          {error}
        </span>
      )}
    </form>
  )
}
