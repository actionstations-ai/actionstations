import { useMemo, useState } from 'react'
import { focusHeading } from '../app/a11y'
import { threadChannels } from '../app/messages'
import type { PlayerSession } from '../app/session'
import { useStore } from '../app/store'
import { STRINGS } from '../app/strings'
import { EmptyState } from '../components/EmptyState'
import { Thread } from '../features/messages/Thread'
import { ThreadList, type ThreadRow } from '../features/messages/ThreadList'

/** Conversations with the SimCell: the seat's own thread, or a list when others exist. */
export function MessagesScreen({ session }: { session: PlayerSession }) {
  const seat = useStore(session.store, (s) => s.seat)
  const info = useStore(session.store, (s) => s.info)
  const messages = useStore(session.store, (s) => s.messages)
  const read = useStore(session.store, (s) => s.read)
  const compose = useStore(session.store, (s) => s.compose)
  const [open, setOpen] = useState<string>()

  const own = seat?.role ? `role:${seat.role.id}` : undefined
  const seatName = seat?.role?.abbreviation ?? seat?.role?.name ?? ''
  const channels = threadChannels(messages, own)
  const current = channels.length === 1 ? channels[0] : open
  const nameFor = useMemo(
    () => (channel: string) => {
      if (channel.startsWith('team:'))
        return STRINGS.messages.teamThread(seat?.role?.teamName ?? channel.slice(5))
      if (channel.startsWith('client:')) return STRINGS.messages.directThread
      return STRINGS.messages.simcell
    },
    [seat?.role?.teamName],
  )

  const [seenReply, setSeenReply] = useState(0)
  if (compose && own && compose.nonce !== seenReply) {
    setSeenReply(compose.nonce)
    setOpen(own)
  }

  if (!info?.features.messages || seat?.kind !== 'player' || !own) {
    return (
      <section className="screen" aria-labelledby="messages-heading" data-screen="messages">
        <h1 id="messages-heading">{STRINGS.messages.heading}</h1>
        <EmptyState title={STRINGS.messages.emptyDisabled} />
      </section>
    )
  }
  if (current) {
    return (
      <Thread
        session={session}
        channel={current}
        name={nameFor(current)}
        seatName={seatName}
        {...(channels.length > 1
          ? {
              onBack: () => {
                setOpen(undefined)
                queueMicrotask(() => focusHeading())
              },
            }
          : {})}
      />
    )
  }
  const rows: ThreadRow[] = channels.map((channel) => {
    const mine = messages.filter((m) => m.channel === channel)
    return {
      channel,
      name: nameFor(channel),
      last: mine.at(-1)?.text ?? '',
      unread: mine.filter((m) => !m.mine && !read.has(`msg:${m.id}`)).length,
    }
  })
  return (
    <section className="screen" aria-labelledby="messages-heading" data-screen="messages">
      <h1 id="messages-heading">{STRINGS.messages.heading}</h1>
      <ThreadList rows={rows} onOpen={setOpen} />
    </section>
  )
}
