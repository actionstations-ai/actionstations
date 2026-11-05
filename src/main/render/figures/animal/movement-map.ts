// animal_movement_map (spec 0460 FR-5): checkpoints, permitted routes and closed roads over the
// control area. Route status is told by line style and a word in the key (solid, dash-dot and
// dashed with a cross), checkpoints are numbered diamonds with a staffing word, and the summary
// and table list every route and checkpoint, so nothing rests on color.
import { z } from 'zod'
import { INK } from '../theme'
import { n, text } from '../svg'
import { GeoLine, GeoPoint, label, polyline, type Projection } from '../geo/project'
import type { FigureKind, FigureResult } from '../types'
import {
  PremisesPoint,
  Ring,
  Title,
  designationKey,
  drawPremises,
  drawRings,
  presentDesignations,
  renderAnimalMap,
  ringKey,
  ringsInWords,
} from './common'

const ROUTE_STATUSES = ['permitted', 'permit only', 'closed'] as const
const STAFFING = ['staffed', 'short staffed', 'unstaffed'] as const

export const AnimalMovementMapData = z.object({
  title: Title,
  routes: z
    .array(GeoLine.extend({ status: z.enum(ROUTE_STATUSES) }))
    .min(1)
    .max(40),
  checkpoints: z
    .array(
      GeoPoint.extend({
        name: z.string().min(1).max(80),
        staffing: z.enum(STAFFING).default('staffed'),
      }),
    )
    .max(20)
    .default([]),
  rings: z.array(Ring).max(30).default([]),
  premises: z.array(PremisesPoint).max(500).default([]),
  simulated: z.boolean().default(true),
})
export type AnimalMovementMapData = z.infer<typeof AnimalMovementMapData>

const ROUTE_ATTRS: Record<(typeof ROUTE_STATUSES)[number], string> = {
  permitted: `fill="none" stroke="#1b7a3a" stroke-width="3.5"`,
  'permit only': `fill="none" stroke="#8a4b00" stroke-width="3" stroke-dasharray="10 3 2 3"`,
  closed: `fill="none" stroke="#b3121b" stroke-width="3.5" stroke-dasharray="4 3"`,
}

const midpoint = (pts: readonly GeoPoint[]): GeoPoint => pts[Math.floor(pts.length / 2)]!

function drawRoutes(proj: Projection, d: AnimalMovementMapData): string {
  let out = ''
  for (const r of d.routes) {
    out += polyline(proj, r.points, ROUTE_ATTRS[r.status])
    if (r.status === 'closed') {
      const [x, y] = proj.px(midpoint(r.points))
      out += `<path d="M${n(x - 6)} ${n(y - 6)}L${n(x + 6)} ${n(y + 6)}M${n(x + 6)} ${n(y - 6)}L${n(x - 6)} ${n(y + 6)}" stroke="#b3121b" stroke-width="3.2" fill="none"/>`
    }
  }
  d.checkpoints.forEach((c, i) => {
    const [x, y] = proj.px(c)
    out += `<path d="M${n(x)} ${n(y - 11)}L${n(x + 11)} ${n(y)}L${n(x)} ${n(y + 11)}L${n(x - 11)} ${n(y)}Z" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`
    out += text(x, y + 4, String(i + 1), { size: 11, weight: 700, anchor: 'middle' })
    out += label(x + 14, y + 4, `${c.name} (${c.staffing})`)
  })
  return out
}

function movementMap(d: AnimalMovementMapData, o: { width: number; height: number }): FigureResult {
  const count = (s: (typeof ROUTE_STATUSES)[number]): number =>
    d.routes.filter((r) => r.status === s).length
  const names = (s: (typeof ROUTE_STATUSES)[number]): string =>
    d.routes
      .filter((r) => r.status === s)
      .map((r) => r.name ?? 'unnamed')
      .join(', ')
  const short = d.checkpoints.filter((c) => c.staffing !== 'staffed')
  const summary =
    `${d.title ?? 'Movement control map'}: ${d.routes.length} routes (${count('permitted')} permitted, ${count('permit only')} permit only, ${count('closed')} closed) ` +
    `and ${d.checkpoints.length} checkpoints. ` +
    (count('closed') ? `Closed: ${names('closed')}. ` : '') +
    (short.length
      ? `Checkpoints short of staff: ${short.map((c) => `${c.name} (${c.staffing})`).join(', ')}. `
      : '') +
    ringsInWords(d.rings) +
    (d.simulated ? ' Positions are simulated.' : '')
  const present = presentDesignations(d.premises)
  return renderAnimalMap({
    title: d.title,
    width: o.width,
    height: o.height,
    points: [
      ...d.routes.flatMap((r) => r.points),
      ...d.checkpoints,
      ...d.premises,
      ...d.rings.map((r) => r.center),
    ],
    idKey: JSON.stringify(d),
    key: [
      ...ROUTE_STATUSES.filter((s) => count(s)).map((s) => ({
        name: `Route, ${s}`,
        swatch: (x: number, y: number) =>
          `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + 22)}" y2="${n(y)}" ${ROUTE_ATTRS[s]}/>`,
      })),
      ...(d.checkpoints.length
        ? [
            {
              name: 'Checkpoint',
              swatch: (x: number, y: number) =>
                `<path d="M${n(x + 11)} ${n(y - 7)}L${n(x + 18)} ${n(y)}L${n(x + 11)} ${n(y + 7)}L${n(x + 4)} ${n(y)}Z" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`,
            },
          ]
        : []),
      ...designationKey(present),
      ...ringKey([...new Set(d.rings.map((r) => r.kind))]),
    ],
    summary: summary.trim(),
    table: {
      caption: d.title,
      columns: ['Kind', 'Name', 'Status'],
      rows: [
        ...d.routes.map((r) => ['Route', r.name ?? 'unnamed', r.status]),
        ...d.checkpoints.map((c, i) => ['Checkpoint', `${i + 1}. ${c.name}`, c.staffing]),
      ],
    },
    draw: (proj) => drawRings(proj, d.rings) + drawRoutes(proj, d) + drawPremises(proj, d.premises),
  })
}

export const animalMovementMapKind: FigureKind<AnimalMovementMapData> = {
  kind: 'animal_movement_map',
  schema: AnimalMovementMapData,
  render: movementMap,
  defaultHeight: 560,
}
