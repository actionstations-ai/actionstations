/**
 * Mounts the player page. Everything browser-specific is wired here and injected into the
 * session, which the unit tests run against the in-memory server instead.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { selectCryptoProvider } from '../shared/live/crypto/select'
import type { KeyValue } from '../shared/live/transport'
import { App } from './app/App'
import { createAnnouncer, playCue, vibrate } from './app/a11y'
import { applyPrefs, loadPrefs, savePrefs, type Prefs } from './app/prefs'
import { browserConnect, PlayerSession } from './app/session'
import { Store } from './app/store'
import { createFetchTransport } from './app/transport-fetch'
import { createWebSocketTransport } from './app/transport-ws'
import './styles/player.css'

declare const __PLAYER_VERSION__: string
const BUNDLE_VERSION = typeof __PLAYER_VERSION__ === 'string' ? __PLAYER_VERSION__ : 'dev'

/** `sessionStorage` behind the protocol's two-method store; a blocked store falls back to memory. */
function sessionKeyValue(): KeyValue {
  try {
    const s = sessionStorage
    s.getItem('as-live:probe')
    return { get: (k) => s.getItem(k), set: (k, v) => s.setItem(k, v) }
  } catch {
    const map = new Map<string, string>()
    return { get: (k) => map.get(k), set: (k, v) => void map.set(k, v) }
  }
}

async function main(): Promise<void> {
  const prefsStore = new Store<Prefs>(loadPrefs())
  applyPrefs(prefsStore.get())
  prefsStore.subscribe(() => {
    applyPrefs(prefsStore.get())
    savePrefs(prefsStore.get())
  })

  const crypto = await selectCryptoProvider()
  const session = new PlayerSession({
    url: location.href,
    crypto,
    storage: sessionKeyValue(),
    connect: browserConnect(
      (url, protocols) => createWebSocketTransport(url, protocols),
      (events, send, headers) => createFetchTransport(events, send, headers),
    ),
    announcer: createAnnouncer(),
    prefs: () => prefsStore.get(),
    bundleVersion: BUNDLE_VERSION,
    online: () => navigator.onLine,
    ua: navigator.userAgent,
    cue: (prefs) => {
      if (prefs.vibration) vibrate()
      if (prefs.sound) playCue()
    },
  })

  // FR-7: wake on every signal that the device may have slept or changed network.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') session.wake()
  })
  window.addEventListener('online', () => session.wake())
  window.addEventListener('offline', () => session.offline())
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) session.wake()
  })
  window.addEventListener('focus', () => session.wake())

  const root = document.getElementById('root')!
  createRoot(root).render(
    <StrictMode>
      <App session={session} prefsStore={prefsStore} bundleVersion={BUNDLE_VERSION} />
    </StrictMode>,
  )
  await session.start()
}

void main()
