import { describe, expect, it } from 'vitest'
import { AttachError, fitWithin, prepareImage, type ImageCodec } from './attach'

/** A codec whose output size shrinks with quality and area, so the loop can be observed. */
function fakeCodec(natural = { width: 4000, height: 3000 }, bytesPerPixel = 1) {
  const calls: { width: number; height: number; quality: number }[] = []
  const codec: ImageCodec = {
    size: async () => natural,
    encode: async (_file, width, height, quality) => {
      calls.push({ width, height, quality })
      return new Blob([new Uint8Array(Math.round(width * height * quality * bytesPerPixel))])
    },
  }
  return { codec, calls }
}

describe('fitWithin', () => {
  it('scales the long side down to the limit and keeps the ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(1000, 3000, 1600)).toEqual({ width: 533, height: 1600 })
  })

  it('never enlarges', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })
})

describe('prepareImage', () => {
  const file = new Blob(['x'])

  it('caps the long side at 1600 px and returns JPEG bytes under the cap', async () => {
    const { codec, calls } = fakeCodec({ width: 4000, height: 3000 }, 0.5)
    const out = await prepareImage(file, { maxBytes: 2 * 1024 * 1024, alt: 'Photo', codec })
    expect(calls[0]).toMatchObject({ width: 1600, height: 1200 })
    expect(out).toMatchObject({ mime: 'image/jpeg', width: 1600, height: 1200, alt: 'Photo' })
    expect(out.bytes.length).toBeLessThanOrEqual(2 * 1024 * 1024)
  })

  it('lowers quality before it shrinks the picture', async () => {
    const { codec, calls } = fakeCodec({ width: 1600, height: 1200 }, 1)
    // 1600 x 1200 x 0.85 is 1.6 MB; 0.7 is 1.3 MB: fits a 1.4 MB cap at the second quality.
    const out = await prepareImage(file, { maxBytes: 1_400_000, alt: '', codec })
    expect(calls.map((c) => c.quality)).toEqual([0.85, 0.7])
    expect(out.width).toBe(1600)
  })

  it('shrinks the dimensions when no quality fits', async () => {
    const { codec } = fakeCodec({ width: 1600, height: 1200 }, 1)
    const out = await prepareImage(file, { maxBytes: 300_000, alt: '', codec })
    expect(out.width).toBeLessThan(1600)
    expect(out.bytes.length).toBeLessThanOrEqual(300_000)
  })

  it('says so when the picture cannot be made small enough', async () => {
    const { codec } = fakeCodec({ width: 1600, height: 1200 }, 1)
    await expect(prepareImage(file, { maxBytes: 10, alt: '', codec })).rejects.toThrow(/too large/)
  })

  it('says so when the file is not a readable picture', async () => {
    const codec: ImageCodec = {
      size: async () => Promise.reject(new Error('decode failed')),
      encode: async () => new Blob(),
    }
    await expect(prepareImage(file, { maxBytes: 1000, alt: '', codec })).rejects.toBeInstanceOf(
      AttachError,
    )
  })
})
