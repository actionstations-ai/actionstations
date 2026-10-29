import { useEffect, useRef, useState } from 'react'
import type { BlobRef } from '../../../shared/live/schemas'
import type { ChatMessage } from '../../app/messages'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { EmptyState } from '../../components/EmptyState'
import { useBlobUrl, type MediaCache } from '../injects/media'
import { Composer } from './Composer'

function Photo({ cache, photo }: { cache: MediaCache; photo: BlobRef }) {
  const [attempt, setAttempt] = useState(0)
  const state = useBlobUrl(cache, photo, true, attempt)
  const alt = photo.name ?? STRINGS.messages.photoCount(1)
  if (state.status === 'ready') return <img className="msg__photo" src={state.url} alt={alt} />
  if (state.status === 'error')
    return (
      <button type="button" className="btn btn--small" onClick={() => setAttempt((n) => n + 1)}>
        {STRINGS.inject.mediaError} {STRINGS.inject.retry}
      </button>
    )
  return <p className="field__hint">{STRINGS.inject.loadingMedia}</p>
}

function Status({ message, onRetry }: { message: ChatMessage; onRetry: () => void }) {
  if (!message.mine) return null
  if (message.status === 'failed')
    return (
      <span className="msg__status msg__status--failed">
        {STRINGS.messages.failed}{' '}
        <button type="button" className="btn btn--quiet btn--small" onClick={onRetry}>
          {STRINGS.messages.retry}
        </button>
      </span>
    )
  return (
    <span className="msg__status">
      {message.status === 'sent' ? `✓ ${STRINGS.messages.sent}` : STRINGS.messages.sending}
    </span>
  )
}

function Bubble({
  session,
  message,
  seatName,
  quote,
}: {
  session: PlayerSession
  message: ChatMessage
  seatName: string
  quote: string | undefined
}) {
  const who = message.mine
    ? STRINGS.messages.you(seatName)
    : (message.persona ?? STRINGS.messages.simcell)
  return (
    <article className={`msg${message.mine ? ' msg--mine' : ''}`}>
      <p className="msg__who">{who}</p>
      {quote ? <p className="msg__quote">{STRINGS.messages.quote(quote)}</p> : null}
      {message.text ? <p className="msg__text">{message.text}</p> : null}
      {message.attachments.map((a) => (
        <Photo key={a.blobId} cache={session.media} photo={a} />
      ))}
      {message.pendingPhotos > 0 ? (
        <p className="field__hint">{STRINGS.messages.photoCount(message.pendingPhotos)}</p>
      ) : null}
      <p className="msg__meta">
        <time>{message.exerciseTime}</time>
        {!message.mine && message.playedBy ? ` · ${STRINGS.messages.playedBy}` : ''}{' '}
        <Status message={message} onRetry={() => void session.retryMessage(message.id)} />
      </p>
    </article>
  )
}

/** One conversation: a live log of messages and the composer under it. */
export function Thread({
  session,
  channel,
  name,
  seatName,
  onBack,
}: {
  session: PlayerSession
  channel: string
  name: string
  seatName: string
  onBack?: () => void
}) {
  const all = useStore(session.store, (s) => s.messages)
  const items = useStore(session.store, (s) => s.items)
  const messages = all.filter((m) => m.channel === channel)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    for (const m of messages) if (!m.mine) session.markRead(`msg:${m.id}`)
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [messages, session])

  const quoteFor = (m: ChatMessage): string | undefined => {
    if (!m.replyTo) return undefined
    const inject = items.find((i) => i.inject?.releaseId === m.replyTo)
    if (inject) return inject.title
    return all.find((x) => x.id === m.replyTo)?.text.slice(0, 80)
  }

  return (
    <section className="screen thread" aria-labelledby="thread-heading" data-screen="thread">
      <div className="screen__head">
        {onBack ? (
          <button type="button" className="back" onClick={onBack}>
            ‹ {STRINGS.messages.back}
          </button>
        ) : null}
        <h1 id="thread-heading">{name}</h1>
        <p className="room__seat">{seatName}</p>
      </div>
      <div
        className="thread__log"
        role="log"
        aria-live="polite"
        aria-label={STRINGS.messages.threadLabel(name)}
      >
        {messages.length === 0 ? (
          <EmptyState title={STRINGS.messages.empty} hint={STRINGS.messages.emptyHint} />
        ) : (
          messages.map((m) => (
            <Bubble
              key={m.id}
              session={session}
              message={m}
              seatName={seatName}
              quote={quoteFor(m)}
            />
          ))
        )}
        <div ref={end} />
      </div>
      <Composer session={session} channel={channel} seatName={seatName} />
    </section>
  )
}
