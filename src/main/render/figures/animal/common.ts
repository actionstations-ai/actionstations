// Shared drawing for the animal disease figure kinds (spec 0460 FR-5): a schematic map (no
// basemap, no tiles) that draws only the layers its data carries, premises marked by shape and
// abbreviation as well as color, and zone rings stated in kilometers in the text summary.
// Premises are fictional points the scenario places; no figure shows a real farm.
import { z } from 'zod'
import {
  DESIGNATIONS,
  DESIGNATION_ABBREVIATION,
  type Designation,
} from '@shared/animal-disease/plan-rules'
import { SURFACE } from '../theme'
import { frame, hashId, heading, n } from '../svg'
import {
  GeoLine,
  GeoPoint,
  circleKm,
  label,
  makeProjection,
  mapChrome,
  mapKey,
  polyline,
  type KeyItem,
  type Plot,
  type Projection,
} from '../geo/project'
import type { FigureResult, FigureTable } from '../types'

export const Title = z.string().max(200).optional()
export const DesignationSchema = z.enum(DESIGNATIONS)

export const PremisesPoint = GeoPoint.extend({
  id: z.string().min(1).max(20),
  species: z.string().max(40).optional(),
  head: z.number().int().min(0).max(10_000_000).default(0),
  designation: DesignationSchema.default('free'),
  /** The zone the premises sits in, from the zone calculator. */
  zone: z.string().max(40).optional(),
})
export type PremisesPoint = z.infer<typeof PremisesPoint>

export const ZONE_RING_KINDS = ['infected zone', 'control area', 'surveillance zone'] as const
export const Ring = z.object({
  around: z.string().max(20).optional(),
  kind: z.enum(ZONE_RING_KINDS),
  center: GeoPoint,
  radiusKm: z.number().positive().max(500),
})
export type Ring = z.infer<typeof Ring>

export const BaseLine = GeoLine.extend({ kind: z.enum(['road', 'county']).default('road') })

const COLOR: Record<Designation, string> = {
  infected: '#b3121b',
  contact: '#8a4b00',
  suspect: '#6d3fb5',
  'at-risk': '#8a5a00',
  monitored: '#1f5fbf',
  free: '#594c3c',
  vaccinated: '#1b7a3a',
}

/** A premises mark: shape per designation, radius by head count, abbreviation beside it. */
export function premisesMark(d: Designation, x: number, y: number, r: number): string {
  const c = COLOR[d]
  const base = `fill="${c}" stroke="${SURFACE}" stroke-width="1.2"`
  switch (d) {
    case 'infected': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = (Math.PI / 5) * i - Math.PI / 2
        const rr = i % 2 ? r * 0.5 : r + 2
        return `${n(x + rr * Math.cos(a))},${n(y + rr * Math.sin(a))}`
      }).join(' ')
      return `<polygon points="${pts}" ${base}/>`
    }
    case 'contact':
      return `<rect x="${n(x - r)}" y="${n(y - r)}" width="${n(2 * r)}" height="${n(2 * r)}" ${base}/>`
    case 'suspect':
      return `<path d="M${n(x)} ${n(y - r - 1)}L${n(x + r + 1)} ${n(y)}L${n(x)} ${n(y + r + 1)}L${n(x - r - 1)} ${n(y)}Z" ${base}/>`
    case 'at-risk':
      return `<path d="M${n(x)} ${n(y - r - 1)}L${n(x + r + 1)} ${n(y + r)}L${n(x - r - 1)} ${n(y + r)}Z" ${base}/>`
    case 'monitored':
      return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#ffffff" stroke="${c}" stroke-width="2.6"/>`
    case 'vaccinated':
      return `<path d="M${n(x - r)} ${n(y - r)}L${n(x + r)} ${n(y + r)}M${n(x + r)} ${n(y - r)}L${n(x - r)} ${n(y + r)}" stroke="${c}" stroke-width="3" fill="none"/>`
    default:
      return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(Math.max(2.5, r - 1))}" fill="#ffffff" stroke="${c}" stroke-width="1.4"/>`
  }
}

const radiusFor = (head: number, maxHead: number): number =>
  3 + (maxHead > 0 ? Math.sqrt(head / maxHead) * 7 : 0)

export const designationKey = (present: readonly Designation[]): KeyItem[] =>
  present.map((d) => ({
    name: `${d[0]!.toUpperCase()}${d.slice(1)} (${DESIGNATION_ABBREVIATION[d]})`,
    swatch: (x: number, y: number) => premisesMark(d, x + 11, y, 5),
  }))

const RING_STYLE: Record<(typeof ZONE_RING_KINDS)[number], string> = {
  'infected zone': `stroke="#b3121b" stroke-width="2.4"`,
  'control area': `stroke="#14100c" stroke-width="2.2" stroke-dasharray="9 5"`,
  'surveillance zone': `stroke="#594c3c" stroke-width="2" stroke-dasharray="2 5"`,
}

export const ringKey = (present: readonly (typeof ZONE_RING_KINDS)[number][]): KeyItem[] =>
  present.map((k) => ({
    name: `${k[0]!.toUpperCase()}${k.slice(1)} edge`,
    swatch: (x: number, y: number) =>
      `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + 22)}" y2="${n(y)}" fill="none" ${RING_STYLE[k]}/>`,
  }))

export function drawRings(proj: Projection, rings: readonly Ring[]): string {
  let out = ''
  for (const r of rings) {
    out += `${circleKm(proj, r.center, r.radiusKm)} fill="none" ${RING_STYLE[r.kind]}/>`
    const [cx, cy] = proj.px(r.center)
    const top = cy - r.radiusKm / proj.kmPerPx
    out += label(cx, top - 4, `${r.radiusKm} km`, { anchor: 'middle' })
  }
  return out
}

export function drawBase(proj: Projection, lines: readonly z.infer<typeof BaseLine>[]): string {
  return lines
    .map((l) =>
      polyline(
        proj,
        l.points,
        l.kind === 'county'
          ? `fill="none" stroke="#7d8b95" stroke-width="1.5" stroke-dasharray="1 4"`
          : `fill="none" stroke="#3b3b3b" stroke-width="1.6"`,
      ),
    )
    .join('')
}

export function drawPremises(proj: Projection, list: readonly PremisesPoint[]): string {
  const maxHead = Math.max(0, ...list.map((p) => p.head))
  let out = ''
  const order = [...list].sort(
    (a, b) => DESIGNATIONS.indexOf(b.designation) - DESIGNATIONS.indexOf(a.designation),
  )
  for (const p of order) {
    const [x, y] = proj.px(p)
    out += premisesMark(p.designation, x, y, radiusFor(p.head, maxHead))
    if (p.designation !== 'free') {
      const abbr = DESIGNATION_ABBREVIATION[p.designation]
      const right = x > proj.plot.x + proj.plot.w - 120
      out += label(right ? x - 9 : x + 9, y + 4, `${abbr} ${p.id}`, {
        anchor: right ? 'end' : 'start',
      })
    }
  }
  return out
}

export interface MapJob {
  title?: string
  width: number
  height: number
  points: GeoPoint[]
  key: KeyItem[]
  summary: string
  table: FigureTable
  draw: (proj: Projection, id: string) => string
  idKey: string
  defs?: (id: string) => string
}

/** Frame, map, key and the clip for a schematic map; the same data gives the same bytes. */
export function renderAnimalMap(j: MapJob): FigureResult {
  const id = hashId(j.idKey)
  const top = j.title ? 34 : 10
  const keyHeight = mapKey(j.key, 14, 0, j.width - 14).height
  const plot: Plot = { x: 10, y: top, w: j.width - 20, h: j.height - top - keyHeight - 14 }
  const proj = makeProjection(j.points, plot)
  const keyShifted = mapKey(j.key, 14, plot.y + plot.h + 16, j.width - 14)
  const clip = `<clipPath id="c${id}"><rect x="${n(plot.x)}" y="${n(plot.y)}" width="${n(plot.w)}" height="${n(plot.h)}"/></clipPath>`
  const body =
    heading(j.title, 14) +
    mapChrome(proj, plot) +
    `<g clip-path="url(#c${id})">${j.draw(proj, id)}</g>` +
    keyShifted.svg
  return {
    svg: frame({
      width: j.width,
      height: j.height,
      title: j.title ?? 'Map',
      summary: j.summary,
      defs: clip + (j.defs?.(id) ?? ''),
      body,
      idKey: j.idKey,
    }),
    summary: j.summary,
    table: j.table,
  }
}

/** Designation counts as a phrase: "1 infected, 2 contact, 14 free". */
export function designationCounts(list: readonly { designation: Designation }[]): string {
  return DESIGNATIONS.map((d) => [d, list.filter((p) => p.designation === d).length] as const)
    .filter(([, c]) => c > 0)
    .map(([d, c]) => `${c} ${d}`)
    .join(', ')
}

/** The distinct designations present, in the plan's order. */
export const presentDesignations = (list: readonly { designation: Designation }[]): Designation[] =>
  DESIGNATIONS.filter((d) => list.some((p) => p.designation === d))

/** Rings stated in words: "infected zone 3 km, control area 10 km around IP-001". */
export function ringsInWords(rings: readonly Ring[]): string {
  if (!rings.length) return ''
  const around = [...new Set(rings.map((r) => r.around).filter(Boolean))]
  const sizes = ZONE_RING_KINDS.map((k) => {
    const km = [...new Set(rings.filter((r) => r.kind === k).map((r) => r.radiusKm))]
    return km.length ? `${k} ${km.join(' and ')} km` : ''
  }).filter(Boolean)
  return `Rings from the infected premises${around.length ? ` (${around.join(', ')})` : ''}: ${sizes.join(', ')}.`
}
