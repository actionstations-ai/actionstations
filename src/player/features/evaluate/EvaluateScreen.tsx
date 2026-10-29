import { useMemo, useState } from 'react'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import {
  filterTasks,
  groupByCapability,
  groupName,
  watchFor,
  EXPECTED_GROUP,
  type Assignment,
  type ReleasedRow,
  type TaskFilter,
} from './assignment'
import { pendingCount, type EvaluatorFeature } from './evaluator'
import { GeneralObservation } from './GeneralObservation'
import type { LocalObservation, ObservationInput } from './observations'
import { EVAL } from './strings'
import { TaskCard } from './TaskCard'
import { WatchForStrip } from './WatchForStrip'

const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: 'mine', label: EVAL.filterMine },
  { id: 'all', label: EVAL.filterAll },
  { id: 'unrated', label: EVAL.filterUnrated },
  { id: 'due', label: EVAL.filterDue },
]

/** The evaluator's form: tasks by Core Capability, the Watch-for strip, filters and general notes. */
export function EvaluateScreen({
  session,
  onBack,
}: {
  session: PlayerSession
  onBack: () => void
}) {
  const feature = session.evaluate
  if (!feature) return null
  return <Form session={session} feature={feature} onBack={onBack} />
}

function useReleased(session: PlayerSession): ReleasedRow[] {
  const items = useStore(session.store, (s) => s.items)
  return useMemo(() => {
    const seen = new Map<string, ReleasedRow>()
    for (const i of items) {
      const inj = i.inject
      if (i.kind !== 'inject' || !inj?.rowId || i.withdrawn) continue
      if (!seen.has(inj.releaseId)) {
        seen.set(inj.releaseId, {
          rowId: inj.rowId,
          releaseId: inj.releaseId,
          time: i.exerciseTime,
          ts: i.ts,
        })
      }
    }
    return [...seen.values()]
  }, [items])
}

function watchText(a: Assignment, roleName: (id: string) => string): string {
  const parts = [...a.watch.roleIds.map(roleName), ...a.watch.capabilities.map(groupName)]
  return parts.join(', ')
}

function Form({
  session,
  feature,
  onBack,
}: {
  session: PlayerSession
  feature: EvaluatorFeature
  onBack: () => void
}) {
  const assignment = useStore(feature.state, (s) => s.assignment)
  const observations = useStore(feature.state, (s) => s.observations)
  const dismissed = useStore(feature.state, (s) => s.dismissedRows)
  const ended = useStore(feature.state, (s) => s.ended)
  const info = useStore(session.store, (s) => s.info)
  const released = useReleased(session)
  const [filter, setFilter] = useState<TaskFilter>('mine')
  const [limit, setLimit] = useState(false)

  const roleName = (id: string) => info?.seats.find((s) => s.id === id)?.name ?? id
  const tasks = useMemo(() => assignment?.tasks ?? [], [assignment])
  const byTask = useMemo(() => {
    const m = new Map<string, LocalObservation>()
    for (const o of observations) if (o.kind === 'task' && o.taskId) m.set(o.taskId, o)
    return m
  }, [observations])
  const rated = useMemo(
    () => new Set([...byTask].filter(([, o]) => o.rating).map(([id]) => id)),
    [byTask],
  )
  const entries = useMemo(
    () => watchFor(tasks, released, rated, dismissed),
    [tasks, released, rated, dismissed],
  )
  const due = useMemo(() => new Set(entries.flatMap((e) => e.tasks.map((t) => t.id))), [entries])
  const shown = assignment
    ? filterTasks(tasks, filter, { watch: assignment.watch, rated, due })
    : []
  const groups = groupByCapability(shown)
  const pending = pendingCount(observations)
  const generals = observations.filter((o) => o.kind === 'note')
  const capabilities = [...new Set(tasks.map((t) => t.capability))].filter(
    (c) => c !== EXPECTED_GROUP,
  )

  const save = (input: ObservationInput) => {
    void feature.save(input).then((r) => setLimit(!r.ok && r.reason === 'limit'))
  }
  const jump = (taskId: string) => {
    setFilter('all')
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`[data-task="${CSS.escape(taskId)}"]`)
      card?.scrollIntoView({ block: 'center' })
      card?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus()
    })
  }

  return (
    <section className="screen evaluate" aria-labelledby="evaluate-heading" data-screen="evaluate">
      <button type="button" className="btn btn--quiet back" onClick={onBack}>
        <span aria-hidden="true">‹ </span>
        {EVAL.back}
      </button>
      <div className="screen__head">
        <h1 id="evaluate-heading">{EVAL.heading}</h1>
      </div>
      <p className="evaluate__who muted">
        {assignment
          ? EVAL.watching(assignment.label, watchText(assignment, roleName) || EVAL.everything)
          : ''}
      </p>
      <p className="evaluate__rule">{EVAL.rule}</p>
      {ended ? <p className="join__attribution">{EVAL.ended}</p> : null}
      {limit ? (
        <p className="join__error" role="alert">
          {EVAL.limit}
        </p>
      ) : null}
      <WatchForStrip entries={entries} onDismiss={(r) => feature.dismissRow(r)} onJump={jump} />
      {!assignment ? (
        <div className="empty">
          <p className="empty__title">{EVAL.waiting}</p>
          <p className="muted">{EVAL.waitingHint}</p>
        </div>
      ) : (
        <>
          {tasks.length === 0 ? (
            <div className="empty">
              <p className="empty__title">{EVAL.noTasks}</p>
              <p className="muted">{EVAL.noTasksHint}</p>
            </div>
          ) : (
            <>
              <fieldset className="choice evaluate__filters">
                <legend>{EVAL.filters}</legend>
                {FILTERS.map((f) => (
                  <label key={f.id} className="choice__option">
                    <input
                      type="radio"
                      name="eval-filter"
                      value={f.id}
                      checked={filter === f.id}
                      onChange={() => setFilter(f.id)}
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </fieldset>
              {groups.length === 0 ? <p className="muted">{EVAL.nothingMatches}</p> : null}
              <div className="evaluate__groups">
                {groups.map((g) => {
                  const all = tasks.filter((t) => t.capability === g.capability)
                  return (
                    <section
                      key={g.capability}
                      className="evalgroup"
                      aria-labelledby={`g-${g.capability}`}
                    >
                      <h2 id={`g-${g.capability}`} className="h3">
                        {g.name}{' '}
                        <span className="muted evalgroup__count">
                          {EVAL.rated(all.filter((t) => rated.has(t.id)).length, all.length)}
                        </span>
                      </h2>
                      {g.tasks.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          roleName={roleName}
                          observation={byTask.get(t.id)}
                          released={released}
                          exerciseNow={() => session.exerciseTimeNow()}
                          readOnly={ended}
                          onSave={save}
                        />
                      ))}
                    </section>
                  )
                })}
              </div>
            </>
          )}
          {!ended ? (
            <GeneralObservation
              capabilities={capabilities}
              rowIds={[...new Set(released.map((r) => r.rowId))]}
              exerciseNow={() => session.exerciseTimeNow()}
              onSave={save}
            />
          ) : null}
          {generals.length ? (
            <section aria-labelledby="eval-general-heading" className="evalgeneral__list">
              <h2 id="eval-general-heading" className="h3">
                {EVAL.generalHeading}
              </h2>
              <ul>
                {generals.map((o) => (
                  <li key={o.observationId}>
                    <span className="mono">{o.exerciseTime}</span> {o.notes}
                    {o.capability ? (
                      <span className="muted"> · {groupName(o.capability)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      <p className="evaluate__pending" role="status" aria-live="polite">
        {pending > 0 ? EVAL.pending(pending) : observations.length ? EVAL.allSent : ''}
      </p>
    </section>
  )
}
