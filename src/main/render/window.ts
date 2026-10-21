// Render composed inject HTML to PNG/PDF in a hidden, sandboxed, offscreen window with no
// network (ADR-0008). Offscreen rendering has a fixed device scale factor of 1, so output
// is identical on retina and non-retina machines; `scale` sets the zoom (2 = crisp @2x).
import { BrowserWindow, session, type Session } from 'electron'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newId } from '../lib/ids'
import type { ComposedDocument } from './compose'

const PARTITION = 'render-sandbox'
let renderSession: Session | null = null
let chain: Promise<unknown> = Promise.resolve()

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

/** Serialize renders through one queue (the renderer workstream adds a pool). */
function serialized<T>(op: () => Promise<T>): Promise<T> {
  const run = chain.catch(() => undefined).then(op)
  chain = run
  return run
}

async function withDocument<T>(
  doc: ComposedDocument,
  scale: number,
  fn: (win: BrowserWindow, size: { width: number; height: number }) => Promise<T>,
): Promise<T> {
  const file = join(tmpdir(), `ttx-render-${newId()}.html`)
  // Inject <base> so relative URLs (template images) resolve to the template folder.
  const html = doc.html.replace('<head>', `<head><base href="file://${doc.baseDir}/">`)
  await fs.writeFile(file, html)
  const width = doc.meta.width
  const win = new BrowserWindow({
    show: false,
    width: Math.ceil(width * scale),
    height: Math.ceil((doc.meta.height ?? 1200) * scale),
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
  try {
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
    await new Promise((r) => setTimeout(r, 50))
    return await fn(win, { width, height })
  } finally {
    win.destroy()
    await fs.rm(file, { force: true })
  }
}

export interface PngResult {
  png: Buffer
  /** CSS pixel size; the PNG is width × scale by height × scale. */
  width: number
  height: number
  scale: number
}

export function renderPng(doc: ComposedDocument, scale = 2): Promise<PngResult> {
  return serialized(() =>
    withDocument(doc, scale, async (win, size) => {
      const img = await win.webContents.capturePage({
        x: 0,
        y: 0,
        width: Math.ceil(size.width * scale),
        height: Math.ceil(size.height * scale),
      })
      return { png: img.toPNG(), ...size, scale }
    }),
  )
}

export function renderPdf(doc: ComposedDocument): Promise<Buffer> {
  return serialized(() =>
    withDocument(doc, 1, async (win, size) =>
      win.webContents.printToPDF({
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        pageSize: doc.meta.paper ? 'Letter' : { width: size.width / 96, height: size.height / 96 },
      }),
    ),
  )
}
