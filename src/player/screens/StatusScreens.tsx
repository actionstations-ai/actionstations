import { useEffect, useState } from 'react'
import type { SessionEndPayload } from '../../shared/live/schemas'
import type { PlayerSession } from '../app/session'
import { useStore } from '../app/store'
import { STRINGS } from '../app/strings'

function Shell({
  heading,
  children,
  screen,
}: {
  heading: string
  children: React.ReactNode
  screen: string
}) {
  return (
    <main className="screen screen--status" data-screen={screen} id="content">
      <p className="brand">{STRINGS.app}</p>
      <h1>{heading}</h1>
      {children}
    </main>
  )
}

/** First connection: a spinner-free line, and after 8 s a hint about the room Wi-Fi. */
export function ConnectingScreen({ session }: { session: PlayerSession }) {
  const connection = useStore(session.store, (s) => s.connection)
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(id)
  }, [])
  return (
    <Shell heading={STRINGS.connecting} screen="connecting">
      <p role="status" className="muted">
        {connection === 'offline'
          ? STRINGS.banner.offline
          : slow
            ? STRINGS.connectingSlow
            : STRINGS.loading}
      </p>
      {slow ? (
        <button type="button" className="btn btn--primary" onClick={() => session.wake()}>
          {STRINGS.retryNow}
        </button>
      ) : null}
    </Shell>
  )
}

export function InvalidLinkScreen({ message }: { message: string | undefined }) {
  return (
    <Shell heading={STRINGS.app} screen="invalid-link">
      <p role="alert">{message ?? STRINGS.link.invalid}</p>
    </Shell>
  )
}

export function EndedScreen({ ended }: { ended: SessionEndPayload | undefined }) {
  return (
    <Shell heading={STRINGS.ended.heading} screen="ended">
      {ended?.message ? <p className="ended__message">{ended.message}</p> : null}
      <p>{ended?.reason === 'cancelled' ? STRINGS.ended.cancelled : STRINGS.ended.endex}</p>
      <p className="muted">{STRINGS.ended.closed}</p>
    </Shell>
  )
}

export function RemovedScreen() {
  return (
    <Shell heading={STRINGS.removed.heading} screen="removed">
      <p role="alert">{STRINGS.removed.body}</p>
      <p className="muted">{STRINGS.removed.hint}</p>
    </Shell>
  )
}

export function UpdateScreen() {
  return (
    <Shell heading={STRINGS.update.heading} screen="update-required">
      <p>{STRINGS.update.body}</p>
      <button type="button" className="btn btn--primary" onClick={() => location.reload()}>
        {STRINGS.update.button}
      </button>
    </Shell>
  )
}

export function ConflictScreen({ session }: { session: PlayerSession }) {
  return (
    <Shell heading={STRINGS.conflict.heading} screen="device-conflict">
      <p>{STRINGS.conflict.body}</p>
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => {
          session.forgetDevice()
          location.reload()
        }}
      >
        {STRINGS.conflict.button}
      </button>
    </Shell>
  )
}
