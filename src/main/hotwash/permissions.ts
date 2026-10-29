// Microphone permission (#425). Every web permission stays denied except one case: the main
// window's own app page asking for audio only, within a few seconds of the user pressing
// Record (hotwash:mic-arm). Presentation, render and print windows, other origins, video,
// screen capture and every other permission are refused. Pure decision functions here;
// src/main/index.ts wires them into the session handlers.

/** How long a press of Record keeps the microphone request window open. */
export const ARM_WINDOW_MS = 10_000

let armedAt: number | undefined

/** Called by hotwash:mic-arm when the user starts a recording. */
export function armMicrophone(now = Date.now()): void {
  armedAt = now
}

/** Called once the microphone stream is open (or failed): later requests are refused again. */
export function disarmMicrophone(): void {
  armedAt = undefined
}

export function isArmed(now = Date.now()): boolean {
  return armedAt !== undefined && now - armedAt >= 0 && now - armedAt <= ARM_WINDOW_MS
}

export interface PermissionAsk {
  permission: string
  /** Electron's details.mediaTypes for 'media' requests. */
  mediaTypes?: readonly string[]
  /** The frame that asked (details.requestingUrl, or the check's requestingOrigin). */
  requestingUrl: string
  /** The asking webContents is the main window's. */
  fromMainWindow: boolean
  isAppUrl: (url: string) => boolean
  armed: boolean
}

/** setPermissionRequestHandler: allow audio capture for the main app page while armed. */
export function allowPermissionRequest(ask: PermissionAsk): boolean {
  if (ask.permission !== 'media') return false
  const types = ask.mediaTypes ?? []
  if (types.length !== 1 || types[0] !== 'audio') return false
  return ask.fromMainWindow && ask.isAppUrl(ask.requestingUrl) && ask.armed
}

export interface PermissionCheck {
  permission: string
  /** details.mediaType for 'media' checks ('audio' | 'video' | 'unknown'). */
  mediaType?: string
  requestingOrigin: string
  fromMainWindow: boolean
  isAppOrigin: (origin: string) => boolean
  armed: boolean
}

/**
 * setPermissionCheckHandler answers the same way, so device labels in enumerateDevices are
 * only visible to the main window right after the user pressed Record.
 */
export function allowPermissionCheck(check: PermissionCheck): boolean {
  if (check.permission !== 'media') return false
  if (check.mediaType !== 'audio') return false
  return check.fromMainWindow && check.isAppOrigin(check.requestingOrigin) && check.armed
}
