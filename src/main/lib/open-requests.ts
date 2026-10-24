// Files and folders the OS hands the app: project folders opened from Finder / Explorer (#277)
// and pack archives (.aspack, #268). A double-clicked item arrives as a macOS 'open-file' event
// or, on Windows and Linux, as a launch argument. Requests made before the renderer is
// listening wait in a queue it drains once. A pack only ever opens the review screen; nothing
// here installs anything.
import { emit } from './events'

const PROJECT_FOLDER = /\.(asproj|ttxproj)[\\/]?$/i
const PACK_FILE = /\.aspack$/i

interface OpenQueue {
  pending: string[]
  listening: boolean
}
const projects: OpenQueue = { pending: [], listening: false }
const packs: OpenQueue = { pending: [], listening: false }

export const isProjectFolderPath = (arg: string): boolean => PROJECT_FOLDER.test(arg)
export const isPackFilePath = (arg: string): boolean => PACK_FILE.test(arg)

/** Project folders named on a command line (skips flags and the executable itself). */
export function projectPathsFromArgv(argv: readonly string[]): string[] {
  return argv.filter((a) => !a.startsWith('-') && isProjectFolderPath(a))
}

/** Project folders and pack archives named on a command line, in order. */
export function openPathsFromArgv(argv: readonly string[]): string[] {
  return argv.filter((a) => !a.startsWith('-') && (isProjectFolderPath(a) || isPackFilePath(a)))
}

/**
 * Queue a project folder or pack archive to open, or hand it to the renderer when it is
 * listening. Anything else is ignored.
 */
export function requestOpen(path: string): void {
  if (isPackFilePath(path)) {
    if (packs.listening) emit('app:open-pack', { path })
    else packs.pending.push(path)
    return
  }
  if (projects.listening) emit('app:open-project', { path })
  else projects.pending.push(path)
}

/** The renderer calls this once at start: returns the queued folders and listens from now. */
export function takePendingOpens(): string[] {
  projects.listening = true
  return projects.pending.splice(0)
}

/** Same for pack archives: the queued .aspack paths (each opens the review, never installs). */
export function takePendingPackOpens(): string[] {
  packs.listening = true
  return packs.pending.splice(0)
}

/** Tests only. */
export function resetOpenRequests(): void {
  for (const q of [projects, packs]) {
    q.pending.length = 0
    q.listening = false
  }
}
