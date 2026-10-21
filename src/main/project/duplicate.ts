// Duplicate a project folder: same documents, scenarios and prompts under a new id and name.
// Derived data (index.sqlite*, .cache/) is skipped; it is rebuilt from the copied documents.
import { promises as fs } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import type { OpenProject } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { exists, slugify } from '../lib/fs'
import { newId, nowIso } from '../lib/ids'
import { openProject, PROJECT_EXT, updateProject } from './store'

/** True for paths (relative to the project root) that must not be copied. */
export function isDerivedPath(rel: string): boolean {
  const top = rel.split(/[\\/]/)[0] ?? ''
  return top === '.cache' || top === 'index.sqlite' || top.startsWith('index.sqlite-')
}

export async function duplicateProject(
  root: string,
  input: { newName: string; parentDir?: string },
): Promise<OpenProject> {
  const target = resolve(input.parentDir ?? dirname(root), slugify(input.newName) + PROJECT_EXT)
  if (await exists(target)) throw new AppError('CONFLICT', `A folder already exists at ${target}`)
  if (target.startsWith(root + sep))
    throw new AppError('VALIDATION', 'Cannot duplicate a project into its own folder')
  await fs.cp(root, target, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: (src) => src === root || !isDerivedPath(relative(root, src)),
  })
  const now = nowIso()
  await updateProject(target, (p) => {
    p.id = newId()
    p.name = input.newName
    p.archived = false
    p.createdAt = now
  })
  return openProject(target)
}
