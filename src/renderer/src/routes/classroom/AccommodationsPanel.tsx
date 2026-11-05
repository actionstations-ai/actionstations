// Accommodations (#739, FR-11): private to the instructor. Adjustments, not diagnoses. Applied
// to one student as written; the shared clock is never changed.
import { useState } from 'react'
import type { ClassroomState } from '@shared/ipc/classroom'
import type { Accommodation } from '@shared/schemas'
import { Button, EmptyState, Field } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { call, change } from './use-classroom'

const blank = (studentId: string): Accommodation => ({
  studentId,
  timeMultiplier: 1,
  responseMethod: 'default',
  packet: 'standard',
  breaks: false,
  quieterRole: false,
  note: '',
})

export function AccommodationsPanel({
  projectPath,
  state,
}: {
  projectPath: string
  state: ClassroomState
}) {
  const { students } = state.course
  const list = useIpcQuery('classroom:accommodations', { projectPath })
  const [chosen, setChosen] = useState('')
  const studentId = chosen || students[0]?.id || ''
  const saved = list.data?.find((a) => a.studentId === studentId)
  const [draft, setDraft] = useState<Accommodation | null>(null)
  const current = draft?.studentId === studentId ? draft : (saved ?? blank(studentId))
  const edit = (patch: Partial<Accommodation>) => setDraft({ ...current, ...patch })
  const save = () =>
    change('Could not save the accommodation', () =>
      call('classroom:set-accommodation', { projectPath, accommodation: current }),
    )
  if (students.length === 0)
    return <EmptyState title="No students yet" body="Add students to record accommodations." />
  return (
    <section className="card stack" aria-labelledby="classroom-acc-title">
      <h2 id="classroom-acc-title" className="section-title">
        Accommodations
      </h2>
      <p className="muted">
        Private to you. They record adjustments, not diagnoses, and are left out of shared files,
        the After Action Report and the dashboard (which shows a count only).
      </p>
      <Field label="Student">
        {({ id }) => (
          <select
            id={id}
            className="input"
            value={studentId}
            onChange={(e) => {
              setChosen(e.target.value)
              setDraft(null)
            }}
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {list.data?.some((a) => a.studentId === s.id) ? ' (has accommodations)' : ''}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="classroom-form">
        <Field
          label="Time multiplier"
          hint="Applied to this student's timed responses, not the shared clock"
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              type="number"
              min={1}
              max={4}
              step={0.25}
              aria-describedby={describedBy}
              value={current.timeMultiplier}
              onChange={(e) => edit({ timeMultiplier: Number(e.target.value) || 1 })}
            />
          )}
        </Field>
        <Field label="Response method">
          {({ id }) => (
            <select
              id={id}
              className="input"
              value={current.responseMethod}
              onChange={(e) =>
                edit({ responseMethod: e.target.value as Accommodation['responseMethod'] })
              }
            >
              <option value="default">As the exercise runs</option>
              <option value="written">Written instead of spoken</option>
              <option value="spoken">Spoken instead of written</option>
            </select>
          )}
        </Field>
        <Field label="Packet">
          {({ id }) => (
            <select
              id={id}
              className="input"
              value={current.packet}
              onChange={(e) => edit({ packet: e.target.value as Accommodation['packet'] })}
            >
              <option value="standard">Standard</option>
              <option value="screen_reader">Screen-reader packet</option>
              <option value="large_print">Large print</option>
            </select>
          )}
        </Field>
      </div>
      <label className="row">
        <input
          type="checkbox"
          checked={current.breaks}
          onChange={(e) => edit({ breaks: e.target.checked })}
        />
        Breaks as needed
      </label>
      <label className="row">
        <input
          type="checkbox"
          checked={current.quieterRole}
          onChange={(e) => edit({ quieterRole: e.target.checked })}
        />
        Observer or evaluator role with an equivalent rubric
      </label>
      <Field label="Note (only you see this)">
        {({ id }) => (
          <textarea
            id={id}
            className="input"
            rows={2}
            value={current.note}
            onChange={(e) => edit({ note: e.target.value })}
          />
        )}
      </Field>
      <div className="row">
        <Button variant="primary" onClick={() => void save()}>
          Save
        </Button>
      </div>
    </section>
  )
}
