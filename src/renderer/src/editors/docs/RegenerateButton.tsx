// "Regenerate" for one document or structured part: re-runs the owning stage with optional
// instructions, warns before overwriting user edits (keeping a history snapshot first) and
// shows the job's progress inline.
import { RefreshCw } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import type { Stage } from '@shared/schemas/scenario'
import { Button, Dialog, ProgressBar } from '../../components/ui'
import { call, subscribe } from '../../lib/api'
import { isConflict } from './use-guarded-save'

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
        else setRun({ phase: 'error', message: e.error ?? `Generation ${e.status}.` })
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [jobId, setRun])
}

export function RegenerateButton(props: RegenerateProps) {
  const [open, setOpen] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [keep, setKeep] = useState(true)
  const [run, setRun] = useState<Run>({ phase: 'idle' })
  const ids = useId()
  useJobRun(run, setRun)
  const running = run.phase === 'running'

  async function start() {
    setOpen(false)
    if (keep && props.hasContent && !(await props.snapshot())) {
      setRun({ phase: 'error', message: 'Could not keep a snapshot, so nothing was regenerated.' })
      return
    }
    try {
      const { jobId } = await call('generate:rerun-stage', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        stage: props.stage,
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
      })
      setRun({ phase: 'running', jobId, progress: 0, message: 'Starting…' })
      props.onJob?.(jobId)
    } catch (e) {
      const message = isConflict(e)
        ? 'Generation is already running for this scenario. Try again when it finishes.'
        : `Could not start: ${(e as Error).message}`
      setRun({ phase: 'error', message })
    }
  }

  return (
    <div className="regen">
      <Button size="sm" onClick={() => setOpen(true)} disabled={running}>
        <RefreshCw size={14} aria-hidden /> Regenerate {props.label}
      </Button>
      {running && (
        <div className="regen__progress">
          <ProgressBar value={run.progress} label={`Regenerating ${props.label}`} />
          <span className="muted" role="status">
            {run.message}
          </span>
        </div>
      )}
      {run.phase === 'done' && (
        <span className="muted" role="status">
          {run.message}
        </span>
      )}
      {run.phase === 'error' && (
        <span className="field__error" role="alert">
          {run.message}
        </span>
      )}
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
            <Button variant="primary" onClick={() => void start()}>
              Regenerate
            </Button>
          </>
        }
      >
        <div className="stack">
          {props.hasContent && props.edited && (
            <p className="editor-banner editor-banner--warn" role="alert">
              You have edited the {props.label} since it was generated. Regenerating overwrites
              those edits.
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
              value={instructions}
              placeholder="e.g. Shorter, and add a hard question for the FBI liaison"
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
          {props.hasContent && (
            <label className="check">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              Keep a history snapshot of the current version first
            </label>
          )}
        </div>
      </Dialog>
    </div>
  )
}
