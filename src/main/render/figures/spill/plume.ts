// plume_footprint (spec 0455 FR-5, #765): a plan view of a toxic plume as threat zones by
// concentration level, around the source, with the wind, a scale bar, a north arrow and named
// places. Zones differ by fill pattern, outline and a written label as well as color. The figure
// says what it is ("Simulated for the exercise" or the model it was imported from); it is an
// exercise model, never a forecast. The summary lists each zone's reach and which places lie in
// which zone.
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { GRID, INK, MUTED } from '../theme'
import { fmt, frame, hashId, heading, legend, n, patternDef, text } from '../svg'
import type { SeriesStyle } from '../theme'
import type { FigureKind, FigureResult, FigureTable } from '../types'

const Pt = z.object({ east: z.number().finite(), north: z.number().finite() })

export const PlumeFootprintData = z.object({
  title: z.string().max(200).optional(),
  source: z.string().min(1).max(160).default('Simulated for the exercise'),
  /** What is released ("Chlorine, ground-level release"). */
  release: z.string().max(160).optional(),
  windFromDeg: z.number().finite().min(0).max(360),
  windMs: z.number().finite().min(0).max(100).optional(),
  /** Zones from the highest concentration to the lowest; outlines in meters east and north of the source. */
  zones: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        ppm: z.number().finite().min(0),
        distanceM: z.number().finite().min(0),
        widthM: z.number().finite().min(0),
        outline: z.array(Pt).max(600),
      }),
    )
    .min(1)
    .max(4),
  places: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        east: z.number().finite(),
        north: z.number().finite(),
      }),
    )
    .max(8)
    .default([]),
})
export type PlumeFootprintData = z.infer<typeof PlumeFootprintData>

/** Highest level first: solid red, then hatched, dotted and barred, each with its own outline dash. */
const ZONE_STYLES: readonly (SeriesStyle & { outlineDash: string | undefined })[] = [
  { color: '#b3121b', dash: undefined, marker: 'circle', pattern: 'solid', outlineDash: undefined },
  { color: '#c25b00', dash: undefined, marker: 'square', pattern: 'hatch', outlineDash: '8 3' },
  { color: '#8a6d00', dash: undefined, marker: 'triangle', pattern: 'dots', outlineDash: '2 3' },
  {
    color: '#594c3c',
    dash: undefined,
    marker: 'diamond',
    pattern: 'bars',
    outlineDash: '10 3 2 3',
  },
]

function inside(
  p: { east: number; north: number },
  poly: { east: number; north: number }[],
): boolean {
  if (poly.length < 3) return false
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (
      a.north > p.north !== b.north > p.north &&
      p.east < ((b.east - a.east) * (p.north - a.north)) / (b.north - a.north) + a.east
    )
      c = !c
  }
  return c
}

/** The highest level a place lies in (index into zones), or -1 when it is outside every zone. */
function zoneOf(d: PlumeFootprintData, p: { east: number; north: number }): number {
  return d.zones.findIndex((z) => inside(p, z.outline))
}

const km = (m: number): string => (m >= 1000 ? `${fmt(m / 1000)} km` : `${fmt(Math.round(m))} m`)

const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
const compass = (deg: number): string => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!

function summarize(d: PlumeFootprintData): string {
  const parts = [
    `${d.title ?? 'Plume footprint'}: plan view of ${d.zones.length} threat zones around the source${d.release ? ` (${d.release})` : ''}.`,
    `${d.source}. This is an exercise model, not a forecast.`,
    `Wind from the ${compass(d.windFromDeg)} (${fmt(d.windFromDeg)} degrees)${d.windMs !== undefined ? ` at ${fmt(d.windMs)} meters per second` : ''}, so the plume travels toward the ${compass(d.windFromDeg + 180)}.`,
  ]
  for (const z of d.zones)
    parts.push(
      z.distanceM > 0
        ? `${z.label} zone, at least ${fmt(z.ppm)} ppm: reaches ${km(z.distanceM)} downwind and is up to ${km(z.widthM)} wide.`
        : `${z.label} zone, at least ${fmt(z.ppm)} ppm: not reached.`,
    )
  for (const p of d.places) {
    const i = zoneOf(d, p)
    parts.push(
      `${p.name} is ${i < 0 ? 'outside every zone' : `inside the ${d.zones[i]!.label} zone`}.`,
    )
  }
  return parts.join(' ')
}

function tableOf(d: PlumeFootprintData): FigureTable {
  const zoneRows = d.zones.map((z) => [
    `${z.label} zone`,
    `${fmt(z.ppm)} ppm or more`,
    z.distanceM > 0 ? km(z.distanceM) : 'not reached',
    z.distanceM > 0 ? km(z.widthM) : '',
  ])
  const placeRows = d.places.map((p) => {
    const i = zoneOf(d, p)
    return [p.name, 'place', i < 0 ? 'outside every zone' : `in the ${d.zones[i]!.label} zone`, '']
  })
  return {
    caption: d.title ?? 'Plume footprint',
    columns: ['Zone or place', 'Level', 'Downwind reach or location', 'Widest'],
    rows: [...zoneRows, ...placeRows],
  }
}

const PAD = { left: 36, right: 24, bottom: 44 }
/** A white outline so a label stays readable over a zone's pattern. */
const HALO = 'paint-order="stroke" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"'

function niceStep(m: number): number {
  const target = m / 5
  const pow = 10 ** Math.floor(Math.log10(target))
  const f = target / pow
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * pow
}

function render(d: PlumeFootprintData, o: { width: number; height: number }): FigureResult {
  const summary = summarize(d)
  const id = hashId(JSON.stringify(d))
  const defs = d.zones.map((_, i) => patternDef(`z${id}-${i}`, ZONE_STYLES[i]!)).join('')
  const topStart = d.title ? 42 : 14
  const lg = legend(
    d.zones.map((z, i) => ({
      name: `${z.label}: ${fmt(z.ppm)} ppm or more`,
      swatch: (x, y) =>
        `<rect x="${n(x)}" y="${n(y - 8)}" width="26" height="14" fill="url(#z${id}-${i})" stroke="${INK}" stroke-width="1.5"${ZONE_STYLES[i]!.outlineDash ? ` stroke-dasharray="${ZONE_STYLES[i]!.outlineDash}"` : ''}/>`,
    })),
    PAD.left,
    topStart,
    o.width - PAD.right,
  )
  const top = topStart + lg.height + 6
  const plotW = o.width - PAD.left - PAD.right
  const plotH = o.height - top - PAD.bottom

  const pts = [{ east: 0, north: 0 }, ...d.zones.flatMap((z) => z.outline), ...d.places]
  const lo = (f: (p: { east: number; north: number }) => number) => Math.min(...pts.map(f))
  const hi = (f: (p: { east: number; north: number }) => number) => Math.max(...pts.map(f))
  const spanE = Math.max(hi((p) => p.east) - lo((p) => p.east), 200)
  const spanN = Math.max(hi((p) => p.north) - lo((p) => p.north), 200)
  const scale = Math.min(plotW / (spanE * 1.2), plotH / (spanN * 1.2))
  const cx = (lo((p) => p.east) + hi((p) => p.east)) / 2
  const cy = (lo((p) => p.north) + hi((p) => p.north)) / 2
  const px = (e: number): number => PAD.left + plotW / 2 + (e - cx) * scale
  const py = (nn: number): number => top + plotH / 2 - (nn - cy) * scale

  let body = heading(d.title, PAD.left) + lg.svg
  body += `<rect x="${PAD.left}" y="${n(top)}" width="${n(plotW)}" height="${n(plotH)}" fill="#fbf8f0" stroke="${GRID}"/>`
  // Grid lines every nice step, in meters from the source.
  const step = niceStep(Math.max(spanE, spanN))
  const eScale = scaleLinear().domain([cx - plotW / 2 / scale, cx + plotW / 2 / scale])
  for (const e of eScale.ticks(Math.max(2, Math.round(plotW / scale / step)))) {
    if (Math.abs(e % step) > 1e-6) continue
    body += `<line x1="${n(px(e))}" x2="${n(px(e))}" y1="${n(top)}" y2="${n(top + plotH)}" stroke="${GRID}" stroke-width="0.8"/>`
  }
  const nScale = scaleLinear().domain([cy - plotH / 2 / scale, cy + plotH / 2 / scale])
  for (const nn of nScale.ticks(Math.max(2, Math.round(plotH / scale / step)))) {
    if (Math.abs(nn % step) > 1e-6) continue
    body += `<line x1="${PAD.left}" x2="${n(PAD.left + plotW)}" y1="${n(py(nn))}" y2="${n(py(nn))}" stroke="${GRID}" stroke-width="0.8"/>`
  }
  // Zones from the lowest level (largest) to the highest so the strongest sits on top.
  for (let i = d.zones.length - 1; i >= 0; i--) {
    const z = d.zones[i]!
    if (!z.outline.length) continue
    const path =
      z.outline.map((p, k) => `${k ? 'L' : 'M'}${n(px(p.east))} ${n(py(p.north))}`).join('') + 'Z'
    const dash = ZONE_STYLES[i]!.outlineDash
    body += `<path d="${path}" fill="url(#z${id}-${i})" fill-opacity="0.85" stroke="${INK}" stroke-width="1.5"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
  }
  // Source.
  body += `<circle cx="${n(px(0))}" cy="${n(py(0))}" r="6" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>`
  body += text(px(0), py(0) - 12, 'Source', {
    size: 12,
    weight: 700,
    anchor: 'middle',
    extra: HALO,
  })
  // Places.
  d.places.forEach((p) => {
    const x = px(p.east)
    const y = py(p.north)
    body += `<path d="M${n(x)} ${n(y - 7)}L${n(x + 7)} ${n(y)}L${n(x)} ${n(y + 7)}L${n(x - 7)} ${n(y)}Z" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`
    const left = p.east < 0
    body += text(left ? x - 11 : x + 11, y + 4, p.name, {
      size: 12,
      fill: INK,
      weight: 600,
      anchor: left ? 'end' : 'start',
      extra: HALO,
    })
  })
  // North arrow and the wind.
  const nx = PAD.left + plotW - 26
  body += `<path d="M${n(nx)} ${n(top + 40)}L${n(nx - 7)} ${n(top + 58)}L${n(nx)} ${n(top + 53)}L${n(nx + 7)} ${n(top + 58)}Z" fill="${INK}"/>`
  body += text(nx, top + 34, 'N', { size: 13, weight: 700, anchor: 'middle' })
  const toward = ((d.windFromDeg + 180) * Math.PI) / 180
  const wx = PAD.left + 42
  const wy = top + 42
  const ex = wx + 26 * Math.sin(toward)
  const ey = wy - 26 * Math.cos(toward)
  body += `<line x1="${n(wx)}" y1="${n(wy)}" x2="${n(ex)}" y2="${n(ey)}" stroke="${INK}" stroke-width="3"/>`
  const ah = 7
  for (const s of [-0.5, 0.5])
    body += `<line x1="${n(ex)}" y1="${n(ey)}" x2="${n(ex - ah * Math.sin(toward + s))}" y2="${n(ey + ah * Math.cos(toward + s))}" stroke="${INK}" stroke-width="3"/>`
  body += text(PAD.left + 8, top + 80, `Wind from ${compass(d.windFromDeg)}`, {
    size: 11,
    fill: MUTED,
    weight: 600,
  })
  // Scale bar.
  const bar = step * scale
  const by = top + plotH - 14
  body += `<line x1="${PAD.left + 12}" x2="${n(PAD.left + 12 + bar)}" y1="${n(by)}" y2="${n(by)}" stroke="${INK}" stroke-width="3"/>`
  body += text(PAD.left + 12 + bar / 2, by - 6, km(step), { size: 11, anchor: 'middle' })
  body += text(o.width - PAD.right, o.height - 10, d.source, {
    size: 11,
    anchor: 'end',
    fill: MUTED,
    weight: 600,
  })
  body += text(PAD.left, o.height - 10, 'Exercise model, not a forecast.', {
    size: 11,
    fill: MUTED,
  })

  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Plume footprint',
      summary,
      defs,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: tableOf(d),
  }
}

export const plumeFootprintKind: FigureKind<PlumeFootprintData> = {
  kind: 'plume_footprint',
  schema: PlumeFootprintData,
  render,
  defaultHeight: 460,
}
