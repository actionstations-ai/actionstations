// structures_assignment_map: the inspection assignment map (spec 0471 FR-5): evaluation areas
// drawn as outlined regions, every building a marker whose shape and word give its placard, and
// priority buildings (hospitals, shelters, schools) labeled. Coordinates are local meters. With
// `asOf`, a building whose placard was posted after that time shows as not yet evaluated, so one
// building list draws the program at any moment. It is a schematic of the entered geometry, not a
// basemap; the map screen draws the same buildings over real geography from the overlay layer.
import { z } from 'zod'
import { AXIS, INK, MUTED } from '../theme'
import { frame, heading, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import {
  PLACARD_STATES,
  PLACARD_STYLE,
  PRIORITY_LABEL,
  PlacardState,
  Priority,
  countStates,
  countsSentence,
  isoTime,
  placardSymbol,
  stamp,
  stateAt,
} from './common'

const Coord = z.number().finite().min(-1_000_000).max(1_000_000)

export const StructuresAssignmentMapData = z
  .object({
    title: z.string().max(200).optional(),
    asOf: isoTime.optional(),
    areas: z
      .array(
        z.object({
          name: z.string().min(1).max(60),
          team: z.string().max(30).optional(),
          polygon: z
            .array(z.tuple([Coord, Coord]))
            .min(3)
            .max(60),
        }),
      )
      .max(20)
      .default([]),
    buildings: z
      .array(
        z.object({
          id: z.string().min(1).max(30),
          name: z.string().max(60).default(''),
          x: Coord,
          y: Coord,
          priority: Priority.default('other'),
          placard: PlacardState.default('NOT YET EVALUATED'),
          postedAt: isoTime.optional(),
        }),
      )
      .min(1)
      .max(300),
  })
  .refine((d) => new Set(d.buildings.map((b) => b.id)).size === d.buildings.length, {
    message: 'building ids must be unique',
  })
export type StructuresAssignmentMapData = z.infer<typeof StructuresAssignmentMapData>

const M = 24

function areaOf(d: StructuresAssignmentMapData, x: number, y: number): string {
  for (const a of d.areas) {
    let inside = false
    for (let i = 0, j = a.polygon.length - 1; i < a.polygon.length; j = i++) {
      const [xi, yi] = a.polygon[i]!
      const [xj, yj] = a.polygon[j]!
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    if (inside) return a.name
  }
  return ''
}

function render(
  d: StructuresAssignmentMapData,
  o: { width: number; height: number },
): FigureResult {
  const pts = [...d.buildings.map((b) => [b.x, b.y] as const), ...d.areas.flatMap((a) => a.polygon)]
  const minX = Math.min(...pts.map((p) => p[0]))
  const maxX = Math.max(...pts.map((p) => p[0]))
  const minY = Math.min(...pts.map((p) => p[1]))
  const maxY = Math.max(...pts.map((p) => p[1]))
  const spanX = Math.max(maxX - minX, 1)
  const spanY = Math.max(maxY - minY, 1)
  const plotW = o.width - 2 * M
  const scale = Math.min(plotW / spanX, 420 / spanY)
  const pw = spanX * scale
  const ph = spanY * scale
  const x0 = M + (plotW - pw) / 2
  const top = 50
  const X = (v: number): number => x0 + (v - minX) * scale
  const Y = (v: number): number => top + ph - (v - minY) * scale

  const rows = d.buildings.map((b) => ({
    b,
    state: stateAt(b.placard, b.postedAt, d.asOf),
    area: areaOf(d, b.x, b.y),
  }))
  const counts = countStates(rows.map((r) => r.state))

  let body = heading(d.title, M)
  if (d.asOf)
    body += text(o.width - M, 20, `As of ${stamp(d.asOf)}`, {
      size: 12,
      anchor: 'end',
      fill: MUTED,
    })
  body += `<rect x="${n(x0 - 12)}" y="${n(top - 12)}" width="${n(pw + 24)}" height="${n(ph + 24)}" fill="#fbf8ef" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const a of d.areas) {
    const poly = a.polygon.map((p) => `${n(X(p[0]))},${n(Y(p[1]))}`).join(' ')
    body += `<polygon points="${poly}" fill="none" stroke="#1f5fbf" stroke-width="2.5" stroke-dasharray="9 4"/>`
    const lx = Math.min(...a.polygon.map((p) => p[0]))
    const ly = Math.max(...a.polygon.map((p) => p[1]))
    body += text(X(lx) + 8, Y(ly) + 18, a.team ? `${a.name} · ${a.team}` : a.name, {
      size: 12,
      weight: 700,
      fill: '#1f5fbf',
    })
  }
  for (const r of rows) {
    const st = PLACARD_STYLE[r.state]
    const big = r.b.priority !== 'other'
    body += `<g>${big ? `<circle cx="${n(X(r.b.x))}" cy="${n(Y(r.b.y))}" r="13" fill="#ffffff" stroke="${st.color}" stroke-width="1.5"/>` : ''}${placardSymbol(r.state, X(r.b.x), Y(r.b.y), big ? 8 : 6)}</g>`
    if (big) body += text(X(r.b.x) + 15, Y(r.b.y) + 4, r.b.id, { size: 11, weight: 700, fill: INK })
  }

  // Legend.
  let y = top + ph + 38
  let x = M
  for (const s of PLACARD_STATES) {
    body += placardSymbol(s, x + 8, y - 4, 7)
    body += text(x + 22, y, `${s} (${counts[s]})`, { size: 12 })
    x += 28 + s.length * 7 + 28
  }
  y += 22
  body += text(
    M,
    y,
    'Labeled markers are hospitals, shelters and schools. Dashed outlines are evaluation areas.',
    {
      size: 11,
      fill: MUTED,
    },
  )
  y += 18

  const pending = rows.filter((r) => r.state === 'NOT YET EVALUATED' && r.b.priority !== 'other')
  const summary =
    `${d.title ?? 'Inspection assignment map'}${d.asOf ? ` as of ${stamp(d.asOf)}` : ''}: ${d.buildings.length} buildings in ${d.areas.length} areas: ${countsSentence(counts)}. ` +
    (pending.length
      ? `Priority buildings not yet evaluated: ${pending.map((r) => `${r.b.id} (${PRIORITY_LABEL[r.b.priority]})`).join(', ')}.`
      : 'Every priority building has been evaluated.') +
    ` Areas: ${d.areas.map((a) => `${a.name}${a.team ? ` (${a.team})` : ''}, ${rows.filter((r) => r.area === a.name).length} buildings`).join('; ')}.`
  return {
    svg: frame({
      width: o.width,
      height: Math.ceil(y + 4),
      title: d.title ?? 'Inspection assignment map',
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Building', 'Priority', 'Area', 'Placard', 'Posted'],
      rows: rows.map((r) => [
        r.b.id + (r.b.name ? ` ${r.b.name}` : ''),
        PRIORITY_LABEL[r.b.priority],
        r.area,
        r.state,
        r.state === 'NOT YET EVALUATED' || !r.b.postedAt ? '' : stamp(r.b.postedAt),
      ]),
    },
  }
}

export const structuresAssignmentMapKind: FigureKind<StructuresAssignmentMapData> = {
  kind: 'structures_assignment_map',
  schema: StructuresAssignmentMapData,
  render,
}
