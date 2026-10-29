// The tables and summaries of the Room (#417, spec 0417 FR-8). Every count is text, every table
// has a caption and column headers, and nothing relies on colour alone.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { DashboardView, InjectRow } from '@shared/schemas/live'
import { Badge, Button } from '../../../components/ui'
import { ANSWER_LABEL, clock, minutes, targetLabel } from './room-format'

export type RoleName = (id: string) => string | undefined

export function RosterSummary({ view }: { view: DashboardView }) {
  return (
    <table className="table room-table">
      <caption className="room-caption">Seats</caption>
      <thead>
        <tr>
          <th scope="col">Seat</th>
          <th scope="col">Connected</th>
          <th scope="col">Removed</th>
        </tr>
      </thead>
      <tbody>
        {view.roster.map((r) => (
          <tr key={r.seat}>
            <th scope="row">{r.label}</th>
            <td>
              {r.connected}
              {r.names.length > 0 && <span className="muted"> ({r.names.join(', ')})</span>}
              {r.empty && <Badge tone="warn">Empty</Badge>}
            </td>
            <td>{r.removed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function answerText(r: InjectRow): string {
  if (!r.answered) return r.expectsResponse ? 'None yet' : 'Not expected'
  const t = r.responseSec !== undefined ? ` in ${clock(r.responseSec)}` : ''
  return `${ANSWER_LABEL[r.answered]}${t}`
}

export function InjectsTable(props: { view: DashboardView; roleName: RoleName }) {
  const { injects } = props.view
  if (!injects.length) return <p className="muted">No inject has been released yet.</p>
  return (
    <table className="table room-table">
      <caption className="room-caption">Released injects</caption>
      <thead>
        <tr>
          <th scope="col">Row</th>
          <th scope="col">To</th>
          <th scope="col">Delivered</th>
          <th scope="col">Read</th>
          <th scope="col">Acted on</th>
          <th scope="col">First read</th>
          <th scope="col">Response</th>
          <th scope="col">Age</th>
        </tr>
      </thead>
      <tbody>
        {injects.map((r) => (
          <tr key={r.releaseId}>
            <th scope="row">
              {r.rowId}
              {r.withdrawn && <span className="muted"> (withdrawn)</span>}
            </th>
            <td>{r.targets.map((t) => targetLabel(t, props.roleName)).join(', ')}</td>
            <td>{`${r.delivered} of ${r.expected}`}</td>
            <td>{`${r.read} of ${r.expected}`}</td>
            <td>{`${r.actioned} of ${r.expected}`}</td>
            <td>{r.firstReadSec !== undefined ? clock(r.firstReadSec) : 'None yet'}</td>
            <td>{answerText(r)}</td>
            <td>{minutes(r.ageMin)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Rows that became unanswered since the last render, each announced once. */
function useNewUnanswered(
  ids: string[],
  rowOf: (id: string) => string,
  ageOf: (id: string) => number,
) {
  const seen = useRef(new Set<string>())
  const [message, setMessage] = useState('')
  const key = ids.join('|')
  useEffect(() => {
    const fresh = ids.filter((id) => !seen.current.has(id))
    for (const id of ids) seen.current.add(id)
    if (fresh.length) {
      setMessage(
        fresh.map((id) => `${rowOf(id)} has had no response for ${minutes(ageOf(id))}.`).join(' '),
      )
    }
    // `key` stands for `ids`; the callbacks only read the current view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return message
}

export function UnansweredList(props: {
  view: DashboardView
  onMarkAnswered: (releaseId: string) => void
}) {
  const { unanswered, unansweredAfterMin } = props.view
  const announce = useNewUnanswered(
    unanswered.map((u) => u.releaseId),
    (id) => unanswered.find((u) => u.releaseId === id)?.rowId ?? id,
    (id) => unanswered.find((u) => u.releaseId === id)?.ageMin ?? 0,
  )
  return (
    <section aria-labelledby="room-unanswered">
      <h3 id="room-unanswered" className="room-heading">
        Unanswered injects
      </h3>
      <p role="status" className="sr-only">
        {announce}
      </p>
      {unanswered.length === 0 ? (
        <p className="muted">
          None. A row that expects a response is flagged after {unansweredAfterMin} minutes without
          one.
        </p>
      ) : (
        <ul className="room-list">
          {unanswered.map((u) => (
            <li key={u.releaseId}>
              <Badge tone="warn">{`No response · ${minutes(u.ageMin)}`}</Badge> {u.rowId}{' '}
              <Button size="sm" onClick={() => props.onMarkAnswered(u.releaseId)}>
                {`Mark ${u.rowId} answered`}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="room-line">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const tally = (t: { label: string; count: number }[]): string =>
  t.map((x) => `${x.label} ${x.count}`).join(', ')

export function MessagesSummary({ view }: { view: DashboardView }) {
  const m = view.messages
  const waiting = m.waiting.length
    ? `${m.waiting.length} waiting, oldest ${minutes(m.waiting[0]!.waitingMin)}`
    : 'none waiting'
  return (
    <Line label="Messages">
      {m.threads} {m.threads === 1 ? 'thread' : 'threads'}, {waiting}
      {m.medianReplySec !== undefined && `, median reply ${clock(m.medianReplySec)}`}
    </Line>
  )
}

export function VotesSummary({ view }: { view: DashboardView }) {
  const { open, lastClosed } = view.votes
  return (
    <Line label="Votes">
      {open ? `Open: ${open.question} (${tally(open.tally)})` : 'None open'}
      {lastClosed && `. Last closed: ${lastClosed.question} (${tally(lastClosed.tally)})`}
    </Line>
  )
}

export function HotWashSummary({ view }: { view: DashboardView }) {
  const h = view.hotwash
  return (
    <Line label="Hot wash">
      {h.open ? 'Open on devices' : 'Not open'}, {h.items} {h.items === 1 ? 'item' : 'items'},{' '}
      {h.plusOnes} agrees, {h.promoted} promoted
    </Line>
  )
}

export function EvaluationSummary({ view }: { view: DashboardView }) {
  const e = view.evaluation
  return (
    <Line label="Evaluation">
      {e.observations} {e.observations === 1 ? 'observation' : 'observations'},{' '}
      {e.evaluatorsConnected} {e.evaluatorsConnected === 1 ? 'evaluator' : 'evaluators'} connected
    </Line>
  )
}

export function HealthStrip({ view }: { view: DashboardView }) {
  const h = view.health
  const dropped = h.dropped.reduce((n, d) => n + d.count, 0)
  const reasons = h.dropped.map((d) => `${d.reason} ${d.count}`).join(', ')
  return (
    <p className="room-health">
      {view.connected} connected · dropped frames {dropped}
      {reasons && ` (${reasons})`} · rejected {h.rejected} · log entry {h.lastIndex},{' '}
      {Math.ceil(h.logBytes / 1024)} KiB
      {h.protocolVersion !== undefined && ` · protocol ${h.protocolVersion}`}
    </p>
  )
}
