import { useEffect, useMemo, useState } from 'react'
import type { BlobRef } from '../../../shared/live/schemas'
import { focusHeading } from '../../app/a11y'
import { addressedToSeat, type Item } from '../../app/items'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { FullSizeViewer } from './FullSizeViewer'
import { transcriptLines, useBlobUrl, type MediaCache } from './media'
import { TextVersion } from './TextVersion'

/** An item counts as read once its detail has been in view this long (FR-9). */
export const READ_AFTER_MS = 1_000

const named = (media: readonly BlobRef[], name: string): BlobRef | undefined =>
  media.find((m) => m.name === name)

function useReadTimer(session: PlayerSession, item: Item, enabled: boolean): void {
  const releaseId = item.inject?.releaseId
  useEffect(() => {
    if (!releaseId || !enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const start = () => {
      if (timer === undefined && document.visibilityState === 'visible')
        timer = setTimeout(() => {
          void session.sendReceipt(releaseId, 'read')
          session.markRead(item.key)
        }, READ_AFTER_MS)
    }
    const stop = () => {
      clearTimeout(timer)
      timer = undefined
    }
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop())
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [session, releaseId, item.key, enabled])
}

function MediaStatus({
  state,
  onRetry,
}: {
  state: ReturnType<typeof useBlobUrl>
  onRetry?: () => void
}) {
  if (state.status === 'loading')
    return (
      <p className="inject__status" role="status">
        {STRINGS.inject.loadingMedia}
      </p>
    )
  if (state.status !== 'error') return null
  return (
    <p className="inject__status" role="alert">
      {STRINGS.inject.mediaError}{' '}
      {onRetry ? (
        <button type="button" className="btn btn--small" onClick={onRetry}>
          {STRINGS.inject.retry}
        </button>
      ) : null}
    </p>
  )
}

function ImageBlock({
  cache,
  device,
  original,
  alt,
  textId,
}: {
  cache: MediaCache
  device: BlobRef
  original?: BlobRef
  alt: string
  textId: string
}) {
  const [attempt, setAttempt] = useState(0)
  const [full, setFull] = useState(false)
  const shown = useBlobUrl(cache, device, true, attempt)
  const big = useBlobUrl(cache, original, full)
  return (
    <figure className="inject__figure">
      {shown.status === 'ready' ? (
        <img className="inject__img" src={shown.url} alt={alt} aria-describedby={textId} />
      ) : null}
      <MediaStatus state={shown} onRetry={() => setAttempt((n) => n + 1)} />
      {original ? (
        <button type="button" className="btn" onClick={() => setFull(true)}>
          {STRINGS.inject.openFullSize}
        </button>
      ) : null}
      {full && big.status === 'ready' ? (
        <FullSizeViewer
          url={big.url}
          alt={alt}
          describedBy={textId}
          onClose={() => setFull(false)}
        />
      ) : null}
      {full && big.status !== 'ready' ? <MediaStatus state={big} /> : null}
    </figure>
  )
}

function CaptionsTrack({ vtt }: { vtt: string }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })), [vtt])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return <track kind="captions" src={url} srcLang="en" label="English" default />
}

function VideoBlock({
  cache,
  video,
  poster,
  vtt,
  textId,
}: {
  cache: MediaCache
  video: BlobRef
  poster?: BlobRef
  vtt?: string
  textId: string
}) {
  const src = useBlobUrl(cache, video)
  const posterUrl = useBlobUrl(cache, poster)
  return (
    <div className="inject__figure">
      {src.status === 'ready' ? (
        <video
          className="inject__video"
          src={src.url}
          controls
          playsInline
          preload="metadata"
          aria-describedby={textId}
          {...(posterUrl.status === 'ready' ? { poster: posterUrl.url } : {})}
        >
          {vtt ? <CaptionsTrack vtt={vtt} /> : null}
        </video>
      ) : null}
      <MediaStatus state={src} />
    </div>
  )
}

function AudioBlock({ cache, audio, vtt }: { cache: MediaCache; audio: BlobRef; vtt?: string }) {
  const src = useBlobUrl(cache, audio)
  const lines = transcriptLines(vtt)
  return (
    <div className="inject__figure">
      {src.status === 'ready' ? (
        <audio className="inject__audio" src={src.url} controls preload="metadata">
          {STRINGS.inject.audioFile}
        </audio>
      ) : null}
      <MediaStatus state={src} />
      {lines.length ? (
        <details className="inject__text" open>
          <summary>{STRINGS.inject.transcript}</summary>
          <ul className="inject__transcript">
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

/** One inject in full: the rendered artifact, its exact text, and the receipts it sends. */
export function InjectDetail({
  session,
  item,
  onBack,
  backLabel,
}: {
  session: PlayerSession
  item: Item
  onBack: () => void
  backLabel: string
}) {
  const inject = item.inject!
  const seat = useStore(session.store, (s) => s.seat)
  const clientId = useStore(session.store, (s) => s.clientId)
  const actioned = useStore(session.store, (s) => s.actioned)
  const view = seat
    ? { clientId, kind: seat.kind, roleId: seat.role?.id, teamId: seat.role?.teamId }
    : undefined
  const mine = addressedToSeat(item, view)
  useReadTimer(session, item, mine && !item.withdrawn)
  useEffect(() => focusHeading(), [])
  const textId = `inject-text-${inject.releaseId}`
  const device = named(inject.media, 'device')
  const video = device?.kind === 'video' ? device : undefined
  const image = device?.kind === 'image' ? device : undefined
  const audio = named(inject.media, 'audio')
  const done = actioned.has(inject.releaseId)
  return (
    <section className="screen inject" aria-labelledby="inject-heading" data-screen="inject">
      <button type="button" className="btn btn--quiet inject__back" onClick={onBack}>
        <span aria-hidden="true">‹ </span>
        {backLabel}
      </button>
      <div className="screen__head">
        <h1 id="inject-heading">{item.title}</h1>
      </div>
      <p className="card__meta">
        <span className="sr-only">{STRINGS.item.exerciseTime} </span>
        {item.exerciseTime} · {inject.injectType}
        {item.sender ? (
          <>
            {' · '}
            <span className="card__meta-label">{STRINGS.inject.from}: </span>
            {item.sender}
          </>
        ) : null}
      </p>
      {item.withdrawn ? <p className="inject__banner">{STRINGS.inject.withdrawn}</p> : null}
      {!mine && !item.withdrawn ? (
        <p className="inject__banner">{STRINGS.inject.notForYou}</p>
      ) : null}
      {image && !item.withdrawn ? (
        <ImageBlock
          cache={session.media}
          device={image}
          original={named(inject.media, 'original')}
          alt={item.altText ?? item.title}
          textId={textId}
        />
      ) : null}
      {video && !item.withdrawn ? (
        <VideoBlock
          cache={session.media}
          video={video}
          poster={named(inject.media, 'poster')}
          vtt={inject.captionsVtt}
          textId={textId}
        />
      ) : null}
      {audio && !item.withdrawn ? (
        <AudioBlock cache={session.media} audio={audio} vtt={inject.captionsVtt} />
      ) : null}
      <TextVersion id={textId} text={inject.text} />
      {mine && inject.expectsResponse && !item.withdrawn ? (
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={done}
          onClick={() => void session.sendReceipt(inject.releaseId, 'actioned')}
        >
          {done ? STRINGS.inject.actioned : STRINGS.inject.markActioned}
        </button>
      ) : null}
    </section>
  )
}
