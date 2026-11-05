// The starting image for a cloud video model, sent inside the request as a data URI. Services
// cap that size (Replicate documents 256 KB for data URLs), and a generated still is usually
// larger, so a big one is re-encoded as JPEG: quality steps down, then the picture is scaled
// down (never past 1280 px on the long side), until the data URI fits the service's budget.
import { promises as fs } from 'node:fs'
import { AppError } from '../../../lib/errors'
import { dataUri } from './files'

/** Budgets for the whole data URI (base64 text included), per service. */
export const IMAGE_BUDGET = { replicate: 250 * 1024, fal: 1024 * 1024 } as const

const MAX_LONG_SIDE = 1280
const SIDES = [1280, 1024, 768, 512]
const QUALITIES = [90, 80, 70, 60, 50]

/** Decode, scale and encode as JPEG. The app's version is Electron's nativeImage. */
export interface ImageCodec {
  size(bytes: Uint8Array): { width: number; height: number }
  toJpeg(bytes: Uint8Array, longSide: number, quality: number): Uint8Array
}

async function electronCodec(): Promise<ImageCodec> {
  const { nativeImage } = await import('electron')
  const open = (bytes: Uint8Array) => {
    const image = nativeImage.createFromBuffer(Buffer.from(bytes))
    if (image.isEmpty()) throw new AppError('VALIDATION', 'The starting image could not be read')
    return image
  }
  return {
    size: (bytes) => open(bytes).getSize(),
    toJpeg: (bytes, longSide, quality) => {
      const image = open(bytes)
      const { width, height } = image.getSize()
      const scale = Math.min(1, longSide / Math.max(width, height))
      const scaled =
        scale < 1
          ? image.resize({
              width: Math.max(1, Math.round(width * scale)),
              height: Math.max(1, Math.round(height * scale)),
              quality: 'good',
            })
          : image
      return scaled.toJPEG(quality)
    },
  }
}

const jpegUri = (bytes: Uint8Array): string =>
  `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`

/**
 * The image at `path` as a data URI no longer than `budget` characters. An image that already
 * fits is sent as it is; otherwise it is re-encoded. Fails in plain words when nothing fits.
 */
export async function fitStartingImage(
  path: string,
  budget: number,
  codec?: ImageCodec,
): Promise<string> {
  const original = await dataUri(path)
  if (original.length <= budget) return original
  const bytes = await fs.readFile(path)
  const c = codec ?? (await electronCodec())
  const { width, height } = c.size(bytes)
  const long = Math.min(Math.max(width, height), MAX_LONG_SIDE)
  const sides = [...new Set([long, ...SIDES.filter((s) => s < long)])]
  for (const side of sides)
    for (const quality of QUALITIES) {
      const uri = jpegUri(c.toJpeg(bytes, side, quality))
      if (uri.length <= budget) return uri
    }
  throw new AppError('VALIDATION', 'The starting image is too large for this service')
}
