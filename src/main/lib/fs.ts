import { promises as fs } from 'node:fs'
import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { z } from 'zod'
import { AppError } from './errors'

/**
 * Join a relative path onto a root and guarantee the result stays inside the root.
 * Every path taken from project JSON or IPC goes through this (docs/02 §Security).
 */
export function safeJoin(root: string, ...parts: string[]): string {
  const base = resolve(root)
  for (const p of parts) {
    if (isAbsolute(p) || /^[a-zA-Z]:/.test(p)) {
      throw new AppError('PATH_ESCAPE', `Absolute path not allowed: ${p}`)
    }
  }
  const target = resolve(base, ...parts.map((p) => normalize(p)))
  const rel = relative(base, target)
  // A child path must be strictly inside the root: "", ".", "a/.." resolve to the root itself
  // and are rejected so e.g. deleting scenarios/<id> can never delete the project.
  if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new AppError('PATH_ESCAPE', `Path escapes project folder: ${parts.join('/')}`)
  }
  return target
}

/**
 * safeJoin + symlink check: the real path of the target (and the root) must still be
 * inside the root. Use when serving or reading files that may come from a shared folder.
 */
export function safeJoinReal(root: string, ...parts: string[]): string {
  const target = safeJoin(root, ...parts)
  const realRoot = realpathSync(resolve(root))
  const realTarget = realpathSync(target)
  const rel = relative(realRoot, realTarget)
  if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new AppError('PATH_ESCAPE', `Symlink escapes project folder: ${parts.join('/')}`)
  }
  return realTarget
}

/** Project-relative POSIX path for storing in JSON. */
export function toRel(root: string, abs: string): string {
  return relative(resolve(root), resolve(abs)).split(sep).join('/')
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

/** Write via temp file + rename so a crash never leaves half-written JSON. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await ensureDir(dirname(path))
  const tmp = join(dirname(path), `.${randomBytes(6).toString('hex')}.tmp`)
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, path)
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, JSON.stringify(value, null, 2) + '\n')
}

export async function readJson<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  let raw: string
  try {
    raw = await fs.readFile(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      throw new AppError('NOT_FOUND', `Not found: ${path}`)
    throw e
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new AppError('VALIDATION', `Invalid JSON in ${path}: ${(e as Error).message}`)
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new AppError('VALIDATION', `Invalid data in ${path}`, result.error.issues)
  }
  return result.data
}

export async function readJsonOr<S extends z.ZodType>(
  path: string,
  schema: S,
  fallback: () => z.output<S>,
): Promise<z.output<S>> {
  if (!(await exists(path))) return fallback()
  return readJson(path, schema)
}

/** Filesystem-safe slug for folder names. */
export function slugify(name: string, max = 60): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
  return s || 'untitled'
}
