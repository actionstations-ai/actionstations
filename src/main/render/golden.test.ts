import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pngjs from 'pngjs'
import { compareWithGolden, GOLDEN_DEFAULTS, goldenName, goldenPath } from './golden'

const { PNG } = pngjs
const TEMPLATES = resolve('templates/injects')
const TIME_JUMP = goldenPath(TEMPLATES, 'time_jump_card', 'default')

const opts = (over: Partial<Parameters<typeof compareWithGolden>[3]> = {}) => ({
  ...GOLDEN_DEFAULTS,
  diffDir: mkdtempSync(join(tmpdir(), 'ttx-golden-')),
  update: false,
  ...over,
})

/** Paint a w×h block of opaque red into a copy of the golden. */
function perturb(png: Buffer, w: number, h: number): Buffer {
  const img = PNG.sync.read(png)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (img.width * y + x) << 2
      img.data[i] = 255
      img.data[i + 1] = 0
      img.data[i + 2] = 0
      img.data[i + 3] = 255
    }
  return PNG.sync.write(img)
}

describe('golden harness (time_jump_card)', () => {
  const golden = readFileSync(TIME_JUMP)

  it('the committed golden is a 2× US Letter page', () => {
    const img = PNG.sync.read(golden)
    expect([img.width, img.height]).toEqual([816 * 2, 1056 * 2])
  })

  it('matches itself exactly', () => {
    expect(compareWithGolden(golden, TIME_JUMP, 'tj', opts())).toMatchObject({
      status: 'match',
      diffPixels: 0,
    })
  })

  it('tolerates differences up to 0.1 % of pixels', () => {
    // 1632 × 2112 px → 0.1 % ≈ 3447 px; a 50×50 block (2500 px) passes.
    const r = compareWithGolden(perturb(golden, 50, 50), TIME_JUMP, 'tj', opts())
    expect(r.status).toBe('match')
  })

  it('fails beyond the tolerance and writes actual + diff images', () => {
    const o = opts()
    const r = compareWithGolden(perturb(golden, 100, 100), TIME_JUMP, 'tj', o)
    expect(r).toMatchObject({ status: 'mismatch', diffPixels: 10_000 })
    expect(existsSync(join(o.diffDir, 'tj.actual.png'))).toBe(true)
    expect(existsSync(join(o.diffDir, 'tj.diff.png'))).toBe(true)
  })

  it('fails on a size change', () => {
    const small = PNG.sync.write(new PNG({ width: 10, height: 10 }))
    const r = compareWithGolden(small, TIME_JUMP, 'tj', opts())
    expect(r).toMatchObject({ status: 'mismatch', message: expect.stringMatching(/size 10×10/) })
  })

  it('a missing golden fails with instructions; update mode writes it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-golden-new-'))
    const path = goldenPath(dir, 'memo', 'default')
    const missing = compareWithGolden(golden, path, goldenName('memo', 'default'), opts())
    expect(missing).toMatchObject({
      status: 'missing',
      message: expect.stringMatching(/UPDATE_GOLDENS=1 pnpm test:templates/),
    })
    expect(compareWithGolden(golden, path, 'memo', opts({ update: true })).status).toBe('updated')
    expect(compareWithGolden(golden, path, 'memo', opts()).status).toBe('match')
  })
})
