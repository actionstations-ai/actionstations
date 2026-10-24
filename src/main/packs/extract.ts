// Write a verified pack to a staging folder (ADR-0018 "Install location"). Every path goes
// through safeJoin, the written tree is re-checked with realpath (a link planted in the
// staging folder by anything else cannot redirect a write outside it), and any error removes
// the whole staging folder so a failed install leaves nothing behind.
import { promises as fs } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { PACK_MANIFEST_FILE, packPathProblem } from '@shared/schemas/pack'
import { AppError } from '../lib/errors'
import { safeJoin } from '../lib/fs'
import type { VerifiedPack } from './reader'

const inside = (root: string, target: string, allowRoot = false): boolean => {
  const rel = relative(root, target)
  if (rel === '') return allowRoot
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

async function assertReal(
  realRoot: string,
  target: string,
  path: string,
  isDir = false,
): Promise<void> {
  const real = await fs.realpath(target)
  if (!inside(realRoot, real, isDir))
    throw new AppError('PATH_ESCAPE', `Pack file escapes the staging folder: ${path}`)
}

async function writeOne(
  stagingDir: string,
  realRoot: string,
  path: string,
  bytes: Buffer,
): Promise<void> {
  const problem = packPathProblem(path)
  if (problem) throw new AppError('PATH_ESCAPE', `Unsafe pack path "${path}": ${problem}`)
  const target = safeJoin(stagingDir, ...path.split('/'))
  await fs.mkdir(dirname(target), { recursive: true })
  await assertReal(realRoot, dirname(target), path, true)
  // 'wx': never follow or overwrite something already at the target.
  await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o644 })
  await assertReal(realRoot, target, path)
}

/**
 * Write `pack.json` (its original bytes) and every verified file into `stagingDir` (created;
 * must not exist or be empty). On any error the staging folder is removed and the error rethrown.
 */
export async function extractPack(pack: VerifiedPack, stagingDir: string): Promise<void> {
  const root = resolve(stagingDir)
  const existing = await fs.readdir(root).catch(() => [])
  // Checked before anything is created, so the cleanup below never removes a folder (and its
  // contents) that was there before.
  if (existing.length) throw new AppError('CONFLICT', `Staging folder is not empty: ${root}`)
  try {
    await fs.mkdir(root, { recursive: true })
    const realRoot = await fs.realpath(root)
    await writeOne(root, realRoot, PACK_MANIFEST_FILE, pack.manifestBytes)
    for (const [path, bytes] of pack.files) await writeOne(root, realRoot, path, bytes)
  } catch (err) {
    await fs.rm(root, { recursive: true, force: true })
    throw err
  }
}
