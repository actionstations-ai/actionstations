import { useMemo, useState } from 'react'
import { focusHeading } from '../app/a11y'
import { seatNamer } from '../app/items'
import { feedItems } from '../app/items'
import type { PlayerSession } from '../app/session'
import { useStore } from '../app/store'
import { STRINGS } from '../app/strings'
import { EmptyState } from '../components/EmptyState'
import { ItemList } from '../components/ItemList'
import { InjectDetail } from '../features/injects/InjectDetail'
import type { Tab } from '../components/TabBar'

/** What everyone saw: items to all, notices, clock changes, vote and hot wash announcements. */
export function FeedScreen({
  session,
  onOpenTab,
}: {
  session: PlayerSession
  onOpenTab: (tab: Tab) => void
}) {
  const items = useStore(session.store, (s) => s.items)
  const read = useStore(session.store, (s) => s.read)
  const dismissed = useStore(session.store, (s) => s.dismissed)
  const seat = useStore(session.store, (s) => s.seat)
  const clientId = useStore(session.store, (s) => s.clientId)
  const seats = useStore(session.store, (s) => s.info?.seats)
  const [openKey, setOpenKey] = useState<string | undefined>()
  const nameFor = useMemo(() => seatNamer(seats ?? []), [seats])
  const feed = useMemo(() => {
    const view = seat
      ? { clientId, kind: seat.kind, roleId: seat.role?.id, teamId: seat.role?.teamId }
      : undefined
    return feedItems(items, view).filter((i) => !dismissed.has(i.key))
  }, [items, seat, clientId, dismissed])
  const opened = openKey ? items.find((i) => i.key === openKey && i.inject) : undefined
  if (opened) {
    return (
      <InjectDetail
        session={session}
        item={opened}
        backLabel={STRINGS.feed.heading}
        onBack={() => {
          setOpenKey(undefined)
          queueMicrotask(() => focusHeading())
        }}
      />
    )
  }
  return (
    <section className="screen" aria-labelledby="feed-heading" data-screen="feed">
      <div className="screen__head">
        <h1 id="feed-heading">{STRINGS.feed.heading}</h1>
      </div>
      {feed.length === 0 ? (
        <EmptyState title={STRINGS.feed.empty} hint={STRINGS.feed.emptyHint} />
      ) : (
        <ItemList
          items={feed}
          read={read}
          label={STRINGS.feed.heading}
          onRead={(k) => session.markRead(k)}
          nameFor={nameFor}
          onOpen={setOpenKey}
          onDismiss={(k) => session.dismiss(k)}
          onOpenTab={() => onOpenTab('more')}
        />
      )}
    </section>
  )
}
