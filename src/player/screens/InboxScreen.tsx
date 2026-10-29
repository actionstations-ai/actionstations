import { useMemo, useState } from 'react'
import { focusHeading } from '../app/a11y'
import { seatNamer } from '../app/items'
import { inboxItems } from '../app/items'
import type { PlayerSession } from '../app/session'
import { useStore } from '../app/store'
import { STRINGS } from '../app/strings'
import { EmptyState } from '../components/EmptyState'
import { ItemList } from '../components/ItemList'
import { InjectDetail } from '../features/injects/InjectDetail'

/** What was addressed to this seat (role, team or device). */
export function InboxScreen({ session }: { session: PlayerSession }) {
  const items = useStore(session.store, (s) => s.items)
  const read = useStore(session.store, (s) => s.read)
  const seat = useStore(session.store, (s) => s.seat)
  const clientId = useStore(session.store, (s) => s.clientId)
  const seats = useStore(session.store, (s) => s.info?.seats)
  const [openKey, setOpenKey] = useState<string | undefined>()
  const nameFor = useMemo(() => seatNamer(seats ?? []), [seats])
  const inbox = useMemo(() => {
    const view = seat
      ? { clientId, kind: seat.kind, roleId: seat.role?.id, teamId: seat.role?.teamId }
      : undefined
    return inboxItems(items, view)
  }, [items, seat, clientId])
  const unread = inbox.filter((i) => !read.has(i.key)).length
  const opened = openKey ? items.find((i) => i.key === openKey && i.inject) : undefined
  if (opened) {
    return (
      <InjectDetail
        session={session}
        item={opened}
        backLabel={STRINGS.inbox.heading}
        onBack={() => {
          setOpenKey(undefined)
          queueMicrotask(() => focusHeading())
        }}
      />
    )
  }
  return (
    <section className="screen" aria-labelledby="inbox-heading" data-screen="inbox">
      <div className="screen__head">
        <h1 id="inbox-heading">{STRINGS.inbox.heading}</h1>
        {unread ? <span className="pill">{STRINGS.tabs.unread(unread)}</span> : null}
      </div>
      {inbox.length === 0 ? (
        <EmptyState title={STRINGS.inbox.empty} hint={STRINGS.inbox.emptyHint} />
      ) : (
        <ItemList
          items={inbox}
          read={read}
          label={STRINGS.inbox.heading}
          onRead={(k) => session.markRead(k)}
          nameFor={nameFor}
          onOpen={setOpenKey}
        />
      )}
    </section>
  )
}
