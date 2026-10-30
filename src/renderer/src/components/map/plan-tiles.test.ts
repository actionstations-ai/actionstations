import { describe, expect, it } from 'vitest'
import {
  chooseLevel,
  MAX_VISIBLE_TILES,
  tilePath,
  visibleTiles,
  type PyramidView,
} from './plan-tiles'

const big: PyramidView = { width: 8000, height: 6000, tileSize: 512, maxLevel: 4 }
const frame = { w: 1000, h: 750 }
const fit = { x: 0, y: 0, scale: 1 }

describe('chooseLevel', () => {
  it('uses a coarse level when the whole plan is in view', () => {
    expect(chooseLevel(big, 1000, 1, 1)).toBe(3)
  })

  it('uses full detail when zoomed far in, and never goes below level 0', () => {
    expect(chooseLevel(big, 1000, 8, 1)).toBe(0)
    expect(chooseLevel(big, 1000, 40, 1)).toBe(0)
  })

  it('asks for more detail on a sharper screen', () => {
    expect(chooseLevel(big, 1000, 2, 2)).toBeLessThan(chooseLevel(big, 1000, 2, 1))
  })
})

describe('visibleTiles', () => {
  it('always starts with the whole plan as one low-detail tile', () => {
    const [base] = visibleTiles(big, frame, fit)
    expect(base).toMatchObject({ level: 4, x: 0, y: 0, left: 0, top: 0, w: 100, h: 100 })
  })

  it('draws only the tiles that overlap the frame when zoomed in', () => {
    const detail = visibleTiles(big, frame, { x: 0, y: 0, scale: 8 }).slice(1)
    expect(detail.every((t) => t.level === 0)).toBe(true)
    expect(detail.length).toBeGreaterThan(0)
    expect(detail.length).toBeLessThan(40)
    expect(detail.every((t) => t.x <= 2 && t.y <= 2)).toBe(true)
  })

  it('follows a pan', () => {
    const view = { x: -7 * 1000, y: -7 * 750, scale: 8 }
    const detail = visibleTiles(big, frame, view).slice(1)
    expect(detail.every((t) => t.x >= 13 && t.y >= 9)).toBe(true)
    expect(detail.some((t) => t.x === 15 && t.y === 11)).toBe(true)
  })

  it('cuts the last column and row short', () => {
    const view = { x: -7 * 1000, y: -7 * 750, scale: 8 }
    const corner = visibleTiles(big, frame, view).find((t) => t.x === 15 && t.y === 11)!
    expect(corner.w).toBeCloseTo((320 / 8000) * 100)
    expect(corner.h).toBeCloseTo((368 / 6000) * 100)
  })

  it('caps the tiles drawn at once', () => {
    const wide = { w: 40_000, h: 30_000 }
    const tiles = visibleTiles(big, wide, { x: 0, y: 0, scale: 1 }, 2)
    expect(tiles.length).toBeLessThanOrEqual(MAX_VISIBLE_TILES + 2)
  })
})

describe('tilePath', () => {
  it('names a tile by level, column and row', () => {
    expect(tilePath('.cache/maps/pyramid/p/s', { level: 2, x: 3, y: 1 })).toBe(
      '.cache/maps/pyramid/p/s/2/3_1.png',
    )
  })
})
