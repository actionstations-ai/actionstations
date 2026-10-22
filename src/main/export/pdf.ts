// Print export documents to PDF in a hidden, sandboxed window with no network (same rules
// as the inject renderer, ADR-0008): only file: and data: loads, no permissions, documents
// carry a CSP without scripts. Page size, orientation and running headers come from the
// document's CSS (@page), so preferCSSPageSize is on; PDFs are tagged with an outline.
import { BrowserWindow, session, type Session } from 'electron'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'

const PARTITION = 'export-sandbox'
const TIMEOUT_MS = 180_000
/** Fonts loaded and every <img> decoded before printing. */
const READY_JS =
  'document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => null)))).then(() => true)'

let exportSession: Session | null = null

function sandboxSession(): Session {
  if (exportSession) return exportSession
  exportSession = session.fromPartition(PARTITION)
  exportSession.webRequest.onBeforeRequest((details, cb) => {
    cb({ cancel: !/^(file|data):/.test(details.url) })
  })
  exportSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  return exportSession
}

function createPrintWindow(): BrowserWindow {
  return new BrowserWindow({
    show: false,
    width: 816,
    height: 1056,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
      session: sandboxSession(),
      backgroundThrottling: false,
    },
  })
}

function withTimeout<T>(work: Promise<T>, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AppError('INTERNAL', `${what} timed out after ${TIMEOUT_MS / 1000} s`)),
      TIMEOUT_MS,
    )
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

/** Print a self-contained HTML document to a tagged PDF. */
export async function htmlToPdf(html: string, what = 'PDF export'): Promise<Buffer> {
  const file = join(tmpdir(), `ttx-export-${newId()}.html`)
  await fs.writeFile(file, html)
  const win = createPrintWindow()
  try {
    return await withTimeout(
      (async () => {
        await win.loadFile(file)
        await win.webContents.executeJavaScript(READY_JS)
        return win.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          generateTaggedPDF: true,
          generateDocumentOutline: true,
        })
      })(),
      what,
    )
  } finally {
    if (!win.isDestroyed()) win.destroy()
    await fs.rm(file, { force: true })
  }
}
