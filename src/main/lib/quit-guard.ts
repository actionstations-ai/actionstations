// Confirm before quitting with unsaved work (#196). Some edits live only in renderer memory
// (inject drafts, edits parked while a job runs, editors whose save was refused). Before the
// app quits, or the main window closes (which quits, #191), main asks the renderer: it saves
// what it can, then answers with what is still unsaved. When something is, a native dialog
// offers "Quit and discard" or "Cancel". A renderer that never answers (hung, crashed, still
// loading) cannot block quitting: the question times out and quitting goes ahead.
import { randomUUID } from 'node:crypto'
import { app, dialog, type BrowserWindow } from 'electron'

/** How long main waits for the renderer's answer (it saves pending edits first). */
export const REPLY_TIMEOUT_MS = 3000

export const QUIT_CHECK_EVENT = 'event:app:quit-check'

const waiting = new Map<string, (items: string[]) => void>()
let rendererReady = false

/**
 * The renderer's answer to a quit check. Without a requestId it is the renderer saying its
 * guard is listening (sent once per page load); until then nothing is asked.
 */
export function onUnsavedReport(requestId: string | undefined, items: string[]): void {
  if (requestId === undefined) {
    rendererReady = true
    return
  }
  waiting.get(requestId)?.(items)
}

/** The page is gone (crash, reload): stop asking until it says it listens again. */
export function resetRendererReady(): void {
  rendererReady = false
}

type AskableWindow = Pick<BrowserWindow, 'isDestroyed'> & {
  webContents: Pick<BrowserWindow['webContents'], 'isCrashed' | 'send'>
}

/** What the renderer still holds unsaved, or [] when it cannot answer in time. */
export function askRendererForUnsaved(
  win: AskableWindow | undefined,
  timeoutMs = REPLY_TIMEOUT_MS,
): Promise<string[]> {
  if (!rendererReady || !win || win.isDestroyed() || win.webContents.isCrashed())
    return Promise.resolve([])
  const requestId = randomUUID()
  return new Promise((resolve) => {
    const done = (items: string[]): void => {
      clearTimeout(timer)
      waiting.delete(requestId)
      resolve(items)
    }
    const timer = setTimeout(() => done([]), timeoutMs)
    waiting.set(requestId, done)
    win.webContents.send(QUIT_CHECK_EVENT, { requestId })
  })
}

/**
 * Ask the user. TTX_QUIT_PROMPT = 'dialog' | 'discard' | 'cancel' (tests); headless runs
 * default to 'discard' so an automated run is never stuck behind a dialog nobody sees.
 */
export async function confirmDiscard(
  win: BrowserWindow | undefined,
  items: string[],
): Promise<boolean> {
  const mode = process.env.TTX_QUIT_PROMPT ?? (process.env.TTX_HEADLESS ? 'discard' : 'dialog')
  if (mode === 'discard') return true
  if (mode === 'cancel') return false
  const options = {
    type: 'warning' as const,
    buttons: ['Quit and discard', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    message: 'You have unsaved work',
    detail: `Quitting now discards:\n${items.map((i) => `• ${i}`).join('\n')}`,
  }
  const live = win && !win.isDestroyed() ? win : undefined
  const { response } = live
    ? await dialog.showMessageBox(live, options)
    : await dialog.showMessageBox(options)
  return response === 0
}

export interface QuitGuardDeps {
  ask: (win: BrowserWindow | undefined) => Promise<string[]>
  confirm: (win: BrowserWindow | undefined, items: string[]) => Promise<boolean>
  quit: () => void
}

const defaultDeps: QuitGuardDeps = {
  ask: (win) => askRendererForUnsaved(win),
  confirm: confirmDiscard,
  quit: () => app.quit(),
}

/**
 * Hook for `before-quit` and the main window's `close`. `intercept` returns true when quitting
 * may go on now; otherwise it cancels the event, checks, and quits itself once confirmed.
 */
export function createQuitGuard(
  getWindow: () => BrowserWindow | undefined,
  deps: QuitGuardDeps = defaultDeps,
) {
  let confirmed = false
  let checking = false

  async function check(): Promise<void> {
    if (checking) return
    checking = true
    try {
      const win = getWindow()
      const items = await deps.ask(win)
      if (items.length && !(await deps.confirm(win, items))) return
      confirmed = true
    } catch (e) {
      // A failed check must never keep the app from quitting.
      console.error('[quit-guard] check failed; quitting', e)
      confirmed = true
    } finally {
      checking = false
    }
    deps.quit()
  }

  return {
    intercept(e: { preventDefault: () => void }): boolean {
      if (confirmed) return true
      e.preventDefault()
      void check()
      return false
    },
  }
}
