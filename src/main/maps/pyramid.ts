// Tile pyramid for large site plans (#500, spec 0436 FR-2/NFR): a plan wider than a few thousand
// pixels is cut into 512 px PNG tiles at halving sizes, so panning and zooming only decode the tiles
// in view. Tiles live under `.cache/maps/pyramid/` (git-ignored, rebuilt on demand) and the app
// serves them like any project file. Level 0 is full size; the top level fits in one tile.
import { promises as fs } from 'node:fs'
import { PYRAMID_MIN_SIDE, TILE_SIZE } from '@shared/maps/pyramid'
import type { MapLayer } from '@shared/schemas'
import { ensureDir, safeJoin, safeJoinReal } from '../lib/fs'

export interface PyramidInfo {
  tileSize: number
  /** Highest level number; levels run 0 (full size) to this. */
  maxLevel: number
  width: number
  height: number
  /** Project-relative folder holding `<level>/<x>_<y>.png`. */
  base: string
}

/** Cuts a region out of the plan and scales it to the given size. */
export interface OpenImage {
  width: number
  height: number
  tile(
    region: { x: number; y: number; width: number; height: number },
    size: { width: number; height: number },
  ): Uint8Array
}

export interface Imaging {
  open(bytes: Uint8Array): OpenImage
}

type Plan = Extract<MapLayer, { kind: 'site_plan' }>

export { PYRAMID_MIN_SIDE, TILE_SIZE }

export const needsPyramid = (width: number, height: number): boolean =>
  Math.max(width, height) > PYRAMID_MIN_SIDE

export function maxLevelFor(width: number, height: number): number {
  return Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / TILE_SIZE)))
}

/** Tile columns and rows at a level. */
export function gridAt(
  width: number,
  height: number,
  level: number,
): { cols: number; rows: number } {
  const span = TILE_SIZE * 2 ** level
  return { cols: Math.ceil(width / span), rows: Math.ceil(height / span) }
}

/** The source region a tile covers and the pixel size it is drawn at. */
export function tileGeometry(width: number, height: number, level: number, x: number, y: number) {
  const span = TILE_SIZE * 2 ** level
  const region = {
    x: x * span,
    y: y * span,
    width: Math.min(span, width - x * span),
    height: Math.min(span, height - y * span),
  }
  const size = {
    width: Math.max(1, Math.round(region.width / 2 ** level)),
    height: Math.max(1, Math.round(region.height / 2 ** level)),
  }
  return { region, size }
}

const inFlight = new Map<string, Promise<PyramidInfo>>()

async function stampOf(root: string, layer: Plan): Promise<string> {
  const stat = await fs.stat(safeJoinReal(root, layer.image))
  return `${layer.width}x${layer.height}-${stat.size}-${Math.round(stat.mtimeMs)}`
}

async function build(root: string, layer: Plan, info: PyramidInfo, imaging: Imaging) {
  const bytes = await fs.readFile(safeJoinReal(root, layer.image))
  const opened = imaging.open(bytes)
  if (opened.width !== layer.width || opened.height !== layer.height)
    throw new Error('The plan image does not match its recorded size')
  for (let level = 0; level <= info.maxLevel; level++) {
    const { cols, rows } = gridAt(layer.width, layer.height, level)
    await ensureDir(safeJoin(root, `${info.base}/${level}`))
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const { region, size } = tileGeometry(layer.width, layer.height, level, x, y)
        const png = opened.tile(region, size)
        await fs.writeFile(safeJoin(root, `${info.base}/${level}/${x}_${y}.png`), png)
      }
    }
  }
  await fs.writeFile(safeJoin(root, `${info.base}/done.json`), JSON.stringify(info))
}

/**
 * The pyramid for a plan, built on first use. Undefined for plans small enough to show whole.
 * Concurrent calls for the same plan share one build.
 */
export async function ensurePyramid(
  root: string,
  layer: Plan,
  imaging: Imaging,
): Promise<PyramidInfo | undefined> {
  if (!needsPyramid(layer.width, layer.height)) return undefined
  const base = `.cache/maps/pyramid/${layer.id}/${await stampOf(root, layer)}`
  const info: PyramidInfo = {
    tileSize: TILE_SIZE,
    maxLevel: maxLevelFor(layer.width, layer.height),
    width: layer.width,
    height: layer.height,
    base,
  }
  const done = await fs.stat(safeJoin(root, `${base}/done.json`)).then(
    (s) => s.isFile(),
    () => false,
  )
  if (done) return info
  const key = `${root}:${base}`
  let running = inFlight.get(key)
  if (!running) {
    running = build(root, layer, info, imaging)
      .then(() => info)
      .finally(() => inFlight.delete(key))
    inFlight.set(key, running)
  }
  return running
}
