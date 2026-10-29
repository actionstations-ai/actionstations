import { resolve } from 'node:path'
import { AppError } from '../lib/errors'
import { getSettings } from '../settings/store'
import { isProgramFolder } from './store'

/**
 * Every program handler starts here: the path must be the active program or one in the recent
 * list (the user chose it in a dialog) and must contain a program.json. Returns the absolute path.
 */
export async function requireProgram(programPath: string): Promise<string> {
  const root = resolve(programPath)
  const { program } = await getSettings()
  const known =
    (program.activePath && resolve(program.activePath) === root) ||
    program.recent.some((r) => resolve(r.path) === root)
  if (!known) throw new AppError('FORBIDDEN', `Program not opened: ${root}`)
  if (!(await isProgramFolder(root)))
    throw new AppError('NOT_FOUND', `Not a program folder: ${root}`)
  return root
}
