// The starting image is shrunk to fit each service's data-URI budget, and left alone when small.
import { randomBytes } from 'node:crypto'
import { mkdtempSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { tinyPng } from '../comfyui/fake-server'
import { fitStartingImage, IMAGE_BUDGET, type ImageCodec } from './image-fit'

/** Noise does not compress: a stand-in for a photographic still of 1216 x 832. */
function noisyPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height })
  randomBytes(png.data.length).copy(png.data)
  return PNG.sync.write(png)
}

/**
 * A stand-in for the app's image encoder: the JPEG gets smaller with the quality and with the
 * number of pixels (about 0.4 bytes per pixel at full quality).
 */
function fakeCodec(
  dims: { width: number; height: number },
  perPixel = 0.4,
): ImageCodec & {
  calls: { side: number; quality: number }[]
} {
  const calls: { side: number; quality: number }[] = []
  return {
    calls,
    size: () => dims,
    toJpeg: (_bytes, side, quality) => {
      calls.push({ side, quality })
      const scale = Math.min(1, side / Math.max(dims.width, dims.height))
      const pixels = dims.width * dims.height * scale * scale
      return Buffer.alloc(Math.round(pixels * perPixel * (quality / 100)), 7)
    },
  }
}

async function write(png: Buffer): Promise<string> {
  const path = join(mkdtempSync(join(tmpdir(), 'ttx-fit-')), 'still.png')
  await fs.writeFile(path, png)
  return path
}

describe('fitStartingImage', () => {
  it('passes a small image through unchanged, without touching the encoder', async () => {
    const png = tinyPng()
    const uri = await fitStartingImage(await write(png), IMAGE_BUDGET.replicate, {
      size: () => {
        throw new Error('encoder must not be used')
      },
      toJpeg: () => {
        throw new Error('encoder must not be used')
      },
    })
    expect(uri).toBe(`data:image/png;base64,${png.toString('base64')}`)
  })

  it.each([
    ['Replicate', IMAGE_BUDGET.replicate],
    ['fal.ai', IMAGE_BUDGET.fal],
  ])('shrinks a large still under the %s budget as a JPEG', async (_name, budget) => {
    const path = await write(noisyPng(1216, 832))
    expect((await fs.stat(path)).size).toBeGreaterThan(budget)
    const codec = fakeCodec({ width: 1216, height: 832 })
    const uri = await fitStartingImage(path, budget, codec)
    expect(uri.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(uri.length).toBeLessThanOrEqual(budget)
  })

  it('keeps the picture size and lowers the quality first, then scales down', async () => {
    const path = await write(noisyPng(1216, 832))
    const codec = fakeCodec({ width: 1216, height: 832 })
    await fitStartingImage(path, IMAGE_BUDGET.replicate, codec)
    expect(codec.calls[0]).toEqual({ side: 1216, quality: 90 })
    const last = codec.calls[codec.calls.length - 1]!
    expect(last.side).toBeLessThan(1216)
  })

  it('never encodes above 1280 px on the long side', async () => {
    const path = await write(noisyPng(1216, 832))
    const codec = fakeCodec({ width: 4000, height: 3000 }, 0.01)
    await fitStartingImage(path, IMAGE_BUDGET.replicate, codec)
    expect(Math.max(...codec.calls.map((c) => c.side))).toBe(1280)
  })

  it('fails in plain words when nothing fits, rather than sending it', async () => {
    const path = await write(noisyPng(1216, 832))
    const codec = fakeCodec({ width: 1216, height: 832 }, 50)
    await expect(fitStartingImage(path, IMAGE_BUDGET.replicate, codec)).rejects.toThrow(
      'The starting image is too large for this service',
    )
  })
})
