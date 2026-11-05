// pharmacy_queue_chart and pharmacy_usage_chart (spec 0463 FR-5). The queue chart stacks the age
// of the oldest item against its target above the count of items over time, so a queue that is
// small but old shows; the usage chart compares one user's controlled substance removals by hour
// with the median of peers (a pattern in data, never proof of diversion). Simulated data.
import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { z } from 'zod'
import { fmt, frame, heading, legend, n, text } from '../svg'
import { AXIS, GRID, MUTED, seriesStyle } from '../theme'
import { timeSeriesKind } from '../time-series'
import type { FigureKind, FigureResult } from '../types'

export const QueueChartData = z.object({
  title: z.string().max(200).optional(),
  queue: z.string().min(1).max(60),
  targetMinutes: z.number().positive(),
  xLabel: z.string().max(60).default('Minutes from start'),
  points: z
    .array(
      z.object({
        x: z.number().finite().min(0),
        count: z.number().min(0),
        oldestMinutes: z.number().min(0),
      }),
    )
    .min(2)
    .max(500),
})
export type QueueChartData = z.infer<typeof QueueChartData>

function renderQueue(d: QueueChartData, o: { width: number; height: number }): FigureResult {
  const pts = [...d.points].sort((a, b) => a.x - b.x)
  const title = d.title ?? `${d.queue}: queue age and count`
  const top = d.title ? 56 : 28
  const L = 58
  const R = o.width - 24
  const gap = 38
  const panelH = (o.height - top - 60 - gap) / 2
  const sx = scaleLinear()
    .domain([pts[0]!.x, pts.at(-1)!.x])
    .range([L, R])
  const ageMax = Math.max(d.targetMinutes, ...pts.map((p) => p.oldestMinutes))
  const sa = scaleLinear()
    .domain([0, ageMax])
    .nice()
    .range([top + panelH, top])
  const cMax = Math.max(1, ...pts.map((p) => p.count))
  const b0 = top + panelH + gap
  const sc = scaleLinear()
    .domain([0, cMax])
    .nice()
    .range([b0 + panelH, b0])
  let body = heading(title, 12)
  const grid = (s: ScaleLinear<number, number>, ticks: number) => {
    let out = ''
    for (const t of s.ticks(ticks)) {
      out += `<line x1="${L}" x2="${R}" y1="${n(s(t))}" y2="${n(s(t))}" stroke="${GRID}"/>`
      out += text(L - 8, s(t) + 4, fmt(t), { size: 11, anchor: 'end', fill: MUTED })
    }
    return out
  }
  body += text(L, top - 6, 'Age of the oldest item (minutes)', {
    size: 11,
    weight: 600,
    fill: MUTED,
  })
  body += grid(sa, 4)
  const over = seriesStyle(1)
  body += `<line x1="${L}" x2="${R}" y1="${n(sa(d.targetMinutes))}" y2="${n(sa(d.targetMinutes))}" stroke="${over.color}" stroke-width="1.5" stroke-dasharray="${over.dash}"/>`
  body += text(R - 4, sa(d.targetMinutes) - 5, `Target ${fmt(d.targetMinutes)} min`, {
    size: 11,
    anchor: 'end',
    fill: over.color,
    weight: 600,
  })
  const age = seriesStyle(0)
  const line = (key: 'oldestMinutes' | 'count', s: ScaleLinear<number, number>) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${n(sx(p.x))} ${n(s(p[key]))}`).join('')
  body += `<path d="${line('oldestMinutes', sa)}" fill="none" stroke="${age.color}" stroke-width="2.5"/>`
  body += text(L, b0 - 8, 'Items in the queue', { size: 11, weight: 600, fill: MUTED })
  body += grid(sc, 4)
  const cnt = seriesStyle(2)
  body += `<path d="${line('count', sc)}" fill="none" stroke="${cnt.color}" stroke-width="2.5" stroke-dasharray="${cnt.dash}"/>`
  body += `<line x1="${L}" x2="${R}" y1="${n(b0 + panelH)}" y2="${n(b0 + panelH)}" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const t of sx.ticks(6))
    body += text(sx(t), b0 + panelH + 16, fmt(t), { size: 11, anchor: 'middle', fill: MUTED })
  body += text((L + R) / 2, b0 + panelH + 32, d.xLabel, { size: 12, anchor: 'middle', fill: MUTED })
  body += legend(
    [
      {
        name: 'Oldest item',
        swatch: (x, y) =>
          `<line x1="${x}" x2="${x + 24}" y1="${y}" y2="${y}" stroke="${age.color}" stroke-width="2.5"/>`,
      },
      {
        name: 'Items',
        swatch: (x, y) =>
          `<line x1="${x}" x2="${x + 24}" y1="${y}" y2="${y}" stroke="${cnt.color}" stroke-width="2.5" stroke-dasharray="${cnt.dash}"/>`,
      },
    ],
    L,
    o.height - 14,
    R,
  ).svg
  const overPts = pts.filter((p) => p.oldestMinutes > d.targetMinutes)
  const peak = pts.reduce((m, p) => (p.oldestMinutes > m.oldestMinutes ? p : m), pts[0]!)
  const summary =
    `${title}: ${d.queue} queue over ${fmt(pts.at(-1)!.x - pts[0]!.x)} minutes. The oldest item peaks at ${fmt(peak.oldestMinutes)} minutes at ${fmt(peak.x)} against a target of ${fmt(d.targetMinutes)}; ` +
    `${overPts.length ? `it is over target at ${overPts.length} of ${pts.length} readings, first at ${fmt(overPts[0]!.x)}` : 'it stays within target'}. ` +
    `The count goes from ${fmt(pts[0]!.count)} to ${fmt(pts.at(-1)!.count)}, peaking at ${fmt(Math.max(...pts.map((p) => p.count)))}. Simulated.`
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title,
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: `${d.queue} queue`,
      columns: [d.xLabel, 'Items', 'Oldest (min)', 'Status'],
      rows: pts.map((p) => [
        fmt(p.x),
        fmt(p.count),
        fmt(p.oldestMinutes),
        p.oldestMinutes > d.targetMinutes ? 'Over target' : 'Within target',
      ]),
    },
  }
}

export const queueChartKind: FigureKind<QueueChartData> = {
  kind: 'pharmacy_queue_chart',
  schema: QueueChartData,
  render: renderQueue,
  defaultHeight: 420,
}

const Hours = z.array(z.number().min(0)).length(24)

export const UsageChartData = z.object({
  title: z.string().max(200).optional(),
  drugClass: z.string().max(80).default('Controlled substances'),
  /** User code (fictional). */
  user: z.string().min(1).max(20),
  byHour: Hours,
  peerMedianByHour: Hours,
  peerMaxByHour: Hours.optional(),
  period: z.string().max(80).optional(),
})
export type UsageChartData = z.infer<typeof UsageChartData>

function renderUsage(d: UsageChartData, o: { width: number; height: number }): FigureResult {
  const title = d.title ?? `${d.drugClass}: removals by hour, ${d.user} against peers`
  const hour = (v: number[]) => v.map((y, x) => ({ x, y }))
  const base = timeSeriesKind.render(
    {
      title,
      xLabel: 'Hour of day (0 to 23)',
      yLabel: 'Removals in the period',
      unit: '',
      series: [
        { name: d.user, points: hour(d.byHour) },
        { name: 'Peer median', points: hour(d.peerMedianByHour) },
        ...(d.peerMaxByHour ? [{ name: 'Peer maximum', points: hour(d.peerMaxByHour) }] : []),
      ],
      thresholds: [],
      annotations: [],
    } as never,
    o,
  )
  const total = (v: number[]) => v.reduce((a, b) => a + b, 0)
  const peakHour = d.byHour.indexOf(Math.max(...d.byHour))
  const above = d.byHour.flatMap((v, h) =>
    v > 2 * Math.max(d.peerMedianByHour[h]!, 0.5) ? [h] : [],
  )
  const summary =
    `${title}${d.period ? ` (${d.period})` : ''}: ${d.user} made ${fmt(total(d.byHour))} removals against a peer median total of ${fmt(total(d.peerMedianByHour))}. ` +
    `${d.user} peaks at hour ${peakHour} with ${fmt(d.byHour[peakHour]!)} removals. ` +
    (above.length
      ? `More than twice the peer median in ${above.length} hours (${above.join(', ')}).`
      : 'Never more than twice the peer median in an hour.') +
    ' A pattern in data is not proof of diversion; simulated.'
  return {
    svg: base.svg,
    summary,
    table: {
      caption: `${d.drugClass}: removals by hour`,
      columns: ['Hour', d.user, 'Peer median', ...(d.peerMaxByHour ? ['Peer maximum'] : [])],
      rows: d.byHour.map((v, h) => [
        String(h),
        fmt(v),
        fmt(d.peerMedianByHour[h]!),
        ...(d.peerMaxByHour ? [fmt(d.peerMaxByHour[h]!)] : []),
      ]),
    },
  }
}

export const usageChartKind: FigureKind<UsageChartData> = {
  kind: 'pharmacy_usage_chart',
  schema: UsageChartData,
  render: renderUsage,
  defaultHeight: 360,
}
