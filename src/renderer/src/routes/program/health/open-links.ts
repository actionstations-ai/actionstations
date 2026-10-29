// Links from the dashboard into a project (FR-10). A project that is not on this computer has no
// path in the program summary, so there is nothing to open and the buttons say so.
import { call } from '../../../lib/api'
import { projectKey } from '../../../state/project'
import type { ProgramContext } from '../ProgramFrame'

export const projectPathOf = (ctx: ProgramContext, projectId: string): string | undefined =>
  ctx.summary.reachable[projectId] ? ctx.summary.projectPaths[projectId] : undefined

/** Open the project, then return the route to go to. */
export async function routeInProject(
  ctx: ProgramContext,
  projectId: string,
  suffix: string,
): Promise<string> {
  const path = projectPathOf(ctx, projectId)
  if (!path) throw new Error('That project is not on this computer.')
  await call('project:open', { path })
  return `/p/${projectKey(path)}/${suffix}`
}
