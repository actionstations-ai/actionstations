import { resolve } from 'node:path'
import { getSettings } from '../settings/store'

const opened = new Set<string>()

/** Record that the user opened/created a project at this path this session. */
export function markProjectOpen(path: string): void {
  opened.add(resolve(path))
}

/** A project path the user has opened (this session or in the recent list). */
export async function isKnownProject(path: string): Promise<boolean> {
  const p = resolve(path)
  if (opened.has(p)) return true
  const s = await getSettings()
  return s.recentProjects.some((r) => resolve(r.path) === p)
}
