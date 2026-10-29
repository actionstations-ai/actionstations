import type { OpenProgram } from '@shared/ipc/program'
import { resolveProjectPath } from './links'
import { loadProgram, summarize } from './store'

/** The program, schedule, lock notice and whether each linked project can be found. */
export async function openSummary(root: string): Promise<OpenProgram> {
  const base = await summarize(root)
  const program = await loadProgram(root)
  const reachable: Record<string, boolean> = {}
  const projectPaths: Record<string, string> = {}
  for (const link of program.projects) {
    const found = await resolveProjectPath(link, root)
    reachable[link.projectId] = found.reachable
    if (found.path) projectPaths[link.projectId] = found.path
  }
  return { ...base, reachable, projectPaths }
}
