import { resolve } from 'node:path'
import { AppError } from '../lib/errors'
import { isKnownProject } from '../lib/project-registry'
import { isProjectFolder } from './store'

/**
 * Every IPC handler taking a projectPath calls this first: the path must be a project the
 * user opened (this session or recent list) and must contain a project.json.
 * Returns the resolved absolute path.
 */
export async function requireProject(projectPath: string): Promise<string> {
  const root = resolve(projectPath)
  if (!(await isKnownProject(root))) throw new AppError('FORBIDDEN', `Project not opened: ${root}`)
  if (!(await isProjectFolder(root)))
    throw new AppError('NOT_FOUND', `Not a project folder: ${root}`)
  return root
}
