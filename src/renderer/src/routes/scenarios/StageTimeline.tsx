import { useState } from 'react'
import { RotateCcw, Play } from 'lucide-react'
import type { StageRun } from '@shared/schemas/scenario'
import { Badge, Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { latestRuns, runDuration, runTokens, stageLabel } from './stages'

const STATUS_TONE = {
  ok: 'ok',
  error: 'error',
  stale: 'warn',
  running: 'info',
  skipped: 'neutral',
} as const

interface Props {
  projectPath: string
  scenarioId: string
  provenance: StageRun[]
  busy: boolean
  onJob: (jobId: string) => void
}

function RerunDialog(props: {
  run: StageRun | null
  onCancel: () => void
  onConfirm: (instructions: string) => void
}) {
  const [instructions, setInstructions] = useState('')
  const run = props.run
  const name = run ? stageLabel(run.stage) + (run.itemId ? ` · ${run.itemId}` : '') : ''
  return (
    <Dialog
      open={!!run}
      onOpenChange={(open) => !open && props.onCancel()}
      title={`Re-run ${name}?`}
      description="Later stages that depend on this one are marked stale. Locked rows are kept."
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => props.onConfirm(instructions)}>
            Re-run
          </Button>
        </>
      }
    >
      <Field label="Extra instructions (optional)" hint="Added to the prompt for this run only.">
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Make the red herring more plausible; cite ASP §6.4"
          />
        )}
      </Field>
    </Dialog>
  )
}

function useStageActions(props: Props) {
  const { projectPath, scenarioId, onJob } = props
  const start = async (what: string, fn: () => Promise<{ jobId: string }>) => {
    try {
      onJob((await fn()).jobId)
    } catch (e) {
      toast.error(`Could not ${what}`, (e as Error).message)
    }
  }
  return {
    rerun: (run: StageRun, instructions: string) =>
      start('re-run the stage', () =>
        call('generate:rerun-stage', {
          projectPath,
          scenarioId,
          stage: run.stage,
          ...(run.itemId ? { itemId: run.itemId } : {}),
          ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        }),
      ),
    resume: () =>
      start('continue generation', () => call('generate:continue', { projectPath, scenarioId })),
  }
}

export function StageTimeline(props: Props) {
  const runs = latestRuns(props.provenance)
  const [pending, setPending] = useState<StageRun | null>(null)
  const actions = useStageActions(props)
  const failed = runs.some((r) => r.status === 'error' || r.status === 'stale')
  return (
    <section className="card timeline" aria-label="Generation stages">
      <div className="row timeline__head">
        <h2 className="section-title">Stages</h2>
        {failed && (
          <Button size="sm" variant="primary" disabled={props.busy} onClick={actions.resume}>
            <Play size={14} aria-hidden /> Continue from failure
          </Button>
        )}
      </div>
      {runs.length === 0 ? (
        <p className="muted">No stages have run for this scenario.</p>
      ) : (
        <ol className="timeline__list">
          {runs.map((run) => (
            <li key={`${run.stage}:${run.itemId ?? ''}`} className="timeline__item">
              <div className="timeline__name">
                <span>{stageLabel(run.stage)}</span>
                {run.itemId && <span className="mono muted">{run.itemId}</span>}
              </div>
              <Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge>
              <span className="muted timeline__meta">
                {run.model ?? '—'} · {runTokens(run)} · {runDuration(run)}
              </span>
              {run.error && <span className="field__error timeline__error">{run.error}</span>}
              <Button
                size="sm"
                variant="ghost"
                disabled={props.busy}
                aria-label={`Re-run ${stageLabel(run.stage)}${run.itemId ? ` ${run.itemId}` : ''}`}
                onClick={() => setPending(run)}
              >
                <RotateCcw size={14} aria-hidden /> Re-run
              </Button>
            </li>
          ))}
        </ol>
      )}
      <RerunDialog
        key={pending ? `${pending.stage}:${pending.itemId ?? ''}` : 'none'}
        run={pending}
        onCancel={() => setPending(null)}
        onConfirm={(text) => {
          const run = pending
          setPending(null)
          if (run) void actions.rerun(run, text)
        }}
      />
    </section>
  )
}
