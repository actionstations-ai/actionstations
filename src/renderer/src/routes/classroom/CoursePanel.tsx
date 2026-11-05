// Course name, term and sections (#718, FR-1). Sections are edited as a list of names; a section
// that still has students cannot be dropped.
import { useState } from 'react'
import type { ClassroomState } from '@shared/ipc/classroom'
import { Button, Field } from '../../components/ui'
import { call, change } from './use-classroom'

export function CoursePanel(props: { projectPath: string; state: ClassroomState }) {
  const { course } = props.state
  const [name, setName] = useState(course.course?.name ?? '')
  const [term, setTerm] = useState(course.course?.term ?? '')
  const [sections, setSections] = useState<Array<{ id?: string; name: string }>>(
    course.sections.map((s) => ({ ...s })),
  )
  const save = () =>
    change('Could not save the course', () =>
      call('classroom:set-course', {
        projectPath: props.projectPath,
        name,
        term,
        sections: sections.filter((s) => s.name.trim() !== ''),
      }),
    )
  return (
    <section className="card stack" aria-labelledby="classroom-course-title">
      <h2 id="classroom-course-title" className="section-title">
        Course and sections
      </h2>
      <div className="classroom-form">
        <Field label="Course name">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Term" hint="For example Fall 2026">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              aria-describedby={describedBy}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          )}
        </Field>
      </div>
      <ul className="classroom-list" aria-label="Sections">
        {sections.map((s, i) => (
          <li key={s.id ?? `new-${i}`} className="row">
            <input
              className="input"
              aria-label={`Section ${i + 1} name`}
              value={s.name}
              onChange={(e) =>
                setSections(sections.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
            />
            <Button
              size="sm"
              aria-label={`Remove section ${s.name || i + 1}`}
              onClick={() => setSections(sections.filter((_, j) => j !== i))}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div className="row">
        <Button onClick={() => setSections([...sections, { name: '' }])}>Add a section</Button>
        <Button variant="primary" disabled={name.trim() === ''} onClick={() => void save()}>
          Save course
        </Button>
      </div>
    </section>
  )
}
