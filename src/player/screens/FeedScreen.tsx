import { useMemo } from 'react'
import { seatNamer } from '../app/items'
import { isFeedItem } from '../app/items'
import type { PlayerSession } from '../app/session'
import { useStore } from '../app/store'
import { STRINGS } from '../app/strings'
import { EmptyState } from '../components/EmptyState'
import { ItemList } from '../components/ItemList'
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
  const nameFor = useMemo(() => seatNamer(seats ?? []), [seats])
  const feed = useMemo(() => {
    const view = seat
      ? { clientId, kind: seat.kind, roleId: seat.role?.id, teamId: seat.role?.teamId }
      : undefined
    return items.filter((i) => isFeedItem(i, view) && !dismissed.has(i.key))
  }, [items, seat, clientId, dismissed])
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
          onDismiss={(k) => session.dismiss(k)}
          onOpenTab={() => onOpenTab('more')}
        />
      )}
    </section>
  )
}
