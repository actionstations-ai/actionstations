// Print export documents to PDF in a hidden, sandboxed window with no network (same rules
// as the inject renderer, ADR-0008, #301): the window loads its own document, then only
// data: URLs and files under the caller's read roots (the project folder, checked by
// realpath); navigation, frames and popups are refused; no permissions; documents carry a
// CSP without scripts. Page size, orientation and running headers come from the document's
// CSS (@page), so preferCSSPageSize is on; PDFs are tagged with an outline.
import { BrowserWindow, session, type Session } from 'electron'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'
import {
  clearWindowPolicy,
  filePolicy,
  guardWindow,
  lockSession,
  setWindowPolicy,
} from '../render/sandbox'

const PARTITION = 'export-sandbox'
const TIMEOUT_MS = 180_000
/** Fonts loaded and every <img> decoded before printing. */
const READY_JS =
  'document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => null)))).then(() => true)'

let exportSession: Session | null = null

function sandboxSession(): Session {
  if (exportSession) return exportSession
  exportSession = lockSession(session.fromPartition(PARTITION))
  return exportSession
}

function createPrintWindow(): BrowserWindow {
  const win = new BrowserWindow({
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
  guardWindow(win)
  return win
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

/**
 * Print a self-contained HTML document to a tagged PDF. `readRoots`: folders (or files) the
 * document's images may come from, e.g. the project folder; any other file is refused.
 */
export async function htmlToPdf(
  html: string,
  what = 'PDF export',
  readRoots: readonly string[] = [],
): Promise<Buffer> {
  const file = join(tmpdir(), `ttx-export-${newId()}.html`)
  await fs.writeFile(file, html)
  const win = createPrintWindow()
  try {
    setWindowPolicy(win, filePolicy(file, readRoots))
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
    clearWindowPolicy(win)
    if (!win.isDestroyed()) win.destroy()
    await fs.rm(file, { force: true })
  }
}
