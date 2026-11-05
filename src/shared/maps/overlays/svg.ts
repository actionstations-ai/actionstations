// Drawing overlays as SVG (#652): the same layers the map view shows, drawn on a plain frame
// (no basemap) for snapshots, exports and figures. Everything is exact text and shapes, so a
// printed page reads the same as the screen. Rasters are drawn as runs of rectangles, one per
// stretch of cells with the same colour.
import type { OverlayLayer, RasterLayer } from '../../schemas/map-overlays'
import { colEdgeLon, rowEdgeLat, scaleColor } from './raster'
import { TOKEN_STYLE, type Hatch } from './style'

export interface FigureMarker {
  n: number
  lat: number
  lon: number
  label: string
  kind: 'incident' | 'staging' | 'command' | 'info'
}

export const FIGURE_ASPECT = 4 / 3
const PAD = 0.06
const MAX_RASTER_RECTS_SIDE = 200
const MAX_LABELS = 40

/** Grids go under areas, areas under lines, lines under points. */
export const DRAW_ORDER: Record<OverlayLayer['kind'], number> = {
  raster: 0,
  polygon: 1,
  cone: 2,
  line: 3,
  point: 4,
}

export const escapeXml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const f1 = (n: number): string => String(Math.round(n * 10) / 10)

type Pt = [number, number]

/** Every position drawn, for fitting the frame. */
export function layerPoints(layers: readonly OverlayLayer[]): Pt[] {
  const out: Pt[] = []
  for (const l of layers) {
    if (l.kind === 'raster') {
      const [w, s, e, n] = l.bbox
      out.push([w, s], [e, n])
    } else if (l.kind === 'point') for (const f of l.features) out.push(f.at)
    else if (l.kind === 'line') for (const f of l.features) out.push(...f.path)
    else
      for (const f of l.features) {
        for (const r of f.rings) out.push(...r)
        if ('centerline' in f && f.centerline) out.push(...f.centerline)
      }
  }
  return out
}

export interface Frame {
  width: number
  height: number
  x: (lon: number) => number
  y: (lat: number) => number
  bounds: [number, number, number, number]
}

/** A frame that fits the points, with longitude scaled by the cosine of the middle latitude. */
export function fitFrame(points: readonly Pt[], width: number): Frame {
  const height = width / FIGURE_ASPECT
  const lons = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  let minLon = Math.min(...lons)
  let maxLon = Math.max(...lons)
  let minLat = Math.min(...lats)
  let maxLat = Math.max(...lats)
  if (!points.length) [minLon, maxLon, minLat, maxLat] = [-1, 1, -1, 1]
  if (maxLon - minLon < 1e-6) [minLon, maxLon] = [minLon - 0.01, maxLon + 0.01]
  if (maxLat - minLat < 1e-6) [minLat, maxLat] = [minLat - 0.01, maxLat + 0.01]
  const cos = Math.max(0.05, Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180))
  const spanX = (maxLon - minLon) * cos
  const spanY = maxLat - minLat
  const innerW = width * (1 - 2 * PAD)
  const innerH = height * (1 - 2 * PAD)
  const scale = Math.min(innerW / spanX, innerH / spanY)
  const left = (width - spanX * scale) / 2
  const top = (height - spanY * scale) / 2
  return {
    width,
    height,
    x: (lon) => left + (lon - minLon) * cos * scale,
    y: (lat) => top + (maxLat - lat) * scale,
    bounds: [minLon, minLat, maxLon, maxLat],
  }
}

const pts = (frame: Frame, path: readonly Pt[]): string =>
  path.map(([lon, lat]) => `${f1(frame.x(lon))},${f1(frame.y(lat))}`).join(' ')

const ringPath = (frame: Frame, rings: readonly (readonly Pt[])[]): string =>
  rings.map((r) => `M${pts(frame, r).replaceAll(' ', 'L')}Z`).join('')

const dashAttr = (dash: number[], w: number): string =>
  dash.length ? ` stroke-dasharray="${dash.map((d) => f1(d * w)).join(' ')}"` : ''

function hatchDef(token: string, hatch: Hatch, color: string): string {
  const id = `hatch-${token}`
  const line = (d: string) => `<path d="${d}" stroke="${color}" stroke-width="1.2" fill="none"/>`
  const body: Record<Exclude<Hatch, 'none'>, string> = {
    diagonal: line('M0,8 L8,0'),
    cross: line('M0,8 L8,0 M0,0 L8,8'),
    horizontal: line('M0,4 L8,4'),
    dots: `<circle cx="4" cy="4" r="1.3" fill="${color}"/>`,
  }
  return hatch === 'none'
    ? ''
    : `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse">${body[hatch]}</pattern>`
}

function rasterRects(layer: RasterLayer, frame: Frame): string {
  const data = layer.frames[layer.frames.length - 1]
  if (!data) return ''
  const stride = Math.max(1, Math.ceil(Math.max(layer.width, layer.height) / MAX_RASTER_RECTS_SIDE))
  const out: string[] = []
  for (let row = 0; row < layer.height; row += stride) {
    const rowEnd = Math.min(layer.height, row + stride)
    const y0 = frame.y(rowEdgeLat(layer, row))
    const y1 = frame.y(rowEdgeLat(layer, rowEnd))
    let runStart = 0
    let runColor = ''
    const flush = (col: number): void => {
      if (runColor)
        out.push(
          `<rect x="${f1(frame.x(colEdgeLon(layer, runStart)))}" y="${f1(y0)}" ` +
            `width="${f1(frame.x(colEdgeLon(layer, col)) - frame.x(colEdgeLon(layer, runStart)) + 0.3)}" ` +
            `height="${f1(y1 - y0 + 0.3)}" fill="${runColor}"/>`,
        )
    }
    for (let col = 0; col <= layer.width; col += stride) {
      const cx = Math.min(layer.width - 1, col)
      const cy = Math.min(layer.height - 1, row + Math.floor((rowEnd - row) / 2))
      const c =
        col >= layer.width
          ? ''
          : colorText(scaleColor(layer.colorScale, data.values[cy * layer.width + cx] ?? null))
      if (c !== runColor) {
        flush(col)
        runStart = col
        runColor = c
      }
    }
  }
  return `<g opacity="${layer.opacity}">${out.join('')}</g>`
}

const colorText = (c: [number, number, number, number]): string =>
  c[3] === 0
    ? ''
    : `#${c
        .slice(0, 3)
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')}`

const center = (path: readonly Pt[]): Pt => {
  const lons = path.map((p) => p[0])
  const lats = path.map((p) => p[1])
  return [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]
}

function label(frame: Frame, at: Pt, text: string, dy = 0): string {
  if (!text) return ''
  return (
    `<text x="${f1(frame.x(at[0]))}" y="${f1(frame.y(at[1]) + dy)}" text-anchor="middle" ` +
    `font-size="11" fill="#1c232b" stroke="#ffffff" stroke-width="3" paint-order="stroke" ` +
    `stroke-linejoin="round">${escapeXml(text)}</text>`
  )
}

const MARKER_FILL: Record<FigureMarker['kind'], string> = {
  incident: '#a50f2d',
  staging: '#1f5fa8',
  command: '#1b6e3a',
  info: '#4a5560',
}

function drawLayer(layer: OverlayLayer, frame: Frame, labels: { n: number }): string {
  if (layer.kind === 'raster') return rasterRects(layer, frame)
  const parts: string[] = []
  const say = (at: Pt, text: string, dy = 0): void => {
    if (labels.n >= MAX_LABELS || !text) return
    labels.n++
    parts.push(label(frame, at, text, dy))
  }
  if (layer.kind === 'polygon' || layer.kind === 'cone')
    for (const f of layer.features) {
      const st = TOKEN_STYLE[f.style]
      const d = ringPath(frame, f.rings)
      const common = `fill-rule="evenodd" stroke="${st.color}" stroke-width="2"${dashAttr(st.dash, 2)}`
      parts.push(
        `<path d="${d}" fill="${st.fill}" fill-opacity="${layer.opacity * 0.6}" ${common}/>`,
      )
      if (st.hatch !== 'none')
        parts.push(
          `<path d="${d}" fill="url(#hatch-${f.style})" fill-rule="evenodd" stroke="none"/>`,
        )
      if ('centerline' in f && f.centerline)
        parts.push(
          `<polyline points="${pts(frame, f.centerline)}" fill="none" stroke="${st.color}" stroke-width="2" stroke-dasharray="6 4"/>`,
        )
      const top = center(f.rings[0]!)
      say([top[0], Math.max(...f.rings[0]!.map((p) => p[1]))], f.label, 14)
    }
  else if (layer.kind === 'line')
    for (const f of layer.features) {
      const st = TOKEN_STYLE[f.style]
      parts.push(
        `<polyline points="${pts(frame, f.path)}" fill="none" stroke="${st.color}" stroke-width="3"${dashAttr(st.dash, 3)} stroke-linejoin="round" stroke-linecap="round"/>`,
      )
      if (layer.track)
        for (const [lon, lat] of f.path)
          parts.push(
            `<circle cx="${f1(frame.x(lon))}" cy="${f1(frame.y(lat))}" r="3" fill="#ffffff" stroke="${st.color}" stroke-width="1.5"/>`,
          )
      say(f.path[f.path.length - 1]!, f.label, -8)
    }
  else
    for (const f of layer.features) {
      const st = TOKEN_STYLE[f.style]
      const [cx, cy] = [f1(frame.x(f.at[0])), f1(frame.y(f.at[1]))]
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="5" fill="${st.fill}" stroke="${st.color}" stroke-width="2"/>`,
      )
      say(
        f.at,
        f.value !== undefined && !f.label ? `${f.value}${f.unit ? ` ${f.unit}` : ''}` : f.label,
        -9,
      )
    }
  return `<g>${parts.join('')}</g>`
}

function drawMarker(m: FigureMarker, frame: Frame): string {
  const [cx, cy] = [f1(frame.x(m.lon)), f1(frame.y(m.lat))]
  return (
    `<g><circle cx="${cx}" cy="${cy}" r="11" fill="${MARKER_FILL[m.kind]}" stroke="#ffffff" stroke-width="2"/>` +
    `<text x="${cx}" y="${f1(frame.y(m.lat) + 4)}" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">${m.n}</text></g>`
  )
}

export interface SvgInput {
  layers: readonly OverlayLayer[]
  markers?: readonly FigureMarker[]
  /** Layers used to fit the frame; defaults to `layers`. Pass all layers so the frame stays fixed in time. */
  fitLayers?: readonly OverlayLayer[]
  width?: number
  /** Prefix for element ids, so several figures can share one page. */
  idPrefix?: string
  title: string
  description: string
}

/** The overlays and markers as one SVG with a title and description for screen readers. */
export function overlaySvg(input: SvgInput): { svg: string; width: number; height: number } {
  const width = input.width ?? 800
  const prefix = input.idPrefix ?? 'mapfig'
  const markers = input.markers ?? []
  const fit = [
    ...layerPoints(input.fitLayers ?? input.layers),
    ...markers.map((m): Pt => [m.lon, m.lat]),
  ]
  const frame = fitFrame(fit, width)
  const defs = new Set<string>()
  for (const l of input.layers)
    if (l.kind === 'polygon' || l.kind === 'cone')
      for (const f of l.features) {
        const st = TOKEN_STYLE[f.style]
        defs.add(hatchDef(f.style, st.hatch, st.color))
      }
  const labels = { n: 0 }
  const body = [...input.layers]
    .sort((a, b) => DRAW_ORDER[a.kind] - DRAW_ORDER[b.kind])
    .map((l) => drawLayer(l, frame, labels))
    .join('')
  const [w, s, e, n] = frame.bounds
  const corner = (text: string, x: number, y: number, anchor: string) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="10" fill="#4a5560">${escapeXml(text)}</text>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${f1(frame.height)}" width="${width}" ` +
    `height="${f1(frame.height)}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc" ` +
    `font-family="'Public Sans', Arial, sans-serif">` +
    `<title id="${prefix}-title">${escapeXml(input.title)}</title>` +
    `<desc id="${prefix}-desc">${escapeXml(input.description)}</desc>` +
    `<defs>${[...defs].join('')}</defs>` +
    `<rect width="${width}" height="${f1(frame.height)}" fill="#f4f6f8" stroke="#8a95a1" stroke-width="1"/>` +
    body +
    markers.map((m) => drawMarker(m, frame)).join('') +
    corner(
      `${Math.abs(n).toFixed(2)}° ${n >= 0 ? 'N' : 'S'}, ${Math.abs(w).toFixed(2)}° ${w >= 0 ? 'E' : 'W'}`,
      6,
      14,
      'start',
    ) +
    corner(
      `${Math.abs(s).toFixed(2)}° ${s >= 0 ? 'N' : 'S'}, ${Math.abs(e).toFixed(2)}° ${e >= 0 ? 'E' : 'W'}`,
      width - 6,
      frame.height - 6,
      'end',
    ) +
    `</svg>`
  return { svg, width, height: frame.height }
}
