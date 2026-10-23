import { useState, type FormEvent } from 'react'
import { Lightbulb } from 'lucide-react'
import type { ScenarioIdea } from '@shared/schemas/scenario'
import type { DomainProfile } from '@shared/domains'
import { Button, Field, ProgressBar } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { GenerateError } from './GenerateError'
import { IdeaCard } from './IdeaCard'
import type { useJob } from './use-job'
import { useIdeasJob } from './use-ideas-job'
import { LiveStatus } from '../../components/LiveStatus'
import { CancelJobButton } from '../../components/CancelJobButton'

function FocusField(props: { value: string; onChange: (v: string) => void }) {
  return (
    <Field
      label="Focus (optional)"
      hint="Leave blank to let the model propose ideas from the project's plans."
    >
      {({ id, describedBy }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          className="textarea"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder="e.g. insider threat, baggage systems, severe weather plus a cyber twist"
        />
      )}
    </Field>
  )
}

function CountAndSubmit(props: { count: string; onCount: (v: string) => void; running: boolean }) {
  return (
    <div className="row ideas-form__actions">
      <Field label="How many">
        {({ id }) => (
          <input
            id={id}
            type="number"
            min={1}
            max={12}
            className="input ideas-form__count"
            value={props.count}
            onChange={(e) => props.onCount(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" disabled={props.running}>
        <Lightbulb size={16} aria-hidden /> {props.running ? 'Thinking…' : 'Give me ideas'}
      </Button>
    </div>
  )
}

function IdeasProgress(props: {
  job: NonNullable<ReturnType<typeof useJob>>
  jobId: string | null
}) {
  const { job } = props
  return (
    <div className="stack">
      <ProgressBar value={job.progress} label="Idea generation progress" />
      <div className="row">
        <span className="muted">{job.message}</span>
        <LiveStatus text={job.message} />
        {props.jobId && <CancelJobButton jobId={props.jobId} />}
      </div>
    </div>
  )
}

export function IdeasPanel(props: {
  projectPath: string
  onDevelop: (idea: ScenarioIdea) => void
  profile?: DomainProfile
}) {
  const { projectPath } = props
  const [focus, setFocus] = useState('')
  const [count, setCount] = useState('6')
  const { jobId, job, running, error, request } = useIdeasJob(projectPath)
  const ideas = useIpcQuery('generate:ideas-result', { projectPath })
  const start = (e: FormEvent) => {
    e.preventDefault()
    void request(focus, count)
  }

  const list = ideas.data ?? []
  return (
    <div className="stack">
      <form className="card ideas-form" onSubmit={start} aria-label="Idea request">
        <FocusField value={focus} onChange={setFocus} />
        <CountAndSubmit count={count} onCount={setCount} running={running} />
        {running && job && <IdeasProgress job={job} jobId={jobId} />}
        <GenerateError
          error={error}
          {...(error && error.code !== 'CANCELLED'
            ? { onRetry: () => void request(focus, count) }
            : {})}
        />
      </form>
      {list.length > 0 && (
        <ul className="grid-cards idea-grid" aria-label="Scenario ideas">
          {list.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onDevelop={() => props.onDevelop(idea)}
              {...(props.profile ? { profile: props.profile } : {})}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
