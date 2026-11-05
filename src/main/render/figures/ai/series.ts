// ai_eval_series and ai_moderation_queue (spec 0467 FR-5): the two time series of an AI
// incident. Both are drawn by the generic time_series kind, so they share its axes, markers and
// data table, and both say in their summary and their notes that the data is simulated.
import { z } from 'zod'
import { fmt } from '../svg'
import { SIMULATED_NOTE, withDescription } from './common'
import { timeSeriesKind } from '../time-series'
import type { FigureKind, FigureOptions, FigureResult } from '../types'

const Day = z.number().int().min(0).max(3650)

export const AiEvalSeriesData = z.object({
  title: z.string().max(200).optional(),
  /** What the evaluation measures, for example "Harmful-output rate on the weekly sample". */
  metric: z.string().min(1).max(120),
  points: z
    .array(z.object({ x: Day, y: z.number().finite().min(0).max(100) }))
    .min(2)
    .max(400),
  /** The level the governance process treats as unacceptable, in percent. */
  threshold: z.object({ value: z.number().min(0).max(100), label: z.string().min(1).max(80) }),
  /** The day the change began, when the exercise knows it (drift or a model change). */
  changepoint: z.object({ x: Day, label: z.string().min(1).max(120) }).optional(),
  /** Printed in the summary; a simulated series always says so. */
  simulated: z.boolean().default(true),
})
export type AiEvalSeriesData = z.infer<typeof AiEvalSeriesData>

function renderEvalSeries(d: AiEvalSeriesData, o: FigureOptions): FigureResult {
  const pts = [...d.points].sort((a, b) => a.x - b.x)
  const drawn = timeSeriesKind.render(
    {
      title: d.title ?? d.metric,
      xLabel: 'Day',
      yLabel: d.metric,
      unit: '%',
      series: [{ name: d.metric, points: pts }],
      thresholds: [{ value: d.threshold.value, label: d.threshold.label }],
      annotations: d.changepoint ? [{ x: d.changepoint.x, label: d.changepoint.label }] : [],
    },
    o,
  )
  const above = pts.find(
    (p, i) => p.y >= d.threshold.value && (pts[i + 1]?.y ?? 0) >= d.threshold.value,
  )
  const first = above
    ? `The rate is at or above ${fmt(d.threshold.value)}% on two days in a row from day ${above.x}.`
    : `The rate never stays at or above ${fmt(d.threshold.value)}% for two days in a row.`
  const note = d.simulated ? ` ${SIMULATED_NOTE}` : ''
  const summary = `${drawn.summary} ${first}${note}`
  return {
    svg: withDescription(drawn.svg, summary),
    summary,
    ...(drawn.table ? { table: drawn.table } : {}),
  }
}

export const aiEvalSeriesKind: FigureKind<AiEvalSeriesData> = {
  kind: 'ai_eval_series',
  schema: AiEvalSeriesData,
  render: renderEvalSeries,
}

// ---- moderation queue ------------------------------------------------------------------------

export const AiModerationQueueData = z.object({
  title: z.string().max(200).optional(),
  hours: z
    .array(
      z.object({
        hour: z.number().int().min(0).max(2000),
        received: z.number().int().min(0).max(1_000_000),
        reviewed: z.number().int().min(0).max(1_000_000),
        backlog: z.number().int().min(0).max(10_000_000),
      }),
    )
    .min(2)
    .max(400),
  simulated: z.boolean().default(true),
})
export type AiModerationQueueData = z.infer<typeof AiModerationQueueData>

function renderQueue(d: AiModerationQueueData, o: FigureOptions): FigureResult {
  const rows = [...d.hours].sort((a, b) => a.hour - b.hour)
  const series = (name: string, key: 'received' | 'reviewed' | 'backlog') => ({
    name,
    points: rows.map((r) => ({ x: r.hour, y: r[key] })),
  })
  const drawn = timeSeriesKind.render(
    {
      title: d.title ?? 'Moderation queue',
      xLabel: 'Hour',
      yLabel: 'Items',
      series: [
        series('Received per hour', 'received'),
        series('Reviewed per hour', 'reviewed'),
        series('Backlog', 'backlog'),
      ],
      thresholds: [],
      annotations: [],
    },
    o,
  )
  const peak = rows.reduce((m, r) => (r.backlog > m.backlog ? r : m), rows[0]!)
  const last = rows[rows.length - 1]!
  const note = d.simulated ? ` ${SIMULATED_NOTE}` : ''
  const summary =
    `${drawn.summary} The backlog peaks at ${fmt(peak.backlog)} items at hour ${peak.hour} ` +
    `and is ${fmt(last.backlog)} at hour ${last.hour}.${note}`
  return {
    svg: withDescription(drawn.svg, summary),
    summary,
    ...(drawn.table ? { table: drawn.table } : {}),
  }
}

export const aiModerationQueueKind: FigureKind<AiModerationQueueData> = {
  kind: 'ai_moderation_queue',
  schema: AiModerationQueueData,
  render: renderQueue,
}
