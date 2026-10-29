import type { Connection } from '../app/session'
import { STRINGS } from '../app/strings'

/** Connection state as a dot plus text (never color alone). */
export function ConnectionDot({ connection, back }: { connection: Connection; back: boolean }) {
  const shown: Connection = connection === 'dropped' ? 'connected' : connection
  const text = back
    ? STRINGS.header.back
    : shown === 'connected'
      ? STRINGS.header.connected
      : shown === 'offline'
        ? STRINGS.header.offline
        : STRINGS.header.reconnecting
  return (
    <span className={`conn conn--${shown}`} role="status">
      <span className="conn__dot" aria-hidden="true" />
      <span className="conn__text">{text}</span>
    </span>
  )
}
