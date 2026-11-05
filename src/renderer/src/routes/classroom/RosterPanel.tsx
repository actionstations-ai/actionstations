// Roster (#718, FR-1, FR-12): add a student, paste or open a CSV (checked before anything is
// added), and delete one student or the whole term in one action.
import { useState } from 'react'
import type { ClassroomState, RosterPreview } from '@shared/ipc/classroom'
import { Button, Dialog, EmptyState, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { errorText } from '../../lib/errors'
import { call, change } from './use-classroom'

function ImportBox(props: { projectPath: string; sectionId: string }) {
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<RosterPreview | null>(null)
  const check = async () => {
    try {
      setPreview(
        await call('classroom:roster-preview', {
          projectPath: props.projectPath,
          sectionId: props.sectionId,
          csv,
        }),
      )
    } catch (e) {
      setPreview(null)
      toast.error('Could not read the roster', errorText(e))
    }
  }
  const apply = async () => {
    const ok = await change('Could not import the roster', () =>
      call('classroom:roster-import', {
        projectPath: props.projectPath,
        sectionId: props.sectionId,
        csv,
      }),
    )
    if (ok) {
      setCsv('')
      setPreview(null)
    }
  }
  const open = async (file: File | undefined) => {
    if (file) setCsv(await file.text())
    setPreview(null)
  }
  return (
    <div className="stack">
      <Field
        label="Roster CSV"
        hint="Columns: name, and optionally student id and email. Other columns are ignored."
      >
        {({ id, describedBy }) => (
          <textarea
            id={id}
            className="input"
            rows={4}
            aria-describedby={describedBy}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value)
              setPreview(null)
            }}
          />
        )}
      </Field>
      <Field label="Or open a CSV file">
        {({ id }) => (
          <input
            id={id}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void open(e.target.files?.[0])}
          />
        )}
      </Field>
      <div className="row">
        <Button disabled={csv.trim() === ''} onClick={() => void check()}>
          Check the file
        </Button>
        <Button
          variant="primary"
          disabled={!preview || preview.rows.length === 0}
          onClick={() => void apply()}
        >
          Add {preview?.rows.length ?? 0} students
        </Button>
      </div>
      {preview && <PreviewSummary preview={preview} />}
    </div>
  )
}

function PreviewSummary({ preview }: { preview: RosterPreview }) {
  return (
    <div role="status" className="stack">
      <p>
        {preview.rows.length} students ready to add, {preview.skipped.length} skipped.
      </p>
      {preview.ignoredColumns.length > 0 && (
        <p className="muted">Ignored columns: {preview.ignoredColumns.join(', ')}</p>
      )}
      {preview.skipped.length > 0 && (
        <ul className="classroom-list">
          {preview.skipped.map((s) => (
            <li key={s.line}>
              Line {s.line}: {s.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AddOne(props: { projectPath: string; sectionId: string }) {
  const [name, setName] = useState('')
  const [institutionId, setInstitutionId] = useState('')
  const add = async () => {
    const ok = await change('Could not add the student', () =>
      call('classroom:add-student', {
        projectPath: props.projectPath,
        sectionId: props.sectionId,
        name,
        ...(institutionId.trim() ? { institutionId } : {}),
      }),
    )
    if (ok) {
      setName('')
      setInstitutionId('')
    }
  }
  return (
    <div className="classroom-form">
      <Field label="Student name">
        {({ id }) => (
          <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label="Student id (optional)">
        {({ id }) => (
          <input
            id={id}
            className="input"
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
          />
        )}
      </Field>
      <div className="row classroom-form__action">
        <Button disabled={name.trim() === ''} onClick={() => void add()}>
          Add student
        </Button>
      </div>
    </div>
  )
}

function DeleteTerm(props: { projectPath: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Delete this term’s records
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Delete every student record?"
        description="This removes all students, sections, evidence, scores and accommodations from this project. Outcomes and rubrics stay. It cannot be undone."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() =>
                void change('Could not delete the records', () =>
                  call('classroom:delete-term', { projectPath: props.projectPath }),
                ).then(() => setOpen(false))
              }
            >
              Delete everything
            </Button>
          </>
        }
      >
        <p>Delete a single student from the roster table to keep the rest.</p>
      </Dialog>
    </>
  )
}

export function RosterPanel(props: { projectPath: string; state: ClassroomState }) {
  const { sections, students } = props.state.course
  const [chosen, setChosen] = useState('')
  const sectionId = chosen || sections[0]?.id || ''
  if (sections.length === 0)
    return (
      <EmptyState
        title="No sections yet"
        body="Save the course with at least one section, then add students."
      />
    )
  const shown = students.filter((s) => s.sectionId === sectionId)
  return (
    <section className="card stack" aria-labelledby="classroom-roster-title">
      <h2 id="classroom-roster-title" className="section-title">
        Roster
      </h2>
      <Field label="Section">
        {({ id }) => (
          <select
            id={id}
            className="input"
            value={sectionId}
            onChange={(e) => setChosen(e.target.value)}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <AddOne projectPath={props.projectPath} sectionId={sectionId} />
      <ImportBox projectPath={props.projectPath} sectionId={sectionId} />
      <StudentTable projectPath={props.projectPath} students={shown} />
      <div className="row">
        <DeleteTerm projectPath={props.projectPath} />
      </div>
    </section>
  )
}

function StudentTable(props: {
  projectPath: string
  students: ClassroomState['course']['students']
}) {
  if (props.students.length === 0) return <p className="muted">No students in this section yet.</p>
  return (
    <table className="classroom-table">
      <caption className="sr-only">Students in this section</caption>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Student id</th>
          <th scope="col">Email</th>
          <th scope="col">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {props.students.map((s) => (
          <tr key={s.id}>
            <th scope="row">{s.name}</th>
            <td>{s.institutionId ?? ''}</td>
            <td>{s.email ?? ''}</td>
            <td>
              <Button
                size="sm"
                aria-label={`Delete ${s.name} and all their records`}
                onClick={() =>
                  void change('Could not delete the student', () =>
                    call('classroom:delete-students', {
                      projectPath: props.projectPath,
                      studentIds: [s.id],
                    }),
                  )
                }
              >
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
