// Georeferenced rasters (#652): a grid of values on a box of longitude and latitude, drawn through
// a colour scale. The math here is pure: which cell holds a point, where a cell's edges lie, and
// how to redraw a lat/lon grid with rows spaced for a web map (which stretches latitude).
import type { ColorScale, RasterFrame, RasterLayer } from '../../schemas/map-overlays'

export type Rgba = [number, number, number, number]

const RAD = Math.PI / 180

/** Web mercator northing of a latitude, in radians (unit sphere). */
export const mercatorY = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))
/** The latitude at a web mercator northing. */
export const latFromMercatorY = (y: number): number =>
  (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD

/** Latitude of row edge `i` (0 is the north edge, `height` the south edge). */
export function rowEdgeLat(
  layer: Pick<RasterLayer, 'bbox' | 'height' | 'projection'>,
  i: number,
): number {
  const [, s, , n] = layer.bbox
  const f = i / layer.height
  if (layer.projection === 'epsg3857') {
    const yn = mercatorY(n)
    const ys = mercatorY(s)
    return latFromMercatorY(yn - f * (yn - ys))
  }
  return n - f * (n - s)
}

/** Longitude of column edge `i` (0 is the west edge). */
export function colEdgeLon(layer: Pick<RasterLayer, 'bbox' | 'width'>, i: number): number {
  const [w, , e] = layer.bbox
  return w + (i / layer.width) * (e - w)
}

/** The cell holding a point, or null outside the grid. A point on the east or south edge is inside. */
export function cellAt(
  layer: Pick<RasterLayer, 'bbox' | 'width' | 'height' | 'projection'>,
  lon: number,
  lat: number,
): { col: number; row: number } | null {
  const [w, s, e, n] = layer.bbox
  if (lon < w || lon > e || lat < s || lat > n) return null
  const fx = (lon - w) / (e - w)
  const fy =
    layer.projection === 'epsg3857'
      ? (mercatorY(n) - mercatorY(lat)) / (mercatorY(n) - mercatorY(s))
      : (n - lat) / (n - s)
  return {
    col: Math.min(layer.width - 1, Math.floor(fx * layer.width)),
    row: Math.min(layer.height - 1, Math.floor(fy * layer.height)),
  }
}

/** The value under a point, or null outside the grid or where there is no data. */
export function valueAt(
  layer: RasterLayer,
  frame: RasterFrame,
  lon: number,
  lat: number,
): number | null {
  const c = cellAt(layer, lon, lat)
  return c ? (frame.values[c.row * layer.width + c.col] ?? null) : null
}

/**
 * The grid redrawn with rows spaced evenly in web mercator, the way a web map stretches an image
 * between its corners. A grid already in web mercator rows comes back unchanged.
 */
export function displayGrid(
  layer: RasterLayer,
  values: readonly (number | null)[],
): (number | null)[] {
  if (layer.projection === 'epsg3857') return [...values]
  const [, s, , n] = layer.bbox
  const yn = mercatorY(n)
  const ys = mercatorY(s)
  const out: (number | null)[] = new Array(values.length)
  for (let row = 0; row < layer.height; row++) {
    const lat = latFromMercatorY(yn - ((row + 0.5) / layer.height) * (yn - ys))
    const src = Math.min(
      layer.height - 1,
      Math.max(0, Math.floor(((n - lat) / (n - s)) * layer.height)),
    )
    for (let col = 0; col < layer.width; col++)
      out[row * layer.width + col] = values[src * layer.width + col] ?? null
  }
  return out
}

const hex = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
]

/** The colour of a value on a scale; null, NaN and values below the first stop (stepped) are clear. */
export function scaleColor(scale: ColorScale, value: number | null): Rgba {
  if (value === null || Number.isNaN(value)) return [0, 0, 0, 0]
  const stops = scale.stops
  const first = stops[0]!
  const last = stops[stops.length - 1]!
  if (value < first.value)
    return scale.mode === 'stepped' ? [0, 0, 0, 0] : [...hex(first.color), 255]
  if (value >= last.value) return [...hex(last.color), 255]
  let i = 0
  while (i < stops.length - 2 && value >= stops[i + 1]!.value) i++
  const lo = stops[i]!
  const hi = stops[i + 1]!
  if (scale.mode === 'stepped') return [...hex(lo.color), 255]
  const t = (value - lo.value) / (hi.value - lo.value)
  const a = hex(lo.color)
  const b = hex(hi.color)
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255,
  ]
}

/** RGBA pixels (row-major) for a frame, with rows spaced for a web map, ready for a canvas. */
export function rasterRgba(layer: RasterLayer, frame: RasterFrame): Uint8ClampedArray {
  const grid = displayGrid(layer, frame.values)
  const out = new Uint8ClampedArray(grid.length * 4)
  grid.forEach((v, i) => out.set(scaleColor(layer.colorScale, v), i * 4))
  return out
}

/** Corner coordinates for a map image source: top-left, top-right, bottom-right, bottom-left. */
export function rasterCorners(
  bbox: RasterLayer['bbox'],
): [[number, number], [number, number], [number, number], [number, number]] {
  const [w, s, e, n] = bbox
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ]
}

/** Smallest and largest value of a frame, and how many cells have data. */
export function rasterStats(
  frame: RasterFrame,
): { min: number; max: number; count: number } | null {
  let min = Infinity
  let max = -Infinity
  let count = 0
  for (const v of frame.values) {
    if (v === null || Number.isNaN(v)) continue
    count++
    if (v < min) min = v
    if (v > max) max = v
  }
  return count ? { min, max, count } : null
}
