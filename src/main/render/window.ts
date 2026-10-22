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

/** Destroy idle render windows (e.g. before quit). */
export function drainRenderPool(): void {
  pool.drain()
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
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    const height =
      doc.meta.height ??
      Math.ceil(
        (await win.webContents.executeJavaScript(
          'Math.ceil(document.querySelector(".inject-root").getBoundingClientRect().height)',
        )) as number,
      )
    win.setContentSize(Math.ceil(width * scale), Math.ceil(height * scale))
    await win.webContents.executeJavaScript(PAINTED_JS)
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

export function renderPng(doc: ComposedDocument, scale = 2): Promise<PngResult> {
  return withDocument(doc, scale, async (win, size) => {
    const img = await win.webContents.capturePage({
      x: 0,
      y: 0,
      width: Math.ceil(size.width * scale),
      height: Math.ceil(size.height * scale),
    })
    return { png: img.toPNG(), ...size, scale }
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
