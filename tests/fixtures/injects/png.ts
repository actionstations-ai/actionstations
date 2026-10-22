// Shrink PNGs copied into the fixture folder (2× renders and SDXL photos are 1–4 MB each):
// box-average downscale by an integer factor until the file fits the byte budget.
import { PNG } from 'pngjs'

export function downscalePng(bytes: Uint8Array, factor: number): Buffer {
  const src = PNG.sync.read(Buffer.from(bytes))
  const width = Math.max(1, Math.floor(src.width / factor))
  const height = Math.max(1, Math.floor(src.height / factor))
  const out = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sum = [0, 0, 0, 0]
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * src.width + (x * factor + dx)) * 4
          for (let c = 0; c < 4; c++) sum[c]! += src.data[i + c]!
        }
      }
      const o = (y * width + x) * 4
      for (let c = 0; c < 4; c++) out.data[o + c] = Math.round(sum[c]! / (factor * factor))
    }
  }
  return PNG.sync.write(out)
}

/** The PNG at the largest size that fits `maxBytes` (factors 1, 2, 3, 4). */
export function shrinkPngToFit(bytes: Uint8Array, maxBytes: number): Buffer {
  let best: Buffer = Buffer.from(bytes)
  for (let factor = 2; best.length > maxBytes && factor <= 4; factor++) {
    best = downscalePng(bytes, factor)
  }
  return best
}
