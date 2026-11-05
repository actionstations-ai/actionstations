// radar: a single-site radar display of one moment on one tilt (reflectivity, radial velocity
// or correlation coefficient), drawn from a polar field (case data, historical or simulated;
// never an image model). The PPI is rasterized from the radar's own gates onto a black
// viewport with range rings, optional county lines, places, warning and watch polygons and
// storm motion arrows. A legend gives the numeric ranges and the text summary states the peak
// values, where they are and what the polygons contain, so color is never the only cue.
import { z } from 'zod'
import { INK, MUTED } from '../theme'
import { frame, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import {
  bandIndex,
  bandLabel,
  hexToRgb,
  CORRELATION,
  REFLECTIVITY,
  VELOCITY,
  type Palette,
} from './palettes'
import { encodePng, pngDataUri } from './png'
import {
  beamSpacing,
  gateRangeM,
  polarValue,
  radialAt,
  radialIndex,
  unpackCodes,
  PolarField,
} from './polar'

const KT_PER_MS = 1.943844
const RASTER = 520

const LatLon = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])

export const RadarData = z.object({
  title: z.string().max(200).optional(),
  /** Shown on the figure: radar images are always labeled historical or simulated. */
  origin: z.enum(['historical', 'simulated']),
  site: z.object({
    id: z.string().min(3).max(8),
    name: z.string().max(80).optional(),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
  product: z.enum(['reflectivity', 'velocity', 'correlation_coefficient']),
  /** Scan time, ISO 8601 with an offset or Z. */
  time: z.iso.datetime({ offset: true }),
  elevationDeg: z.number().min(0).max(30),
  extentKm: z.number().min(20).max(460).default(150),
  field: PolarField,
  overlays: z
    .object({
      counties: z
        .array(
          z.object({ name: z.string().max(60).optional(), line: z.array(LatLon).min(2).max(600) }),
        )
        .max(200)
        .default([]),
      places: z
        .array(z.object({ name: z.string().min(1).max(40), lat: z.number(), lon: z.number() }))
        .max(30)
        .default([]),
      polygons: z
        .array(
          z.object({
            label: z.string().min(1).max(60),
            kind: z.enum(['warning', 'watch', 'other']).default('warning'),
            points: z.array(LatLon).min(3).max(40),
          }),
        )
        .max(20)
        .default([]),
      motions: z
        .array(
          z.object({
            label: z.string().max(40).optional(),
            lat: z.number(),
            lon: z.number(),
            fromDeg: z.number().min(0).max(360),
            speedKt: z.number().min(0).max(120),
          }),
        )
        .max(10)
        .default([]),
    })
    .default({ counties: [], places: [], polygons: [], motions: [] }),
})
export type RadarData = z.infer<typeof RadarData>

const PRODUCTS: Record<
  RadarData['product'],
  { palette: Palette; toDisplay: (v: number) => number; word: string }
> = {
  reflectivity: { palette: REFLECTIVITY, toDisplay: (v) => v, word: 'Reflectivity' },
  velocity: { palette: VELOCITY, toDisplay: (v) => v * KT_PER_MS, word: 'Radial velocity' },
  correlation_coefficient: {
    palette: CORRELATION,
    toDisplay: (v) => v,
    word: 'Correlation coefficient',
  },
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (v: number): string => String(v).padStart(2, '0')

export function utcLabel(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

const KM_PER_DEG_LAT = 110.57
const kmPerDegLon = (lat: number): number => 111.32 * Math.cos((lat * Math.PI) / 180)

/** Position of a point in kilometers east and north of the radar. */
function offsetKm(site: RadarData['site'], lat: number, lon: number): [number, number] {
  return [(lon - site.lon) * kmPerDegLon(site.lat), (lat - site.lat) * KM_PER_DEG_LAT]
}

function placeOf(site: RadarData['site'], azDeg: number, rangeKm: number): string {
  const az = (azDeg * Math.PI) / 180
  const lat = site.lat + (rangeKm * Math.cos(az)) / KM_PER_DEG_LAT
  const lon = site.lon + (rangeKm * Math.sin(az)) / kmPerDegLon(site.lat)
  return `${Math.abs(lat).toFixed(2)}${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}${lon >= 0 ? 'E' : 'W'}`
}

const bearing = (az: number): string => String(Math.round(az) % 360).padStart(3, '0')

/** RGBA pixels of the PPI: each pixel takes the gate under it; nothing is drawn below the first band. */
function rasterize(d: RadarData, palette: Palette, toDisplay: (v: number) => number): Uint8Array {
  const f = d.field
  const codes = unpackCodes(f)
  const idx = radialIndex(f)
  const beam = Math.max(beamSpacing(f) * 0.75, 0.4)
  const rgba = new Uint8Array(RASTER * RASTER * 4)
  const colors = palette.bands.map((b) => hexToRgb(b.color))
  const half = RASTER / 2
  for (let py = 0; py < RASTER; py++)
    for (let px = 0; px < RASTER; px++) {
      const dx = ((px + 0.5 - half) / half) * d.extentKm
      const dy = ((half - py - 0.5) / half) * d.extentKm
      const rangeM = Math.hypot(dx, dy) * 1000
      if (rangeM > d.extentKm * 1000) continue
      const gate = Math.round((rangeM - f.firstGateM) / f.gateSpacingM)
      if (gate < 0 || gate >= f.gates) continue
      const az = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
      const r = radialAt(idx, az, beam)
      if (r < 0) continue
      const v = polarValue(f, codes[r * f.gates + gate]!)
      if (v === undefined) continue
      const b = bandIndex(palette, toDisplay(v))
      if (b < 0) continue
      const at = (py * RASTER + px) * 4
      const c = colors[b]!
      rgba[at] = c[0]
      rgba[at + 1] = c[1]
      rgba[at + 2] = c[2]
      rgba[at + 3] = 255
    }
  return rgba
}

interface Stats {
  rows: string[][]
  sentences: string[]
}

interface Gate {
  r: number
  g: number
  value: number
  az: number
  km: number
}

function* gates(d: RadarData, toDisplay: (v: number) => number): Generator<Gate> {
  const f = d.field
  const codes = unpackCodes(f)
  for (let r = 0; r < f.azimuthsDeg.length; r++)
    for (let g = 0; g < f.gates; g++) {
      const v = polarValue(f, codes[r * f.gates + g]!)
      if (v === undefined) continue
      const km = gateRangeM(f, g) / 1000
      if (km > d.extentKm) break
      yield { r, g, value: toDisplay(v), az: f.azimuthsDeg[r]!, km }
    }
}

/** Area of one gate in km2: range x angular width x gate length. */
const gateArea = (d: RadarData, km: number, beam: number): number =>
  km * ((beam * Math.PI) / 180) * (d.field.gateSpacingM / 1000)

function insidePolygon(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function polygonPeaks(d: RadarData, toDisplay: (v: number) => number) {
  const rings = d.overlays.polygons.map((p) =>
    p.points.map(([lat, lon]) => offsetKm(d.site, lat, lon)),
  )
  const best: (number | undefined)[] = rings.map(() => undefined)
  for (const g of gates(d, toDisplay)) {
    const x = g.km * Math.sin((g.az * Math.PI) / 180)
    const y = g.km * Math.cos((g.az * Math.PI) / 180)
    rings.forEach((ring, i) => {
      if (!insidePolygon(x, y, ring)) return
      const cur = best[i]
      if (cur === undefined || g.value > cur) best[i] = g.value
    })
  }
  return best
}

function reflectivityStats(d: RadarData, toDisplay: (v: number) => number): Stats {
  const beam = beamSpacing(d.field)
  let peak: Gate | undefined
  let area40 = 0
  let area50 = 0
  for (const g of gates(d, toDisplay)) {
    if (!peak || g.value > peak.value) peak = g
    const a = gateArea(d, g.km, beam)
    if (g.value >= 40) area40 += a
    if (g.value >= 50) area50 += a
  }
  const rows: string[][] = []
  const sentences: string[] = []
  if (!peak) {
    sentences.push('No echoes of 5 dBZ or more are in view.')
    rows.push(['Peak reflectivity', 'none'])
  } else {
    const where = `${bearing(peak.az)} degrees at ${Math.round(peak.km)} km (${placeOf(d.site, peak.az, peak.km)})`
    rows.push(['Peak reflectivity', `${Math.round(peak.value)} dBZ`], ['Location of peak', where])
    sentences.push(`Peak reflectivity is ${Math.round(peak.value)} dBZ at ${where}.`)
    rows.push(
      ['Area of 40 dBZ or more', `${Math.round(area40)} km2`],
      ['Area of 50 dBZ or more', `${Math.round(area50)} km2`],
    )
    sentences.push(
      area50 > 0
        ? `Echoes of 50 dBZ or more cover about ${Math.round(area50)} km2.`
        : area40 > 0
          ? `Echoes of 40 dBZ or more cover about ${Math.round(area40)} km2; none reach 50 dBZ.`
          : 'No echoes reach 40 dBZ.',
    )
  }
  return { rows, sentences }
}

/** The strongest adjacent inbound/outbound pair within 6 km, by speed difference. */
function velocityStats(d: RadarData, toDisplay: (v: number) => number): Stats {
  const f = d.field
  let inbound: Gate | undefined
  let outbound: Gate | undefined
  const cell = new Map<string, Gate>()
  for (const g of gates(d, toDisplay)) {
    if (!inbound || g.value < inbound.value) inbound = g
    if (!outbound || g.value > outbound.value) outbound = g
    cell.set(`${g.r}:${g.g}`, g)
  }
  const order = f.azimuthsDeg.map((_, i) => i).sort((a, b) => f.azimuthsDeg[a]! - f.azimuthsDeg[b]!)
  let couplet: { a: Gate; b: Gate; delta: number; width: number } | undefined
  for (let i = 0; i + 1 < order.length; i++) {
    const ra = order[i]!
    const rb = order[i + 1]!
    if (f.azimuthsDeg[rb]! - f.azimuthsDeg[ra]! > 2) continue
    for (let g = 0; g < f.gates; g++) {
      const a = cell.get(`${ra}:${g}`)
      const b = cell.get(`${rb}:${g}`)
      if (!a || !b || a.value * b.value >= 0) continue
      const width = a.km * (((f.azimuthsDeg[rb]! - f.azimuthsDeg[ra]!) * Math.PI) / 180)
      const delta = Math.abs(a.value - b.value)
      if (width <= 6 && (!couplet || delta > couplet.delta)) couplet = { a, b, delta, width }
    }
  }
  const rows: string[][] = []
  const sentences: string[] = []
  if (!inbound || !outbound) {
    rows.push(['Radial velocity', 'no data'])
    sentences.push('No velocity data are in view.')
    return { rows, sentences }
  }
  const at = (g: Gate) => `${bearing(g.az)} degrees at ${Math.round(g.km)} km`
  rows.push(
    ['Strongest inbound', `${Math.abs(Math.round(inbound.value))} kt, ${at(inbound)}`],
    ['Strongest outbound', `${Math.round(outbound.value)} kt, ${at(outbound)}`],
  )
  sentences.push(
    `Strongest inbound velocity is ${Math.abs(Math.round(inbound.value))} kt at ${at(inbound)}; strongest outbound is ${Math.round(outbound.value)} kt at ${at(outbound)}.`,
  )
  if (couplet && couplet.delta >= 40) {
    const c = couplet
    const inb = c.a.value < 0 ? c.a : c.b
    const out = c.a.value < 0 ? c.b : c.a
    const where = `${bearing(c.a.az)} degrees at ${Math.round(c.a.km)} km (${placeOf(d.site, c.a.az, c.a.km)})`
    rows.push([
      'Strongest adjacent inbound/outbound pair',
      `${Math.round(c.delta)} kt difference over ${c.width.toFixed(1)} km, ${where}`,
    ])
    sentences.push(
      `The strongest adjacent inbound and outbound pair is ${Math.abs(Math.round(inb.value))} kt inbound next to ${Math.round(out.value)} kt outbound, ${c.width.toFixed(1)} km apart, at ${where}.`,
    )
  } else {
    rows.push(['Strongest adjacent inbound/outbound pair', 'under 40 kt difference'])
    sentences.push('No adjacent inbound and outbound pair differs by 40 kt or more.')
  }
  return { rows, sentences }
}

function correlationStats(d: RadarData, toDisplay: (v: number) => number): Stats {
  const beam = beamSpacing(d.field)
  let low: Gate | undefined
  let lowArea = 0
  for (const g of gates(d, toDisplay)) {
    if (!low || g.value < low.value) low = g
    if (g.value < 0.8) lowArea += gateArea(d, g.km, beam)
  }
  if (!low)
    return {
      rows: [['Correlation coefficient', 'no data']],
      sentences: ['No correlation coefficient data are in view.'],
    }
  const where = `${bearing(low.az)} degrees at ${Math.round(low.km)} km (${placeOf(d.site, low.az, low.km)})`
  return {
    rows: [
      ['Lowest value', `${low.value.toFixed(2)}, ${where}`],
      ['Area below 0.80', `${Math.round(lowArea)} km2`],
    ],
    sentences: [
      `The lowest correlation coefficient is ${low.value.toFixed(2)} at ${where}; values below 0.80 cover about ${Math.round(lowArea)} km2. Low values mixed into precipitation can mean a mix of scatterer types, such as debris.`,
    ],
  }
}

function legendSvg(p: Palette, product: string, x: number, y: number, h: number): string {
  const title = `${product}${p.unit ? ` (${p.unit})` : ''}`
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

function render(d: RadarData, o: { width: number; height: number }): FigureResult {
  const prod = PRODUCTS[d.product]
  const stats =
    d.product === 'reflectivity'
      ? reflectivityStats(d, prod.toDisplay)
      : d.product === 'velocity'
        ? velocityStats(d, prod.toDisplay)
        : correlationStats(d, prod.toDisplay)

  const top = d.title ? 34 : 12
  const legendW = 150
  const footerH = 40
  const S = Math.floor(Math.min(o.width - legendW - 36, o.height - top - footerH - 8))
  const x0 = 16
  const y0 = top
  const c = S / 2
  const px = (km: number): number => (km / d.extentKm) * c
  const toPix = (lat: number, lon: number): [number, number] => {
    const [ex, ny] = offsetKm(d.site, lat, lon)
    return [x0 + c + px(ex), y0 + c - px(ny)]
  }

  const clipId = `rc${d.site.id}${Math.round(d.extentKm)}`
  const png = encodePng(RASTER, RASTER, rasterize(d, prod.palette, prod.toDisplay))
  let body = ''
  if (d.title) body += text(16, 22, d.title, { size: 15, weight: 700 })
  body += `<rect x="${x0}" y="${y0}" width="${S}" height="${S}" fill="#000"/>`
  body += `<g clip-path="url(#${clipId})">`
  body += `<image x="${x0}" y="${y0}" width="${S}" height="${S}" href="${pngDataUri(png)}" style="image-rendering:pixelated" preserveAspectRatio="none"/>`

  const ring = d.extentKm <= 100 ? 25 : d.extentKm <= 220 ? 50 : 100
  for (let km = ring; km <= d.extentKm; km += ring) {
    body += `<circle cx="${n(x0 + c)}" cy="${n(y0 + c)}" r="${n(px(km))}" fill="none" stroke="#7d8793" stroke-width="0.8" stroke-dasharray="3 3"/>`
    body += text(x0 + c + 3, y0 + c - px(km) + 11, `${km} km`, { size: 10, fill: '#c3cad2' })
  }
  body += `<path d="M${n(x0 + c)} ${n(y0)}V${n(y0 + S)}M${n(x0)} ${n(y0 + c)}H${n(x0 + S)}" stroke="#7d8793" stroke-width="0.6" fill="none"/>`
  for (const cty of d.overlays.counties) {
    const pts = cty.line.map(([la, lo]) => toPix(la, lo).map(n).join(' ')).join('L')
    body += `<path d="M${pts}" fill="none" stroke="#aab4c0" stroke-width="0.9" opacity="0.85"/>`
  }
  for (const pg of d.overlays.polygons) {
    const pts = pg.points.map(([la, lo]) => toPix(la, lo).map(n).join(' ')).join('L')
    const dash =
      pg.kind === 'watch'
        ? ' stroke-dasharray="9 5"'
        : pg.kind === 'other'
          ? ' stroke-dasharray="2 4"'
          : ''
    body += `<path d="M${pts}Z" fill="none" stroke="#000" stroke-width="5"/>`
    body += `<path d="M${pts}Z" fill="none" stroke="#ffffff" stroke-width="2.2"${dash}/>`
    const [lx, ly] = toPix(pg.points[0]![0], pg.points[0]![1])
    body += text(lx + 4, ly - 4, pg.label, {
      size: 11,
      weight: 700,
      fill: '#ffffff',
      extra: 'stroke="#000" stroke-width="3" paint-order="stroke"',
    })
  }
  for (const m of d.overlays.motions) {
    const [mx, my] = toPix(m.lat, m.lon)
    const to = ((m.fromDeg + 180) % 360) * (Math.PI / 180)
    const len = Math.max(14, Math.min(60, m.speedKt * 1.2))
    const ex = mx + len * Math.sin(to)
    const ey = my - len * Math.cos(to)
    body += `<path d="M${n(mx)} ${n(my)}L${n(ex)} ${n(ey)}" stroke="#000" stroke-width="4.5" fill="none"/>`
    body += `<path d="M${n(mx)} ${n(my)}L${n(ex)} ${n(ey)}" stroke="#ffffff" stroke-width="2" fill="none"/>`
    body += `<circle cx="${n(ex)}" cy="${n(ey)}" r="3.4" fill="#ffffff" stroke="#000" stroke-width="1"/>`
    const lab = m.label ?? `${bearing(m.fromDeg)} deg at ${Math.round(m.speedKt)} kt`
    body += text(ex + 5, ey + 4, lab, {
      size: 10,
      weight: 700,
      fill: '#ffffff',
      extra: 'stroke="#000" stroke-width="3" paint-order="stroke"',
    })
  }
  for (const pl of d.overlays.places) {
    const [qx, qy] = toPix(pl.lat, pl.lon)
    body += `<rect x="${n(qx - 2.5)}" y="${n(qy - 2.5)}" width="5" height="5" fill="#fff" stroke="#000" stroke-width="1"/>`
    body += text(qx + 6, qy + 4, pl.name, {
      size: 10,
      fill: '#ffffff',
      extra: 'stroke="#000" stroke-width="3" paint-order="stroke"',
    })
  }
  body += `<path d="M${n(x0 + c - 5)} ${n(y0 + c)}H${n(x0 + c + 5)}M${n(x0 + c)} ${n(y0 + c - 5)}V${n(y0 + c + 5)}" stroke="#fff" stroke-width="1.6"/>`
  body += `</g>`
  body += `<rect x="${x0}" y="${y0}" width="${S}" height="${S}" fill="none" stroke="${INK}" stroke-width="1"/>`
  body += text(x0 + c, y0 - 3 > 10 ? y0 - 3 : y0 + 10, 'N', {
    size: 11,
    weight: 700,
    anchor: 'middle',
    fill: y0 - 3 > 10 ? INK : '#fff',
  })
  body += legendSvg(prod.palette, prod.word, x0 + S + 20, y0, S)

  const originWord = d.origin === 'historical' ? 'Historical data' : 'Simulated data'
  const foot1 = `${d.site.id}${d.site.name ? ` ${d.site.name}` : ''} · ${d.elevationDeg.toFixed(1)}° tilt · ${utcLabel(d.time)}`
  body += text(x0, y0 + S + 18, foot1, { size: 12, weight: 600 })
  body += text(
    x0,
    y0 + S + 34,
    `${originWord} · exercise figure · ${prod.word} · range ${Math.round(d.extentKm)} km`,
    { size: 11, fill: MUTED },
  )

  const defs = `<clipPath id="${clipId}"><rect x="${x0}" y="${y0}" width="${S}" height="${S}"/></clipPath>`

  const rows = [...stats.rows]
  const polyText: string[] = []
  if (d.overlays.polygons.length && d.product !== 'correlation_coefficient') {
    const peaks = polygonPeaks(d, prod.toDisplay)
    d.overlays.polygons.forEach((p, i) => {
      const v = peaks[i]
      const val =
        v === undefined
          ? 'no echoes'
          : d.product === 'reflectivity'
            ? `peak ${Math.round(v)} dBZ inside`
            : `peak outbound ${Math.round(v)} kt inside`
      rows.push([p.label, val])
      polyText.push(`${p.label}: ${val}.`)
    })
  }
  const motionText = d.overlays.motions.map(
    (m) =>
      `Storm motion ${m.label ?? `from ${bearing(m.fromDeg)} degrees at ${Math.round(m.speedKt)} kt`}.`,
  )
  const summary =
    `${prod.word} from radar ${d.site.id}${d.site.name ? ` (${d.site.name})` : ''} at the ${d.elevationDeg.toFixed(1)} degree tilt, ${utcLabel(d.time)}, ${originWord.toLowerCase()}, within ${Math.round(d.extentKm)} km of the radar. ` +
    [...stats.sentences, ...polyText, ...motionText].join(' ') +
    ` Colors are listed in the legend as ${prod.palette.unit || 'unitless'} ranges.`

  const title = `${prod.word}, ${d.site.id}, ${utcLabel(d.time)}`
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title,
      summary,
      defs,
      body,
      idKey: `radar${d.site.id}${d.time}${d.product}`,
    }),
    summary,
    table: {
      caption: `${prod.word} measures, ${d.site.id}, ${utcLabel(d.time)}`,
      columns: ['Measure', 'Value'],
      rows,
    },
  }
}

export const radarKind: FigureKind<RadarData> = {
  kind: 'radar',
  schema: RadarData,
  render,
  defaultHeight: 720,
}
