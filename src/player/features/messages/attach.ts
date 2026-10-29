/**
 * Photos for messages (spec 0413 FR-3, NFR-2): the picked file is decoded and drawn on a
 * canvas, then saved as JPEG, at most 1600 px on the long side and under the connection's
 * player blob cap. Drawing on a canvas drops EXIF (including GPS) by construction. The
 * browser parts sit behind `ImageCodec` so the sizing logic runs in tests.
 */

export const MAX_DIMENSION = 1600
export const MAX_PHOTOS = 3
const QUALITIES = [0.85, 0.7, 0.55, 0.4]
const MIN_DIMENSION = 320

export interface PreparedImage {
  bytes: Uint8Array
  mime: 'image/jpeg'
  width: number
  height: number
  alt: string
}

export interface ImageCodec {
  /** Natural size of the picked image; rejects when the file is not an image the browser reads. */
  size(file: Blob): Promise<{ width: number; height: number }>
  /** The image drawn at `width` x `height` and saved as JPEG at `quality`. */
  encode(file: Blob, width: number, height: number, quality: number): Promise<Blob>
}

export class AttachError extends Error {}

/** Scale to fit `max` on the long side; never enlarges. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Re-encode `file` to fit `maxBytes`: lower quality first, then smaller dimensions. */
export async function prepareImage(
  file: Blob,
  opts: { maxBytes: number; alt: string; codec: ImageCodec },
): Promise<PreparedImage> {
  const natural = await opts.codec.size(file).catch(() => {
    throw new AttachError('That file could not be read as a picture.')
  })
  let box = fitWithin(natural.width, natural.height, MAX_DIMENSION)
  for (;;) {
    for (const quality of QUALITIES) {
      const out = await opts.codec.encode(file, box.width, box.height, quality)
      if (out.size > 0 && out.size <= opts.maxBytes) {
        return {
          bytes: new Uint8Array(await out.arrayBuffer()),
          mime: 'image/jpeg',
          width: box.width,
          height: box.height,
          alt: opts.alt,
        }
      }
    }
    if (Math.max(box.width, box.height) <= MIN_DIMENSION) break
    box = fitWithin(box.width, box.height, Math.round(Math.max(box.width, box.height) * 0.75))
  }
  throw new AttachError('That picture is too large to send on this connection.')
}

/** The browser's codec: `createImageBitmap` to read, a canvas to draw and save. */
export const browserCodec: ImageCodec = {
  async size(file) {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  },
  async encode(file, width, height, quality) {
    const bitmap = await createImageBitmap(file)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new AttachError('This browser cannot prepare pictures.')
      // JPEG has no transparency: paint white first so a transparent PNG does not turn black.
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(bitmap, 0, 0, width, height)
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new AttachError('Could not save the picture.'))),
          'image/jpeg',
          quality,
        ),
      )
    } finally {
      bitmap.close()
    }
  },
}
