// Project folders opened from Finder / Explorer (#277): a double-clicked `.asproj` (or legacy
// `.ttxproj`) arrives as a macOS 'open-file' event or, on Windows and Linux, as a launch
// argument. Requests made before the renderer is listening wait in a queue it drains once.
import { emit } from './events'

const PROJECT_FOLDER = /\.(asproj|ttxproj)[\\/]?$/i
const pending: string[] = []
let rendererListening = false

export const isProjectFolderPath = (arg: string): boolean => PROJECT_FOLDER.test(arg)

/** Project folders named on a command line (skips flags and the executable itself). */
export function projectPathsFromArgv(argv: readonly string[]): string[] {
  return argv.filter((a) => !a.startsWith('-') && isProjectFolderPath(a))
}

/** Queue a project folder to open, or hand it to the renderer when it is listening. */
export function requestOpen(path: string): void {
  if (rendererListening) emit('app:open-project', { path })
  else pending.push(path)
}

/** The renderer calls this once at start: returns the queued folders and listens from now. */
export function takePendingOpens(): string[] {
  rendererListening = true
  return pending.splice(0)
}

/** Tests only. */
export function resetOpenRequests(): void {
  pending.length = 0
  rendererListening = false
}
