// File and navigation lock for the hidden render and PDF windows (ADR-0008, #301). Templates
// are shared files and field values are model output, so the windows do not trust the
// documents they load; this layer works without the template checker:
//
//   - the main frame may load only the document file the app wrote for this job;
//   - sub-resources may load from data: URLs or from files whose realpath is inside one of
//     the job's roots (template folder, templates/_shared, the media files the render uses);
//   - frames, every other scheme and every navigation after the initial load are refused
//     (will-navigate, will-frame-navigate, will-redirect, window.open).
//
// Policies are per webContents; a window with no policy (between jobs) loads nothing.
import { realpathSync } from 'node:fs'
import { sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserWindow, Session } from 'electron'

export interface FilePolicy {
  /** Realpath of the document file the window loads for this job. */
  document: string
  /** Realpaths of the folders (or single files) sub-resources may load from. */
  roots: string[]
}

const policies = new Map<number, FilePolicy>()
const locked = new WeakSet<Session>()

/** Realpath, or undefined when the path does not exist. */
export function realOrUndefined(path: string): string | undefined {
  try {
    return realpathSync.native(path)
  } catch {
    return undefined
  }
}

/** Build a policy: realpaths of the document and of every existing root. */
export function filePolicy(document: string, roots: readonly string[]): FilePolicy {
  const doc = realOrUndefined(document)
  if (!doc) throw new Error(`render document missing: ${document}`)
  const real = roots.map(realOrUndefined).filter((r): r is string => !!r)
  return { document: doc, roots: [...new Set(real)] }
}

const inside = (root: string, target: string): boolean =>
  target === root || target.startsWith(root.endsWith(sep) ? root : root + sep)

function fileTarget(url: string): string | undefined {
  try {
    const u = new URL(url)
    if (u.protocol !== 'file:' || (u.host && u.host !== 'localhost')) return undefined
    u.search = ''
    u.hash = ''
    return realOrUndefined(fileURLToPath(u))
  } catch {
    return undefined
  }
}

/** Whether a request from a window under `policy` may load. */
export function requestAllowed(
  url: string,
  resourceType: string,
  policy: FilePolicy | undefined,
): boolean {
  if (!policy || resourceType === 'subFrame') return false
  if (resourceType === 'mainFrame') return fileTarget(url) === policy.document
  if (url.startsWith('data:')) return true
  const target = fileTarget(url)
  return !!target && policy.roots.some((root) => inside(root, target))
}

/** Install the request filter and permission denial on a sandbox session (once). */
export function lockSession(s: Session): Session {
  if (locked.has(s)) return s
  locked.add(s)
  s.webRequest.onBeforeRequest((details, cb) => {
    const policy =
      details.webContentsId === undefined ? undefined : policies.get(details.webContentsId)
    cb({ cancel: !requestAllowed(details.url, details.resourceType, policy) })
  })
  s.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  s.setPermissionCheckHandler(() => false)
  return s
}

/** Refuse every page-initiated navigation, redirect, popup and webview in this window. */
export function guardWindow(win: BrowserWindow): void {
  const wc = win.webContents
  const id = wc.id
  const deny = (e: { preventDefault: () => void }) => e.preventDefault()
  wc.on('will-navigate', deny)
  wc.on('will-frame-navigate', deny)
  wc.on('will-redirect', deny)
  wc.on('will-attach-webview', deny)
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.once('destroyed', () => policies.delete(id))
}

/** Allow this window's next job to load `policy`'s document and roots. */
export function setWindowPolicy(win: BrowserWindow, policy: FilePolicy): void {
  policies.set(win.webContents.id, policy)
}

/** Back to loading nothing. */
export function clearWindowPolicy(win: BrowserWindow): void {
  if (!win.isDestroyed()) policies.delete(win.webContents.id)
}
