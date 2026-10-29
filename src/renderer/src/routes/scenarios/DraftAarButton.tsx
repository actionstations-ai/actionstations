// "Draft AAR/IP" (#419, FR-9): a dialog with optional instructions and, when live play ran,
// the session to read, then the draft-aar job with its progress. On the Facilitate screen it
// opens the AAR page when the job is done; on the AAR page it reloads the draft. A re-draft
// replaces the model-written text and keeps confirmed ratings, locked rows and typed owners.
import { FileText } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Dialog, ProgressBar } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { trackJob } from '../../state/jobs'
import { useTrackedJob } from '../../state/use-jobs'
import { isConflict } from '../../editors/docs/conflict'
import { useLatest } from '../../editors/docs/use-latest'
import { projectKey } from '../../state/project'
import { TranscriptCloudWarning } from './TranscriptCloudWarning'

type Run =
  | { phase: 'idle' }
  | { phase: 'running'; jobId: string }
  | { phase: 'done' }
  | { phase: 'error'; message: string }

export interface DraftAarProps {
  projectPath: string
  scenarioId: string
  /** The record has something to draft from (a note, item, decision or delivered row). */
  hasEvidence: boolean
  /** A draft exists already: the button reads Re-draft and the dialog warns. */
  hasDraft: boolean
  /** What to do when the job finishes; the default opens the AAR page. */
  onDone?: (() => void) | undefined
  variant?: 'default' | 'primary'
}

function SessionPicker(props: {
  sessions: { id: string; startedAt?: string | undefined; endedAt?: string | undefined }[]
  value: string
  onChange: (id: string) => void
}) {
  const id = useId()
  if (!props.sessions.length) return null
  const label = (s: (typeof props.sessions)[number]) => {
    const when = s.startedAt ? new Date(s.startedAt).toLocaleString() : s.id
    return `${when}${s.endedAt ? '' : ' (not ended)'}`
  }
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        Live session to read
      </label>
      <select
        id={id}
        className="select"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {label(s)}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Follow the job to its end; report done (once) or the error. */
function useDraftRun(run: Run, setRun: (r: Run) => void, onDone: () => void) {
  const job = useTrackedJob(run.phase === 'running' ? run.jobId : null)
  const doneRef = useLatest(onDone)
  const fired = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (run.phase !== 'running' || !job || fired.current === job.id) return
    if (job.status === 'done') {
      fired.current = job.id
      setRun({ phase: 'done' })
      doneRef.current()
    } else if (job.status === 'error' || job.status === 'cancelled') {
      fired.current = job.id
      setRun({ phase: 'error', message: job.error ?? `The draft was ${job.status}.` })
    }
  }, [job, run, setRun, doneRef])
  return job
}

export function DraftAarButton(props: DraftAarProps) {
  const { projectPath, scenarioId } = props
  const navigate = useNavigate()
  const ids = useId()
  const [open, setOpen] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [run, setRun] = useState<Run>({ phase: 'idle' })
  const sessions = useIpcQuery('aar:sessions', { projectPath, scenarioId }, { enabled: open })
  const list = sessions.data ?? []
  const chosen = sessionId || list[0]?.id || ''
  const onDone =
    props.onDone ?? (() => navigate(`/p/${projectKey(projectPath)}/scenarios/${scenarioId}/aar`))
  const job = useDraftRun(run, setRun, onDone)

  const start = async () => {
    setOpen(false)
    try {
      const { jobId } = await call('aar:draft', {
        projectPath,
        scenarioId,
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ...(chosen ? { sessionId: chosen } : {}),
      })
      trackJob(jobId, { kind: 'draft-aar', projectPath, scenarioId })
      setRun({ phase: 'running', jobId })
    } catch (e) {
      const message = isConflict(e)
        ? 'A generation job is already running for this scenario. Try again when it finishes.'
        : `Could not start the draft: ${errorText(e)}`
      setRun({ phase: 'error', message })
    }
  }

  const label = props.hasDraft ? 'Re-draft AAR/IP' : 'Draft AAR/IP'
  const running = run.phase === 'running'
  return (
    <div className="draft-aar">
      <Button
        variant={props.variant ?? 'default'}
        disabled={!props.hasEvidence || running}
        title={
          props.hasEvidence
            ? undefined
            : 'Deliver an inject, write a note, capture a hot wash item or log a decision first'
        }
        onClick={() => setOpen(true)}
      >
        <FileText size={16} aria-hidden /> {label}
      </Button>
      {running && (
        <div className="draft-aar__progress">
          <ProgressBar value={job?.progress ?? 0} label="Drafting the AAR/IP" />
          <span className="muted" role="status">
            {job?.message || 'Starting…'}
          </span>
        </div>
      )}
      {run.phase === 'error' && (
        <span className="field__error" role="alert">
          {run.message}
        </span>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={props.hasDraft ? 'Re-draft the AAR/IP?' : 'Draft the AAR/IP'}
        description="The draft is built from the facilitator notes, hot wash items, decisions, evaluator observations, the live-play log and survey results of this exercise. The model proposes; nothing prints as final until a person confirms it."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void start()}>
              {props.hasDraft ? 'Re-draft' : 'Draft'}
            </Button>
          </>
        }
      >
        <div className="stack">
          {props.hasDraft && (
            <p className="editor-banner editor-banner--warn" role="alert">
              Re-drafting replaces the model-written text. Confirmed ratings, locked findings and
              actions, and the organizations, contacts and dates you typed are kept.
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
              placeholder="e.g. Focus on the Go Dark decision and the airline hand-offs"
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
          <TranscriptCloudWarning projectPath={projectPath} scenarioId={scenarioId} />
          <SessionPicker sessions={list} value={chosen} onChange={setSessionId} />
        </div>
      </Dialog>
    </div>
  )
}
