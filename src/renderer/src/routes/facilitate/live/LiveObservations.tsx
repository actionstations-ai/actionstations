// Live observations in the Evaluation tab (#416 FR-8): a coverage matrix (task by evaluator,
// each cell a word and an icon), the latest observations with filters by capability and
// evaluator, and "Ask to watch" for one evaluator. Hidden until a session runs.
import { useId, useState } from 'react'
import { capabilityName } from '@shared/core-capabilities'
import { RATING_LABELS, type Rating } from '@shared/schemas/evaluation'
import type { CoverageView } from '@shared/schemas/live'
import { Badge, Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { useIpcQuery } from '../../../lib/query'
import { useLiveEvaluation } from './use-live-evaluation'

const ICON: Record<Rating, string> = { met: '✓', partial: '◐', not_met: '✕', not_observed: '–' }
const EXPECTED_GROUP = 'expected-actions'
const groupName = (id: string) => (id === EXPECTED_GROUP ? 'Expected actions' : capabilityName(id))

function Matrix({ view }: { view: CoverageView }) {
  const cell = (taskId: string, ref: string) =>
    view.cells.find((c) => c.taskId === taskId && c.clientRef === ref)?.rating
  return (
    <div
      className="live-matrix"
      tabIndex={0}
      role="region"
      aria-label="Coverage by task and evaluator"
    >
      <table>
        <caption className="sr-only">Latest rating of each task by each evaluator</caption>
        <thead>
          <tr>
            <th scope="col">Task</th>
            {view.evaluators.map((e) => (
              <th scope="col" key={e.clientRef}>
                {e.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.tasks.map((t) => (
            <tr key={t.id}>
              <th scope="row">
                <span className="mono">{t.id}</span> {t.text}
                <span className="muted"> · {groupName(t.capability)}</span>
              </th>
              {view.evaluators.map((e) => {
                const r = cell(t.id, e.clientRef)
                return (
                  <td key={e.clientRef} data-rating={r ?? 'none'}>
                    {r ? (
                      <>
                        <span aria-hidden="true">{ICON[r]} </span>
                        {RATING_LABELS[r]}
                      </>
                    ) : (
                      <span aria-label="No rating yet">—</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AskToWatch(props: {
  view: CoverageView
  onAsk: (ref: string, text: string) => Promise<unknown>
}) {
  const { view } = props
  const id = useId()
  const [ref, setRef] = useState('')
  const [taskId, setTaskId] = useState('')
  const [busy, setBusy] = useState(false)
  const rated = new Set(view.cells.filter((c) => c.rating !== 'not_observed').map((c) => c.taskId))
  const open = view.tasks.filter((t) => !rated.has(t.id))
  const online = view.evaluators.filter((e) => e.online)
  if (online.length === 0 || open.length === 0) return null
  const evaluator = ref || online[0]!.clientRef
  const task = open.find((t) => t.id === taskId) ?? open[0]!
  const send = async () => {
    setBusy(true)
    try {
      await props.onAsk(
        evaluator,
        `Please watch for ${task.id} (${task.text}) at the next inject.`.slice(0, 500),
      )
      toast.success('Asked the evaluator to watch')
    } catch (e) {
      toast.error('Could not send the request', e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="live-ask">
      <div className="field">
        <label className="field__label" htmlFor={`${id}-ev`}>
          Evaluator
        </label>
        <select
          id={`${id}-ev`}
          className="select"
          value={evaluator}
          onChange={(e) => setRef(e.target.value)}
        >
          {online.map((e) => (
            <option key={e.clientRef} value={e.clientRef}>
              {e.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-task`}>
          Task nobody has rated
        </label>
        <select
          id={`${id}-task`}
          className="select"
          value={task.id}
          onChange={(e) => setTaskId(e.target.value)}
        >
          {open.map((t) => (
            <option key={t.id} value={t.id}>
              {t.id} · {t.text.slice(0, 60)}
            </option>
          ))}
        </select>
      </div>
      <Button size="sm" disabled={busy} onClick={() => void send()}>
        Ask to watch
      </Button>
    </div>
  )
}

function Stream({ view }: { view: CoverageView }) {
  const id = useId()
  const [capability, setCapability] = useState('')
  const [evaluator, setEvaluator] = useState('')
  const capabilityOf = (taskId: string | undefined) =>
    view.tasks.find((t) => t.id === taskId)?.capability
  const rows = view.latest.filter(
    (o) =>
      (!evaluator || o.clientRef === evaluator) &&
      (!capability || (o.capability ?? capabilityOf(o.taskId)) === capability),
  )
  const capabilities = [...new Set(view.tasks.map((t) => t.capability))]
  return (
    <>
      <div className="row live-filters">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-cap`}>
            Capability
          </label>
          <select
            id={`${id}-cap`}
            className="select"
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
          >
            <option value="">All capabilities</option>
            {capabilities.map((c) => (
              <option key={c} value={c}>
                {groupName(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-ev`}>
            Evaluator
          </label>
          <select
            id={`${id}-ev`}
            className="select"
            value={evaluator}
            onChange={(e) => setEvaluator(e.target.value)}
          >
            <option value="">All evaluators</option>
            {view.evaluators.map((e) => (
              <option key={e.clientRef} value={e.clientRef}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">No observations match.</p>
      ) : (
        <ul className="live-stream">
          {rows.map((o) => (
            <li key={o.observationId}>
              <span className="mono">{o.exerciseTime}</span> {o.label}{' '}
              {o.taskId ? <span className="mono">{o.taskId}</span> : <span>General</span>}
              {o.rating ? (
                <>
                  {' '}
                  <strong>
                    <span aria-hidden="true">{ICON[o.rating]} </span>
                    {RATING_LABELS[o.rating]}
                  </strong>
                </>
              ) : null}
              {o.note ? <span> “{o.note}”</span> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const SOURCE_LABEL = {
  facilitate: 'Facilitator',
  paper: 'Paper',
  live: 'Evaluator device',
} as const

/** Every recorded observation, the facilitator's own and the evaluators', told apart by source. */
function Recorded(props: { projectPath: string; scenarioId: string }) {
  const record = useIpcQuery('evaluation:get', props)
  const rows = [...(record.data?.observations ?? [])]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 50)
  if (rows.length === 0) return null
  return (
    <>
      <h3 className="h3">Recorded observations</h3>
      <ul className="live-stream">
        {rows.map((o) => (
          <li key={o.id}>
            <Badge tone={o.source === 'live' ? 'info' : 'neutral'}>{SOURCE_LABEL[o.source]}</Badge>{' '}
            {o.evaluator ? `${o.evaluator} · ` : ''}
            <span className="mono">{o.taskId ?? o.criterionId ?? o.rowId ?? 'General'}</span>{' '}
            <strong>
              <span aria-hidden="true">{ICON[o.rating]} </span>
              {RATING_LABELS[o.rating]}
            </strong>
            {o.note ? <span> “{o.note}”</span> : null}
          </li>
        ))}
      </ul>
    </>
  )
}

export function LiveObservations(props: { projectPath: string; scenarioId: string }) {
  const live = useLiveEvaluation(props.projectPath, props.scenarioId)
  if (!live.active) return null
  const view = live.coverage
  return (
    <section className="live-observations" aria-labelledby="live-obs-heading">
      <h2 id="live-obs-heading" className="fac-eval__title">
        Live observations
      </h2>
      {live.error && (
        <p className="field__error" role="alert">
          Could not load the live observations.
        </p>
      )}
      {!view && !live.error && <p className="muted">Loading…</p>}
      {view && view.evaluators.length === 0 && (
        <p className="muted">
          No evaluators have joined. Open the staff link on a tablet and choose the Evaluator seat.
        </p>
      )}
      {view && view.evaluators.length > 0 && (
        <>
          <p role="status" aria-live="polite">
            Coverage {view.covered} of {view.tasks.length} tasks ·{' '}
            {view.evaluators.filter((e) => e.online).length} of {view.evaluators.length} evaluators
            connected · {view.observations} observations
          </p>
          <Matrix view={view} />
          <AskToWatch view={view} onAsk={live.ask} />
          <h3 className="h3">Latest</h3>
          <Stream view={view} />
          <Recorded projectPath={props.projectPath} scenarioId={props.scenarioId} />
        </>
      )}
    </section>
  )
}
