// Rubrics per role (#722, FR-3): start from the original starter rubrics, edit weights, levels
// and descriptors, link criteria to outcomes, and export or import as JSON. Rubric entry works
// by keyboard: every control is a native input.
import { useState } from 'react'
import type { ClassroomState } from '@shared/ipc/classroom'
import type { ClassroomRubric, ClassroomRubricCriterion } from '@shared/schemas'
import { Button, EmptyState, Field } from '../../components/ui'
import { downloadPdf, downloadText } from './download'
import { call, change } from './use-classroom'

type Props = { projectPath: string; state: ClassroomState }

function CriterionEditor(props: {
  criterion: ClassroomRubricCriterion
  outcomes: ClassroomState['course']['outcomes']
  onChange: (c: ClassroomRubricCriterion) => void
}) {
  const { criterion: c, onChange } = props
  const setLevel = (i: number, patch: Partial<ClassroomRubricCriterion['levels'][number]>) =>
    onChange({ ...c, levels: c.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  return (
    <fieldset className="classroom-criterion">
      <legend>{c.name}</legend>
      <Field label="Weight">
        {({ id }) => (
          <input
            id={id}
            className="input"
            type="number"
            min={0.1}
            step={0.5}
            value={c.weight}
            onChange={(e) => onChange({ ...c, weight: Number(e.target.value) || 1 })}
          />
        )}
      </Field>
      <Field label="Linked outcomes">
        {({ id }) => (
          <select
            id={id}
            className="input"
            multiple
            value={c.outcomeIds}
            onChange={(e) =>
              onChange({
                ...c,
                outcomeIds: [...e.target.selectedOptions].map((o) => o.value),
              })
            }
          >
            {props.outcomes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code}
              </option>
            ))}
          </select>
        )}
      </Field>
      <table className="classroom-table">
        <caption className="sr-only">Levels of {c.name}</caption>
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Points</th>
            <th scope="col">Descriptor</th>
          </tr>
        </thead>
        <tbody>
          {c.levels.map((l, i) => (
            <tr key={i}>
              <td>
                <input
                  className="input"
                  aria-label={`${c.name} level ${i + 1} label`}
                  value={l.label}
                  onChange={(e) => setLevel(i, { label: e.target.value })}
                />
              </td>
              <td>
                <input
                  className="input"
                  type="number"
                  min={0}
                  aria-label={`${c.name} level ${i + 1} points`}
                  value={l.points}
                  onChange={(e) => setLevel(i, { points: Number(e.target.value) || 0 })}
                />
              </td>
              <td>
                <textarea
                  className="input"
                  rows={2}
                  aria-label={`${c.name} level ${i + 1} descriptor`}
                  value={l.descriptor}
                  onChange={(e) => setLevel(i, { descriptor: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  )
}

function RubricEditor(props: Props & { rubric: ClassroomRubric; onDone: () => void }) {
  const [draft, setDraft] = useState(props.rubric)
  const save = async () => {
    if (
      await change('Could not save the rubric', () =>
        call('classroom:save-rubric', { projectPath: props.projectPath, rubric: draft }),
      )
    )
      props.onDone()
  }
  return (
    <div className="stack">
      <div className="classroom-form">
        <Field label="Rubric name">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          )}
        </Field>
        <Field label="Role" hint="A role name, or team to score the whole team">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              aria-describedby={describedBy}
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            />
          )}
        </Field>
      </div>
      {draft.criteria.map((c, i) => (
        <CriterionEditor
          key={c.id}
          criterion={c}
          outcomes={props.state.course.outcomes}
          onChange={(next) =>
            setDraft({ ...draft, criteria: draft.criteria.map((x, j) => (j === i ? next : x)) })
          }
        />
      ))}
      <div className="row">
        <Button variant="primary" onClick={() => void save()}>
          Save rubric
        </Button>
        <Button onClick={props.onDone}>Cancel</Button>
      </div>
    </div>
  )
}

export function RubricsPanel(props: Props) {
  const { projectPath, state } = props
  const [editing, setEditing] = useState<string | null>(null)
  const rubrics = state.course.rubrics
  const exportOne = async (rubricId: string) => {
    const file = await call('classroom:export-rubric', { projectPath, rubricId })
    downloadText(file.fileName, file.json)
  }
  const importFile = async (file: File | undefined) => {
    if (file)
      await change('Could not import the rubric', async () =>
        call('classroom:import-rubrics', { projectPath, json: await file.text() }),
      )
  }
  const open = rubrics.find((r) => r.id === editing)
  return (
    <section className="card stack" aria-labelledby="classroom-rubrics-title">
      <h2 id="classroom-rubrics-title" className="section-title">
        Rubrics
      </h2>
      {open ? (
        <RubricEditor key={open.id} {...props} rubric={open} onDone={() => setEditing(null)} />
      ) : rubrics.length === 0 ? (
        <EmptyState
          title="No rubrics yet"
          body="Add the starter rubrics, then edit them to fit your course."
        />
      ) : (
        <ul className="classroom-list" aria-label="Rubrics">
          {rubrics.map((r) => (
            <li key={r.id} className="row">
              <strong>{r.name}</strong> for {r.role}, {r.criteria.length} criteria
              <Button size="sm" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r.id)}>
                Edit
              </Button>
              <Button
                size="sm"
                aria-label={`Export ${r.name}`}
                onClick={() => void exportOne(r.id)}
              >
                Export
              </Button>
              <Button
                size="sm"
                aria-label={`Print ${r.name} as a PDF handout`}
                onClick={() =>
                  void call('classroom:rubric-pdf', { projectPath, rubricId: r.id }).then(
                    downloadPdf,
                  )
                }
              >
                Handout PDF
              </Button>
              <Button
                size="sm"
                aria-label={`Delete ${r.name}`}
                onClick={() =>
                  void change('Could not delete the rubric', () =>
                    call('classroom:delete-rubric', { projectPath, rubricId: r.id }),
                  )
                }
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!open && (
        <div className="row">
          <Button
            onClick={() =>
              void change('Could not add the rubrics', () =>
                call('classroom:add-starter-rubrics', { projectPath }),
              )
            }
          >
            Add the starter rubrics
          </Button>
        </div>
      )}
      {!open && (
        <Field label="Import a rubric (JSON)">
          {({ id }) => (
            <input
              id={id}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void importFile(e.target.files?.[0])}
            />
          )}
        </Field>
      )}
      <p className="muted">
        The starter rubrics are original work. Rubrics from other institutions are not bundled when
        their license forbids it; import them as JSON if yours allows.
      </p>
    </section>
  )
}
