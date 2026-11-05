// Scoring (#727, #724): pick a scenario, then each student's level per rubric criterion. The
// suggestion and its basis sit beside the choice; the instructor's choice is the score. One-tap
// hot wash tally per student. Every control is a native input, so scoring works by keyboard.
import { useState } from 'react'
import type { ClassroomState } from '@shared/ipc/classroom'
import type { ScoringCell, ScoringStudent } from '@shared/ipc/classroom-scoring'
import { Button, EmptyState, Field } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { downloadPdf } from './download'
import { call, change } from './use-classroom'

type Props = { projectPath: string; state: ClassroomState }

function CellRow(props: {
  projectPath: string
  scenarioId: string
  student: ScoringStudent
  cell: ScoringCell
  state: ClassroomState
}) {
  const { cell, student, state } = props
  const rubric = state.course.rubrics.find((r) => r.id === cell.rubricId)!
  const criterion = rubric.criteria.find((c) => c.id === cell.criterionId)!
  const label = `${student.name}, ${criterion.name}`
  const score = (value: string) => {
    const base = {
      projectPath: props.projectPath,
      scenarioId: props.scenarioId,
      studentId: student.studentId,
      rubricId: cell.rubricId,
      criterionId: cell.criterionId,
    }
    return change('Could not save the score', () =>
      value === ''
        ? call('classroom:clear-score', base)
        : call('classroom:set-score', {
            ...base,
            levelIndex: Number(value),
            comment: cell.comment,
          }),
    )
  }
  return (
    <tr>
      <th scope="row">
        {rubric.name}: {criterion.name}
      </th>
      <td>
        <select
          className="input"
          aria-label={`Level for ${label}`}
          value={cell.level === null || cell.fromTeam ? '' : String(cell.level)}
          onChange={(e) => void score(e.target.value)}
        >
          <option value="">
            {cell.fromTeam ? `Team score (${criterion.levels[cell.level!]?.label})` : 'Not scored'}
          </option>
          {criterion.levels.map((l, i) => (
            <option key={i} value={i}>
              {l.label} ({l.points})
            </option>
          ))}
        </select>
      </td>
      <td>
        {cell.suggestedLevel === null
          ? 'No evidence yet'
          : `Suggested: ${criterion.levels[cell.suggestedLevel]?.label}. ${cell.basis}`}
      </td>
      <td>
        {cell.evidence.length === 0 ? (
          <span className="muted">None</span>
        ) : (
          <ul className="classroom-list">
            {cell.evidence.map((e) => (
              <li key={e.id}>
                {e.exerciseTime ? `${e.exerciseTime} ` : ''}
                {e.note || e.kind}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  )
}

function TypedReflection(props: {
  projectPath: string
  scenarioId: string
  student: ScoringStudent
}) {
  const [text, setText] = useState('')
  const add = async () => {
    const ok = await change('Could not save the reflection', () =>
      call('classroom:evidence-add', {
        projectPath: props.projectPath,
        evidence: {
          kind: 'reflection',
          scenarioId: props.scenarioId,
          studentId: props.student.studentId,
          note: text,
          count: 1,
        },
      }),
    )
    if (ok) setText('')
  }
  return (
    <details>
      <summary>Type in a reflection from a printed sheet</summary>
      <Field label={`Reflection by ${props.student.name}`}>
        {({ id }) => (
          <textarea
            id={id}
            className="input"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>
      <Button size="sm" disabled={text.trim() === ''} onClick={() => void add()}>
        Add reflection
      </Button>
    </details>
  )
}

function StudentScores(props: {
  projectPath: string
  scenarioId: string
  student: ScoringStudent
  state: ClassroomState
}) {
  const { student } = props
  const total = student.totals.map((t) => {
    const name = props.state.course.rubrics.find((r) => r.id === t.rubricId)?.name ?? t.rubricId
    return `${name}: ${t.points} of ${t.maxPoints}${t.complete ? '' : ' (incomplete)'}`
  })
  return (
    <section className="classroom-student" aria-labelledby={`stu-${student.studentId}`}>
      <h3 id={`stu-${student.studentId}`}>{student.name}</h3>
      <p className="muted">{total.join('. ')}</p>
      <div className="row">
        <Button
          size="sm"
          aria-label={`Count a hot wash contribution for ${student.name}`}
          onClick={() =>
            void change('Could not count the contribution', () =>
              call('classroom:hotwash-tally', {
                projectPath: props.projectPath,
                scenarioId: props.scenarioId,
                studentId: student.studentId,
              }),
            )
          }
        >
          + Hot wash contribution
        </Button>
        <Button
          size="sm"
          aria-label={`Score report PDF for ${student.name}`}
          onClick={() =>
            void call('classroom:student-report-pdf', {
              projectPath: props.projectPath,
              scenarioId: props.scenarioId,
              studentId: student.studentId,
            }).then(downloadPdf)
          }
        >
          Score report PDF
        </Button>
        {student.unlinked.length > 0 && (
          <span className="muted">
            {student.unlinked.length} piece(s) of evidence not linked to a criterion
          </span>
        )}
      </div>
      <TypedReflection
        projectPath={props.projectPath}
        scenarioId={props.scenarioId}
        student={student}
      />
      <table className="classroom-table">
        <caption className="sr-only">Scores for {student.name}</caption>
        <thead>
          <tr>
            <th scope="col">Criterion</th>
            <th scope="col">Level</th>
            <th scope="col">Suggestion and basis</th>
            <th scope="col">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {student.cells.map((c) => (
            <CellRow key={`${c.rubricId}-${c.criterionId}`} {...props} cell={c} />
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function ScoringPanel({ projectPath, state }: Props) {
  const scenarios = useIpcQuery('scenarios:list', { projectPath })
  const [chosen, setChosen] = useState('')
  const scenarioId = chosen || scenarios.data?.[0]?.id || ''
  const view = useIpcQuery(
    'classroom:scoring-view',
    { projectPath, scenarioId },
    { enabled: !!scenarioId },
  )
  return (
    <section className="card stack" aria-labelledby="classroom-scoring-title">
      <h2 id="classroom-scoring-title" className="section-title">
        Scoring
      </h2>
      {state.course.rubrics.length === 0 || state.course.students.length === 0 ? (
        <EmptyState title="Nothing to score yet" body="Add students and rubrics first." />
      ) : (
        <>
          <Field label="Scenario">
            {({ id }) => (
              <select
                id={id}
                className="input"
                value={scenarioId}
                onChange={(e) => setChosen(e.target.value)}
              >
                {(scenarios.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <p className="muted">
            Suggestions come from a fixed rule over the evidence and are shown with their basis. The
            score is yours.
            {view.data?.practice ? ' This run is marked as practice and does not count.' : ''}
          </p>
          {view.data?.students.map((s) => (
            <StudentScores
              key={s.studentId}
              projectPath={projectPath}
              scenarioId={scenarioId}
              student={s}
              state={state}
            />
          ))}
        </>
      )}
    </section>
  )
}
