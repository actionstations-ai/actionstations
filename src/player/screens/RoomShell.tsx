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
import { NO_HELPER_STATE } from '../features/simcell/helper'
import { DrillBanner } from '../features/drills/DrillBanner'
import { DrillScreen } from '../features/drills/DrillScreen'
import { SurveyBanner } from '../features/surveys/SurveyBanner'
import { SurveysScreen } from '../features/surveys/SurveysScreen'
import { CallBanner, CallScreen } from '../features/calls/CallScreen'
import { VoteBanner } from '../features/votes/VoteBanner'
import { VoteScreen } from '../features/votes/VoteScreen'
import { currentVote } from '../features/votes/votes'
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
  const [surveys, setSurveys] = useState<{ initial?: string } | undefined>(undefined)
  const [drillId, setDrillId] = useState<string | undefined>(undefined)
  const [voteId, setVoteId] = useState<string | undefined>(undefined)
  const [callId, setCallId] = useState<string | undefined>(undefined)
  const info = useStore(session.store, (s) => s.info)
  const [tab, setTab] = useState<Tab>(surveysOnly(info) ? 'more' : 'inbox')
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
  const helperDrafts = useStore(session.simcell?.state ?? NO_HELPER_STATE, (s) => s.drafts.length)

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
    { id: 'more', label: STRINGS.tabs.more, badge: seat?.kind === 'simcell' ? helperDrafts : 0 },
  ]
  const select = (next: Tab) => {
    if (next === 'messages' && !canMessage) return
    setSurveys(undefined)
    setDrillId(undefined)
    setTab(next)
  }
  const seatName = seat?.role
    ? `${seat.role.name}${seat.role.abbreviation ? ` (${seat.role.abbreviation})` : ''}`
    : seat?.kind === 'evaluator'
      ? 'Evaluator'
      : seat?.kind === 'observer'
        ? 'Observer'
        : seat?.kind === 'simcell'
          ? 'SimCell'
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
      <CallBanner session={session} onOpen={setCallId} viewing={callId} />
      <VoteBanner session={session} onOpen={setVoteId} viewing={voteId} />
      <SurveyBanner
        session={session}
        onOpen={(initial) => setSurveys({ initial })}
        viewing={!!surveys}
      />
      <DrillBanner session={session} onOpen={setDrillId} viewing={!!drillId} />
      <main className="room__main" id="content">
        {callId ? (
          <CallScreen session={session} callId={callId} onClose={() => setCallId(undefined)} />
        ) : null}
        {!callId && voteId ? (
          <VoteScreen session={session} voteId={voteId} onBack={() => setVoteId(undefined)} />
        ) : null}
        {!voteId && !callId && !surveys && drillId ? (
          <DrillScreen session={session} drillId={drillId} onBack={() => setDrillId(undefined)} />
        ) : null}
        {!voteId && !callId && surveys ? (
          <SurveysScreen
            session={session}
            initialId={surveys.initial}
            onBack={() => setSurveys(undefined)}
          />
        ) : null}
        {!voteId && !surveys && !callId && !drillId && tab === 'inbox' ? (
          <InboxScreen session={session} />
        ) : null}
        {!voteId && !surveys && !callId && !drillId && tab === 'feed' ? (
          <FeedScreen session={session} onOpenTab={select} />
        ) : null}
        {!voteId && !surveys && !callId && !drillId && tab === 'messages' ? (
          <MessagesScreen session={session} />
        ) : null}
        {!voteId && !surveys && !callId && !drillId && tab === 'more' ? (
          <MoreScreen
            session={session}
            prefsStore={prefsStore}
            bundleVersion={bundleVersion}
            onOpenSurveys={() => setSurveys({})}
            onOpenVotes={() => setVoteId(currentVote(session.state.votes)?.voteId ?? 'none')}
          />
        ) : null}
      </main>
      <TabBar tabs={tabs} active={tab} onSelect={select} />
    </div>
  )
}

/** A session for surveys only: the room opens on More, where Surveys is the one entry in use. */
const surveysOnly = (info: PlayerSession['state']['info']): boolean =>
  !!info && info.features.surveys && !info.features.messages && !info.features.votes

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
