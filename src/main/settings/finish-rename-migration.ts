// Second half of the rename migration (#277), run once after app ready: move the default
// projects folder, point recent projects and job records at it, and check that migrated API
// keys still decrypt. Driven by the marker the first half wrote; does nothing without one.
import { join } from 'node:path'
import {
  JOBS_FILE,
  migrateProjectsFolder,
  readMarker,
  rebase,
  rebaseJobsFile,
  writeMarker,
  type Log,
  type MigrationMarker,
} from '../lib/rename-migration'
import { setAsideUndecryptableSecrets } from '../secrets'
import { updateSettings } from './store'

const defaultLog: Log = (m) => console.log(`[migration] ${m}`)

/** Rewrite settings paths that pointed into the old projects folder. */
async function rebaseProjectPaths(from: string, to: string): Promise<void> {
  await updateSettings((s) => {
    for (const r of s.recentProjects) r.path = rebase(r.path, from, to) ?? r.path
    if (s.defaultProjectsDir)
      s.defaultProjectsDir = rebase(s.defaultProjectsDir, from, to) ?? s.defaultProjectsDir
  })
}

/**
 * Job records still pointing into the old projects folder follow it (#309). Runs on every
 * start after a projects move, so installs migrated before this fix are caught up; the
 * rewrite is idempotent and writes nothing once the paths are moved.
 */
function rebaseJobPaths(userData: string, marker: MigrationMarker, log: Log): void {
  const moved = marker.projects
  if (!moved || (moved.status !== 'renamed' && moved.status !== 'copied')) return
  try {
    const count = rebaseJobsFile(join(userData, JOBS_FILE), moved.from, moved.to)
    if (count > 0) log(`${count} job record(s) now point at ${moved.to}`)
  } catch (e) {
    log(`job records not updated: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function checkSecrets(log: Log): Promise<void> {
  const ids = await setAsideUndecryptableSecrets()
  if (ids.length === 0) return
  log(
    `API keys for ${ids.join(', ')} could not be decrypted; the user is asked to enter them again`,
  )
  await updateSettings((s) => {
    s.keyReentry = { providerIds: ids, dismissed: false }
  })
}

export async function finishRenameMigration(
  userData: string,
  documents: string,
  log: Log = defaultLog,
): Promise<void> {
  const marker = readMarker(userData)
  if (!marker) return
  if (!marker.projects) {
    marker.projects = migrateProjectsFolder(documents, log)
    writeMarker(userData, marker)
    const { status, from, to } = marker.projects
    if (status === 'renamed' || status === 'copied')
      await rebaseProjectPaths(from, to).catch((e: unknown) =>
        log(`recent projects not updated: ${e instanceof Error ? e.message : String(e)}`),
      )
  }
  rebaseJobPaths(userData, marker, log)
  if (marker.secretsCheck === 'pending') {
    try {
      await checkSecrets(log)
    } catch (e) {
      log(`API key check failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    marker.secretsCheck = 'done'
    writeMarker(userData, marker)
  }
}
