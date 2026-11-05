// Session set-up (#724, #730, #739): which section ran the scenario, who sits in which role,
// whether the run counts, which rubrics apply, and the adjustments to remember. The reflection
// survey is saved from here and opened from the live Surveys panel.
import { useState } from 'react'
import type { ClassroomState } from '@shared/ipc/classroom'
import type { ClassroomSession } from '@shared/schemas'
import { Button, EmptyState, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcQuery } from '../../lib/query'
import { downloadPdf } from './download'
import { call, change } from './use-classroom'

type Props = { projectPath: string; state: ClassroomState }

function SeatRow(props: {
  role: { id: string; name: string }
  value: string
  students: ClassroomState['course']['students']
  onChange: (studentId: string) => void
}) {
  return (
    <Field label={props.role.name}>
      {({ id }) => (
        <select
          id={id}
          className="input"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        >
          <option value="">No one</option>
          {props.students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function SessionPanel({ projectPath, state }: Props) {
  const { sections, students, rubrics, sessions } = state.course
  const scenarios = useIpcQuery('scenarios:list', { projectPath })
  const project = useIpcQuery('project:get', { path: projectPath })
  const [chosen, setChosen] = useState('')
  const scenarioId = chosen || scenarios.data?.[0]?.id || ''
  const saved = sessions.find((s) => s.scenarioId === scenarioId)
  const [draft, setDraft] = useState<ClassroomSession | null>(null)
  const current: ClassroomSession =
    draft?.scenarioId === scenarioId
      ? draft
      : (saved ?? {
          scenarioId,
          sectionId: sections[0]?.id ?? '',
          practice: false,
          seats: {},
          rubricIds: [],
        })
  const roles = (project.data?.project.roles ?? []) as Array<{ id: string; name: string }>
  const inSection = students.filter((s) => s.sectionId === current.sectionId)
  const accommodations = useIpcQuery(
    'classroom:session-accommodations',
    { projectPath, scenarioId },
    { enabled: !!scenarioId && !!saved },
  )
  const edit = (patch: Partial<ClassroomSession>) => setDraft({ ...current, ...patch })
  const save = () =>
    change('Could not save the session', () =>
      call('classroom:set-session', { projectPath, session: current }),
    )
  const reflection = async () => {
    await call('classroom:reflection-survey', { projectPath, scenarioId })
    toast.success(
      'Reflection survey saved',
      'Open it from the Surveys panel during the live session.',
    )
  }
  const makeup = async () => {
    const ok = await change('Could not start the make-up version', () =>
      call('classroom:create-makeup', { projectPath, scenarioId }),
    )
    if (ok)
      toast.success(
        'Make-up version started',
        'It keeps the objectives, outcomes and rubrics. Find it in Scenarios when generation finishes.',
      )
  }
  if (sections.length === 0 || !scenarioId)
    return <EmptyState title="No session to set up" body="Add a section and a scenario first." />
  return (
    <section className="card stack" aria-labelledby="classroom-session-title">
      <h2 id="classroom-session-title" className="section-title">
        Session set-up
      </h2>
      <div className="classroom-form">
        <Field label="Scenario">
          {({ id }) => (
            <select
              id={id}
              className="input"
              value={scenarioId}
              onChange={(e) => {
                setChosen(e.target.value)
                setDraft(null)
              }}
            >
              {(scenarios.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Section">
          {({ id }) => (
            <select
              id={id}
              className="input"
              value={current.sectionId}
              onChange={(e) => edit({ sectionId: e.target.value, seats: {} })}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <label className="row">
        <input
          type="checkbox"
          checked={current.practice}
          onChange={(e) => edit({ practice: e.target.checked })}
        />
        Practice run (ungraded: it does not count in the gradebook or the dashboard)
      </label>
      <fieldset className="stack">
        <legend>Rubrics for this session (none selected means all)</legend>
        {rubrics.map((r) => (
          <label key={r.id} className="row">
            <input
              type="checkbox"
              checked={current.rubricIds.includes(r.id)}
              onChange={(e) =>
                edit({
                  rubricIds: e.target.checked
                    ? [...current.rubricIds, r.id]
                    : current.rubricIds.filter((x) => x !== r.id),
                })
              }
            />
            {r.name}
          </label>
        ))}
      </fieldset>
      <div className="classroom-form">
        {roles.map((r) => (
          <SeatRow
            key={r.id}
            role={r}
            students={inSection}
            value={current.seats[r.id] ?? ''}
            onChange={(studentId) => {
              const seats = { ...current.seats }
              if (studentId) seats[r.id] = studentId
              else delete seats[r.id]
              edit({ seats })
            }}
          />
        ))}
      </div>
      <div className="row">
        <Button variant="primary" onClick={() => void save()}>
          Save session
        </Button>
        <Button disabled={!saved} onClick={() => void reflection()}>
          Save the reflection survey
        </Button>
        <Button disabled={!saved} onClick={() => void makeup()}>
          Create a make-up version
        </Button>
        <Button
          disabled={!current.sectionId}
          onClick={() =>
            void call('classroom:reflection-sheets-pdf', {
              projectPath,
              sectionId: current.sectionId,
              scenarioId,
            }).then(downloadPdf)
          }
        >
          Reflection sheets PDF
        </Button>
      </div>
      {accommodations.data && accommodations.data.length > 0 && (
        <section aria-labelledby="classroom-session-acc" className="stack">
          <h3 id="classroom-session-acc">Adjustments to remember for this session</h3>
          <ul className="classroom-list">
            {accommodations.data.map((a) => (
              <li key={a.studentId}>
                <strong>{a.name}</strong>: {a.lines.join('; ')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
