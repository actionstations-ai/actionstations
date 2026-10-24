// One-time move from the old product name (#277). The app was called "Tabletop Generator"
// and kept its settings in `<appData>/Tabletop Generator` and its projects in
// `Documents/Tabletop Generator`. The new folders are `Action Stations`. On the first launch
// after the rename the old folders are moved (renamed; copied when a rename is not possible).
// A failed copy never deletes the old folder: the app keeps using it instead.
import * as nodeFs from 'node:fs'
import { join, resolve, sep } from 'node:path'

export const APP_NAME = 'Action Stations'
/** The product name before #277. Used only to find folders to migrate. */
export const LEGACY_APP_NAME = 'Tabletop Generator'
/** Written into the new settings folder once the settings migration has run. */
export const MIGRATION_MARKER = 'migration-from-tabletop-generator.json'

export type MoveMethod = 'renamed' | 'copied'
export type MoveResult = { ok: true; method: MoveMethod } | { ok: false; error: string }

/** The fs calls a move needs; tests swap in failing ones. */
export interface MoveOps {
  renameSync: (from: string, to: string) => void
  cpSync: (from: string, to: string, opts: nodeFs.CopySyncOptions) => void
}
const realOps: MoveOps = { renameSync: nodeFs.renameSync, cpSync: nodeFs.cpSync }

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function isEmptyDir(path: string): boolean {
  try {
    return nodeFs.readdirSync(path).length === 0
  } catch {
    return false
  }
}

/**
 * Move `from` to `to` (which must not exist, or be an empty folder). Rename first; on any
 * rename failure (another volume, permissions, a file in use) copy into a staging folder and
 * rename that into place, so `to` never holds a half copy. The source is kept after a copy.
 */
export function moveFolder(from: string, to: string, ops: MoveOps = realOps): MoveResult {
  if (nodeFs.existsSync(to)) {
    if (!isEmptyDir(to)) return { ok: false, error: `${to} already exists and is not empty` }
    nodeFs.rmdirSync(to)
  }
  try {
    ops.renameSync(from, to)
    return { ok: true, method: 'renamed' }
  } catch (renameErr) {
    const staging = `${to}.migrating-${process.pid}`
    try {
      nodeFs.rmSync(staging, { recursive: true, force: true })
      ops.cpSync(from, staging, { recursive: true, verbatimSymlinks: true, errorOnExist: true })
      nodeFs.renameSync(staging, to)
      return { ok: true, method: 'copied' }
    } catch (copyErr) {
      nodeFs.rmSync(staging, { recursive: true, force: true })
      return { ok: false, error: `rename: ${errText(renameErr)}; copy: ${errText(copyErr)}` }
    }
  }
}

export interface MigrationMarker {
  from: string
  to: string
  at: string
  settings: 'renamed' | 'copied'
  /** Secrets are checked after app ready, when safeStorage can be used. */
  secretsCheck: 'pending' | 'done'
  projects?: {
    status: 'renamed' | 'copied' | 'failed' | 'skipped'
    from: string
    to: string
    error?: string
  }
}

export function readMarker(userData: string): MigrationMarker | undefined {
  try {
    return JSON.parse(
      nodeFs.readFileSync(join(userData, MIGRATION_MARKER), 'utf8'),
    ) as MigrationMarker
  } catch {
    return undefined
  }
}

export function writeMarker(userData: string, marker: MigrationMarker): void {
  nodeFs.writeFileSync(join(userData, MIGRATION_MARKER), JSON.stringify(marker, null, 2) + '\n')
}

export type Log = (message: string) => void
const defaultLog: Log = (m) => console.log(`[migration] ${m}`)

export interface UserDataMigration {
  /** The folder the app should use as userData. */
  userData: string
  outcome: 'skipped' | 'renamed' | 'copied' | 'failed'
  reason?: string
}

/**
 * A new settings folder without settings.json holds only what a run left behind before the
 * migration (caches, a crash folder). Rename it aside so the old folder can take its place.
 */
function setAsideStray(to: string, log: Log): void {
  if (!nodeFs.existsSync(to) || isEmptyDir(to)) return
  const aside = `${to} (before migration ${new Date().toISOString().replace(/[:.]/g, '-')})`
  try {
    nodeFs.renameSync(to, aside)
    log(`set aside ${to} (no settings in it) as ${aside}`)
  } catch (e) {
    log(`could not set aside ${to}: ${errText(e)}`)
  }
}

/**
 * Pick (and if needed create by migration) the settings folder. `appData` is the OS folder
 * that holds per-app folders (~/Library/Application Support, %APPDATA%, ~/.config).
 * Synchronous: it runs before app ready, before anything opens a file in userData.
 */
export function migrateUserData(
  appData: string,
  log: Log = defaultLog,
  ops?: MoveOps,
): UserDataMigration {
  const to = join(appData, APP_NAME)
  const from = join(appData, LEGACY_APP_NAME)
  if (nodeFs.existsSync(join(to, 'settings.json')))
    return { userData: to, outcome: 'skipped', reason: 'settings already in the new folder' }
  if (!nodeFs.existsSync(from)) return { userData: to, outcome: 'skipped', reason: 'no old folder' }
  setAsideStray(to, log)
  const moved = moveFolder(from, to, ops)
  if (!moved.ok) {
    log(`could not move settings from ${from} to ${to} (${moved.error}); using ${from}`)
    return { userData: from, outcome: 'failed', reason: moved.error }
  }
  const marker: MigrationMarker = {
    from,
    to,
    at: new Date().toISOString(),
    settings: moved.method,
    secretsCheck: 'pending',
  }
  try {
    writeMarker(to, marker)
  } catch (e) {
    log(`settings moved but the marker could not be written: ${errText(e)}`)
  }
  const kept = moved.method === 'copied' ? `; the old folder ${from} was kept` : ''
  log(`settings ${moved.method} from ${from} to ${to}${kept}`)
  return { userData: to, outcome: moved.method }
}

/** Default projects folders, old and new, under the OS Documents folder. */
export function projectsFolders(documents: string): { from: string; to: string } {
  return { from: join(documents, LEGACY_APP_NAME), to: join(documents, APP_NAME) }
}

/**
 * Where new projects and example copies go when Settings names no folder: the new folder,
 * unless only the old one exists (its move failed or has not run).
 */
export function defaultProjectsDir(documents: string): string {
  const { from, to } = projectsFolders(documents)
  if (!nodeFs.existsSync(to) && nodeFs.existsSync(from)) return from
  return to
}

/** `path` with the `from` prefix replaced by `to`, or undefined when it is not under `from`. */
export function rebase(path: string, from: string, to: string): string | undefined {
  const abs = resolve(path)
  if (abs === from) return to
  if (abs.startsWith(from + sep)) return to + abs.slice(from.length)
  return undefined
}

/**
 * Move Documents/Tabletop Generator to Documents/Action Stations once, when the new folder
 * does not exist yet. Returns the marker entry to record.
 */
export function migrateProjectsFolder(
  documents: string,
  log: Log = defaultLog,
  ops?: MoveOps,
): NonNullable<MigrationMarker['projects']> {
  const { from, to } = projectsFolders(documents)
  if (!nodeFs.existsSync(from) || nodeFs.existsSync(to)) return { status: 'skipped', from, to }
  const moved = moveFolder(from, to, ops)
  if (!moved.ok) {
    log(`could not move projects from ${from} to ${to} (${moved.error}); projects stay there`)
    return { status: 'failed', from, to, error: moved.error }
  }
  log(`projects folder ${moved.method} from ${from} to ${to}`)
  return { status: moved.method, from, to }
}

/** userData/jobs.json, the job records file (src/main/jobs/persist.ts). */
export const JOBS_FILE = 'jobs.json'

/**
 * Point job records at the moved projects folder (#309): every `projectPath` under `from`
 * is rewritten to `to`. Works on the raw JSON so fields this code does not know survive.
 * Idempotent: rewritten paths are no longer under `from`. Returns how many records changed;
 * the file is written (atomically) only when one did. A missing or unreadable file is left.
 */
export function rebaseJobsFile(file: string, from: string, to: string): number {
  let data: { jobs?: unknown }
  try {
    data = JSON.parse(nodeFs.readFileSync(file, 'utf8')) as { jobs?: unknown }
  } catch {
    return 0
  }
  if (!data || !Array.isArray(data.jobs)) return 0
  let changed = 0
  for (const job of data.jobs as { projectPath?: unknown }[]) {
    if (!job || typeof job.projectPath !== 'string') continue
    const moved = rebase(job.projectPath, from, to)
    if (moved === undefined || moved === job.projectPath) continue
    job.projectPath = moved
    changed++
  }
  if (changed === 0) return 0
  const tmp = `${file}.migrating-${process.pid}`
  nodeFs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  nodeFs.renameSync(tmp, file)
  return changed
}
