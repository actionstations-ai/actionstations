// Role rotation (#730, FR-7): one role per student per session, every role covered each session,
// no repeat until all have been played. The plan is shown as a table; problems are listed.
import { useState } from 'react'
import type { ClassroomState } from '@shared/ipc/classroom'
import { Button, Field } from '../../components/ui'
import { call, change } from './use-classroom'

export function RotationPanel({
  projectPath,
  state,
}: {
  projectPath: string
  state: ClassroomState
}) {
  const { sections, students, rotations } = state.course
  const [sectionId, setSectionId] = useState('')
  const [roles, setRoles] = useState('Incident commander, Communications lead, Analyst, Evaluator')
  const [sessions, setSessions] = useState(4)
  const [problems, setProblems] = useState<string[]>([])
  const section = sectionId || sections[0]?.id || ''
  const plan = rotations.find((r) => r.sectionId === section)
  const names = new Map(students.map((s) => [s.id, s.name]))
  const run = async () => {
    const list = roles
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
    await change('Could not plan the rotation', async () => {
      const result = await call('classroom:rotation-plan', {
        projectPath,
        sectionId: section,
        roles: list,
        sessions,
      })
      setProblems(result.problems)
    })
  }
  if (sections.length === 0) return null
  return (
    <section className="card stack" aria-labelledby="classroom-rotation-title">
      <h2 id="classroom-rotation-title" className="section-title">
        Role rotation
      </h2>
      <div className="classroom-form">
        <Field label="Section">
          {({ id }) => (
            <select
              id={id}
              className="input"
              value={section}
              onChange={(e) => setSectionId(e.target.value)}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Roles" hint="Separate with commas">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              aria-describedby={describedBy}
              value={roles}
              onChange={(e) => setRoles(e.target.value)}
            />
          )}
        </Field>
        <Field label="Sessions">
          {({ id }) => (
            <input
              id={id}
              className="input"
              type="number"
              min={1}
              max={40}
              value={sessions}
              onChange={(e) => setSessions(Number(e.target.value) || 1)}
            />
          )}
        </Field>
      </div>
      <div className="row">
        <Button variant="primary" onClick={() => void run()}>
          Plan the rotation
        </Button>
      </div>
      {problems.length > 0 && (
        <ul className="classroom-list" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {plan && (
        <table className="classroom-table">
          <caption className="sr-only">Role rotation plan</caption>
          <thead>
            <tr>
              <th scope="col">Student</th>
              {plan.sessions.map((s) => (
                <th key={s.index} scope="col">
                  Session {s.index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students
              .filter((s) => s.sectionId === section)
              .map((s) => (
                <tr key={s.id}>
                  <th scope="row">{names.get(s.id)}</th>
                  {plan.sessions.map((x) => (
                    <td key={x.index}>{x.assignments[s.id] ?? ''}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
