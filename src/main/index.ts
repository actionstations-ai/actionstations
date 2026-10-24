import { app, BrowserWindow, session, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { jobs } from './jobs/manager'
import {
  APP_INDEX_URL,
  isAppIndexUrl,
  isAppOrigin,
  registerAppProtocol,
  registerAppScheme,
  rendererRoot,
} from './lib/app-protocol'
import { projectPathsFromArgv, requestOpen } from './lib/open-requests'
import { registerMediaProtocol, registerMediaScheme } from './lib/media-protocol'
import { appDataDir, documentsDir, resourcesDir } from './lib/paths'
import { APP_NAME, migrateUserData } from './lib/rename-migration'
import { finishRenameMigration } from './settings/finish-rename-migration'
import { createQuitGuard, resetRendererReady } from './lib/quit-guard'
// Load every provider adapter at startup so a broken adapter fails the launch smoke test
// instead of crashing later on first use.
import { listAdapterKinds } from './providers/registry'
import { shutdownRenderPool } from './render/window'
import { initPacks } from './packs/state'
import { initTemplateRegistry } from './render/template-registry'

// Must run before app ready.
registerMediaScheme()
registerAppScheme()

const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL

/** The only document the main window may show. Anything else would get the window.ttx bridge. */
export function isAppUrl(url: string): boolean {
  if (isDev) return sameOrigin(url, process.env.ELECTRON_RENDERER_URL!)
  return isAppIndexUrl(url)
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/** The app icon for unpackaged runs (`pnpm dev`, the desktop launcher), else Electron's. A
 * resources override without the icon (test fixtures) keeps Electron's: a missing file would
 * make `dock.setIcon` throw before the window opens. */
function devIconPath(): string | undefined {
  const path = join(resourcesDir(), 'build', 'icon.png')
  return existsSync(path) ? path : undefined
}

let mainWindow: BrowserWindow | undefined
// Unsaved work in the renderer is confirmed before the app quits or the window closes (#196).
const quitGuard = createQuitGuard(() => mainWindow)

function createMainWindow(): BrowserWindow {
  const devIcon = app.isPackaged ? undefined : devIconPath()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: APP_NAME,
    backgroundColor: '#0d1226',
    // Packaged builds take the icon from the installer; unpackaged runs use the build/ master.
    ...(devIcon ? { icon: devIcon } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  })

  // The main window is the app: closing it quits, on macOS too. Hidden render-pool windows
  // would otherwise keep the process (and its Dock icon) alive with nothing on screen.
  // Unsaved work is confirmed first (the guard quits once it may).
  win.on('close', (e) => {
    quitGuard.intercept(e)
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = undefined
    app.quit()
  })
  win.webContents.on('render-process-gone', () => resetRendererReady())
  mainWindow = win

  win.once('ready-to-show', () => {
    if (!process.env.TTX_HEADLESS) win.show()
  })

  // No in-app navigation away from the renderer; external links open in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = isDev ? sameOrigin(url, process.env.ELECTRON_RENDERER_URL!) : isAppOrigin(url)
    if (!allowed) e.preventDefault()
  })

  void win.loadURL(isDev ? process.env.ELECTRON_RENDERER_URL! : APP_INDEX_URL)
  return win
}

// Menu bar, About, Hide and Quit say Action Stations. The name also keys the macOS Keychain
// entry safeStorage uses ("Action Stations Safe Storage"), read after this script runs.
app.setName(APP_NAME)
// Settings live in <appData>/Action Stations. The first launch after the rename moves the old
// "Tabletop Generator" folder there (#277); isolated runs (TTX_USER_DATA) never migrate.
const userDataOverride = process.env.TTX_USER_DATA
app.setPath('userData', userDataOverride ?? migrateUserData(appDataDir()).userData)

// Project folders opened from Finder / Explorer (#277). 'open-file' can fire before ready.
app.on('open-file', (e, path) => {
  e.preventDefault()
  requestOpen(path)
})
for (const path of projectPathsFromArgv(process.argv.slice(1))) requestOpen(path)

void app.whenReady().then(async () => {
  // No camera/mic/geolocation/notifications etc. for any web content.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  registerMediaProtocol()
  registerAppProtocol(rendererRoot(import.meta.dirname))
  registerIpc(isAppUrl)
  const devIcon = app.isPackaged ? undefined : devIconPath()
  if (devIcon && process.platform === 'darwin') app.dock?.setIcon(devIcon)
  if (!app.isPackaged) console.log(`[providers] adapters: ${listAdapterKinds().join(', ')}`)
  // Before the window opens, so the renderer's first reads see the moved paths and keys.
  if (!userDataOverride)
    await finishRenameMigration(app.getPath('userData'), documentsDir()).catch((e: unknown) =>
      console.error('[migration]', e),
    )
  // Installed packs (#260): clear leftover staging files, verify each pack, register the
  // enabled packs' domains. Never fetches. A failure leaves the app running without packs.
  // Inject types from user and pack templates (#261): registered now and after every pack change.
  initTemplateRegistry()
  await initPacks().catch((e: unknown) => console.error('[packs]', e))
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => app.quit())

// Job records are written debounced; write them now so a job that just finished is not shown
// as "Interrupted — resumable" on the next start. flush() writes synchronously.
// Then stop the render-window pool: otherwise quitting closes the busy render windows, the
// queued previews spawn fresh ones after Electron's close-all pass, and quit never ends (#170).
// Before that the quit guard asks the renderer about unsaved work; it cancels this quit and
// quits again once confirmed (or at once when nothing is unsaved or the renderer is silent).
app.on('before-quit', (e) => {
  if (!quitGuard.intercept(e)) return
  void jobs.flush()
  shutdownRenderPool()
})
