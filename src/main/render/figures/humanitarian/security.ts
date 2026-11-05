// humanitarian_security_timeline and humanitarian_access_map (spec 0469 FR-8). The timeline puts
// a crisis management team's information, decisions, actions and communications on lanes; the
// map shows routes as open, restricted or closed (line style and a word, not color alone) with
// incident points. Both stay at the level of decisions and coordination: a point is a place
// named in general terms, never a tactical position.
import { z } from 'zod'
import { annotatedTimelineKind } from '../annotated-timeline'
import { XValue } from '../axis'
import {
  GeoPoint,
  NamedPlace,
  label,
  makeProjection,
  mapChrome,
  mapKey,
  polyline,
} from '../geo/project'
import { INK } from '../theme'
import { frame, heading, marker, n } from '../svg'
import type { FigureKind, FigureResult } from '../types'

const KINDS = ['information', 'decision', 'action', 'communication'] as const
const LANE: Record<(typeof KINDS)[number], string> = {
  information: 'Information',
  decision: 'Decision',
  action: 'Action',
  communication: 'Communication',
}

export const SecurityTimelineData = z.object({
  title: z.string().max(200).optional(),
  events: z
    .array(z.object({ time: XValue, kind: z.enum(KINDS), label: z.string().min(1).max(120) }))
    .min(1)
    .max(30),
})
export type SecurityTimelineData = z.infer<typeof SecurityTimelineData>

export const securityTimelineKind: FigureKind<SecurityTimelineData> = {
  kind: 'humanitarian_security_timeline',
  schema: SecurityTimelineData,
  render(d, o): FigureResult {
    const used = KINDS.filter((k) => d.events.some((e) => e.kind === k))
    const r = annotatedTimelineKind.render(
      {
        title: d.title ?? 'Staff incident timeline',
        lanes: used.map((k) => LANE[k]),
        events: d.events.map((e) => ({ x: e.time, label: e.label, lane: LANE[e.kind] })),
        spans: [],
      },
      o,
    )
    return {
      ...r,
      summary: `${r.summary} Entries are decisions and communications only.`,
    }
  },
  defaultHeight: 320,
}

// ---- access map ------------------------------------------------------------------------------

const STATUS = ['open', 'restricted', 'closed'] as const
const ROUTE_STYLE: Record<(typeof STATUS)[number], { color: string; dash: string; w: number }> = {
  open: { color: '#1b7a3a', dash: '', w: 3 },
  restricted: { color: '#8a5a00', dash: '9 5', w: 3.5 },
  closed: { color: '#b3121b', dash: '2 5', w: 4.5 },
}

export const AccessMapData = z.object({
  title: z.string().max(200).optional(),
  routes: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        status: z.enum(STATUS),
        note: z.string().max(120).optional(),
        points: z.array(GeoPoint).min(2).max(200),
      }),
    )
    .min(1)
    .max(20),
  places: z.array(NamedPlace).max(20).default([]),
  incidents: z.array(NamedPlace).max(12).default([]),
})
export type AccessMapData = z.infer<typeof AccessMapData>

export const accessMapKind: FigureKind<AccessMapData> = {
  kind: 'humanitarian_access_map',
  schema: AccessMapData,
  defaultHeight: 420,
  render(d, o): FigureResult {
    const keyItems = [
      ...STATUS.filter((s) => d.routes.some((r) => r.status === s)).map((s) => ({
        name: `Route ${s}`,
        swatch: (x: number, y: number) =>
          `<path d="M${n(x)} ${n(y)}H${n(x + 22)}" stroke="${ROUTE_STYLE[s].color}" stroke-width="${ROUTE_STYLE[s].w}" stroke-dasharray="${ROUTE_STYLE[s].dash}" fill="none"/>`,
      })),
      ...(d.incidents.length
        ? [
            {
              name: 'Incident (general location)',
              swatch: (x: number, y: number) => marker('cross', x + 11, y, '#b3121b'),
            },
          ]
        : []),
      ...(d.places.length
        ? [{ name: 'Place', swatch: (x: number, y: number) => marker('circle', x + 11, y, INK) }]
        : []),
    ]
    const keyH = mapKey(keyItems, 12, 0, o.width - 12).height
    const top = d.title ? 34 : 8
    const plot = { x: 8, y: top, w: o.width - 16, h: o.height - top - keyH - 10 }
    const proj = makeProjection(
      [...d.routes.flatMap((r) => r.points), ...d.places, ...d.incidents],
      plot,
    )
    let body = heading(d.title, 8) + mapChrome(proj, plot)
    for (const r of d.routes) {
      const s = ROUTE_STYLE[r.status]
      body += polyline(
        proj,
        r.points,
        `fill="none" stroke="${s.color}" stroke-width="${s.w}" stroke-dasharray="${s.dash}"`,
      )
      const mid = r.points[Math.floor(r.points.length / 2)]!
      const [mx, my] = proj.px(mid)
      body += label(mx + 6, my - 6, `${r.name}: ${r.status}`)
    }
    for (const p of d.places) {
      const [x, y] = proj.px(p)
      body += marker('circle', x, y, INK) + label(x + 8, y + 4, p.name)
    }
    d.incidents.forEach((p, i) => {
      const [x, y] = proj.px(p)
      body += marker('cross', x, y, '#b3121b') + label(x + 8, y + 4, `${i + 1}. ${p.name}`)
    })
    body += mapKey(keyItems, 12, plot.y + plot.h + 22, o.width - 12).svg
    const summary =
      `${d.title ?? 'Access constraints'}: ${d.routes.length} routes. ` +
      d.routes.map((r) => `${r.name} ${r.status}${r.note ? ` (${r.note})` : ''}`).join('; ') +
      '.' +
      (d.incidents.length
        ? ` Incidents, by general location: ${d.incidents.map((p, i) => `${i + 1}. ${p.name}`).join('; ')}.`
        : '')
    return {
      svg: frame({
        ...o,
        title: d.title ?? 'Access constraints',
        summary,
        body,
        idKey: JSON.stringify(d),
      }),
      summary,
      table: {
        caption: d.title ?? 'Access constraints',
        columns: ['Route', 'Status', 'Note'],
        rows: d.routes.map((r) => [r.name, r.status, r.note ?? '']),
      },
    }
  },
}
