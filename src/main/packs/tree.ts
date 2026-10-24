// Folder helpers for installed packs (#260): installed files are read-only, so removing a
// pack folder first makes its files writable again (Windows refuses to delete read-only files).
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

async function walk(dir: string, onFile: (path: string) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    const path = join(dir, e.name)
    if (e.isDirectory()) await walk(path, onFile)
    else if (e.isFile()) await onFile(path)
  }
}

/** Make every file under `dir` read-only (0444); folders stay writable so removal works. */
export async function makeReadOnly(dir: string): Promise<void> {
  await walk(dir, (p) => fs.chmod(p, 0o444))
}

/** Remove a file or folder tree, read-only files included. Missing is fine. */
export async function removeTree(path: string): Promise<void> {
  const st = await fs.lstat(path).catch(() => null)
  if (!st) return
  if (st.isDirectory()) await walk(path, (p) => fs.chmod(p, 0o644).catch(() => undefined))
  await fs.rm(path, { recursive: true, force: true })
}
