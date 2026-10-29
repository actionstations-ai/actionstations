// Past and interrupted sessions of the scenario (#417, spec 0417 FR-6): the summary counts,
// Export JSON / CSV, View (the Room for that session), Close as ended for an interrupted
// session, and Delete session data.
import { useState } from 'react'
import type { LiveSessionSummary } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { call } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'
import { toast } from '../../../components/toast-store'
import { Badge, Button } from '../../../components/ui'
import { exportLog } from './log-actions'
import { RoomPanel } from './RoomPanel'

const when = (iso: string): string => iso.replace('T', ' ').slice(0, 16)

function duration(s: LiveSessionSummary): string {
  if (!s.endedAt) return 'not ended'
  const min = Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60_000)
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`
}

export const DELETE_CONFIRM =
  'Delete this session’s data? This removes its log, attachments and staged media from the project folder and cannot be undone. The facilitator notes and evaluation for the scenario are not touched.'

export function SessionRow(props: {
  session: LiveSessionSummary
  onView: () => void
  onExport: (format: 'json' | 'csv') => void
  onClose: () => void
  onDelete: () => void
}) {
  const { session: s } = props
  const c = s.counts
  return (
    <tr>
      <th scope="row">
        {s.name} <span className="muted">{when(s.startedAt)}</span>{' '}
        {s.interrupted && <Badge tone="warn">Interrupted</Badge>}
      </th>
      <td>{duration(s)}</td>
      <td>{`${c.clients} devices, ${c.releases} releases, ${c.messages} messages, ${c.votes} votes, ${c.hotwashItems} hot wash items, ${c.observations} observations`}</td>
      <td className="room-actions">
        <Button size="sm" onClick={props.onView} aria-label={`View ${s.name}`}>
          View
        </Button>
        <Button
          size="sm"
          onClick={() => props.onExport('json')}
          aria-label={`Export JSON of ${s.name}`}
        >
          Export JSON
        </Button>
        <Button
          size="sm"
          onClick={() => props.onExport('csv')}
          aria-label={`Export CSV of ${s.name}`}
        >
          Export CSV
        </Button>
        {s.interrupted && (
          <Button size="sm" onClick={props.onClose} aria-label={`Close ${s.name} as ended`}>
            Close as ended
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          onClick={props.onDelete}
          aria-label={`Delete data of ${s.name}`}
        >
          Delete session data
        </Button>
      </td>
    </tr>
  )
}

export function SessionsList(props: { projectPath: string; scenario: Scenario }) {
  const base = { projectPath: props.projectPath, scenarioId: props.scenario.id }
  const sessions = useIpcQuery('live:sessions-list', base)
  const [viewing, setViewing] = useState<string | undefined>()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['live:sessions-list'] })
  const run = (fn: () => Promise<unknown>, failure: string) =>
    void fn()
      .then(refresh)
      .catch((e: unknown) => toast.error(failure, e))
  const list = sessions.data ?? []
  if (!list.length) return null
  return (
    <section aria-labelledby="past-sessions" className="live-past">
      <h3 id="past-sessions" className="room-heading">
        Past sessions
      </h3>
      <table className="table room-table">
        <caption className="sr-only">Past sessions of this scenario</caption>
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Length</th>
            <th scope="col">Record</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              onView={() => setViewing(viewing === s.id ? undefined : s.id)}
              onExport={(format) => void exportLog({ ...base, sessionId: s.id }, format, false)}
              onClose={() =>
                run(
                  () => call('live:session-close', { ...base, sessionId: s.id }),
                  'Could not close the session',
                )
              }
              onDelete={() => {
                if (!window.confirm(DELETE_CONFIRM)) return
                if (viewing === s.id) setViewing(undefined)
                run(
                  () => call('live:session-delete', { ...base, sessionId: s.id }),
                  'Could not delete the session data',
                )
              }}
            />
          ))}
        </tbody>
      </table>
      {viewing && (
        <RoomPanel projectPath={props.projectPath} scenario={props.scenario} sessionId={viewing} />
      )}
    </section>
  )
}
