// "Regenerate" for one document or structured part: re-runs the owning stage with optional
// instructions, warns before overwriting user edits (keeping a history snapshot first) and
// shows the job's progress inline.
import { RefreshCw } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { Stage } from '@shared/schemas/scenario'
import { Button, Dialog, ProgressBar } from '../../components/ui'
import { call, subscribe } from '../../lib/api'
import { isConflict } from './conflict'
import { errorText } from '../../lib/errors'

type Run =
  | { phase: 'idle' }
  | { phase: 'running'; jobId: string; progress: number; message: string }
  | { phase: 'done'; message: string }
  | { phase: 'error'; message: string }

export interface RegenerateProps {
  projectPath: string
  scenarioId: string
  stage: Stage
  /** Lower-case noun for messages: "controller handbook", "rubric". */
  label: string
  hasContent: boolean
  /** The user changed this part since it was last generated (or has unsaved edits). */
  edited: boolean
  /** Save the current version so it lands in history; resolves false when it could not. */
  snapshot: () => Promise<boolean>
  onJob?: ((jobId: string) => void) | undefined
}

function useJobRun(run: Run, setRun: (r: Run) => void) {
  const jobId = run.phase === 'running' ? run.jobId : null
  useEffect(() => {
    if (!jobId) return
    const offs = [
      subscribe('job:progress', (e) => {
        if (e.jobId === jobId)
          setRun({ phase: 'running', jobId, progress: e.progress, message: e.message })
      }),
      subscribe('job:done', (e) => {
        if (e.jobId !== jobId) return
        if (e.status === 'done') setRun({ phase: 'done', message: 'Regenerated.' })
        else setRun({ phase: 'error', message: errorText(e.error ?? `Generation ${e.status}.`) })
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [jobId, setRun])
}

/** Snapshot first when asked (and there is content), then start the stage re-run. */
async function startRerun(
  props: RegenerateProps,
  opts: { instructions: string; keep: boolean },
  setRun: (r: Run) => void,
) {
  if (opts.keep && props.hasContent && !(await props.snapshot())) {
    setRun({ phase: 'error', message: 'Could not keep a snapshot, so nothing was regenerated.' })
    return
  }
  try {
    const { jobId } = await call('generate:rerun-stage', {
      projectPath: props.projectPath,
      scenarioId: props.scenarioId,
      stage: props.stage,
      ...(opts.instructions.trim() ? { instructions: opts.instructions.trim() } : {}),
    })
    setRun({ phase: 'running', jobId, progress: 0, message: 'Starting…' })
    props.onJob?.(jobId)
  } catch (e) {
    const message = isConflict(e)
      ? 'Generation is already running for this scenario. Try again when it finishes.'
      : `Could not start: ${errorText(e)}`
    setRun({ phase: 'error', message })
  }
}

function RunStatus(props: { run: Run; label: string }) {
  const { run } = props
  if (run.phase === 'running')
    return (
      <div className="regen__progress">
        <ProgressBar value={run.progress} label={`Regenerating ${props.label}`} />
        <span className="muted" role="status">
          {run.message}
        </span>
      </div>
    )
  if (run.phase === 'done')
    return (
      <span className="muted" role="status">
        {run.message}
      </span>
    )
  if (run.phase === 'error')
    return (
      <span className="field__error" role="alert">
        {run.message}
      </span>
    )
  return null
}

function RegenerateOptions(props: {
  label: string
  hasContent: boolean
  edited: boolean
  instructions: string
  onInstructions: (text: string) => void
  keep: boolean
  onKeep: (keep: boolean) => void
}) {
  const ids = useId()
  return (
    <div className="stack">
      {props.hasContent && props.edited && (
        <p className="editor-banner editor-banner--warn" role="alert">
          You have edited the {props.label} since it was generated. Regenerating overwrites those
          edits.
        </p>
      )}
      <div className="field">
        <label className="field__label" htmlFor={`${ids}-instr`}>
          Instructions (optional)
        </label>
        <textarea
          id={`${ids}-instr`}
          className="textarea"
          rows={3}
          value={props.instructions}
          placeholder="e.g. Shorter, and add a hard question for the FBI liaison"
          onChange={(e) => props.onInstructions(e.target.value)}
        />
      </div>
      {props.hasContent && (
        <label className="check">
          <input
            type="checkbox"
            checked={props.keep}
            onChange={(e) => props.onKeep(e.target.checked)}
          />
          Keep a history snapshot of the current version first
        </label>
      )}
    </div>
  )
}

export function RegenerateButton(props: RegenerateProps) {
  const [open, setOpen] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [keep, setKeep] = useState(true)
  const [run, setRun] = useState<Run>({ phase: 'idle' })
  useJobRun(run, setRun)

  const start = () => {
    setOpen(false)
    void startRerun(props, { instructions, keep }, setRun)
  }

  return (
    <div className="regen">
      <Button size="sm" onClick={() => setOpen(true)} disabled={run.phase === 'running'}>
        <RefreshCw size={14} aria-hidden /> Regenerate {props.label}
      </Button>
      <RunStatus run={run} label={props.label} />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Regenerate the ${props.label}?`}
        description={
          props.hasContent
            ? `This replaces the current ${props.label} with a new version from the model.`
            : `The model writes the ${props.label} from the scenario so far.`
        }
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={start}>
              Regenerate
            </Button>
          </>
        }
      >
        <RegenerateOptions
          label={props.label}
          hasContent={props.hasContent}
          edited={props.edited}
          instructions={instructions}
          onInstructions={setInstructions}
          keep={keep}
          onKeep={setKeep}
        />
      </Dialog>
    </div>
  )
}
