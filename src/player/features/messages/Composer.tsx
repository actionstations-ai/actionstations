import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import {
  AttachError,
  browserCodec,
  MAX_PHOTOS,
  prepareImage,
  type ImageCodec,
  type PreparedImage,
} from './attach'

const MAX_CHARS = 2000

interface Photo {
  image: PreparedImage
  url?: string
}

function previewUrl(image: PreparedImage): string | undefined {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return undefined
  return URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.mime }))
}

/** Write a message, add up to three photos, quote an inject; Enter sends, Shift+Enter breaks the line. */
export function Composer({
  session,
  channel,
  seatName,
  codec = browserCodec,
}: {
  session: PlayerSession
  channel: string
  seatName: string
  codec?: ImageCodec
}) {
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const compose = useStore(session.store, (s) => s.compose)
  const connection = useStore(session.store, (s) => s.connection)

  useEffect(
    () => () => photos.forEach((p) => p.url && URL.revokeObjectURL(p.url)),
    // Revoke only what is left when the composer goes away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => {
    if (compose) field.current?.focus()
  }, [compose])

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setError(undefined)
    const room = MAX_PHOTOS - photos.length
    if (files.length > room) setError(STRINGS.messages.tooMany)
    const added: Photo[] = []
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      try {
        const image = await prepareImage(file, {
          maxBytes: session.photoCap,
          alt: STRINGS.messages.altDefault(seatName),
          codec,
        })
        added.push({ image, url: previewUrl(image) })
      } catch (err) {
        setError(err instanceof AttachError ? err.message : STRINGS.messages.failed)
      }
    }
    setPhotos((prev) => [...prev, ...added])
    if (picker.current) picker.current.value = ''
  }

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const body = text.trim()
    if ((!body && photos.length === 0) || busy) return
    setBusy(true)
    const draft = {
      channel,
      text: body,
      photos: photos.map((p) => p.image),
      ...(compose ? { replyTo: compose.releaseId } : {}),
    }
    setText('')
    setPhotos([])
    session.clearReply()
    photos.forEach((p) => p.url && URL.revokeObjectURL(p.url))
    field.current?.focus()
    await session.sendMessage(draft)
    setBusy(false)
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <form
      className="composer"
      onSubmit={(e) => void send(e)}
      aria-label={STRINGS.messages.formLabel}
    >
      {compose ? (
        <p className="composer__quote">
          <span>
            {compose.title
              ? STRINGS.messages.replyingTo(compose.title)
              : STRINGS.messages.replyingToInject}
          </span>
          <button
            type="button"
            className="btn btn--quiet btn--small"
            onClick={() => session.clearReply()}
          >
            {STRINGS.messages.cancelReply}
          </button>
        </p>
      ) : null}
      {photos.length > 0 ? (
        <ul className="composer__photos">
          {photos.map((p, i) => (
            <li key={i} className="composer__photo">
              {p.url ? <img src={p.url} alt="" className="composer__thumb" /> : null}
              <label className="field__label" htmlFor={`photo-alt-${i}`}>
                {STRINGS.messages.altLabel(i + 1)}
              </label>
              <input
                id={`photo-alt-${i}`}
                className="field__input"
                value={p.image.alt}
                maxLength={120}
                onChange={(e) =>
                  setPhotos((prev) =>
                    prev.map((x, j) =>
                      j === i ? { ...x, image: { ...x.image, alt: e.target.value } } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="btn btn--quiet btn--small"
                onClick={() => {
                  if (p.url) URL.revokeObjectURL(p.url)
                  setPhotos((prev) => prev.filter((_, j) => j !== i))
                }}
              >
                {STRINGS.messages.removePhoto(i + 1)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="field__label" htmlFor="message-text">
        {STRINGS.messages.composerLabel}
      </label>
      <div className="composer__row">
        <button
          type="button"
          className="btn composer__attach"
          aria-label={STRINGS.messages.attach}
          disabled={photos.length >= MAX_PHOTOS}
          onClick={() => picker.current?.click()}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path
              d="M4 7h4l2-2h4l2 2h4v12H4zM12 17a4 4 0 100-8 4 4 0 000 8z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="photo-input"
          onChange={(e) => void addFiles(e.target.files)}
        />
        <textarea
          id="message-text"
          ref={field}
          className="field__input composer__text"
          rows={2}
          maxLength={MAX_CHARS}
          value={text}
          placeholder={STRINGS.messages.placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button
          type="submit"
          className="btn btn--primary composer__send"
          disabled={busy || (!text.trim() && photos.length === 0)}
        >
          {STRINGS.messages.send}
        </button>
      </div>
      {connection !== 'connected' ? (
        <p className="field__hint" role="status">
          {STRINGS.messages.willSend}
        </p>
      ) : null}
      {error ? (
        <p className="join__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
