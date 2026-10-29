// /program/schedule: the multi-year IPP schedule (FR-8, FR-9) as a year-by-quarter grid, with the
// same exercises listed underneath, the priorities, and exports.
import { useState } from 'react'
import { EXERCISE_TYPE_LABELS, type PlannedExercise, type Schedule } from '@shared/schemas'
import { Badge, Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText, isConflictError } from '../../lib/errors'
import { refreshProgramQueries } from '../../state/program'
import { ExportDialog } from './ExportDialog'
import { PlannedExerciseForm } from './PlannedExerciseForm'
import { newExercise } from './program-helpers'
import { PrioritiesDialog } from './PrioritiesDialog'
import { ProgramFrame, type ProgramContext } from './ProgramFrame'
import { cellOf, inCell, outsideCycle, whenText } from './schedule-grid'

function ExerciseButton({ e, onOpen }: { e: PlannedExercise; onOpen: () => void }) {
  const done = e.status === 'completed'
  return (
    <button type="button" className="program-exercise" onClick={onOpen}>
      <span aria-hidden>{done ? '▣' : '▢'}</span> {EXERCISE_TYPE_LABELS[e.type]}: {e.title}
      <span className="sr-only">{done ? ' (completed)' : ` (${e.status})`}</span>
      {done && e.completedAt && <span className="muted"> done {e.completedAt}</span>}
    </button>
  )
}

function Grid(props: {
  ctx: ProgramContext
  exercises: PlannedExercise[]
  onOpen: (e: PlannedExercise) => void
  onAdd: (year: number, quarter: number) => void
}) {
  const { cycle } = props.ctx.summary.program
  const years = Array.from({ length: cycle.years }, (_, i) => cycle.startYear + i)
  return (
    <table className="table program-grid">
      <caption className="sr-only">Planned exercises by year and quarter</caption>
      <thead>
        <tr>
          <th scope="col">Year</th>
          {[1, 2, 3, 4].map((q) => (
            <th key={q} scope="col">
              Q{q}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {years.map((year) => (
          <tr key={year}>
            <th scope="row">{year}</th>
            {[1, 2, 3, 4].map((quarter) => (
              <td key={quarter}>
                <ul className="program-grid__cell">
                  {props.exercises
                    .filter((e) => inCell(e, { year, quarter }))
                    .map((e) => (
                      <li key={e.id}>
                        <ExerciseButton e={e} onOpen={() => props.onOpen(e)} />
                      </li>
                    ))}
                </ul>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Add an exercise in ${year} Q${quarter}`}
                  onClick={() => props.onAdd(year, quarter)}
                >
                  Add
                </Button>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ListView({
  exercises,
  onOpen,
}: {
  exercises: PlannedExercise[]
  onOpen: (e: PlannedExercise) => void
}) {
  if (!exercises.length) return null
  const sorted = [...exercises].sort((a, b) => whenText(a).localeCompare(whenText(b)))
  return (
    <section aria-labelledby="program-ipp-list">
      <h2 id="program-ipp-list">All planned exercises</h2>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Exercise</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr key={e.id}>
              <td>{whenText(e)}</td>
              <td>
                <button type="button" className="program-link" onClick={() => onOpen(e)}>
                  {e.title}
                </button>
              </td>
              <td>{EXERCISE_TYPE_LABELS[e.type]}</td>
              <td>
                <Badge tone={e.status === 'completed' ? 'ok' : 'neutral'}>{e.status}</Badge>
                {e.completedAt ? ` ${e.completedAt}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function ScheduleBody({ ctx }: { ctx: ProgramContext }) {
  const [editing, setEditing] = useState<{ e: PlannedExercise; isNew: boolean }>()
  const [priorities, setPriorities] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { schedule, scheduleRevision, program } = ctx.summary

  const persist = async (next: Schedule) => {
    try {
      await call('program:schedule-save', {
        programPath: ctx.programPath,
        schedule: next,
        baseRevision: scheduleRevision,
      })
      await refreshProgramQueries()
      setEditing(undefined)
    } catch (e) {
      if (isConflictError(e)) {
        await refreshProgramQueries()
        toast.error(
          'The schedule was changed by someone else',
          'It was reloaded. Make your change again.',
        )
        setEditing(undefined)
      } else toast.error('Could not save the schedule', errorText(e))
    }
  }
  const upsert = (e: PlannedExercise) => {
    const rest = schedule.exercises.filter((x) => x.id !== e.id)
    void persist({ ...schedule, exercises: [...rest, e] })
  }
  const exercises = schedule.exercises
  const outside = outsideCycle(exercises, program.cycle)
  return (
    <div className="stack">
      <div className="row program-toolbar">
        <Button onClick={() => setPriorities(true)}>
          Priorities ({program.priorities.length})
        </Button>
        <Button
          variant="primary"
          onClick={() => setEditing({ e: newExercise(program.cycle.startYear, 1), isNew: true })}
        >
          Add exercise
        </Button>
        <Button onClick={() => setExporting(true)}>Export…</Button>
      </div>
      {exercises.length === 0 && (
        <p className="muted">
          Nothing planned yet. Add the seminars, workshops, tabletops, drills and exercises of the
          cycle, and tie each to the priorities and corrective actions it serves.
        </p>
      )}
      <Grid
        ctx={ctx}
        exercises={exercises}
        onOpen={(e) => setEditing({ e, isNew: false })}
        onAdd={(year, quarter) => setEditing({ e: newExercise(year, quarter), isNew: true })}
      />
      {outside.length > 0 && (
        <p className="muted">
          {outside.length} planned {outside.length === 1 ? 'exercise falls' : 'exercises fall'}{' '}
          outside the cycle years ({outside.map((o) => cellOf(o).year).join(', ')}); they are in the
          list below.
        </p>
      )}
      <ListView exercises={exercises} onOpen={(e) => setEditing({ e, isNew: false })} />
      {editing && (
        <PlannedExerciseForm
          programPath={ctx.programPath}
          program={program}
          initial={editing.e}
          isNew={editing.isNew}
          onSave={upsert}
          onDelete={() =>
            void persist({ ...schedule, exercises: exercises.filter((x) => x.id !== editing.e.id) })
          }
          onClose={() => setEditing(undefined)}
        />
      )}
      {priorities && <PrioritiesDialog ctx={ctx} onClose={() => setPriorities(false)} />}
      {exporting && (
        <ExportDialog
          programPath={ctx.programPath}
          focus="ipp"
          onClose={() => setExporting(false)}
        />
      )}
    </div>
  )
}

export default function SchedulePage() {
  return (
    <ProgramFrame
      title="Integrated Preparedness Plan schedule"
      description="The multi-year plan of seminars, workshops, tabletops, drills and exercises."
    >
      {(ctx) => <ScheduleBody ctx={ctx} />}
    </ProgramFrame>
  )
}
