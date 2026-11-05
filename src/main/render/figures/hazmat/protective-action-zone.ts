// protective_action_zone: the initial isolation circle and the downwind protective action square
// drawn over the release point, with the wind, a scale bar and the places near the release
// (spec 0456 FR-6). No street map: it is a plain plan, like the Locations pages. The distances
// are always labeled with their source: entered from the author's own guidebook (with the
// edition), or invented exercise values for a fictional material. Nothing is looked up.
import { z } from 'zod'
import { INK, MUTED } from '../theme'
import { fmt, frame, hashId, heading, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import {
  circleRing,
  downwindBearing,
  insideIsolation,
  insideProtective,
  offsetAt,
  protectiveSquare,
  type Point,
} from './geometry'

const Dist = z.number().positive().max(1_000_000)

export const ProtectiveActionZoneData = z
  .object({
    title: z.string().max(200).optional(),
    material: z.string().min(1).max(120),
    incident: z.object({ label: z.string().min(1).max(120) }),
    wind: z.object({
      fromDeg: z.number().min(0).max(360),
      speed: z.number().min(0).max(300),
      unit: z.enum(['mph', 'kt', 'm/s', 'km/h']),
      source: z.string().min(1).max(120),
      asOf: z.string().max(40).optional(),
    }),
    isolationDistance: Dist,
    protectiveDistance: Dist,
    unit: z.enum(['ft', 'm', 'mi', 'km']),
    distanceSource: z.enum(['entered', 'fictional']),
    /** The guidebook edition the author took the numbers from; required when `entered`. */
    edition: z.string().max(80).optional(),
    places: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          bearingDeg: z.number().min(0).max(360),
          distance: z.number().min(0).max(1_000_000),
        }),
      )
      .max(12)
      .default([]),
  })
  .refine((d) => d.distanceSource !== 'entered' || !!d.edition?.trim(), {
    message: 'distances entered from a guidebook need the edition they came from',
    path: ['edition'],
  })
export type ProtectiveActionZoneData = z.infer<typeof ProtectiveActionZoneData>

const COMPASS = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
]
const compass = (deg: number): string => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!

const sourceText = (d: ProtectiveActionZoneData): string =>
  d.distanceSource === 'fictional'
    ? 'Distances: invented exercise values for a fictional material.'
    : `Distances: entered by the facilitator from their own guidebook, ${d.edition}.`

const zoneOf = (d: ProtectiveActionZoneData) => ({
  windFromDeg: d.wind.fromDeg,
  isolationDistance: d.isolationDistance,
  protectiveDistance: d.protectiveDistance,
})

function placeStatus(
  d: ProtectiveActionZoneData,
  p: ProtectiveActionZoneData['places'][number],
): string {
  const pt = offsetAt(p.bearingDeg, p.distance)
  const z = zoneOf(d)
  if (insideIsolation(pt, z)) return 'inside the initial isolation zone'
  if (insideProtective(pt, z)) return 'inside the protective action zone'
  return 'outside both zones'
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Maps plan units to pixels so every zone and place fits the box. */
function projector(d: ProtectiveActionZoneData, box: Box): (p: Point) => [number, number] {
  const z = zoneOf(d)
  const pts: Point[] = [
    { x: 0, y: 0 },
    ...circleRing(d.isolationDistance, 32),
    ...protectiveSquare(z),
    ...d.places.map((p) => offsetAt(p.bearingDeg, p.distance)),
  ]
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = 1.12
  const scale = Math.min(box.w / ((maxX - minX) * pad || 1), box.h / ((maxY - minY) * pad || 1))
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return (p) => [box.x + box.w / 2 + (p.x - cx) * scale, box.y + box.h / 2 - (p.y - cy) * scale]
}

const HALO = 'stroke="#faf7f0" stroke-width="4" paint-order="stroke" stroke-linejoin="round"'
const poly = (pts: [number, number][]): string => pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')

function scaleBar(d: ProtectiveActionZoneData, box: Box, pxPerUnit: number): string {
  const target = (box.w * 0.2) / pxPerUnit
  const mag = 10 ** Math.floor(Math.log10(target))
  const len = [5, 2, 1].map((m) => m * mag).find((v) => v <= target) ?? mag
  const px = len * pxPerUnit
  const x = box.x + 14
  const y = box.y + box.h - 16
  return (
    `<path d="M${n(x)} ${n(y - 5)}V${n(y)}H${n(x + px)}V${n(y - 5)}" fill="none" stroke="${INK}" stroke-width="2"/>` +
    text(x, y - 10, `${fmt(len)} ${d.unit}`, { size: 11, fill: INK })
  )
}

function windArrow(d: ProtectiveActionZoneData, box: Box): string {
  const cx = box.x + box.w - 70
  const cy = box.y + 62
  const to = offsetAt(downwindBearing(d.wind.fromDeg), 34)
  const x2 = cx + to.x
  const y2 = cy - to.y
  const x1 = cx - to.x
  const y1 = cy + to.y
  const a = Math.atan2(y2 - y1, x2 - x1)
  const head = [
    [x2, y2],
    [x2 - 11 * Math.cos(a - 0.45), y2 - 11 * Math.sin(a - 0.45)],
    [x2 - 11 * Math.cos(a + 0.45), y2 - 11 * Math.sin(a + 0.45)],
  ] as [number, number][]
  return (
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${INK}" stroke-width="3"/>` +
    `<polygon points="${poly(head)}" fill="${INK}"/>` +
    text(box.x + box.w - 12, box.y + 118, `Wind from ${compass(d.wind.fromDeg)}`, {
      size: 12,
      weight: 700,
      anchor: 'end',
    }) +
    text(
      box.x + box.w - 12,
      box.y + 133,
      `${Math.round(d.wind.fromDeg)} degrees, ${fmt(d.wind.speed)} ${d.wind.unit}`,
      {
        size: 11,
        anchor: 'end',
        fill: MUTED,
      },
    )
  )
}

const northArrow = (box: Box): string =>
  `<path d="M${n(box.x + 26)} ${n(box.y + 52)}V${n(box.y + 18)}M${n(box.x + 26)} ${n(box.y + 16)}l-6 12h12z" stroke="${INK}" stroke-width="2.5" fill="${INK}"/>` +
  text(box.x + 26, box.y + 68, 'N', { size: 13, weight: 700, anchor: 'middle' })

function zonesSvg(d: ProtectiveActionZoneData, box: Box, key: string): string {
  const proj = projector(d, box)
  const z = zoneOf(d)
  const square = protectiveSquare(z).map(proj)
  const [ox, oy] = proj({ x: 0, y: 0 })
  const [rx] = proj({ x: d.isolationDistance, y: 0 })
  const r = Math.abs(rx - ox)
  const pxPerUnit = r / d.isolationDistance
  let body = `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="#faf7f0" stroke="#d8c79e"/>`
  body += `<polygon points="${poly(square)}" fill="url(#paz-sq-${key})" stroke="#8a4b00" stroke-width="2.5"/>`
  body += `<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(r)}" fill="url(#paz-ci-${key})" stroke="#b3121b" stroke-width="2.5" stroke-dasharray="8 5"/>`
  body += `<path d="M${n(ox - 8)} ${n(oy - 8)}L${n(ox + 8)} ${n(oy + 8)}M${n(ox + 8)} ${n(oy - 8)}L${n(ox - 8)} ${n(oy + 8)}" stroke="${INK}" stroke-width="3.5"/>`
  body += text(ox + 12, oy - 12, d.incident.label, { size: 12, weight: 700, extra: HALO })
  for (const p of d.places) {
    const [px, py] = proj(offsetAt(p.bearingDeg, p.distance))
    body += `<path d="M${n(px)} ${n(py - 7)}L${n(px + 7)} ${n(py)}L${n(px)} ${n(py + 7)}L${n(px - 7)} ${n(py)}Z" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`
    body += text(px + 11, py + 4, p.name, { size: 12, weight: 600, extra: HALO })
  }
  return body + northArrow(box) + windArrow(d, box) + scaleBar(d, box, pxPerUnit)
}

function legendSvg(d: ProtectiveActionZoneData, y: number, key: string): string {
  const u = d.unit
  return (
    `<rect x="16" y="${y}" width="26" height="14" fill="url(#paz-ci-${key})" stroke="#b3121b" stroke-width="2" stroke-dasharray="6 3"/>` +
    text(50, y + 12, `Initial isolation zone: circle, radius ${fmt(d.isolationDistance)} ${u}`, {
      size: 12,
    }) +
    `<rect x="16" y="${y + 22}" width="26" height="14" fill="url(#paz-sq-${key})" stroke="#8a4b00" stroke-width="2"/>` +
    text(
      50,
      y + 34,
      `Protective action zone: downwind square, side ${fmt(d.protectiveDistance)} ${u}`,
      { size: 12 },
    ) +
    text(16, y + 56, `${sourceText(d)} Exercise only: use your own guidebook for real decisions.`, {
      size: 11,
      fill: MUTED,
    })
  )
}

const defs = (key: string): string =>
  `<pattern id="paz-ci-${key}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fbe1e2"/><path d="M-1 1L1 -1M0 8L8 0M7 9L9 7" stroke="#b3121b" stroke-width="1.2"/></pattern>` +
  `<pattern id="paz-sq-${key}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff0c2"/><circle cx="2" cy="2" r="1.1" fill="#8a4b00"/><circle cx="6" cy="6" r="1.1" fill="#8a4b00"/></pattern>`

function summaryOf(d: ProtectiveActionZoneData): string {
  const u = d.unit
  const places = d.places.map((p) => `${p.name} is ${placeStatus(d, p)}`)
  return (
    `${d.title ?? 'Isolation and protective action zones'} for ${d.material} at ${d.incident.label}. ` +
    `Wind from the ${compass(d.wind.fromDeg)} (${Math.round(d.wind.fromDeg)} degrees) at ${fmt(d.wind.speed)} ${d.wind.unit}, ` +
    `from ${d.wind.source}${d.wind.asOf ? ` at ${d.wind.asOf}` : ''}. ` +
    `Initial isolation zone: a circle of radius ${fmt(d.isolationDistance)} ${u}. ` +
    `Protective action zone: a square of side ${fmt(d.protectiveDistance)} ${u} downwind, toward the ${compass(downwindBearing(d.wind.fromDeg))}. ` +
    (places.length ? `${places.join('; ')}. ` : '') +
    sourceText(d)
  )
}

function tableOf(d: ProtectiveActionZoneData): FigureResult['table'] {
  const u = d.unit
  const rows: string[][] = [
    ['Material', d.material],
    ['Release point', d.incident.label],
    [
      'Wind',
      `from ${compass(d.wind.fromDeg)} (${Math.round(d.wind.fromDeg)} degrees) at ${fmt(d.wind.speed)} ${d.wind.unit}; ${d.wind.source}`,
    ],
    ['Initial isolation distance (radius)', `${fmt(d.isolationDistance)} ${u}`],
    ['Protective action distance (square side, downwind)', `${fmt(d.protectiveDistance)} ${u}`],
    ['Source of distances', sourceText(d).replace(/^Distances: /, '')],
    ...d.places.map((p) => [
      p.name,
      `${Math.round(p.bearingDeg)} degrees, ${fmt(p.distance)} ${u}: ${placeStatus(d, p)}`,
    ]),
  ]
  return {
    caption: d.title ?? 'Isolation and protective action zones',
    columns: ['Item', 'Value'],
    rows,
  }
}

function render(d: ProtectiveActionZoneData, o: { width: number; height: number }): FigureResult {
  const key = hashId(JSON.stringify(d))
  const summary = summaryOf(d)
  const box: Box = { x: 16, y: 40, w: o.width - 32, h: o.height - 40 - 84 }
  const body =
    heading(d.title ?? 'Isolation and protective action zones', 16) +
    zonesSvg(d, box, key) +
    legendSvg(d, o.height - 74, key)
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Isolation and protective action zones',
      summary,
      defs: defs(key),
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: tableOf(d),
  }
}

export const protectiveActionZoneKind: FigureKind<ProtectiveActionZoneData> = {
  kind: 'protective_action_zone',
  schema: ProtectiveActionZoneData,
  render,
  defaultHeight: 520,
}
