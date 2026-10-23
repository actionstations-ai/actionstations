// Project logo (#217): a PNG, JPEG or WebP copied into <project>/brand/ and stored as the
// project-relative brand.logoPath. Templates get it as brand.logo (a file: URL) and the
// export cover shows it. The type is read from the file's bytes, never trusted from its name.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { Brand, Project } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { ensureDir, safeJoin, safeJoinReal, toRel, writeFileAtomic } from '../lib/fs'
import { updateProject } from './store'

export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_DIR = 'brand'

export type LogoType = 'png' | 'jpg' | 'webp'

const MIME: Record<LogoType, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

/** The image type from the first bytes, or undefined when it is not a supported image. */
export function sniffLogoType(head: Uint8Array): LogoType | undefined {
  const b = (i: number) => head[i]
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'png'
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpg'
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to))
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  return undefined
}

export const logoMime = (type: LogoType): string => MIME[type]

async function readLogoSource(sourcePath: string): Promise<{ data: Buffer; type: LogoType }> {
  let stat
  try {
    stat = await fs.stat(sourcePath)
  } catch {
    throw new AppError('NOT_FOUND', 'The chosen logo file no longer exists')
  }
  if (!stat.isFile()) throw new AppError('VALIDATION', 'Choose an image file for the logo')
  if (stat.size === 0) throw new AppError('VALIDATION', 'The chosen logo file is empty')
  if (stat.size > LOGO_MAX_BYTES)
    throw new AppError('VALIDATION', 'The logo must be 2 MB or smaller')
  const data = await fs.readFile(sourcePath)
  const type = sniffLogoType(data.subarray(0, 12))
  if (!type) throw new AppError('VALIDATION', 'The logo must be a PNG, JPEG or WebP image')
  return { data, type }
}

/** Delete a previous logo, but only one this feature wrote (inside brand/). */
async function removeOldLogo(root: string, previous: string | undefined, kept: string) {
  if (!previous || previous === kept || !previous.startsWith(`${LOGO_DIR}/`)) return
  await fs.rm(safeJoin(root, previous), { force: true })
}

/** Copy an image into the project and make it the project logo. */
export async function importLogo(root: string, sourcePath: string): Promise<Project> {
  const { data, type } = await readLogoSource(sourcePath)
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 12)
  const abs = safeJoin(root, LOGO_DIR, `logo-${hash}.${type}`)
  await ensureDir(safeJoin(root, LOGO_DIR))
  await writeFileAtomic(abs, data)
  const rel = toRel(root, abs)
  let previous: string | undefined
  const project = await updateProject(root, (p) => {
    previous = p.brand.logoPath
    p.brand.logoPath = rel
  })
  await removeOldLogo(root, previous, rel)
  return project
}

/** Remove the project logo (and its copy in brand/). */
export async function clearLogo(root: string): Promise<Project> {
  let previous: string | undefined
  const project = await updateProject(root, (p) => {
    previous = p.brand.logoPath
    delete p.brand.logoPath
  })
  await removeOldLogo(root, previous, '')
  return project
}

/**
 * Absolute path of the project's logo for rendering, or undefined when none is set or the
 * file is missing, escapes the project (symlinks included) or is not a supported image.
 */
export async function brandLogoFile(
  root: string,
  brand: Pick<Brand, 'logoPath'> | undefined,
): Promise<string | undefined> {
  if (!brand?.logoPath) return undefined
  try {
    const abs = safeJoinReal(root, brand.logoPath)
    const handle = await fs.open(abs, 'r')
    try {
      const { size } = await handle.stat()
      if (size > LOGO_MAX_BYTES) return undefined
      const head = Buffer.alloc(12)
      await handle.read(head, 0, 12, 0)
      return sniffLogoType(head) ? abs : undefined
    } finally {
      await handle.close()
    }
  } catch {
    return undefined
  }
}
