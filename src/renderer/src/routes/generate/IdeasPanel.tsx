import { useState, type FormEvent } from 'react'
import { Lightbulb } from 'lucide-react'
import type { ScenarioIdea } from '@shared/schemas/scenario'
import { Button, Field, ProgressBar } from '../../components/ui'
import { call, type IpcError } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { GenerateError } from './GenerateError'
import { IdeaCard } from './IdeaCard'
import { useJob } from './use-job'
import { LiveStatus } from '../../components/LiveStatus'

type ErrorLike = { code?: string; message: string }

export function IdeasPanel(props: {
  projectPath: string
  onDevelop: (idea: ScenarioIdea) => void
}) {
  const { projectPath } = props
  const [focus, setFocus] = useState('')
  const [count, setCount] = useState('6')
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<ErrorLike | null>(null)
  const ideas = useIpcQuery('generate:ideas-result', { projectPath })
  const job = useJob(jobId, (e) => {
    if (e.status === 'error') setError({ message: e.error ?? 'Idea generation failed' })
    if (e.status === 'cancelled')
      setError({ code: 'CANCELLED', message: 'Idea generation was cancelled' })
    void queryClient.invalidateQueries({ queryKey: ['generate:ideas-result'] })
  })
  const running = job?.status === 'queued' || job?.status === 'running'

  const cancel = () =>
    jobId && void call('jobs:cancel', { jobId }).catch((err: unknown) => setError(err as IpcError))

  const request = async () => {
    setError(null)
    try {
      const n = Math.min(12, Math.max(1, Math.round(Number(count)) || 6))
      const { jobId: id } = await call('generate:ideas', {
        projectPath,
        brief: focus.trim() ? { userPrompt: focus.trim() } : {},
        count: n,
      })
      setJobId(id)
    } catch (err) {
      setError(err as IpcError)
    }
  }
  const start = (e: FormEvent) => {
    e.preventDefault()
    void request()
  }

  const list = ideas.data ?? []
  return (
    <div className="stack">
      <form className="card ideas-form" onSubmit={start} aria-label="Idea request">
        <Field
          label="Focus (optional)"
          hint="Leave blank to let the model propose ideas from the project's plans."
        >
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              className="textarea"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. insider threat, baggage systems, severe weather plus a cyber twist"
            />
          )}
        </Field>
        <div className="row ideas-form__actions">
          <Field label="How many">
            {({ id }) => (
              <input
                id={id}
                type="number"
                min={1}
                max={12}
                className="input ideas-form__count"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="primary" disabled={running}>
            <Lightbulb size={16} aria-hidden /> {running ? 'Thinking…' : 'Give me ideas'}
          </Button>
        </div>
        {running && job && (
          <div className="stack">
            <ProgressBar value={job.progress} label="Idea generation progress" />
            <div className="row">
              <span className="muted">{job.message}</span>
              <LiveStatus text={job.message} />
              <Button size="sm" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <GenerateError
          error={error}
          {...(error && error.code !== 'CANCELLED' ? { onRetry: () => void request() } : {})}
        />
      </form>
      {list.length > 0 && (
        <ul className="grid-cards idea-grid" aria-label="Scenario ideas">
          {list.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onDevelop={() => props.onDevelop(idea)} />
          ))}
        </ul>
      )}
    </div>
  )
}
