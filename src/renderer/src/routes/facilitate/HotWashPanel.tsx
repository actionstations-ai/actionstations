// Hot wash helper: the scenario's debrief questions and rubric metrics next to the notes the
// facilitator captured per inject during the exercise.
import type { FacilitatorState } from '@shared/ipc'
import type { MselRow, Scenario } from '@shared/schemas/scenario'
import { Badge } from '../../components/ui'

interface NoteLine {
  row: MselRow
  text: string
}

function notesFor(rowIds: string[], msel: MselRow[], notes: FacilitatorState['notes']) {
  const wanted = new Set(rowIds)
  return msel
    .filter((r) => wanted.has(r.id) && notes[r.id]?.trim())
    .map((row) => ({ row, text: notes[row.id]!.trim() }))
}

function NoteList({ lines, empty }: { lines: NoteLine[]; empty: string }) {
  if (!lines.length) return <p className="muted fac-hotwash__empty">{empty}</p>
  return (
    <ul className="fac-hotwash__notes">
      {lines.map(({ row, text }) => (
        <li key={row.id}>
          <span className="mono">{row.id}</span> {text}
        </li>
      ))}
    </ul>
  )
}

export function HotWashPanel({ scenario, state }: { scenario: Scenario; state: FacilitatorState }) {
  const questions = scenario.hotwash?.questions ?? []
  const metrics = scenario.rubric?.metrics ?? []
  const allNotes = notesFor(
    scenario.msel.map((r) => r.id),
    scenario.msel,
    state.notes,
  )
  return (
    <div className="fac-hotwash">
      <section aria-labelledby="fac-hw-questions">
        <h2 id="fac-hw-questions">Hot wash questions</h2>
        {scenario.hotwash?.methodDescription && (
          <p className="muted">{scenario.hotwash.methodDescription}</p>
        )}
        {questions.length ? (
          <ol className="fac-hotwash__questions">
            {questions.map((q, i) => (
              <li key={i}>
                {q.topic && <strong>{q.topic}: </strong>}
                {q.text}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">This scenario has no hot wash questions yet.</p>
        )}
      </section>
      <section aria-labelledby="fac-hw-rubric">
        <h2 id="fac-hw-rubric">Rubric</h2>
        {metrics.length === 0 && <p className="muted">This scenario has no rubric yet.</p>}
        {metrics.map((m) => (
          <article key={m.id} className="fac-metric" aria-label={m.name}>
            <h3>
              {m.name} <Badge>{m.points} pts</Badge>
            </h3>
            <dl className="fac-metric__levels">
              <dt>Fail</dt>
              <dd>{m.fail}</dd>
              <dt>Pass</dt>
              <dd>{m.pass}</dd>
              <dt>Excellence</dt>
              <dd>{m.excellence}</dd>
            </dl>
            <NoteList
              lines={notesFor(m.linkedInjectIds, scenario.msel, state.notes)}
              empty={
                m.linkedInjectIds.length
                  ? `No notes yet for ${m.linkedInjectIds.join(', ')}.`
                  : 'No injects linked to this metric.'
              }
            />
          </article>
        ))}
      </section>
      <section aria-labelledby="fac-hw-notes">
        <h2 id="fac-hw-notes">All inject notes</h2>
        <NoteList lines={allNotes} empty="No inject notes captured yet." />
        {state.generalNotes.trim() && (
          <>
            <h3>General notes</h3>
            <p className="fac-hotwash__general">{state.generalNotes}</p>
          </>
        )}
      </section>
    </div>
  )
}
