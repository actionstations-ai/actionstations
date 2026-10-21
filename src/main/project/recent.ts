// Recent-projects list kept in app settings. The list is a convenience index: project.json
// stays the source of truth for name, organization and archived state.
import { resolve } from 'node:path'
import type { Project, RecentProject } from '@shared/schemas'
import { getSettings, updateSettings } from '../settings/store'
import { isProjectFolder, loadProject } from './store'

/** Recent entry refreshed from project.json, or null when the folder is gone. */
async function refreshEntry(entry: RecentProject): Promise<RecentProject | null> {
  if (!(await isProjectFolder(entry.path))) return null
  try {
    const project = await loadProject(entry.path)
    return { ...entry, name: project.name, orgName: project.orgName, archived: project.archived }
  } catch {
    // Keep a project whose JSON is invalid visible, so the user can open it and see why.
    return entry
  }
}

/**
 * Recent projects whose folders still exist, with name/org/archived read from disk.
 * Missing folders stay in settings (a removable drive may come back) but are not returned.
 */
export async function listRecent(): Promise<RecentProject[]> {
  const { recentProjects } = await getSettings()
  const refreshed = await Promise.all(recentProjects.map(refreshEntry))
  return refreshed.filter((r): r is RecentProject => r !== null)
}

/** Update a recent entry's display fields in place, without moving it to the top. */
export async function syncRecent(root: string, project: Project): Promise<void> {
  await updateSettings((s) => {
    for (const r of s.recentProjects) {
      if (resolve(r.path) !== root) continue
      r.name = project.name
      r.orgName = project.orgName
      r.archived = project.archived
    }
  })
}

/** Remove a project from the recent list. The folder on disk is untouched. */
export async function forgetRecent(path: string): Promise<void> {
  const root = resolve(path)
  await updateSettings((s) => {
    s.recentProjects = s.recentProjects.filter((r) => resolve(r.path) !== root)
  })
}
