// Reunification and child welfare figures (spec 0464 FR-7): hs_reunification_flow (students
// arrived, verified and released over time, with pending and exceptions stated) and
// hs_displaced_tracker (children in care by placement type and status). Students and children are
// counts or exercise references, never names.
import { z } from 'zod'
import { fmt } from '../svg'
import { stackedBarKind } from '../bar'
import { timeSeriesKind, type TimeSeriesData } from '../time-series'
import type { FigureKind, FigureResult, FigureTable } from '../types'

// ---- reunification flow ------------------------------------------------------------------------

export const HsReunificationFlowData = z
  .object({
    title: z.string().max(200).optional(),
    /** Students on the roster. */
    onRoster: z.number().int().min(1).max(100_000),
    /** Cumulative counts at each time, in minutes from site activation. */
    points: z
      .array(
        z.object({
          minute: z.number().min(0).max(10_080),
          arrived: z.number().int().min(0),
          verified: z.number().int().min(0),
          released: z.number().int().min(0),
          exceptions: z.number().int().min(0).default(0),
        }),
      )
      .min(2)
      .max(300),
  })
  .refine(
    (d) =>
      d.points.every(
        (p) => p.released <= p.verified && p.verified <= p.arrived && p.arrived <= d.onRoster,
      ),
    {
      message:
        'released cannot exceed verified, verified cannot exceed arrived, and arrived cannot exceed the roster',
    },
  )
export type HsReunificationFlowData = z.infer<typeof HsReunificationFlowData>

function renderFlow(
  d: HsReunificationFlowData,
  o: { width: number; height: number },
): FigureResult {
  const title = d.title ?? 'Reunification flow'
  const pts = [...d.points].sort((a, b) => a.minute - b.minute)
  const ts: TimeSeriesData = {
    title,
    xLabel: 'Minutes from site activation',
    yLabel: 'Parents and students (cumulative)',
    series: [
      { name: 'Guardians arrived', points: pts.map((p) => ({ x: p.minute, y: p.arrived })) },
      { name: 'Verified', points: pts.map((p) => ({ x: p.minute, y: p.verified })) },
      { name: 'Released', points: pts.map((p) => ({ x: p.minute, y: p.released })) },
    ],
    thresholds: [{ value: d.onRoster, label: 'Roster total' }],
    annotations: [],
  }
  const base = timeSeriesKind.render(ts, o)
  const last = pts[pts.length - 1]!
  const pending = d.onRoster - last.released
  const firstDone = pts.find((p) => p.released >= d.onRoster)
  const summary =
    `${title}: at minute ${fmt(last.minute)}, ${last.released} of ${d.onRoster} students released, ${pending} pending, ` +
    `${last.exceptions} exceptions; ${last.arrived} guardians arrived and ${last.verified} verified. ` +
    (firstDone
      ? `All students were released by minute ${fmt(firstDone.minute)}. `
      : 'Not every student is released yet. ') +
    `Verification trails arrival by ${last.arrived - last.verified}. ` +
    base.summary
  const table: FigureTable = {
    caption: title,
    columns: ['Minute', 'Arrived', 'Verified', 'Released', 'Pending', 'Exceptions'],
    rows: pts.map((p) => [
      fmt(p.minute),
      String(p.arrived),
      String(p.verified),
      String(p.released),
      String(d.onRoster - p.released),
      String(p.exceptions),
    ]),
  }
  return { svg: base.svg, summary, table }
}

export const hsReunificationFlowKind: FigureKind<HsReunificationFlowData> = {
  kind: 'hs_reunification_flow',
  schema: HsReunificationFlowData,
  render: renderFlow,
}

// ---- displaced children tracker ----------------------------------------------------------------

const PLACEMENTS = ['Foster home', 'Kinship', 'Group home', 'Other'] as const
const STATUSES = ['Located', 'Contacted', 'Placed', 'Unknown'] as const

export const HsDisplacedTrackerData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  /** Counts by placement type (rows) and status (columns), in the order of PLACEMENTS and STATUSES. */
  counts: z
    .array(
      z.object({
        placement: z.enum(PLACEMENTS),
        located: z.number().int().min(0),
        contacted: z.number().int().min(0),
        placed: z.number().int().min(0),
        unknown: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(4),
})
export type HsDisplacedTrackerData = z.infer<typeof HsDisplacedTrackerData>

function renderTracker(
  d: HsDisplacedTrackerData,
  o: { width: number; height: number },
): FigureResult {
  const title = d.title ?? 'Children in care: contact status'
  const base = stackedBarKind.render(
    {
      title,
      yLabel: 'Children in care',
      categories: d.counts.map((c) => c.placement),
      series: STATUSES.map((s) => ({
        name: s,
        values: d.counts.map(
          (c) => c[s.toLowerCase() as 'located' | 'contacted' | 'placed' | 'unknown'],
        ),
      })),
    },
    o,
  )
  const total = (k: 'located' | 'contacted' | 'placed' | 'unknown'): number =>
    d.counts.reduce((a, c) => a + c[k], 0)
  const all = total('located') + total('contacted') + total('placed') + total('unknown')
  const summary =
    `${title}${d.asOf ? ` as of ${d.asOf}` : ''}: ${all} children in care in the affected area; ` +
    `${total('located')} located, ${total('contacted')} contacted, ${total('placed')} placed, ${total('unknown')} unknown (${all ? Math.round((total('unknown') / all) * 100) : 0}% unknown). ` +
    base.summary
  const table: FigureTable = {
    caption: title,
    columns: ['Placement', ...STATUSES, 'Total'],
    rows: d.counts.map((c) => [
      c.placement,
      String(c.located),
      String(c.contacted),
      String(c.placed),
      String(c.unknown),
      String(c.located + c.contacted + c.placed + c.unknown),
    ]),
  }
  return { svg: base.svg, summary, table }
}

export const hsDisplacedTrackerKind: FigureKind<HsDisplacedTrackerData> = {
  kind: 'hs_displaced_tracker',
  schema: HsDisplacedTrackerData,
  render: renderTracker,
}
