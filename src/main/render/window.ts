// Render composed inject HTML to PNG/PDF in hidden, sandboxed, offscreen windows with no
// network (ADR-0008). Offscreen rendering has a fixed device scale factor of 1, so output
// is identical on retina and non-retina machines; `scale` sets the zoom (2 = crisp @2x).
//
// Windows come from a small pool (./pool.ts): warm windows are reused per zoom factor,
// reset to a blank page between jobs, recycled after `maxUses` renders or a renderer
// crash, and every render has a timeout. Size/limits: configureRenderPool() or the
// TTX_RENDER_POOL_SIZE / TTX_RENDER_MAX_USES / TTX_RENDER_TIMEOUT_MS env vars.
import { BrowserWindow, session, type Session } from 'electron'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newId } from '../lib/ids'
import type { ComposedDocument } from './compose'
import { WorkerPool, type PoolDriver, type PoolOptions, type PoolStats } from './pool'

const PARTITION = 'render-sandbox'
/** Empty the previous document so nothing from one inject can show up in the next. */
const RESET_JS = 'document.documentElement.replaceChildren(); true'
/** Resolves after two animation frames, i.e. once the current layout has been painted. */
const PAINTED_JS =
  'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))'
let renderSession: Session | null = null

function sandboxSession(): Session {
  if (renderSession) return renderSession
  renderSession = session.fromPartition(PARTITION)
  // Only local files and inline data may load; templates never touch the network.
  renderSession.webRequest.onBeforeRequest((details, cb) => {
    cb({ cancel: !/^(file|data):/.test(details.url) })
  })
  renderSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  return renderSession
}

const envInt = (name: string, fallback: number): number => {
  const v = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(v) && v > 0 ? v : fallback
}

export const DEFAULT_POOL_OPTIONS: PoolOptions = {
  size: envInt('TTX_RENDER_POOL_SIZE', 2),
  maxUses: envInt('TTX_RENDER_MAX_USES', 50),
  timeoutMs: envInt('TTX_RENDER_TIMEOUT_MS', 15_000),
}

function createWindow(key: string): Promise<BrowserWindow> {
  const scale = Number(key)
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
      session: sandboxSession(),
      zoomFactor: scale,
      backgroundThrottling: false,
    },
  })
  return Promise.resolve(win)
}

const windowDriver: PoolDriver<BrowserWindow> = {
  create: createWindow,
  reset: async (win) => {
    await win.webContents.executeJavaScript(RESET_JS)
  },
  destroy: (win) => {
    if (!win.isDestroyed()) win.destroy()
  },
  isAlive: (win) => !win.isDestroyed() && !win.webContents.isCrashed(),
  onDeath: (win, cb) => {
    const onGone = (_e: unknown, details: { reason: string }) => cb(details.reason)
    const onClosed = () => cb('closed')
    win.webContents.on('render-process-gone', onGone)
    win.on('closed', onClosed)
    return () => {
      if (win.isDestroyed()) return
      win.webContents.off('render-process-gone', onGone)
      win.off('closed', onClosed)
    }
  },
}

const pool = new WorkerPool(windowDriver, DEFAULT_POOL_OPTIONS)

/** Change pool size, recycle count or per-render timeout (applies to later jobs). */
export function configureRenderPool(opts: Partial<PoolOptions>): void {
  pool.configure(opts)
}

export function renderPoolStats(): PoolStats & { options: PoolOptions } {
  return { ...pool.stats(), options: pool.options }
}

/** Destroy idle render windows (busy ones close when their render ends). */
export function drainRenderPool(): void {
  pool.drain()
}

/**
 * App quit: cancel queued renders, reject in-flight ones (CANCELLED) and destroy every
 * render window, before Electron's close-all pass. Final; later renders reject at once.
 */
export function shutdownRenderPool(): void {
  pool.shutdown()
}

/** Fonts loaded and every <img> decoded, so measurement and capture see final pixels. */
const READY_JS =
  'document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => null)))).then(() => true)'

/**
 * Resize a (possibly reused) offscreen window and wait until the compositor surface has
 * actually taken the new size before anyone captures it; capturing a surface mid-resize
 * throws UnknownVizError or returns a stale frame.
 */
async function resizeAndSettle(win: BrowserWindow, width: number, height: number): Promise<void> {
  win.setContentSize(width, height)
  for (let i = 0; i < 40; i++) {
    const [w, h] = win.getContentSize()
    const inner = (await win.webContents.executeJavaScript(
      '[Math.round(innerWidth * devicePixelRatio), Math.round(innerHeight * devicePixelRatio)]',
    )) as [number, number]
    if (
      w === width &&
      h === height &&
      Math.abs(inner[0] - width) <= 1 &&
      Math.abs(inner[1] - height) <= 1
    )
      break
    await new Promise((r) => setTimeout(r, 25))
  }
  await win.webContents.executeJavaScript(PAINTED_JS)
}

async function loadDocument(
  win: BrowserWindow,
  doc: ComposedDocument,
  scale: number,
): Promise<{ width: number; height: number }> {
  const file = join(tmpdir(), `ttx-render-${newId()}.html`)
  // Inject <base> so relative URLs (template images) resolve to the template folder.
  const html = doc.html.replace('<head>', `<head><base href="file://${doc.baseDir}/">`)
  await fs.writeFile(file, html)
  const width = doc.meta.width
  try {
    win.setContentSize(Math.ceil(width * scale), Math.ceil((doc.meta.height ?? 1200) * scale))
    await win.loadFile(file)
    await win.webContents.executeJavaScript(READY_JS)
    const height =
      doc.meta.height ??
      Math.ceil(
        (await win.webContents.executeJavaScript(
          'Math.ceil(document.querySelector(".inject-root").getBoundingClientRect().height)',
        )) as number,
      )
    await resizeAndSettle(win, Math.ceil(width * scale), Math.ceil(height * scale))
    return { width, height }
  } finally {
    await fs.rm(file, { force: true })
  }
}

function withDocument<T>(
  doc: ComposedDocument,
  scale: number,
  fn: (win: BrowserWindow, size: { width: number; height: number }) => Promise<T>,
): Promise<T> {
  return pool.run(String(scale), async (win) => fn(win, await loadDocument(win, doc, scale)))
}

export interface PngResult {
  png: Buffer
  /** CSS pixel size; the PNG is width × scale by height × scale. */
  width: number
  height: number
  scale: number
}

/**
 * Offscreen windows can return a frame that is not fully rasterized even after two
 * animation frames. Capture until two consecutive frames are byte-identical (stable),
 * so output is deterministic; give up after MAX_CAPTURES and use the last frame.
 */
const MAX_CAPTURES = 6

/** capturePage can throw UnknownVizError while the compositor is busy; retry on a fresh frame. */
async function captureWithRetry(
  win: BrowserWindow,
  rect: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return (await win.webContents.capturePage(rect)).toPNG()
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)))
      await win.webContents.executeJavaScript(PAINTED_JS)
    }
  }
  // Let the pool recycle this window (a failed job replaces its worker).
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export function renderPng(doc: ComposedDocument, scale = 2): Promise<PngResult> {
  return withDocument(doc, scale, async (win, size) => {
    const rect = {
      x: 0,
      y: 0,
      width: Math.ceil(size.width * scale),
      height: Math.ceil(size.height * scale),
    }
    let previous = await captureWithRetry(win, rect)
    for (let i = 1; i < MAX_CAPTURES; i++) {
      await win.webContents.executeJavaScript(PAINTED_JS)
      const next = await captureWithRetry(win, rect)
      if (next.equals(previous)) break
      previous = next
    }
    return { png: previous, ...size, scale }
  })
}

export function renderPdf(doc: ComposedDocument): Promise<Buffer> {
  return withDocument(doc, 1, async (win, size) =>
    win.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: doc.meta.paper ? 'Letter' : { width: size.width / 96, height: size.height / 96 },
    }),
  )
}
