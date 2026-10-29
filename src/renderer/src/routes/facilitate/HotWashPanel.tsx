// Hot wash helper: the observations rolled up by objective and Core Capability (#421), the
// scenario's debrief questions and rubric metrics, next to the notes the facilitator captured
// per inject during the exercise. Ratings are counts per capability, never a score.
import type { FacilitatorState } from '@shared/ipc'
import { capabilityName } from '@shared/core-capabilities'
import {
  RATING_LABELS,
  RATINGS,
  type CriticalTask,
  type Observation,
} from '@shared/schemas/evaluation'
import type { MselRow, Scenario } from '@shared/schemas/scenario'
import { Badge } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { CitationChips } from '../scenarios/CitationChips'
import { countRatings, type RatingCounts } from './evaluation'

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

function Counts({ counts }: { counts: RatingCounts }) {
  const total = RATINGS.reduce((n, r) => n + counts[r], 0)
  if (!total) return <span className="muted">No ratings yet</span>
  return (
    <span className="fac-counts" aria-label="Ratings">
      {RATINGS.filter((r) => counts[r] > 0).map((r) => (
        <span key={r} className="fac-counts__item" data-rating={r}>
          {RATING_LABELS[r]} {counts[r]}
        </span>
      ))}
    </span>
  )
}

function TaskLine(props: {
  task: CriticalTask
  observations: Observation[]
  scenario: Scenario
  notes: FacilitatorState['notes']
}) {
  const { task: t } = props
  const mine = props.observations.filter((o) => o.taskId === t.id)
  return (
    <li className="fac-task">
      <p className="fac-task__text">
        <span className="mono">{t.id}</span> {t.task}
        {t.timing && <span className="muted"> ({t.timing})</span>}
      </p>
      <CitationChips citations={[t.citation]} />
      {mine.length > 0 && (
        <ul className="fac-task__observations">
          {mine.map((o) => (
            <li key={o.id}>
              <Badge
                tone={o.rating === 'met' ? 'ok' : o.rating === 'not_met' ? 'error' : 'neutral'}
              >
                {RATING_LABELS[o.rating]}
              </Badge>{' '}
              {o.rowId && <span className="mono">{o.rowId}</span>} {o.note}
              {o.evaluator && <span className="muted"> — {o.evaluator}</span>}
            </li>
          ))}
        </ul>
      )}
      <NoteList
        lines={notesFor(t.rowIds, props.scenario.msel, props.notes)}
        empty={mine.length ? '' : `Not rated yet (${t.rowIds.join(', ') || 'no rows linked'}).`}
      />
    </li>
  )
}

/** Observations and inject notes grouped by objective, then by capability (FR-8). */
function ByObjective(props: {
  scenario: Scenario
  observations: Observation[]
  notes: FacilitatorState['notes']
}) {
  const { scenario: s } = props
  const evaluation = s.evaluation ?? { objectiveCapabilities: [], eegs: [] }
  if (!evaluation.eegs.length)
    return (
      <p className="muted">
        This scenario has no evaluation guides yet. Generate them on the Scenario page to see
        ratings here by objective and capability.
      </p>
    )
  const expectedOnly = props.observations.filter((o) => !o.taskId && o.rating)
  return (
    <>
      {s.objectives.map((o) => {
        const eegs = evaluation.eegs.filter(
          (e) =>
            e.objectiveRefs.includes(o.id) ||
            evaluation.objectiveCapabilities.some(
              (p) => p.objectiveId === o.id && p.capability === e.capability,
            ),
        )
        return (
          <article key={o.id} className="fac-objective" aria-label={o.name || o.text}>
            <h3>{o.name || o.text}</h3>
            {!eegs.length && <p className="muted">No capability mapped to this objective.</p>}
            {eegs.map((e) => {
              const taskIds = new Set(e.criticalTasks.map((t) => t.id))
              const mine = props.observations.filter((x) => x.taskId && taskIds.has(x.taskId))
              return (
                <section
                  key={e.capability}
                  className="fac-capability"
                  aria-label={capabilityName(e.capability)}
                >
                  <h4>
                    {capabilityName(e.capability)} <Counts counts={countRatings(mine)} />
                  </h4>
                  <ul className="fac-tasks">
                    {e.criticalTasks.map((t) => (
                      <TaskLine
                        key={t.id}
                        task={t}
                        observations={props.observations}
                        scenario={s}
                        notes={props.notes}
                      />
                    ))}
                  </ul>
                </section>
              )
            })}
          </article>
        )
      })}
      {expectedOnly.length > 0 && (
        <section className="fac-capability" aria-label="Expected actions">
          <h4>
            Expected actions (rows no task covers) <Counts counts={countRatings(expectedOnly)} />
          </h4>
          <ul className="fac-task__observations">
            {expectedOnly.map((o) => (
              <li key={o.id}>
                <Badge>{RATING_LABELS[o.rating]}</Badge> <span className="mono">{o.rowId}</span>{' '}
                {o.note}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

export function HotWashPanel({
  projectPath,
  scenario,
  state,
}: {
  projectPath: string
  scenario: Scenario
  state: FacilitatorState
}) {
  const questions = scenario.hotwash?.questions ?? []
  const metrics = scenario.rubric?.metrics ?? []
  const record = useIpcQuery('evaluation:get', { projectPath, scenarioId: scenario.id })
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
      <section aria-labelledby="fac-hw-evaluation">
        <h2 id="fac-hw-evaluation">By objective and capability</h2>
        <p className="muted">
          What the evaluation guides asked for, the plan section each item comes from, and how it
          was rated. Counts, not scores; the discussion is about procedures.
        </p>
        <ByObjective
          scenario={scenario}
          observations={record.data?.observations ?? []}
          notes={state.notes}
        />
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
