/**
 * The practice session page the player apps ship (spec 0446, **Try a demo**). It is the player
 * page with the scripted controller and the in-memory server in the same page: no network, no
 * real keys. Everything else (screens, store, session) is the player page's own code.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { selectCryptoProvider } from '../../shared/live/crypto/select'
import { MemoryKeyValue } from '../../shared/live/transport'
import { App } from '../app/App'
import { createAnnouncer, playCue, vibrate } from '../app/a11y'
import { applyPrefs, loadPrefs, savePrefs, type Prefs } from '../app/prefs'
import { PlayerSession } from '../app/session'
import { Store } from '../app/store'
import { HarnessController } from '../harness/controller'
import { memoryTransport } from './memory-transport'
import { DEMO_SEATS, DEMO_TITLE, runDemo } from './script'
import '../styles/player.css'

declare const __PLAYER_VERSION__: string
const BUNDLE_VERSION = typeof __PLAYER_VERSION__ === 'string' ? __PLAYER_VERSION__ : 'dev'

async function main(): Promise<void> {
  const prefsStore = new Store<Prefs>(loadPrefs())
  applyPrefs(prefsStore.get())
  prefsStore.subscribe(() => {
    applyPrefs(prefsStore.get())
    savePrefs(prefsStore.get())
  })

  const crypto = await selectCryptoProvider()
  const controller = await HarnessController.create({
    crypto,
    scenarioTitle: DEMO_TITLE,
    sessionName: 'Practice',
    attribution: 'role',
    seats: DEMO_SEATS,
  })
  controller.base = 'https://practice.invalid'
  const session = new PlayerSession({
    url: controller.invite('players'),
    crypto,
    storage: new MemoryKeyValue(),
    connect: (kind, params) =>
      memoryTransport(
        kind,
        controller.server.connect({
          clientId: params.clientId,
          joinToken: params.joinToken,
          resumeToken: params.resumeToken,
        }),
      ),
    announcer: createAnnouncer(),
    prefs: () => prefsStore.get(),
    bundleVersion: BUNDLE_VERSION,
    online: () => true,
    ua: navigator.userAgent,
    cue: (prefs) => {
      if (prefs.vibration) vibrate()
      if (prefs.sound) playCue()
    },
  })
  runDemo(controller)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App session={session} prefsStore={prefsStore} bundleVersion={BUNDLE_VERSION} />
    </StrictMode>,
  )
  await session.start()
}

void main()
