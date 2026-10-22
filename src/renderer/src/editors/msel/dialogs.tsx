// Dialogs: delete a row that has an inject, insert a TIME_JUMP card, renumber ids.
import { useState } from 'react'
import { WallClock, exerciseMinutes, formatExerciseTime } from '@shared/schemas/common'
import { wallClockAt } from './cell-format'
import type { MselRow, Phase } from '@shared/schemas/scenario'
import { Button, Dialog, Field } from '../../components/ui'
import { parseExerciseTime } from './model'
import { twelveHour, type Rename, type TimeJumpInput } from './operations'

export function DeleteRowDialog(props: {
  row: MselRow | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog
      open={!!props.row}
      onOpenChange={(o) => !o && props.onCancel()}
      title={`Delete ${props.row?.id ?? 'row'}?`}
      description="This row has a generated inject. The inject file stays in the project; deleting the row only unlinks it from the MSEL. You can undo with Cmd/Ctrl+Z."
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="danger" onClick={props.onConfirm}>
            Delete row
          </Button>
        </>
      }
    >
      <p className="msel-editor__dialog-quote">{props.row?.event}</p>
    </Dialog>
  )
}

interface TimeJumpProps {
  open: boolean
  phases: Phase[]
  rows: MselRow[]
  defaultPhaseId: string
  onCancel: () => void
  onInsert: (input: TimeJumpInput) => void
}

export function TimeJumpDialog(props: TimeJumpProps) {
  return props.open ? <TimeJumpForm {...props} /> : null
}

function TimeJumpForm(props: TimeJumpProps) {
  const first = props.phases.find((p) => p.id === props.defaultPhaseId) ?? props.phases[0]
  const [phaseId, setPhaseId] = useState(first?.id ?? '')
  const [time, setTime] = useState(first?.startTime ?? '0:00')
  const [wall, setWall] = useState(() =>
    wallClockAt(props.rows, exerciseMinutes(first?.startTime ?? '0:00')),
  )
  const [narration, setNarration] = useState('')
  const [tried, setTried] = useState(false)
  const timeErr = parseExerciseTime(time) === null ? 'Use H:MM, e.g. 2:00' : undefined
  const wallErr = WallClock.safeParse(wall).success ? undefined : 'Use HH:MM, e.g. 11:00'
  const pickPhase = (id: string) => {
    setPhaseId(id)
    const p = props.phases.find((x) => x.id === id)
    if (p) {
      setTime(p.startTime)
      setWall(wallClockAt(props.rows, exerciseMinutes(p.startTime)) || wall)
    }
  }
  const submit = () => {
    setTried(true)
    if (timeErr || wallErr) return
    const minutes = parseExerciseTime(time)!
    props.onInsert({ phaseId, time: formatExerciseTime(minutes), wallClock: wall, narration })
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onCancel()}
      title="Insert time jump"
      description="A facilitator card that moves the story clock forward."
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Insert time jump
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Phase">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={phaseId}
              onChange={(e) => pickPhase(e.target.value)}
            >
              {props.phases.map((p) => (
                <option key={p.id} value={p.id}>
                  Phase {p.index + 1}: {p.title} ({p.startTime}–{p.endTime})
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="msel-editor__two">
          <Field
            label="Exercise time"
            hint="H:MM on the exercise clock"
            {...(tried && timeErr ? { error: timeErr } : {})}
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="input"
                value={time}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                onChange={(e) => setTime(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="New wall-clock time"
            hint={wall && !wallErr ? `Card reads “It is now ${twelveHour(wall)}”` : 'HH:MM'}
            {...(tried && wallErr ? { error: wallErr } : {})}
          >
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className="input"
                value={wall}
                placeholder="11:00"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                onChange={(e) => setWall(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Narration" hint="What has happened in the meantime">
          {({ id, describedBy }) => (
            <textarea
              id={id}
              className="textarea"
              rows={3}
              value={narration}
              aria-describedby={describedBy}
              onChange={(e) => setNarration(e.target.value)}
            />
          )}
        </Field>
      </form>
    </Dialog>
  )
}

export function RenumberDialog(props: {
  renames: Rename[] | null
  onCancel: () => void
  onApply: () => void
}) {
  const renames = props.renames ?? []
  return (
    <Dialog
      open={!!props.renames}
      onOpenChange={(o) => !o && props.onCancel()}
      title="Renumber inject IDs"
      description="I-01, I-02, … in time order. Rows with a letter suffix (I-07b) stay with their base row; START, END and custom ids are kept."
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!renames.length} onClick={props.onApply}>
            Renumber {renames.length} row{renames.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      {renames.length ? (
        <div className="msel-editor__preview">
          <table className="table" aria-label="Renumber preview">
            <thead>
              <tr>
                <th scope="col">Current</th>
                <th scope="col">New</th>
              </tr>
            </thead>
            <tbody>
              {renames.map((r) => (
                <tr key={r.key}>
                  <td className="mono">{r.from}</td>
                  <td className="mono">{r.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Rubric links follow the new IDs.</p>
        </div>
      ) : (
        <p className="muted">IDs are already in order. Nothing to change.</p>
      )}
    </Dialog>
  )
}
