import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { maxRecordingSeconds } from './calls'
import { canRecord, startRecording, type Recorder } from './record'

type Phase = 'idle' | 'recording' | 'sending'

/** Play the caller's voice. The words are always on screen, so a failed or muted voice loses nothing. */
function VoicePlayer({ session, call }: { session: PlayerSession; call: Call }) {
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const ref = call.audio
  useEffect(() => {
    if (!ref) return
    let live = true
    session.media.acquire(ref).then(
      (u) => live && setUrl(u),
      () => live && setFailed(true),
    )
    return () => {
      live = false
      session.media.release(ref)
    }
  }, [session, ref])
  if (!ref) return null
  return (
    <div className="call__voice">
      <audio ref={audio} src={url} preload="auto" onError={() => setFailed(true)} />
      <button
        type="button"
        className="btn btn--primary"
        disabled={!url}
        onClick={() => void audio.current?.play().catch(() => setFailed(true))}
      >
        {STRINGS.calls.play}
      </button>
      {failed ? <p role="status">{STRINGS.calls.playFailed}</p> : null}
    </div>
  )
}

type Call = NonNullable<ReturnType<typeof useCall>>

function useCall(session: PlayerSession, callId: string) {
  return useStore(session.store, (s) => s.calls[callId])
}

/**
 * One phone call with a SimCell caller. Always shows what the caller said as text; plays the
 * voice when there is one; the player answers by typing, or by tapping to talk when the
 * facilitator can transcribe speech. It is a call by turns: after an answer the screen waits for
 * the next line, and says so.
 */
export function CallScreen({
  session,
  callId,
  onClose,
}: {
  session: PlayerSession
  callId: string
  onClose: () => void
}) {
  const call = useCall(session, callId)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string>()
  const recorder = useRef<Recorder | undefined>(undefined)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => heading.current?.focus(), [call?.turn])
  useEffect(() => () => void recorder.current?.stop().catch(() => undefined), [])

  if (!call) return null
  const open = call.status === 'ringing'
  const who = STRINGS.calls.from(call.persona.name, call.persona.organization)
  const canTalk = call.canSpeak && canRecord()

  const sendText = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || phase !== 'idle') return
    setPhase('sending')
    await session.answerCall(callId, { text })
    setText('')
    setPhase('idle')
  }

  const toggleTalk = async () => {
    setError(undefined)
    if (phase === 'recording') {
      setPhase('sending')
      try {
        const clip = await recorder.current!.stop()
        recorder.current = undefined
        await session.answerCall(callId, { audio: clip })
      } catch {
        setError(STRINGS.calls.noMic)
      }
      setPhase('idle')
      return
    }
    try {
      recorder.current = await startRecording(session.answerCap, () => void toggleTalk())
      setPhase('recording')
    } catch {
      setError(STRINGS.calls.noMic)
    }
  }

  return (
    <section className="screen call" aria-labelledby="call-heading" data-screen="call">
      <h1 id="call-heading" tabIndex={-1} ref={heading}>
        {STRINGS.calls.heading}: {who}
      </h1>
      {open ? (
        <VoicePlayer key={call.audio?.blobId ?? 'none'} session={session} call={call} />
      ) : null}
      <section aria-labelledby="call-said">
        <h2 id="call-said">{STRINGS.calls.transcriptHeading}</h2>
        <p className="call__transcript">{call.transcript}</p>
      </section>
      {call.history.length > 2 ? (
        <section aria-labelledby="call-history">
          <h2 id="call-history">{STRINGS.calls.historyHeading}</h2>
          <ol className="call__history">
            {call.history.slice(0, -1).map((l, i) => (
              <li key={i}>
                <strong>{l.who === 'them' ? call.persona.name : STRINGS.calls.me}:</strong> {l.text}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {open ? (
        <form className="call__answer" onSubmit={(e) => void sendText(e)}>
          <label className="field__label" htmlFor="call-text">
            {STRINGS.calls.yourAnswer}
          </label>
          <textarea
            id="call-text"
            className="field__input"
            rows={3}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={phase !== 'idle'}
          />
          <div className="call__buttons">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!text.trim() || phase !== 'idle'}
            >
              {STRINGS.calls.send}
            </button>
            {canTalk ? (
              <button
                type="button"
                className="btn"
                aria-pressed={phase === 'recording'}
                disabled={phase === 'sending'}
                onClick={() => void toggleTalk()}
              >
                {phase === 'recording' ? STRINGS.calls.talkStop : STRINGS.calls.talkStart}
              </button>
            ) : null}
          </div>
          {phase === 'recording' ? (
            <p role="status">
              {STRINGS.calls.recording} (
              {STRINGS.calls.timeLeft(maxRecordingSeconds(session.answerCap))})
            </p>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
        </form>
      ) : null}
      {call.status === 'answered' ? (
        <p role="status" className="call__wait">
          {STRINGS.calls.waiting(call.expectedWaitSec)}
        </p>
      ) : null}
      {call.status === 'ended' ? (
        <p role="status">
          {call.endedReason === 'hangup' ? STRINGS.calls.endedHangup : STRINGS.calls.ended}
        </p>
      ) : null}
      <div className="call__buttons">
        {call.status !== 'ended' ? (
          <button type="button" className="btn" onClick={() => void session.hangUp(callId)}>
            {STRINGS.calls.hangUp}
          </button>
        ) : null}
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          {STRINGS.calls.close}
        </button>
      </div>
    </section>
  )
}

/** A line under the header while a call is open. */
export function CallBanner({
  session,
  onOpen,
  viewing,
}: {
  session: PlayerSession
  onOpen: (callId: string) => void
  viewing?: string | undefined
}) {
  const calls = useStore(session.store, (s) => s.calls)
  const open = Object.values(calls)
    .filter((c) => c.status !== 'ended' && c.callId !== viewing)
    .sort((a, b) => b.openedAt - a.openedAt)[0]
  if (!open) return null
  return (
    <div className="vote-banner call-banner">
      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={() => onOpen(open.callId)}
      >
        {open.status === 'ringing'
          ? STRINGS.calls.incoming(open.persona.name)
          : STRINGS.calls.bannerOpenFrom(open.persona.name)}
      </button>
    </div>
  )
}
