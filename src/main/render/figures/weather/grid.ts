// Gridded fields and the map figures drawn from them: satellite images, model guidance panels
// and mesoanalysis parameter maps. A field is a latitude/longitude grid quantized to 8 bits
// (code 0 is missing; code 1 to 255 map linearly onto [min, max]), deflated and base64-encoded,
// rows from north to south. The map colors the grid with a banded palette, draws optional
// contour lines, county or state lines, places and polygons, and prints a legend; the summary
// and table state the extremes, the area above a threshold and the values at the places.
import { deflateSync, inflateSync } from 'node:zlib'
import { z } from 'zod'
import { INK, MUTED } from '../theme'
import { frame, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import { bandIndex, bandLabel, hexToRgb, type Palette } from './palettes'
import { GRID_PALETTES, GRID_PALETTE_NAMES, type GridPaletteName } from './grid-palettes'
import { encodePng, pngDataUri } from './png'
import { utcLabel } from './radar'

const MAX_CELLS = 40_000

export const GridField = z
  .object({
    west: z.number().min(-180).max(180),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    north: z.number().min(-90).max(90),
    nx: z.number().int().min(2).max(400),
    ny: z.number().int().min(2).max(400),
    min: z.number(),
    max: z.number(),
    codes: z.string().max(400_000),
  })
  .superRefine((g, ctx) => {
    if (g.east <= g.west || g.north <= g.south)
      ctx.addIssue({ code: 'custom', message: 'east and north must exceed west and south' })
    if (g.nx * g.ny > MAX_CELLS)
      ctx.addIssue({ code: 'custom', message: `a grid has at most ${MAX_CELLS} cells` })
    if (g.max < g.min) ctx.addIssue({ code: 'custom', message: 'max must not be below min' })
    try {
      const raw = inflateSync(Buffer.from(g.codes, 'base64'))
      if (raw.length !== g.nx * g.ny)
        ctx.addIssue({
          code: 'custom',
          path: ['codes'],
          message: `expected ${g.nx * g.ny} codes, found ${raw.length}`,
        })
    } catch {
      ctx.addIssue({ code: 'custom', path: ['codes'], message: 'not deflated base64 data' })
    }
  })
export type GridField = z.infer<typeof GridField>

/** Quantize a grid of values (row-major from the north; null is missing). */
export function packGrid(
  bounds: Pick<GridField, 'west' | 'south' | 'east' | 'north' | 'nx' | 'ny'>,
  values: readonly (number | null)[],
): GridField {
  const have = values.filter((v): v is number => v !== null && Number.isFinite(v))
  const min = have.length ? Math.min(...have) : 0
  const max = have.length ? Math.max(...have) : 0
  const span = max - min || 1
  const codes = Uint8Array.from(values, (v) =>
    v === null || !Number.isFinite(v) ? 0 : 1 + Math.round(((v - min) / span) * 254),
  )
  return {
    ...bounds,
    min,
    max,
    codes: Buffer.from(deflateSync(codes, { level: 9 })).toString('base64'),
  }
}

export function gridValues(g: GridField): (number | null)[] {
  const codes = inflateSync(Buffer.from(g.codes, 'base64'))
  const span = g.max - g.min
  return Array.from(codes, (c) => (c === 0 ? null : g.min + ((c - 1) / 254) * span))
}

const LatLon = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])

export const MapOverlays = z
  .object({
    lines: z
      .array(
        z.object({ name: z.string().max(60).optional(), line: z.array(LatLon).min(2).max(600) }),
      )
      .max(300)
      .default([]),
    places: z
      .array(z.object({ name: z.string().min(1).max(40), lat: z.number(), lon: z.number() }))
      .max(30)
      .default([]),
    polygons: z
      .array(
        z.object({
          label: z.string().min(1).max(60),
          kind: z.enum(['warning', 'watch', 'other']).default('watch'),
          points: z.array(LatLon).min(3).max(40),
        }),
      )
      .max(20)
      .default([]),
  })
  .default({ lines: [], places: [], polygons: [] })
export type MapOverlays = z.infer<typeof MapOverlays>

const Origin = z.enum(['historical', 'simulated'])

const Contours = z
  .object({
    interval: z.number().positive(),
    /** Lowest and highest contour value; default is the field's range. */
    from: z.number().optional(),
    to: z.number().optional(),
  })
  .optional()

const common = {
  title: z.string().max(200).optional(),
  origin: Origin,
  /** Valid time, ISO 8601. */
  time: z.iso.datetime({ offset: true }),
  field: GridField,
  overlays: MapOverlays,
}

export const SatelliteData = z.object({
  ...common,
  satellite: z.object({ name: z.string().min(2).max(40), band: z.string().max(60).optional() }),
  channel: z.enum(['visible', 'infrared', 'water_vapor']),
})
export type SatelliteData = z.infer<typeof SatelliteData>

const Parameter = z.object({
  label: z.string().min(1).max(80),
  unit: z.string().max(20),
  /** Fill palette; leave out to draw contours only. */
  palette: z.enum(GRID_PALETTE_NAMES).optional(),
  /** A value the summary reports the area above (for example 1000 J/kg of CAPE). */
  threshold: z.number().optional(),
})

export const ModelPanelData = z.object({
  ...common,
  model: z.object({
    name: z.string().min(2).max(40),
    /** Model initialization time, ISO 8601. */
    run: z.iso.datetime({ offset: true }),
    forecastHour: z.number().int().min(0).max(384),
  }),
  parameter: Parameter,
  contours: Contours,
})
export type ModelPanelData = z.infer<typeof ModelPanelData>

export const MesoanalysisData = z.object({
  ...common,
  source: z.string().min(2).max(80),
  parameter: Parameter,
  contours: Contours,
})
export type MesoanalysisData = z.infer<typeof MesoanalysisData>

// ---- drawing --------------------------------------------------------------------------------

interface Panel {
  kindWord: string
  title: string
  origin: z.infer<typeof Origin>
  time: string
  field: GridField
  overlays: MapOverlays
  palette: Palette | undefined
  parameterLabel: string
  unit: string
  contours: z.infer<typeof Contours>
  threshold?: number
  /** Words after the product name in the footer and summary. */
  source: string
  raster: 'pixelated' | 'auto'
  /** Value to display from a stored value (e.g. Kelvin to C is done by the data writer). */
  idKey: string
}

const KM_PER_DEG = 111.2

function areaKm2(
  g: GridField,
  cellValue: (i: number) => boolean,
  mid: (row: number) => number,
): number {
  const dLat = (g.north - g.south) / g.ny
  const dLon = (g.east - g.west) / g.nx
  let a = 0
  for (let r = 0; r < g.ny; r++)
    for (let c = 0; c < g.nx; c++)
      if (cellValue(r * g.nx + c))
        a += dLat * KM_PER_DEG * dLon * KM_PER_DEG * Math.cos((mid(r) * Math.PI) / 180)
  return a
}

function marchingSquares(
  values: (number | null)[],
  nx: number,
  ny: number,
  level: number,
): [number, number, number, number][] {
  const segs: [number, number, number, number][] = []
  const v = (x: number, y: number): number | null => values[y * nx + x] ?? null
  const mix = (a: number, b: number): number => (level - a) / (b - a)
  for (let y = 0; y + 1 < ny; y++)
    for (let x = 0; x + 1 < nx; x++) {
      const a = v(x, y)
      const b = v(x + 1, y)
      const c = v(x + 1, y + 1)
      const d = v(x, y + 1)
      if (a === null || b === null || c === null || d === null) continue
      const idx =
        (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0)
      if (idx === 0 || idx === 15) continue
      const top: [number, number] = [x + mix(a, b), y]
      const right: [number, number] = [x + 1, y + mix(b, c)]
      const bottom: [number, number] = [x + mix(d, c), y + 1]
      const left: [number, number] = [x, y + mix(a, d)]
      const pairs: Record<number, [[number, number], [number, number]][]> = {
        1: [[left, bottom]],
        2: [[bottom, right]],
        3: [[left, right]],
        4: [[top, right]],
        5: [
          [top, left],
          [bottom, right],
        ],
        6: [[top, bottom]],
        7: [[top, left]],
        8: [[top, left]],
        9: [[top, bottom]],
        10: [
          [top, right],
          [left, bottom],
        ],
        11: [[top, right]],
        12: [[left, right]],
        13: [[bottom, right]],
        14: [[left, bottom]],
      }
      for (const [p, q] of pairs[idx]!) segs.push([p[0], p[1], q[0], q[1]])
    }
  return segs
}

function legendRows(p: Palette, x: number, y: number, h: number, title: string): string {
  const rows = p.bands.length
  const rowH = Math.min(18, (h - 28) / rows)
  let out = text(x, y + 10, title, { size: 12, weight: 700 })
  for (let k = 0; k < rows; k++) {
    const i = rows - 1 - k
    const yy = y + 22 + k * rowH
    out += `<rect x="${n(x)}" y="${n(yy)}" width="22" height="${n(rowH - 2)}" fill="${p.bands[i]!.color}" stroke="${INK}" stroke-width="0.5"/>`
    out += text(x + 28, yy + rowH / 2 + 1, bandLabel(p, i), {
      size: 11,
      fill: MUTED,
      baseline: 'middle',
    })
  }
  return out
}

function renderPanel(pn: Panel, o: { width: number; height: number }): FigureResult {
  const g = pn.field
  const values = gridValues(g)
  const midLat = (g.north + g.south) / 2
  const aspect = ((g.east - g.west) * Math.cos((midLat * Math.PI) / 180)) / (g.north - g.south)
  const legendW = pn.palette ? 215 : 20
  const top = pn.title ? 34 : 12
  const maxW = o.width - legendW - 36
  const maxH = o.height - top - 52
  const W = Math.floor(Math.min(maxW, maxH * aspect))
  const H = Math.floor(W / aspect)
  const x0 = 16
  const y0 = top
  const px = (lat: number, lon: number): [number, number] => [
    x0 + ((lon - g.west) / (g.east - g.west)) * W,
    y0 + ((g.north - lat) / (g.north - g.south)) * H,
  ]
  const clipId = `gm${pn.idKey.slice(0, 20).replace(/\W/g, '')}`
  let body = pn.title ? text(16, 22, pn.title, { size: 15, weight: 700 }) : ''
  body += `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#f4f1ea"/>`
  body += `<g clip-path="url(#${clipId})">`
  if (pn.palette) {
    const rgba = new Uint8Array(g.nx * g.ny * 4)
    const colors = pn.palette.bands.map((b) => hexToRgb(b.color))
    values.forEach((v, i) => {
      if (v === null) return
      const b = bandIndex(pn.palette!, v)
      if (b < 0) return
      rgba.set([...colors[b]!, 255], i * 4)
    })
    body += `<image x="${x0}" y="${y0}" width="${W}" height="${H}" preserveAspectRatio="none" style="image-rendering:${pn.raster}" href="${pngDataUri(encodePng(g.nx, g.ny, rgba))}"/>`
  }
  for (const l of pn.overlays.lines) {
    const pts = l.line.map(([la, lo]) => px(la, lo).map(n).join(' ')).join('L')
    body += `<path d="M${pts}" fill="none" stroke="${pn.palette ? '#2b2b2b' : '#8a8f96'}" stroke-width="0.8" opacity="0.8"/>`
  }
  if (pn.contours) {
    const lo = pn.contours.from ?? Math.ceil(g.min / pn.contours.interval) * pn.contours.interval
    const hi = pn.contours.to ?? g.max
    const sx = W / (g.nx - 1)
    const sy = H / (g.ny - 1)
    for (let level = lo, k = 0; level <= hi && k < 60; level += pn.contours.interval, k++) {
      const segs = marchingSquares(values, g.nx, g.ny, level)
      if (!segs.length) continue
      const d = segs
        .map(
          ([ax, ay, bx, by]) =>
            `M${n(x0 + ax * sx)} ${n(y0 + ay * sy)}L${n(x0 + bx * sx)} ${n(y0 + by * sy)}`,
        )
        .join('')
      body += `<path d="${d}" fill="none" stroke="#000" stroke-width="1.1" stroke-linecap="round"/>`
      const m = segs[Math.floor(segs.length / 2)]!
      body += text(
        x0 + ((m[0] + m[2]) / 2) * sx,
        y0 + ((m[1] + m[3]) / 2) * sy,
        String(Math.round(level * 100) / 100),
        {
          size: 10,
          weight: 700,
          anchor: 'middle',
          extra: 'stroke="#ffffff" stroke-width="3" paint-order="stroke"',
        },
      )
    }
  }
  for (const p of pn.overlays.polygons) {
    const pts = p.points.map(([la, lo]) => px(la, lo).map(n).join(' ')).join('L')
    const dash =
      p.kind === 'watch'
        ? ' stroke-dasharray="9 5"'
        : p.kind === 'other'
          ? ' stroke-dasharray="2 4"'
          : ''
    body += `<path d="M${pts}Z" fill="none" stroke="#fff" stroke-width="5"/><path d="M${pts}Z" fill="none" stroke="#000" stroke-width="2.2"${dash}/>`
    const [lx, ly] = px(p.points[0]![0], p.points[0]![1])
    body += text(lx + 4, ly - 4, p.label, {
      size: 11,
      weight: 700,
      extra: 'stroke="#ffffff" stroke-width="3" paint-order="stroke"',
    })
  }
  for (const pl of pn.overlays.places) {
    const [qx, qy] = px(pl.lat, pl.lon)
    body += `<rect x="${n(qx - 2.5)}" y="${n(qy - 2.5)}" width="5" height="5" fill="#000" stroke="#fff" stroke-width="1"/>${text(qx + 6, qy + 4, pl.name, { size: 10, weight: 600, extra: 'stroke="#ffffff" stroke-width="3" paint-order="stroke"' })}`
  }
  body += `</g><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="none" stroke="${INK}"/>`
  if (pn.palette)
    body += legendRows(
      pn.palette,
      x0 + W + 20,
      y0,
      H,
      `${pn.parameterLabel}${pn.unit ? ` (${pn.unit})` : ''}`,
    )
  const originWord = pn.origin === 'historical' ? 'Historical data' : 'Simulated data'
  body += text(x0, y0 + H + 18, `${pn.kindWord} · ${pn.parameterLabel} · ${utcLabel(pn.time)}`, {
    size: 12,
    weight: 600,
  })
  body += text(x0, y0 + H + 34, `${originWord} · ${pn.source} · exercise figure`, {
    size: 11,
    fill: MUTED,
  })

  // summary and table
  const unit = pn.unit ? ` ${pn.unit}` : ''
  const fmt = (v: number): string =>
    Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2)
  let hi = -Infinity
  let lo = Infinity
  let hiAt = 0
  let loAt = 0
  values.forEach((v, i) => {
    if (v === null) return
    if (v > hi) {
      hi = v
      hiAt = i
    }
    if (v < lo) {
      lo = v
      loAt = i
    }
  })
  const where = (i: number): string => {
    const r = Math.floor(i / g.nx)
    const c = i % g.nx
    const lat = g.north - ((r + 0.5) / g.ny) * (g.north - g.south)
    const lon = g.west + ((c + 0.5) / g.nx) * (g.east - g.west)
    return `${Math.abs(lat).toFixed(1)}${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}${lon >= 0 ? 'E' : 'W'}`
  }
  const rows: string[][] = []
  const sentences: string[] = []
  if (hi === -Infinity) sentences.push('The field has no data in view.')
  else {
    rows.push(
      ['Maximum', `${fmt(hi)}${unit} at ${where(hiAt)}`],
      ['Minimum', `${fmt(lo)}${unit} at ${where(loAt)}`],
    )
    sentences.push(
      `The maximum is ${fmt(hi)}${unit} near ${where(hiAt)} and the minimum is ${fmt(lo)}${unit} near ${where(loAt)}.`,
    )
  }
  if (pn.threshold !== undefined) {
    const t = pn.threshold
    const a = areaKm2(
      g,
      (i) => (values[i] ?? -Infinity) >= t,
      (r) => g.north - ((r + 0.5) / g.ny) * (g.north - g.south),
    )
    rows.push([`Area at or above ${fmt(t)}${unit}`, `${Math.round(a)} km2`])
    sentences.push(
      a > 0
        ? `Values of ${fmt(t)}${unit} or more cover about ${Math.round(a)} km2.`
        : `No values reach ${fmt(t)}${unit}.`,
    )
  }
  const sample = (lat: number, lon: number): number | null => {
    const c = Math.floor(((lon - g.west) / (g.east - g.west)) * g.nx)
    const r = Math.floor(((g.north - lat) / (g.north - g.south)) * g.ny)
    return c < 0 || r < 0 || c >= g.nx || r >= g.ny ? null : (values[r * g.nx + c] ?? null)
  }
  const placeValues = pn.overlays.places
    .map((p) => [p.name, sample(p.lat, p.lon)] as const)
    .filter(([, v]) => v !== null)
  for (const [name, v] of placeValues) rows.push([`Value at ${name}`, `${fmt(v!)}${unit}`])
  if (placeValues.length)
    sentences.push(
      `At the marked places: ${placeValues.map(([nm, v]) => `${nm} ${fmt(v!)}${unit}`).join(', ')}.`,
    )
  const summary = `${pn.kindWord} of ${pn.parameterLabel}, valid ${utcLabel(pn.time)}, ${originWord.toLowerCase()} (${pn.source}). ${sentences.join(' ')}${pn.palette ? ' The legend lists the value range of each color.' : ' Contour lines are labeled with their values.'}`
  const defs = `<clipPath id="${clipId}"><rect x="${x0}" y="${y0}" width="${W}" height="${H}"/></clipPath>`
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: `${pn.kindWord}: ${pn.parameterLabel}, ${utcLabel(pn.time)}`,
      summary,
      defs,
      body,
      idKey: pn.idKey,
    }),
    summary,
    table: {
      caption: `${pn.kindWord} values, ${pn.parameterLabel}, ${utcLabel(pn.time)}`,
      columns: ['Measure', 'Value'],
      rows,
    },
  }
}

const CHANNEL: Record<SatelliteData['channel'], { palette: GridPaletteName; word: string }> = {
  visible: { palette: 'visible', word: 'Visible' },
  infrared: { palette: 'infrared', word: 'Infrared' },
  water_vapor: { palette: 'water_vapor', word: 'Water vapor' },
}

export const satelliteKind: FigureKind<SatelliteData> = {
  kind: 'satellite',
  schema: SatelliteData,
  defaultHeight: 640,
  render: (d, o) => {
    const ch = CHANNEL[d.channel]
    return renderPanel(
      {
        kindWord: 'Satellite',
        title: d.title ?? '',
        origin: d.origin,
        time: d.time,
        field: d.field,
        overlays: d.overlays,
        palette: GRID_PALETTES[ch.palette],
        parameterLabel: `${ch.word}${d.satellite.band ? `, ${d.satellite.band}` : ''}`,
        unit: GRID_PALETTES[ch.palette].unit,
        contours: undefined,
        source: d.satellite.name,
        raster: 'pixelated',
        idKey: `sat${d.satellite.name}${d.time}${d.channel}`,
      },
      o,
    )
  },
}

const parameterPanel = (
  kindWord: string,
  d: ModelPanelData | MesoanalysisData,
  source: string,
  idKey: string,
): Panel => ({
  kindWord,
  title: d.title ?? '',
  origin: d.origin,
  time: d.time,
  field: d.field,
  overlays: d.overlays,
  palette: d.parameter.palette ? GRID_PALETTES[d.parameter.palette] : undefined,
  parameterLabel: d.parameter.label,
  unit: d.parameter.unit,
  contours: d.contours,
  ...(d.parameter.threshold !== undefined ? { threshold: d.parameter.threshold } : {}),
  source,
  raster: 'auto',
  idKey,
})

export const modelPanelKind: FigureKind<ModelPanelData> = {
  kind: 'model_panel',
  schema: ModelPanelData,
  defaultHeight: 640,
  render: (d, o) =>
    renderPanel(
      parameterPanel(
        'Model guidance',
        d,
        `${d.model.name} run ${utcLabel(d.model.run)}, forecast hour ${d.model.forecastHour}`,
        `mod${d.model.name}${d.model.run}${d.model.forecastHour}${d.parameter.label}`,
      ),
      o,
    ),
}

export const mesoanalysisKind: FigureKind<MesoanalysisData> = {
  kind: 'mesoanalysis',
  schema: MesoanalysisData,
  defaultHeight: 640,
  render: (d, o) =>
    renderPanel(
      parameterPanel('Mesoanalysis', d, d.source, `mes${d.source}${d.time}${d.parameter.label}`),
      o,
    ),
}
