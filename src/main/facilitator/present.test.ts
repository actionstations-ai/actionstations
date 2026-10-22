import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void

class FakeWebContents {
  listeners = new Map<string, Listener>()
  loading = true
  isLoading = () => this.loading
  setWindowOpenHandler = vi.fn()
  on(event: string, fn: Listener) {
    this.listeners.set(event, fn)
  }
}

class FakeWindow {
  static instances: FakeWindow[] = []
  webContents = new FakeWebContents()
  destroyed = false
  listeners = new Map<string, Listener[]>()
  loadFile = vi.fn()
  loadURL = vi.fn()
  showInactive = vi.fn()
  setSimpleFullScreen = vi.fn()
  setMenuBarVisibility = vi.fn()
  focus = vi.fn()
  constructor(public options: Record<string, unknown>) {
    FakeWindow.instances.push(this)
  }
  isDestroyed = () => this.destroyed
  on(event: string, fn: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn])
  }
  once(event: string, fn: Listener) {
    this.on(event, fn)
  }
  emit(event: string, ...args: unknown[]) {
    for (const fn of this.listeners.get(event) ?? []) fn(...args)
  }
  close = vi.fn(() => {
    this.destroyed = true
    this.emit('closed')
  })
}

const displays = [
  {
    id: 1,
    label: 'Built-in',
    bounds: { x: 0, y: 0, width: 1512, height: 982 },
    size: { width: 1512, height: 982 },
  },
  {
    id: 2,
    label: '',
    bounds: { x: 1512, y: 0, width: 1920, height: 1080 },
    size: { width: 1920, height: 1080 },
  },
]
const screenState = { all: displays, primary: displays[0]! }

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: FakeWindow,
  screen: {
    getAllDisplays: () => screenState.all,
    getPrimaryDisplay: () => screenState.primary,
  },
}))

const { chooseDisplay, closePresent, listDisplays, present, presentHash, presentWindow } =
  await import('./present')

const target = { projectPath: '/Users/a/NCIA.ttxproj', scenarioId: 'S1', injectId: 'INJ1' }

describe('presentation window', () => {
  beforeEach(() => {
    closePresent()
    FakeWindow.instances = []
    screenState.all = displays
    vi.unstubAllEnvs()
    vi.stubEnv('ELECTRON_RENDERER_URL', '')
    vi.stubEnv('TTX_HEADLESS', '')
  })

  it('lists displays with labels and the primary flag', () => {
    expect(listDisplays()).toEqual([
      { id: 1, label: 'Built-in', primary: true, width: 1512, height: 982 },
      { id: 2, label: 'Display 2', primary: false, width: 1920, height: 1080 },
    ])
  })

  it('chooses the requested display, else the first non-primary one, else none', () => {
    const all = displays as never
    expect(chooseDisplay(all, 1, 1)?.id).toBe(1)
    expect(chooseDisplay(all, 1)?.id).toBe(2)
    expect(chooseDisplay(all, 1, 99)?.id).toBe(2)
    expect(chooseDisplay([displays[0]] as never, 1)).toBeUndefined()
  })

  it('routes to the app document with a present hash', () => {
    expect(presentHash(target)).toBe('/present/%2FUsers%2Fa%2FNCIA.ttxproj/S1/INJ1')
    expect(presentHash({ ...target, assetId: 'photo-01' })).toBe(
      '/present/%2FUsers%2Fa%2FNCIA.ttxproj/S1/INJ1?asset=photo-01',
    )
  })

  it('opens a frameless window on the second display with the main window webPreferences', () => {
    const owner = new FakeWindow({})
    present(target, { owner: owner as never })
    const win = FakeWindow.instances[1]!
    expect(win.options).toMatchObject({
      x: 1512,
      y: 0,
      width: 1920,
      height: 1080,
      frame: false,
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
    })
    expect(String((win.options.webPreferences as { preload: string }).preload)).toMatch(
      /preload[\\/]index\.cjs$/,
    )
    expect(win.loadURL).toHaveBeenCalledWith(
      'app://bundle/index.html#/present/%2FUsers%2Fa%2FNCIA.ttxproj/S1/INJ1',
    )
    win.emit('ready-to-show')
    expect(win.showInactive).toHaveBeenCalled()
    expect(owner.focus).toHaveBeenCalled()
  })

  it('reuses the open window for the next inject', () => {
    present(target)
    present({ ...target, injectId: 'INJ2', assetId: 'A1' })
    expect(FakeWindow.instances).toHaveLength(1)
    expect(FakeWindow.instances[0]!.loadURL).toHaveBeenLastCalledWith(
      'app://bundle/index.html#/present/%2FUsers%2Fa%2FNCIA.ttxproj/S1/INJ2?asset=A1',
    )
  })

  it('falls back to a framed preview window when there is only one display', () => {
    screenState.all = [displays[0]!]
    present(target)
    expect(FakeWindow.instances[0]!.options).toMatchObject({ width: 960, height: 540, frame: true })
  })

  it('moves to a new window when another display is chosen', () => {
    present(target)
    present(target, { displayId: 1 })
    expect(FakeWindow.instances).toHaveLength(2)
    expect(FakeWindow.instances[0]!.destroyed).toBe(true)
    expect(presentWindow()).toBe(FakeWindow.instances[1])
  })

  it('closes on Escape, on close-present and with its owner window', () => {
    present(target)
    const first = FakeWindow.instances[0]!
    const prevent = vi.fn()
    first.webContents.listeners.get('before-input-event')!(
      { preventDefault: prevent },
      { type: 'keyDown', key: 'Escape' },
    )
    expect(first.destroyed).toBe(true)
    expect(presentWindow()).toBeUndefined()

    present(target)
    closePresent()
    expect(FakeWindow.instances[1]!.destroyed).toBe(true)

    const owner = new FakeWindow({})
    present(target, { owner: owner as never })
    owner.emit('closed')
    expect(FakeWindow.instances[3]!.destroyed).toBe(true)
  })

  it('blocks navigation and new windows from the presentation document', () => {
    present(target)
    const wc = FakeWindow.instances[0]!.webContents
    const prevent = vi.fn()
    wc.listeners.get('will-navigate')!({ preventDefault: prevent }, 'https://example.com')
    expect(prevent).toHaveBeenCalled()
    const handler = wc.setWindowOpenHandler.mock.calls[0]![0] as () => { action: string }
    expect(handler()).toEqual({ action: 'deny' })
  })

  it('loads the dev server URL in development', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    present(target)
    expect(FakeWindow.instances[0]!.loadURL).toHaveBeenCalledWith(
      'http://localhost:5173#/present/%2FUsers%2Fa%2FNCIA.ttxproj/S1/INJ1',
    )
  })
})
