import { STRINGS } from '../../app/strings'

export interface ThreadRow {
  channel: string
  name: string
  last: string
  unread: number
}

/** The seat's conversations; shown only when there is more than one. */
export function ThreadList({
  rows,
  onOpen,
}: {
  rows: ThreadRow[]
  onOpen: (channel: string) => void
}) {
  return (
    <ul className="list" aria-label={STRINGS.messages.threads}>
      {rows.map((r) => (
        <li key={r.channel} className="list__row">
          <button
            type="button"
            className="card thread-row"
            aria-label={STRINGS.messages.openThread(r.name)}
            onClick={() => onOpen(r.channel)}
          >
            <span className="card__title">{r.name}</span>
            {r.unread ? <span className="pill">{STRINGS.messages.unread(r.unread)}</span> : null}
            <span className="card__alt">{r.last}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
