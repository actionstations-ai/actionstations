// Add a site plan (#436, FR-2): an image of the facility, copied into maps/<id>/ in the project.
// Images are .png .jpg .webp up to 50 megapixels. The size is read from the file's header, so
// a huge image is refused before anything decodes it.
import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { MAX_MAPS, ProjectMaps, type MapLayer } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { ensureDir, safeJoin } from '../lib/fs'
import { newId } from '../lib/ids'
import { mapFolder, readProjectMaps, saveProjectMaps } from './project'

export const MAX_PLAN_PIXELS = 50_000_000
export const MAX_PLAN_BYTES = 200 * 1024 * 1024
const EXTS = ['.png', '.jpg', '.jpeg', '.webp'] as const

export interface ImageSize {
  width: number
  height: number
}

function pngSize(b: Buffer): ImageSize | undefined {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return undefined
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

function jpegSize(b: Buffer): ImageSize | undefined {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return undefined
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1]!
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return undefined
}

function webpSize(b: Buffer): ImageSize | undefined {
  if (
    b.length < 30 ||
    b.toString('ascii', 0, 4) !== 'RIFF' ||
    b.toString('ascii', 8, 12) !== 'WEBP'
  )
    return undefined
  const kind = b.toString('ascii', 12, 16)
  if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
  if (kind === 'VP8 ')
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
  if (kind === 'VP8L') {
    const v = b.readUInt32LE(21)
    return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }
  }
  return undefined
}

/** Pixel size from the file header; undefined when the bytes are not a PNG, JPEG or WebP. */
export function imageSize(b: Buffer): ImageSize | undefined {
  return pngSize(b) ?? jpegSize(b) ?? webpSize(b)
}

export interface ImportPlanRequest {
  filePath: string
  title: string
  documentId?: string
}

export async function importSitePlan(
  root: string,
  req: ImportPlanRequest,
): Promise<{ layer: MapLayer; maps: ProjectMaps; revision: string }> {
  const ext = extname(req.filePath).toLowerCase()
  if (ext === '.pdf')
    throw new AppError(
      'VALIDATION',
      'PDF pages are not supported yet. Save the page as a PNG and add that.',
    )
  if (!(EXTS as readonly string[]).includes(ext))
    throw new AppError('VALIDATION', 'A site plan must be a .png, .jpg or .webp image')
  const stat = await fs.stat(req.filePath).catch(() => undefined)
  if (!stat?.isFile()) throw new AppError('NOT_FOUND', 'That file could not be read')
  if (stat.size > MAX_PLAN_BYTES)
    throw new AppError('VALIDATION', 'That image is larger than 200 MB')
  const bytes = await fs.readFile(req.filePath)
  const size = imageSize(bytes)
  if (!size || size.width < 1 || size.height < 1)
    throw new AppError('VALIDATION', `That file is not a valid ${ext.slice(1).toUpperCase()} image`)
  if (size.width * size.height > MAX_PLAN_PIXELS)
    throw new AppError(
      'VALIDATION',
      'That image is over 50 megapixels. Reduce its size and try again.',
    )

  const current = await readProjectMaps(root)
  if (current.maps.maps.length >= MAX_MAPS)
    throw new AppError('VALIDATION', 'A project can have up to 20 maps')
  const id = `plan-${newId().slice(-10).toLowerCase()}`
  const rel = `maps/${id}/plan${ext === '.jpeg' ? '.jpg' : ext}`
  await ensureDir(mapFolder(root, id))
  await fs.writeFile(safeJoin(root, rel), bytes)
  const layer: MapLayer = {
    kind: 'site_plan',
    id,
    title: req.title.trim().slice(0, 120) || 'Site plan',
    source: rel,
    image: rel,
    width: size.width,
    height: size.height,
    ...(req.documentId ? { documentId: req.documentId } : {}),
  }
  const next = ProjectMaps.parse({
    ...current.maps,
    maps: [...current.maps.maps, layer],
    defaultMapId: current.maps.defaultMapId ?? id,
  })
  const saved = await saveProjectMaps(root, next, current.revision)
  return { layer, ...saved }
}
