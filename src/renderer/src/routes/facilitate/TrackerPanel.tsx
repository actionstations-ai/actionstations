// The Tracker tab (spec 0428 FR-13..17): injects nobody answered, promises that came due, and
// promises the notes seem to contain. Everything here is the facilitator's call: the tracker
// lists, it never sends anything to players.
import { useId, useState, type FormEvent } from 'react'
import type { FacilitatorState } from '@shared/ipc'
import {
  acceptSuggestion,
  addCommitment,
  closeCommitment,
  dismissFlag,
  dismissSuggestion,
  markAnswered,
  type Flag,
} from '@shared/facilitator/tracker'
import { teamNames } from '@shared/facilitator/recipients'
import { formatExerciseTime } from '@shared/schemas/common'
import type { Scenario } from '@shared/schemas/scenario'
import { Badge, Button, Dialog } from '../../components/ui'
import type { UpdateState } from './use-delivery-actions'
import { answerStamp, nudgeText, parseDue } from './use-tracker'

export interface TrackerPanelProps {
  scenario: Scenario
  state: FacilitatorState
  update: UpdateState
  flags: Flag[]
  minutes: number
  onGoToRow: (rowId: string) => void
  onAnnounce: (text: string) => void
  onAddCommitment: () => void
  /** Set while a live session runs: send a line to evaluator devices (never to players). */
  onNotifyEvaluators?: ((text: string, rowId: string) => Promise<void>) | undefined
}

function AnswerForm(props: { onSubmit: (by: string, note: string) => void; onCancel: () => void }) {
  const [by, setBy] = useState('')
  const [note, setNote] = useState('')
  const id = useId()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    props.onSubmit(by.trim(), note.trim())
  }
  return (
    <form className="fac-tracker__form" onSubmit={submit} aria-label="Mark answered">
      <label className="field__label" htmlFor={`${id}-by`}>
        Answered by (optional)
      </label>
      <input
        id={`${id}-by`}
        className="input"
        value={by}
        maxLength={120}
        onChange={(e) => setBy(e.target.value)}
      />
      <label className="field__label" htmlFor={`${id}-note`}>
        One line on the answer (optional)
      </label>
      <input
        id={`${id}-note`}
        className="input"
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="row">
        <Button type="submit" variant="primary" size="sm">
          Mark answered
        </Button>
        <Button size="sm" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function RowFlag(props: TrackerPanelProps & { flag: Flag }) {
  const { flag, update, minutes } = props
  const [mode, setMode] = useState<'idle' | 'answer' | 'prompt'>('idle')
  const rowId = flag.rowId!
  return (
    <li className="fac-tracker__item" data-level={flag.level}>
      <p>
        <Badge tone={flag.level === 'warn' ? 'warn' : 'info'}>
          {flag.level === 'warn' ? 'Needs attention' : 'Note'}
        </Badge>{' '}
        {flag.text}
      </p>
      <div className="row">
        <Button
          size="sm"
          onClick={() => setMode(mode === 'prompt' ? 'idle' : 'prompt')}
          aria-expanded={mode === 'prompt'}
        >
          Prompt the table
        </Button>
        <Button size="sm" onClick={() => setMode('answer')}>
          Mark answered
        </Button>
        <Button
          size="sm"
          onClick={() => update((s) => dismissFlag(s, flag.id, new Date().toISOString()))}
        >
          Dismiss
        </Button>
        <Button size="sm" variant="ghost" onClick={() => props.onGoToRow(rowId)}>
          Go to {rowId}
        </Button>
      </div>
      {mode === 'prompt' && (
        <p className="fac-tracker__nudge" role="note">
          Say: “{nudgeText(flag, props.scenario)}”
        </p>
      )}
      {mode === 'prompt' && props.onNotifyEvaluators && (
        <Button
          size="sm"
          onClick={() =>
            void props.onNotifyEvaluators!(nudgeText(flag, props.scenario), rowId)
              .then(() => props.onAnnounce('Sent to evaluator devices'))
              .catch(() => props.onAnnounce('Could not send to evaluator devices'))
          }
        >
          Send to evaluator devices
        </Button>
      )}
      {mode === 'answer' && (
        <AnswerForm
          onCancel={() => setMode('idle')}
          onSubmit={(by, note) => {
            const stamp = answerStamp(minutes)
            const at = { iso: stamp.iso, exerciseMin: stamp.exerciseMin }
            update((s) => markAnswered(s, rowId, at, { note, ...(by ? { by } : {}) }))
            props.onAnnounce(`${rowId} marked answered`)
            setMode('idle')
          }}
        />
      )}
    </li>
  )
}

function CommitmentFlag(props: TrackerPanelProps & { flag: Flag }) {
  const { flag, update, minutes } = props
  const id = flag.commitmentId!
  const close = (status: 'kept' | 'missed' | 'dropped') => {
    update((s) => closeCommitment(s, id, status, Math.floor(minutes)))
    props.onAnnounce(`Commitment marked ${status}`)
  }
  return (
    <li className="fac-tracker__item" data-level={flag.level}>
      <p>
        <Badge tone={flag.level === 'warn' ? 'warn' : 'info'}>
          {flag.level === 'warn' ? 'Due' : 'Note'}
        </Badge>{' '}
        {flag.text}
      </p>
      <div className="row">
        <Button size="sm" onClick={() => close('kept')}>
          Kept
        </Button>
        <Button size="sm" onClick={() => close('missed')}>
          Missed
        </Button>
        <Button
          size="sm"
          onClick={() => update((s) => dismissFlag(s, flag.id, new Date().toISOString()))}
        >
          Dismiss
        </Button>
      </div>
    </li>
  )
}

function Suggestions(props: TrackerPanelProps) {
  const list = props.state.tracker?.suggestions ?? []
  if (list.length === 0) return null
  return (
    <section aria-label="Suggested commitments">
      <h3 className="fac-panel__subtitle">Suggestions ({list.length})</h3>
      <p className="muted">Found in your notes. Nothing is added until you accept it.</p>
      <ul className="fac-tracker__list">
        {list.map((s) => (
          <li key={s.id} className="fac-tracker__item">
            <p>
              “{s.text}”{s.rowId ? ` (note on ${s.rowId})` : ''}
              {s.dueAtMin !== undefined ? `, due ${formatExerciseTime(s.dueAtMin)}` : ''}
            </p>
            <div className="row">
              <Button
                size="sm"
                onClick={() =>
                  props.update((st) => acceptSuggestion(st, s.id, Math.floor(props.minutes)))
                }
                aria-label={`Add commitment: ${s.text}`}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  props.update((st) => dismissSuggestion(st, s.id, new Date().toISOString()))
                }
                aria-label={`Dismiss suggestion: ${s.text}`}
              >
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Commitments(props: TrackerPanelProps) {
  const closed = (props.state.tracker?.commitments ?? []).filter((c) => c.status !== 'open')
  if (closed.length === 0) return null
  return (
    <section aria-label="Closed commitments">
      <h3 className="fac-panel__subtitle">Closed commitments</h3>
      <ul className="fac-tracker__list">
        {closed.map((c) => (
          <li key={c.id} className="fac-tracker__item">
            <span>
              “{c.text}” {c.owner && `· ${c.owner} `}· {c.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function TrackerPanel(props: TrackerPanelProps) {
  const warn = props.flags.filter((f) => f.level === 'warn').length
  return (
    <div className="fac-tracker">
      <div className="row fac-tracker__head">
        <h2 className="fac-panel__title">Tracker ({warn} open)</h2>
        <Button size="sm" onClick={props.onAddCommitment} aria-keyshortcuts="C">
          Add a commitment
        </Button>
      </div>
      {props.flags.length === 0 ? (
        <p className="muted">
          Nothing is waiting. Injects that expect an answer show here when nobody has answered them
          in time, and so do promises that come due.
        </p>
      ) : (
        <ul className="fac-tracker__list" aria-label="Open items">
          {props.flags.map((f) =>
            f.commitmentId ? (
              <CommitmentFlag key={f.id} {...props} flag={f} />
            ) : (
              <RowFlag key={f.id} {...props} flag={f} />
            ),
          )}
        </ul>
      )}
      <Suggestions {...props} />
      <Commitments {...props} />
    </div>
  )
}

/** Add a promise by hand (spec 0428 FR-15), opened from the `C` shortcut or the Tracker tab. */
export function CommitmentDialog(props: {
  open: boolean
  scenario: Scenario
  minutes: number
  rowId: string | undefined
  update: UpdateState
  onClose: () => void
  onAnnounce: (text: string) => void
}) {
  const [text, setText] = useState('')
  const [owner, setOwner] = useState('')
  const [due, setDue] = useState('')
  const [error, setError] = useState<string>()
  const id = useId()
  const owners = [
    ...props.scenario.roles.map((r) => r.abbreviation || r.name),
    ...teamNames(props.scenario.roles).map((t) => `${t} team`),
  ]
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return setError('Write what was promised.')
    const dueAtMin = parseDue(due, Math.floor(props.minutes), props.scenario)
    if (due.trim() && dueAtMin === undefined)
      return setError('Use a time like 10:30, or +20 for minutes from now.')
    props.update((s) =>
      addCommitment(s, {
        id: `p-${Date.now().toString(36)}`,
        text: text.trim().slice(0, 500),
        owner,
        madeAtMin: Math.floor(props.minutes),
        source: 'manual',
        status: 'open',
        ...(dueAtMin !== undefined ? { dueAtMin } : {}),
        ...(props.rowId ? { rowId: props.rowId } : {}),
      }),
    )
    props.onAnnounce('Commitment added')
    setText('')
    setOwner('')
    setDue('')
    setError(undefined)
    props.onClose()
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => !open && props.onClose()}
      title="Add a commitment"
      description="Something the players said they would do."
    >
      <form onSubmit={submit} className="fac-tracker__form">
        <label className="field__label" htmlFor={`${id}-t`}>
          What was promised
        </label>
        <input
          id={`${id}-t`}
          className="input"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <label className="field__label" htmlFor={`${id}-o`}>
          Who promised it
        </label>
        <input
          id={`${id}-o`}
          className="input"
          list={`${id}-owners`}
          value={owner}
          maxLength={120}
          onChange={(e) => setOwner(e.target.value)}
        />
        <datalist id={`${id}-owners`}>
          {owners.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <label className="field__label" htmlFor={`${id}-d`}>
          Due (optional)
        </label>
        <input
          id={`${id}-d`}
          className="input"
          value={due}
          placeholder="10:30 or +20"
          onChange={(e) => setDue(e.target.value)}
        />
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog__footer">
          <Button onClick={props.onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Add commitment
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
