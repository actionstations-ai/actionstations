// Flood operations boards (spec 0454 FR-7): the status board and table figure kinds configured
// for flood work, built from case data and the decisions recorded in the session so that a
// closure, a shelter opening or a delivery made in the exercise shows up on the board. Pure
// functions returning figure specs; the figure kinds draw them.
import type { MetricDecision } from '@shared/schemas/metrics'
import type { FigureSpec } from '../../render/figures/types'

const when = (iso: string): string => {
  const d = new Date(Date.parse(iso))
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}
const at = (d: MetricDecision, asOf: number): boolean => Date.parse(d.time) <= asOf
const field = (d: MetricDecision, k: string): string => {
  const v = d.fields[k]
  return typeof v === 'string' || typeof v === 'number' ? String(v) : ''
}
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

export interface FloodRoad {
  name: string
  /** Stage in feet at the gauge at which the road goes under. */
  floodsAtStage: number
  detour?: string
}

/**
 * The closure board: each road with the stage that floods it and what is true now. Closed means a
 * close decision names it by `asOf`; a road under water but not closed is flagged as such, which
 * is the board's point.
 */
export function roadClosureBoard(input: {
  roads: readonly FloodRoad[]
  /** The gauge reading now, in feet. */
  stage: number
  asOf: string
  decisions: readonly MetricDecision[]
  gaugeLabel?: string
}): FigureSpec {
  const asOf = Date.parse(input.asOf)
  const closures = input.decisions.filter((d) => d.kind === 'close_road' && at(d, asOf))
  return {
    kind: 'status_board',
    data: {
      title: 'Road and crossing status',
      asOf: `${when(input.asOf)}${input.gaugeLabel ? `, ${input.gaugeLabel} ${input.stage} ft` : ''}`,
      rows: input.roads.map((r) => {
        const closed = closures
          .filter((d) => same(field(d, 'road') || d.area || '', r.name))
          .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))[0]
        const under = input.stage >= r.floodsAtStage
        const near = !under && r.floodsAtStage - input.stage <= 1
        const base = `Floods at ${r.floodsAtStage} ft.`
        const detour = r.detour ? ` Detour: ${r.detour}.` : ''
        if (closed)
          return {
            name: r.name,
            state: 'down' as const,
            detail: `Closed at ${when(closed.time)}. ${base}${under ? ' Water over the road.' : ''}${detour}`,
            updated: when(closed.time),
          }
        if (under)
          return {
            name: r.name,
            state: 'degraded' as const,
            detail: `Water over the road and NOT closed. ${base}${detour}`,
          }
        return {
          name: r.name,
          state: near ? ('degraded' as const) : ('ok' as const),
          detail: `${near ? 'Within 1 ft of flooding. ' : 'Open. '}${base}`,
        }
      }),
    },
  }
}

export interface FloodFacility {
  name: string
  floodsAtStage: number
  kind?: string
}

/** Critical facility status: dry, at risk within a foot, or flooded, plus whether it was moved. */
export function facilityStatusBoard(input: {
  facilities: readonly FloodFacility[]
  stage: number
  asOf: string
  decisions: readonly MetricDecision[]
}): FigureSpec {
  const asOf = Date.parse(input.asOf)
  const moves = input.decisions.filter((d) => d.kind === 'move_assets' && at(d, asOf))
  return {
    kind: 'status_board',
    data: {
      title: 'Critical facility status',
      asOf: when(input.asOf),
      rows: input.facilities.map((f) => {
        const moved = moves.find(
          (d) => same(field(d, 'what'), f.name) || same(d.area ?? '', f.name),
        )
        const flooded = input.stage >= f.floodsAtStage
        const near = !flooded && f.floodsAtStage - input.stage <= 1
        return {
          name: f.name,
          state: flooded
            ? ('down' as const)
            : near || moved
              ? ('degraded' as const)
              : ('ok' as const),
          detail: `${f.kind ? `${f.kind}. ` : ''}Floods at ${f.floodsAtStage} ft.${moved ? ` Moved or protected at ${when(moved.time)}.` : ''}${flooded ? ' Flooded.' : ''}`,
        }
      }),
    },
  }
}

/** Shelter occupancy from open_shelter decisions and the headcounts reported so far. */
export function shelterTable(input: {
  asOf: string
  decisions: readonly MetricDecision[]
  /** Latest count of people and pets per shelter, from reports. */
  counts?: Record<string, { present: number; pets?: number; note?: string }>
}): FigureSpec {
  const asOf = Date.parse(input.asOf)
  const opened = input.decisions.filter((d) => d.kind === 'open_shelter' && at(d, asOf))
  return {
    kind: 'table',
    data: {
      title: 'Shelters',
      caption: `As of ${when(input.asOf)}`,
      columns: ['Shelter', 'Opened', 'Capacity', 'Present', 'Pets', 'Notes'],
      rows: opened.length
        ? opened.map((d) => {
            const site = field(d, 'site') || d.area || 'Shelter'
            const c = input.counts?.[site]
            const cap = Number(field(d, 'capacity'))
            return [
              site,
              when(d.time),
              Number.isFinite(cap) && field(d, 'capacity') ? cap : null,
              c ? c.present : null,
              c?.pets ?? null,
              c?.note ?? '',
            ]
          })
        : [['No shelter opened yet', '', null, null, null, '']],
    },
  }
}

export interface Delivery {
  resource: string
  quantity: number
  at: string
}

/** Sandbag and pump tracker: needed (orders), in transit and delivered, per resource. */
export function logisticsTracker(input: {
  asOf: string
  decisions: readonly MetricDecision[]
  deliveries?: readonly Delivery[]
  /** Quantities handed to a carrier but not yet arrived. */
  inTransit?: Record<string, number>
}): FigureSpec {
  const asOf = Date.parse(input.asOf)
  const orders = input.decisions.filter((d) => d.kind === 'order_resources' && at(d, asOf))
  const needed = new Map<string, { qty: number; first: string; needBy: string }>()
  for (const d of orders) {
    const r = field(d, 'resource') || 'Resource'
    const prev = needed.get(r)
    needed.set(r, {
      qty: (prev?.qty ?? 0) + (Number(field(d, 'quantity')) || 0),
      first: prev?.first ?? d.time,
      needBy: field(d, 'need_by') || prev?.needBy || '',
    })
  }
  const delivered = new Map<string, number>()
  for (const x of input.deliveries ?? [])
    if (Date.parse(x.at) <= asOf)
      delivered.set(x.resource, (delivered.get(x.resource) ?? 0) + x.quantity)
  return {
    kind: 'table',
    data: {
      title: 'Sandbag and pump tracker',
      caption: `As of ${when(input.asOf)}`,
      columns: ['Resource', 'Ordered', 'In transit', 'Delivered', 'Still needed', 'Needed by'],
      rows: needed.size
        ? [...needed.entries()].map(([r, v]) => {
            const got = delivered.get(r) ?? 0
            const moving = input.inTransit?.[r] ?? 0
            return [r, v.qty, moving, got, Math.max(0, v.qty - got - moving), v.needBy]
          })
        : [['Nothing ordered yet', null, null, null, null, '']],
    },
  }
}

export interface PatrolEntry {
  time: string
  segment: string
  finding: string
  severity: string
  action: string
}

/** The levee patrol log, newest last, up to `asOf`. */
export function leveePatrolLog(input: {
  asOf: string
  entries: readonly PatrolEntry[]
}): FigureSpec {
  const asOf = Date.parse(input.asOf)
  const rows = input.entries
    .filter((e) => Date.parse(e.time) <= asOf)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
    .slice(-30)
  return {
    kind: 'table',
    data: {
      title: 'Levee patrol log',
      caption: `As of ${when(input.asOf)}`,
      columns: ['Time', 'Segment', 'Finding', 'Severity', 'Action'],
      rows: rows.length
        ? rows.map((e) => [when(e.time), e.segment, e.finding, e.severity, e.action])
        : [['No patrol reports yet', '', '', '', '']],
    },
  }
}
