import { useEffect } from 'react'
import { focusHeading } from './a11y'
import type { Prefs } from './prefs'
import type { PlayerSession } from './session'
import { useStore, type Store } from './store'
import { STRINGS } from './strings'
import { JoinScreen } from '../screens/JoinScreen'
import { RoomShell } from '../screens/RoomShell'
import {
  ConflictScreen,
  ConnectingScreen,
  EndedScreen,
  InvalidLinkScreen,
  RemovedScreen,
  UpdateScreen,
} from '../screens/StatusScreens'

/** Screen state machine: join → room → ended, with the terminal screens beside it. No router. */
export function App({
  session,
  prefsStore,
  bundleVersion,
}: {
  session: PlayerSession
  prefsStore: Store<Prefs>
  bundleVersion: string
}) {
  const phase = useStore(session.store, (s) => s.phase)
  const linkError = useStore(session.store, (s) => s.linkError)
  const ended = useStore(session.store, (s) => s.ended)
  useEffect(() => {
    focusHeading()
  }, [phase])

  let screen: React.ReactNode
  switch (phase) {
    case 'loading':
    case 'connecting':
      screen = <ConnectingScreen session={session} />
      break
    case 'invalid-link':
      screen = <InvalidLinkScreen message={linkError} />
      break
    case 'link-invalid':
      screen = <InvalidLinkScreen message={STRINGS.link.invalid} />
      break
    case 'lobby':
      screen = <JoinScreen session={session} bundleVersion={bundleVersion} />
      break
    case 'seated':
      screen = <RoomShell session={session} prefsStore={prefsStore} bundleVersion={bundleVersion} />
      break
    case 'ended':
      screen = <EndedScreen ended={ended} evaluate={session.evaluate} />
      break
    case 'removed':
      screen = <RemovedScreen />
      break
    case 'update-required':
      screen = <UpdateScreen />
      break
    case 'device-conflict':
      screen = <ConflictScreen session={session} />
      break
  }
  return (
    <>
      <a className="skip-link" href="#content">
        {STRINGS.skipToContent}
      </a>
      {screen}
    </>
  )
}
