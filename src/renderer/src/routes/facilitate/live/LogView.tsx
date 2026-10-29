// The session log view (#417, spec 0417 FR-10): newest entries first, a kind filter, a text
// search, Load earlier, Star on messages, and Export JSON / CSV. It reads `live:log-tail` in
// pages and never holds the whole file.
import { useDeferredValue, useMemo, useState } from 'react'
import type { LogTailEntry } from '@shared/schemas/live'
import { call } from '../../../lib/api'
import { useIpcQuery, queryClient } from '../../../lib/query'
import { toast } from '../../../components/toast-store'
import { Button } from '../../../components/ui'
import { KIND_GROUPS, exportLog } from './log-actions'

const GROUP_LABEL: Record<string, string> = {
  all: 'All kinds',
  injects: 'Injects',
  messages: 'Messages',
  votes: 'Votes',
  hotwash: 'Hot wash',
  evaluation: 'Evaluation',
  devices: 'Devices',
  problems: 'Problems',
}

const time = (iso: string): string => iso.slice(11, 19)

export function LogRows(props: {
  entries: LogTailEntry[]
  onStar?: (messageId: string, on: boolean) => void
}) {
  return (
    <table className="table room-table">
      <caption className="room-caption">Session log, newest first</caption>
      <thead>
        <tr>
          <th scope="col">Entry</th>
          <th scope="col">Time</th>
          <th scope="col">Exercise time</th>
          <th scope="col">Kind</th>
          <th scope="col">Who</th>
          <th scope="col">What</th>
          {props.onStar && <th scope="col">Star</th>}
        </tr>
      </thead>
      <tbody>
        {props.entries.map((e) => (
          <tr key={e.i}>
            <th scope="row">{e.i}</th>
            <td>{time(e.at)}</td>
            <td>{e.ex ?? ''}</td>
            <td>{e.kind}</td>
            <td>{e.actor}</td>
            <td>{e.summary}</td>
            {props.onStar && (
              <td>
                {e.messageId && (
                  <Button
                    size="sm"
                    aria-pressed={e.starred === true}
                    aria-label={`${e.starred ? 'Unstar' : 'Star'} message ${e.i}`}
                    onClick={() => props.onStar!(e.messageId!, !e.starred)}
                  >
                    {e.starred ? 'Starred' : 'Star'}
                  </Button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function LogView(props: {
  projectPath: string
  scenarioId: string
  sessionId: string | undefined
  live?: boolean
}) {
  const [group, setGroup] = useState('all')
  const [text, setText] = useState('')
  const [names, setNames] = useState(false)
  const [paged, setPaged] = useState<{ key: string; entries: LogTailEntry[]; more: boolean }>()
  const q = useDeferredValue(text.trim())
  const filter = useMemo(
    () => ({
      ...(props.sessionId ? { sessionId: props.sessionId } : {}),
      ...(KIND_GROUPS[group]!.length ? { kinds: KIND_GROUPS[group]! } : {}),
      ...(q ? { q } : {}),
    }),
    [props.sessionId, group, q],
  )
  const base = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const first = useIpcQuery('live:log-tail', { ...base, ...filter, limit: 200 })
  const key = JSON.stringify(filter)
  // Older pages belong to the filter they were loaded under; a changed filter drops them.
  const older = paged?.key === key ? paged : undefined
  const entries = [...(first.data?.entries ?? []), ...(older?.entries ?? [])]
  const hasMore = older?.more ?? first.data?.hasMore ?? false

  const loadEarlier = async () => {
    const before = entries.at(-1)?.i
    if (!before) return
    const page = await call('live:log-tail', { ...base, ...filter, before, limit: 200 })
    setPaged({ key, entries: [...(older?.entries ?? []), ...page.entries], more: page.hasMore })
  }
  const star = (messageId: string, on: boolean) =>
    call('live:message-star', { ...base, messageId, on })
      .then(() => queryClient.invalidateQueries({ queryKey: ['live:log-tail'] }))
      .catch((e: unknown) => toast.error('Could not star the message', e))

  return (
    <section aria-label="Session log" className="room-log">
      <div className="room-log__controls">
        <label>
          Kind{' '}
          <select className="select" value={group} onChange={(e) => setGroup(e.target.value)}>
            {Object.keys(KIND_GROUPS).map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search{' '}
          <input
            className="input"
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label>
          <input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} />{' '}
          Include display names (named sessions only)
        </label>
        {props.sessionId && (
          <>
            <Button
              size="sm"
              onClick={() =>
                void exportLog({ ...base, sessionId: props.sessionId! }, 'json', names)
              }
            >
              Export JSON
            </Button>
            <Button
              size="sm"
              onClick={() => void exportLog({ ...base, sessionId: props.sessionId! }, 'csv', names)}
            >
              Export CSV
            </Button>
          </>
        )}
      </div>
      {first.isLoading ? (
        <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="muted">No entries match.</p>
      ) : (
        <LogRows
          entries={entries}
          {...(props.live === false
            ? {}
            : { onStar: (id: string, on: boolean) => void star(id, on) })}
        />
      )}
      {hasMore && <Button onClick={() => void loadEarlier()}>Load earlier</Button>}
    </section>
  )
}
