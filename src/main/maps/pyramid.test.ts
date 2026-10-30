import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { MapLayer } from '@shared/schemas'
import {
  ensurePyramid,
  gridAt,
  maxLevelFor,
  needsPyramid,
  tileGeometry,
  type Imaging,
} from './pyramid'

type Plan = Extract<MapLayer, { kind: 'site_plan' }>

const plan = (width: number, height: number): Plan => ({
  kind: 'site_plan',
  id: 'plan-1',
  title: 'Terminal',
  source: 'maps/plan-1/plan.png',
  image: 'maps/plan-1/plan.png',
  width,
  height,
})

async function project(width: number, height: number) {
  const root = await mkdtemp(join(tmpdir(), 'pyramid-'))
  await mkdir(join(root, 'maps/plan-1'), { recursive: true })
  await writeFile(join(root, 'maps/plan-1/plan.png'), 'not really a png')
  return { root, layer: plan(width, height) }
}

function fakeImaging(width: number, height: number) {
  const tile = vi.fn((region: object, size: object) =>
    Buffer.from(JSON.stringify({ region, size })),
  )
  const open = vi.fn(() => ({ width, height, tile }))
  return { imaging: { open } as Imaging, tile, open }
}

describe('pyramid geometry', () => {
  it('uses a pyramid only for plans over 2048 pixels', () => {
    expect(needsPyramid(2048, 1500)).toBe(false)
    expect(needsPyramid(2049, 10)).toBe(true)
  })

  it('stops at the level where the whole plan fits in one tile', () => {
    expect(maxLevelFor(8000, 6000)).toBe(4)
    expect(gridAt(8000, 6000, 4)).toEqual({ cols: 1, rows: 1 })
    expect(gridAt(8000, 6000, 0)).toEqual({ cols: 16, rows: 12 })
  })

  it('cuts edge tiles short and scales them by the level', () => {
    expect(tileGeometry(8000, 6000, 1, 7, 5)).toEqual({
      region: { x: 7168, y: 5120, width: 832, height: 880 },
      size: { width: 416, height: 440 },
    })
  })
})

describe('ensurePyramid', () => {
  it('returns nothing for a small plan and reads no image', async () => {
    const { root, layer } = await project(1000, 800)
    const { imaging, open } = fakeImaging(1000, 800)
    await expect(ensurePyramid(root, layer, imaging)).resolves.toBeUndefined()
    expect(open).not.toHaveBeenCalled()
  })

  it('writes every tile of every level under the cache folder', async () => {
    const { root, layer } = await project(2600, 1300)
    const { imaging, tile } = fakeImaging(2600, 1300)
    const info = await ensurePyramid(root, layer, imaging)
    expect(info).toMatchObject({ tileSize: 512, maxLevel: 3, width: 2600, height: 1300 })
    expect(info!.base).toMatch(/^\.cache\/maps\/pyramid\/plan-1\//)
    // 6x3 + 3x2 + 2x1 + 1x1 tiles.
    expect(tile).toHaveBeenCalledTimes(18 + 6 + 2 + 1)
    const last = await readFile(join(root, info!.base, '0/5_2.png'), 'utf8')
    expect(JSON.parse(last).region).toEqual({ x: 2560, y: 1024, width: 40, height: 276 })
  })

  it('builds once and reuses the tiles', async () => {
    const { root, layer } = await project(2600, 1300)
    const first = fakeImaging(2600, 1300)
    const [a, b] = await Promise.all([
      ensurePyramid(root, layer, first.imaging),
      ensurePyramid(root, layer, first.imaging),
    ])
    expect(a).toEqual(b)
    expect(first.open).toHaveBeenCalledTimes(1)
    const again = fakeImaging(2600, 1300)
    await ensurePyramid(root, layer, again.imaging)
    expect(again.open).not.toHaveBeenCalled()
  })

  it('refuses an image that is not the size the project recorded', async () => {
    const { root, layer } = await project(2600, 1300)
    const { imaging } = fakeImaging(100, 100)
    await expect(ensurePyramid(root, layer, imaging)).rejects.toThrow('does not match')
  })
})
