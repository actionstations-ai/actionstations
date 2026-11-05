// Crisis line figures (spec 0464 FR-7): hs_contact_series (volume or answer rate by contact type
// with target lines), hs_queue_board (waiting, longest wait and answer rate by channel, with a
// state word) and hs_staffing_coverage (counselors on the floor against the number needed).
// Each draws through a generic kind (time series, status board) so axes, thresholds and tables
// behave the same, and adds the field's own summary: where the measure fell short of its target.
import { z } from 'zod'
import { fmt } from '../svg'
import { statusBoardKind } from '../status-board'
import { timeSeriesKind, type TimeSeriesData } from '../time-series'
import type { FigureKind, FigureResult, FigureTable } from '../types'

const CONTACT_TYPES = ['Calls', 'Texts', 'Chats'] as const

/** m:ss for a wait in seconds. */
export function waitText(seconds: number): string {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ---- contact series ----------------------------------------------------------------------------

export const HsContactSeriesData = z.object({
  title: z.string().max(200).optional(),
  measure: z.enum(['volume', 'answer_rate']),
  /** Label of the x axis, with its unit ("Hour of day", "Minutes from STARTEX"). */
  xLabel: z.string().max(80).default('Hour of day'),
  types: z
    .array(
      z.object({
        name: z.enum(CONTACT_TYPES),
        points: z.array(z.object({ x: z.number().finite(), y: z.number().finite().min(0) })).min(2),
      }),
    )
    .min(1)
    .max(3),
  /** Target lines, each with its source ("federal goal, September 2026"). */
  targets: z
    .array(z.object({ value: z.number().finite(), label: z.string().min(1).max(80) }))
    .max(3)
    .default([]),
  /** Always says where the numbers come from. */
  origin: z.string().min(1).max(200).default('Simulated'),
})
export type HsContactSeriesData = z.infer<typeof HsContactSeriesData>

function renderContactSeries(
  d: HsContactSeriesData,
  o: { width: number; height: number },
): FigureResult {
  const rate = d.measure === 'answer_rate'
  const title =
    d.title ?? (rate ? 'Answer rate by contact type' : 'Contacts offered by contact type')
  const ts: TimeSeriesData = {
    title,
    xLabel: d.xLabel,
    yLabel: rate ? 'Answer rate (%)' : 'Contacts offered per interval',
    ...(rate ? { unit: '%' } : {}),
    series: d.types.map((t) => ({ name: t.name, points: t.points })),
    thresholds: d.targets,
    annotations: [],
  }
  const base = timeSeriesKind.render(ts, o)
  const lines = d.types.map((t) => {
    const low = t.points.reduce((b, p) => (p.y < b.y ? p : b), t.points[0]!)
    const high = t.points.reduce((b, p) => (p.y > b.y ? p : b), t.points[0]!)
    const tgt = d.targets[0]
    const short =
      rate && tgt
        ? ` ${t.points.filter((p) => p.y < tgt.value).length} of ${t.points.length} points are below ${tgt.label} (${fmt(tgt.value)}%).`
        : ''
    return rate
      ? `${t.name} answer rate is lowest at ${fmt(low.y)}% at ${fmt(low.x)}.${short}`
      : `${t.name} volume peaks at ${fmt(high.y)} at ${fmt(high.x)}.`
  })
  const summary = `${title}. Origin: ${d.origin}. ${lines.join(' ')} ${base.summary}`
  return { svg: base.svg, summary, ...(base.table ? { table: base.table } : {}) }
}

export const hsContactSeriesKind: FigureKind<HsContactSeriesData> = {
  kind: 'hs_contact_series',
  schema: HsContactSeriesData,
  render: renderContactSeries,
}

// ---- queue board -------------------------------------------------------------------------------

const QueueState = z.enum(['normal', 'watch', 'critical'])
const STATE_MAP = { normal: 'ok', watch: 'degraded', critical: 'down' } as const

export const HsQueueBoardData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  rows: z
    .array(
      z.object({
        type: z.enum(CONTACT_TYPES),
        waiting: z.number().int().min(0).max(100_000),
        longestWaitSec: z.number().int().min(0).max(86_400),
        answerRatePct: z.number().min(0).max(100).optional(),
        staffOn: z.number().int().min(0).max(5000),
        state: QueueState,
      }),
    )
    .min(1)
    .max(3),
})
export type HsQueueBoardData = z.infer<typeof HsQueueBoardData>

function renderQueueBoard(d: HsQueueBoardData, o: { width: number; height: number }): FigureResult {
  const title = d.title ?? 'Queue and wait times'
  const detail = (r: HsQueueBoardData['rows'][number]): string =>
    `${r.waiting} waiting, longest wait ${waitText(r.longestWaitSec)}, ` +
    `${r.answerRatePct === undefined ? '' : `answer rate ${fmt(r.answerRatePct)}%, `}${r.staffOn} staff on`
  const base = statusBoardKind.render(
    {
      title,
      ...(d.asOf ? { asOf: d.asOf } : {}),
      rows: d.rows.map((r) => ({
        name: r.type,
        state: STATE_MAP[r.state],
        detail: `${r.state.toUpperCase()}: ${detail(r)}`,
      })),
    },
    o,
  )
  const worst = [...d.rows].sort((a, b) => b.longestWaitSec - a.longestWaitSec)[0]!
  const critical = d.rows.filter((r) => r.state === 'critical').map((r) => r.type)
  const summary =
    `${title}${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.rows.map((r) => `${r.type} ${r.state.toUpperCase()}, ${detail(r)}`).join('; ')}. ` +
    `Longest wait: ${worst.type} at ${waitText(worst.longestWaitSec)}. ` +
    (critical.length ? `Critical: ${critical.join(', ')}.` : 'No channel is critical.')
  const table: FigureTable = {
    caption: title,
    columns: ['Type', 'Waiting', 'Longest wait', 'Answer rate', 'Staff on', 'State'],
    rows: d.rows.map((r) => [
      r.type,
      String(r.waiting),
      waitText(r.longestWaitSec),
      r.answerRatePct === undefined ? '' : `${fmt(r.answerRatePct)}%`,
      String(r.staffOn),
      r.state.toUpperCase(),
    ]),
  }
  return { svg: base.svg, summary, table }
}

export const hsQueueBoardKind: FigureKind<HsQueueBoardData> = {
  kind: 'hs_queue_board',
  schema: HsQueueBoardData,
  render: renderQueueBoard,
}

// ---- staffing coverage -------------------------------------------------------------------------

export const HsStaffingCoverageData = z.object({
  title: z.string().max(200).optional(),
  /** Interval start in minutes from the start of the period. */
  intervals: z
    .array(
      z.object({
        startMin: z.number().min(0).max(10_080),
        onFloor: z.number().int().min(0).max(5000),
        needed: z.number().int().min(0).max(5000),
      }),
    )
    .min(2)
    .max(200),
  /** How "needed" was set, so the number is never bare. */
  basis: z.string().min(1).max(200),
})
export type HsStaffingCoverageData = z.infer<typeof HsStaffingCoverageData>

function renderStaffing(
  d: HsStaffingCoverageData,
  o: { width: number; height: number },
): FigureResult {
  const title = d.title ?? 'Staffing coverage against demand'
  const ts: TimeSeriesData = {
    title,
    xLabel: 'Minutes from start of period',
    yLabel: 'Counselors',
    series: [
      { name: 'On the floor', points: d.intervals.map((i) => ({ x: i.startMin, y: i.onFloor })) },
      { name: 'Needed', points: d.intervals.map((i) => ({ x: i.startMin, y: i.needed })) },
    ],
    thresholds: [],
    annotations: [],
  }
  const base = timeSeriesKind.render(ts, o)
  const short = d.intervals.filter((i) => i.onFloor < i.needed)
  const worst = d.intervals.reduce(
    (b, i) => (i.needed - i.onFloor > b.needed - b.onFloor ? i : b),
    d.intervals[0]!,
  )
  const summary =
    `${title}. Needed is based on ${d.basis}. ` +
    (short.length
      ? `${short.length} of ${d.intervals.length} intervals are short of the number needed; the largest gap is ${worst.needed - worst.onFloor} counselors at minute ${fmt(worst.startMin)} (${worst.onFloor} on the floor, ${worst.needed} needed). `
      : 'Every interval is staffed to the number needed. ') +
    base.summary
  const table: FigureTable = {
    caption: title,
    columns: ['Minute', 'On the floor', 'Needed', 'Gap'],
    rows: d.intervals.map((i) => [
      fmt(i.startMin),
      String(i.onFloor),
      String(i.needed),
      String(Math.max(0, i.needed - i.onFloor)),
    ]),
  }
  return { svg: base.svg, summary, table }
}

export const hsStaffingCoverageKind: FigureKind<HsStaffingCoverageData> = {
  kind: 'hs_staffing_coverage',
  schema: HsStaffingCoverageData,
  render: renderStaffing,
}
