// The export page defaults to <project>/exports (#238). That folder may not exist yet, so the
// first export there creates it. Any other folder must already exist (assertOutDir).
import { mkdir } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

export const EXPORTS_DIR = 'exports'

/** Create <project>/exports when `outDir` is exactly that folder for one of `projectRoots`. */
export async function ensureDefaultOutDir(
  outDir: string,
  projectRoots: string[],
): Promise<boolean> {
  if (!isAbsolute(outDir)) return false
  const wanted = resolve(outDir)
  if (!projectRoots.some((r) => join(resolve(r), EXPORTS_DIR) === wanted)) return false
  await mkdir(wanted, { recursive: true })
  return true
}
