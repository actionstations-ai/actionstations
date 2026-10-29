// Presentation window for facilitator mode (#45): shows one inject's media full-screen on a
// second display. It loads the app's own index.html with a #/present/... route, so it is the
// same trusted document as the main window (registerIpc accepts it) with no extra privileges.
import { app, BrowserWindow, screen, type Display, type Rectangle } from 'electron'
import { join } from 'node:path'
import { APP_INDEX_URL } from '../lib/app-protocol'
import { emit } from '../lib/events'

export interface DisplayInfo {
  id: number
  label: string
  primary: boolean
  width: number
  height: number
}

export interface PresentTarget {
  projectPath: string
  scenarioId: string
  /** An inject's media; absent when the window shows a vote. */
  injectId?: string
  assetId?: string
  /** Show this vote's tally instead of an inject (#414). */
  voteId?: string
}

/** Preview size when there is no second display. */
export const PREVIEW_SIZE = { width: 960, height: 540 } as const

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Display ${i + 1}`,
    primary: d.id === primaryId,
    width: d.size.width,
    height: d.size.height,
  }))
}

/**
 * The display to present on: the requested one if it exists, else the first non-primary one.
 * Undefined means there is only the primary display, so a windowed preview is shown instead.
 */
export function chooseDisplay(
  displays: Display[],
  primaryId: number,
  requestedId?: number,
): Display | undefined {
  if (requestedId !== undefined) {
    const requested = displays.find((d) => d.id === requestedId)
    if (requested) return requested
  }
  return displays.find((d) => d.id !== primaryId)
}

/** Hash route (without '#') the presentation window shows. */
export function presentHash(t: PresentTarget): string {
  if (t.voteId) {
    return `/present/${encodeURIComponent(t.projectPath)}/${t.scenarioId}/vote/${t.voteId}`
  }
  const base = ['present', encodeURIComponent(t.projectPath), t.scenarioId, t.injectId ?? ''].join(
    '/',
  )
  return `/${base}${t.assetId ? `?asset=${encodeURIComponent(t.assetId)}` : ''}`
}

const devRendererUrl = (): string | undefined =>
  !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL
    : undefined
function loadPresent(win: BrowserWindow, hash: string): void {
  void win.loadURL(`${devRendererUrl() ?? APP_INDEX_URL}#${hash}`)
}

function windowBounds(display: Display | undefined): Partial<Rectangle> {
  if (!display) return { ...PREVIEW_SIZE }
  return { ...display.bounds }
}

function createPresentWindow(display: Display | undefined): BrowserWindow {
  const win = new BrowserWindow({
    ...windowBounds(display),
    show: false,
    frame: !display,
    fullscreen: !!display && process.platform !== 'darwin',
    title: 'Presentation',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      // Audio injects start playing when delivered, without a click on the projector.
      autoplayPolicy: 'no-user-gesture-required',
    },
  })
  win.setMenuBarVisibility(false)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      e.preventDefault()
      win.close()
    }
  })
  return win
}

/** Show without taking focus from the facilitator's window. */
function showPresentWindow(win: BrowserWindow, onSecondDisplay: boolean, owner?: BrowserWindow) {
  const reveal = () => {
    if (process.env.TTX_HEADLESS) return
    win.showInactive()
    if (onSecondDisplay && process.platform === 'darwin') win.setSimpleFullScreen(true)
    if (owner && !owner.isDestroyed()) owner.focus()
  }
  if (win.webContents.isLoading()) win.once('ready-to-show', reveal)
  else reveal()
}

interface Current {
  win: BrowserWindow
  displayId: number | undefined
}

let current: Current | undefined
const watchedOwners = new WeakSet<BrowserWindow>()

export function presentWindow(): BrowserWindow | undefined {
  return current && !current.win.isDestroyed() ? current.win : undefined
}

/** Whether a presentation window is open, for the facilitator's Open/Close toggle (#235). */
export const isPresenting = (): boolean => !!presentWindow()

const announcePresenting = (): void => emit('facilitator:present-changed', { open: isPresenting() })

/** Open (or reuse) the presentation window and show the target inject in it. */
export function present(
  target: PresentTarget,
  opts: { displayId?: number; owner?: BrowserWindow } = {},
): BrowserWindow {
  const display = chooseDisplay(
    screen.getAllDisplays(),
    screen.getPrimaryDisplay().id,
    opts.displayId,
  )
  const existing = presentWindow()
  if (existing && current?.displayId !== display?.id) closePresent()
  let win = presentWindow()
  if (!win) {
    win = createPresentWindow(display)
    current = { win, displayId: display?.id }
    const created = win
    win.on('closed', () => {
      if (current?.win === created) current = undefined
      announcePresenting()
    })
    announcePresenting()
  }
  closeWithOwner(opts.owner)
  loadPresent(win, presentHash(target))
  showPresentWindow(win, !!display, opts.owner)
  return win
}

/** The presentation must not outlive the window that controls it. */
function closeWithOwner(owner: BrowserWindow | undefined): void {
  if (!owner || watchedOwners.has(owner)) return
  watchedOwners.add(owner)
  owner.once('closed', () => closePresent())
}

export function closePresent(): void {
  const win = presentWindow()
  current = undefined
  if (win) win.close()
}
