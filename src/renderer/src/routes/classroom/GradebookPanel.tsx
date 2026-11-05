// Gradebook CSV (#733, FR-8): preview first, then save. Practice runs are left out and the
// screen says what was skipped. Nothing is sent anywhere; saving the file is the instructor's act.
import { useState } from 'react'
import type { ClassroomState } from '@shared/ipc/classroom'
import type { GradebookResult, GradebookWarning } from '@shared/ipc/classroom-dashboard'
import { Button, EmptyState, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { errorText } from '../../lib/errors'
import { downloadText } from './download'
import { call } from './use-classroom'

function warningText(w: GradebookWarning): string {
  switch (w.kind) {
    case 'no-score':
      return `${w.student} has no score for ${w.scenario}.`
    case 'missing-id':
      return `${w.student} has no student id, so the gradebook may not match this row.`
    case 'practice-excluded':
      return `${w.scenario} is a practice run and was left out.`
    case 'no-students':
      return 'This section has no students.'
  }
}

function Preview({ result }: { result: GradebookResult }) {
  return (
    <div className="stack">
      {result.warnings.length > 0 && (
        <ul className="classroom-list" aria-label="Warnings">
          {result.warnings.map((w, i) => (
            <li key={i}>{warningText(w)}</li>
          ))}
        </ul>
      )}
      <div className="classroom-scroll">
        <table className="classroom-table">
          <caption className="sr-only">Gradebook preview</caption>
          <thead>
            <tr>
              {result.header.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        variant="primary"
        onClick={() => downloadText(result.fileName, result.csv, 'text/csv')}
      >
        Save the CSV file
      </Button>
    </div>
  )
}

export function GradebookPanel({
  projectPath,
  state,
}: {
  projectPath: string
  state: ClassroomState
}) {
  const { sections } = state.course
  const [sectionId, setSectionId] = useState('')
  const [outcomes, setOutcomes] = useState(false)
  const [criteria, setCriteria] = useState(false)
  const [comments, setComments] = useState(false)
  const [result, setResult] = useState<GradebookResult | null>(null)
  const section = sectionId || sections[0]?.id || ''
  const run = async () => {
    try {
      setResult(
        await call('classroom:gradebook', {
          projectPath,
          sectionId: section,
          layoutId: 'generic',
          includeOutcomes: outcomes,
          includeCriteria: criteria,
          includeComments: comments,
        }),
      )
    } catch (e) {
      toast.error('Could not build the gradebook', errorText(e))
    }
  }
  if (sections.length === 0)
    return (
      <EmptyState
        title="No sections to export"
        body="Add a section and students before exporting grades."
      />
    )
  const check = (label: string, value: boolean, set: (v: boolean) => void) => (
    <label className="row">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => {
          set(e.target.checked)
          setResult(null)
        }}
      />
      {label}
    </label>
  )
  return (
    <section className="card stack" aria-labelledby="classroom-gradebook-title">
      <h2 id="classroom-gradebook-title" className="section-title">
        Gradebook export
      </h2>
      <p className="muted">
        Grades are education records held by your institution. Saving this file is your decision;
        the app sends nothing anywhere. Points are weighted rubric points.
      </p>
      <Field label="Section">
        {({ id }) => (
          <select
            id={id}
            className="input"
            value={section}
            onChange={(e) => {
              setSectionId(e.target.value)
              setResult(null)
            }}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {check('Add a column per outcome (percent)', outcomes, setOutcomes)}
      {check('Add a column per rubric criterion (points)', criteria, setCriteria)}
      {check('Add short comments', comments, setComments)}
      <div className="row">
        <Button onClick={() => void run()}>Preview</Button>
      </div>
      {result && <Preview result={result} />}
    </section>
  )
}
