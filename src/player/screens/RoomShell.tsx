import { useEffect, useMemo, useState } from 'react'
import { focusHeading } from '../app/a11y'
import { inboxItems } from '../app/items'
import { unreadCount } from '../app/messages'
import type { Prefs } from '../app/prefs'
import type { PlayerSession } from '../app/session'
import { useStore, type Store } from '../app/store'
import { STRINGS } from '../app/strings'
import { Banner } from '../components/Banner'
import { Clock } from '../components/Clock'
import { ConnectionDot } from '../components/ConnectionDot'
import { TabBar, type Tab, type TabSpec } from '../components/TabBar'
import { FeedScreen } from './FeedScreen'
import { InboxScreen } from './InboxScreen'
import { MessagesScreen } from './MessagesScreen'
import { MoreScreen } from './MoreScreen'

/** Header (clock, title, seat, connection), banners, the active section and the tab bar. */
export function RoomShell({
  session,
  prefsStore,
  bundleVersion,
}: {
  session: PlayerSession
  prefsStore: Store<Prefs>
  bundleVersion: string
}) {
  const [tab, setTab] = useState<Tab>('inbox')
  const info = useStore(session.store, (s) => s.info)
  const seat = useStore(session.store, (s) => s.seat)
  const clock = useStore(session.store, (s) => s.clock)
  const offset = useStore(session.store, (s) => s.clockOffsetMs)
  const connection = useStore(session.store, (s) => s.connection)
  const catchingUp = useStore(session.store, (s) => s.catchingUp)
  const retryNotice = useStore(session.store, (s) => s.retryNotice)
  const backUntil = useStore(session.store, (s) => s.backUntil)
  const items = useStore(session.store, (s) => s.items)
  const read = useStore(session.store, (s) => s.read)
  const clientId = useStore(session.store, (s) => s.clientId)
  const chats = useStore(session.store, (s) => s.messages)
  const compose = useStore(session.store, (s) => s.compose)
  const back = useBack(backUntil)

  const unread = useMemo(() => {
    const view = seat
      ? { clientId, kind: seat.kind, roleId: seat.role?.id, teamId: seat.role?.teamId }
      : undefined
    return inboxItems(items, view).filter((i) => !read.has(i.key)).length
  }, [items, read, seat, clientId])

  useEffect(() => {
    focusHeading()
  }, [tab])
  // "Reply to SimCell" on an inject opens the Messages tab.
  const [seenReply, setSeenReply] = useState(0)
  if (compose && compose.nonce !== seenReply) {
    setSeenReply(compose.nonce)
    setTab('messages')
  }

  const canMessage = !!info?.features.messages && seat?.kind === 'player'
  const unreadChats = canMessage ? unreadCount(chats, read) : 0

  const tabs: TabSpec[] = [
    { id: 'inbox', label: STRINGS.tabs.inbox, badge: unread },
    { id: 'feed', label: STRINGS.tabs.feed },
    {
      id: 'messages',
      label: STRINGS.tabs.messages,
      badge: unreadChats,
      ...(canMessage ? {} : { disabledReason: STRINGS.messages.emptyDisabled }),
    },
    { id: 'more', label: STRINGS.tabs.more },
  ]
  const select = (next: Tab) => {
    if (next === 'messages' && !canMessage) return
    setTab(next)
  }
  const seatName = seat?.role
    ? `${seat.role.name}${seat.role.abbreviation ? ` (${seat.role.abbreviation})` : ''}`
    : seat?.kind === 'evaluator'
      ? 'Evaluator'
      : seat?.kind === 'observer'
        ? 'Observer'
        : ''

  return (
    <div className="room" data-screen="room">
      <header className="room__head">
        <div className="room__row">
          <Clock clock={clock} offsetMs={offset} />
          <p className="room__title">{info?.scenarioTitle ?? STRINGS.app}</p>
          <ConnectionDot connection={connection} back={back} />
        </div>
        <p className="room__seat">
          <span className="sr-only">{STRINGS.header.seat}: </span>
          {seatName}
        </p>
      </header>
      {connection === 'offline' ? (
        <Banner tone="warning">{STRINGS.banner.offline}</Banner>
      ) : connection === 'reconnecting' ? (
        <Banner tone="warning">{STRINGS.banner.reconnecting}</Banner>
      ) : retryNotice ? (
        <Banner tone="warning">
          {retryNotice === 'session-full' ? STRINGS.banner.sessionFull : STRINGS.banner.rateLimited}
        </Banner>
      ) : catchingUp ? (
        <Banner tone="info">{STRINGS.banner.catchingUp}</Banner>
      ) : back ? (
        <Banner tone="success">{STRINGS.header.back}</Banner>
      ) : null}
      <main className="room__main" id="content">
        {tab === 'inbox' ? <InboxScreen session={session} /> : null}
        {tab === 'feed' ? <FeedScreen session={session} onOpenTab={select} /> : null}
        {tab === 'messages' ? <MessagesScreen session={session} /> : null}
        {tab === 'more' ? (
          <MoreScreen session={session} prefsStore={prefsStore} bundleVersion={bundleVersion} />
        ) : null}
      </main>
      <TabBar tabs={tabs} active={tab} onSelect={select} />
    </div>
  )
}

/** True while "You're back" should show: from `until` being set to the moment it passes. */
function useBack(until: number | undefined): boolean {
  const [expired, setExpired] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (until === undefined) return
    const id = setTimeout(() => setExpired(until), Math.max(0, until - Date.now()) + 20)
    return () => clearTimeout(id)
  }, [until])
  return until !== undefined && expired !== until
}
