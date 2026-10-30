// Which tiles of a plan's pyramid to show for the current pan and zoom (#500). Pure, so it is
// tested without a browser. Tiles are placed in percent of the plan, so they scale with the plane.

export interface PyramidView {
  width: number
  height: number
  tileSize: number
  maxLevel: number
}

export interface ViewState {
  x: number
  y: number
  scale: number
}

export interface TilePlacement {
  level: number
  x: number
  y: number
  /** Position and size in percent of the whole plan. */
  left: number
  top: number
  w: number
  h: number
}

/** Most tiles drawn at once, so a very wide window cannot ask for hundreds. */
export const MAX_VISIBLE_TILES = 48

/** The level whose pixels are closest to the screen's, without being blurrier than needed. */
export function chooseLevel(p: PyramidView, frameW: number, scale: number, dpr: number): number {
  const sourcePerScreen = p.width / Math.max(1, frameW * scale * dpr)
  return Math.min(p.maxLevel, Math.max(0, Math.floor(Math.log2(Math.max(1, sourcePerScreen)))))
}

export function placement(p: PyramidView, level: number, x: number, y: number): TilePlacement {
  const span = p.tileSize * 2 ** level
  const w = Math.min(span, p.width - x * span)
  const h = Math.min(span, p.height - y * span)
  return {
    level,
    x,
    y,
    left: ((x * span) / p.width) * 100,
    top: ((y * span) / p.height) * 100,
    w: (w / p.width) * 100,
    h: (h / p.height) * 100,
  }
}

/**
 * The single top-level tile (always drawn, so panning never shows blank space) followed by the
 * tiles of the chosen level that overlap the frame.
 */
export function visibleTiles(
  p: PyramidView,
  frame: { w: number; h: number },
  view: ViewState,
  dpr = 1,
): TilePlacement[] {
  const base = placement(p, p.maxLevel, 0, 0)
  const level = chooseLevel(p, frame.w, view.scale, dpr)
  if (level >= p.maxLevel) return [base]
  // The frame as fractions of the plan.
  const fx0 = -view.x / (frame.w * view.scale)
  const fy0 = -view.y / (frame.h * view.scale)
  const fx1 = fx0 + 1 / view.scale
  const fy1 = fy0 + 1 / view.scale
  const span = p.tileSize * 2 ** level
  const cols = Math.ceil(p.width / span)
  const rows = Math.ceil(p.height / span)
  const x0 = Math.max(0, Math.floor((fx0 * p.width) / span))
  const x1 = Math.min(cols - 1, Math.floor((fx1 * p.width) / span))
  const y0 = Math.max(0, Math.floor((fy0 * p.height) / span))
  const y1 = Math.min(rows - 1, Math.floor((fy1 * p.height) / span))
  const tiles: TilePlacement[] = [base]
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (tiles.length > MAX_VISIBLE_TILES) return tiles
      tiles.push(placement(p, level, x, y))
    }
  return tiles
}

export const tilePath = (base: string, t: Pick<TilePlacement, 'level' | 'x' | 'y'>): string =>
  `${base}/${t.level}/${t.x}_${t.y}.png`
