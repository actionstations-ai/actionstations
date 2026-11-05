// space_gnss_error: GNSS horizontal error, satellites tracked and timing holdover remaining as
// stacked panels on one UTC time axis, with timing alarms marked and numbered in words (spec 0468
// FR-5). The model that makes simulated series is labeled, and the figure says so.
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { makeXAxis } from '../axis'
import { fmt, frame, heading, marker, n, text } from '../svg'
import { INK, MUTED, seriesStyle } from '../theme'
import type { FigureKind, FigureResult } from '../types'
import {
  IsoTime,
  Title,
  bottomAxis,
  hashKey,
  leftTicks,
  pathOf,
  simulatedStamp,
  thin,
  utcShort,
} from './common'

const Point = z.object({ time: IsoTime, value: z.number().finite() })

export const GnssErrorData = z.object({
  title: Title,
  /** Receiver class the series is for, written as the project names it. */
  receiver: z.string().max(120).optional(),
  /** Horizontal position error in meters. */
  error: z
    .array(Point.refine((p) => p.value >= 0, 'error cannot be negative'))
    .min(1)
    .max(3000),
  satellites: z
    .array(Point.refine((p) => p.value >= 0, 'count cannot be negative'))
    .max(3000)
    .default([]),
  /** Timing holdover remaining in hours. */
  holdoverHours: z
    .array(Point.refine((p) => p.value >= 0, 'holdover cannot be negative'))
    .max(3000)
    .default([]),
  errorLimitM: z.number().finite().positive().optional(),
  alarms: z
    .array(z.object({ time: IsoTime, label: z.string().min(1).max(80) }))
    .max(8)
    .default([]),
  simulated: z.boolean().default(false),
})
export type GnssErrorData = z.infer<typeof GnssErrorData>

const M = { left: 66, right: 24, bottom: 54 }

interface PanelDef {
  name: string
  unit: string
  points: z.infer<typeof Point>[]
  step: boolean
  limit?: number
  limitLabel?: string
}

function render(d: GnssErrorData, o: { width: number; height: number }): FigureResult {
  const sort = (a: z.infer<typeof Point>[]) =>
    [...a].sort((p, q) => Date.parse(p.time) - Date.parse(q.time))
  const panels: PanelDef[] = [
    {
      name: 'Horizontal error',
      unit: 'm',
      points: sort(d.error),
      step: false,
      limit: d.errorLimitM,
      limitLabel: d.errorLimitM ? `Limit ${fmt(d.errorLimitM)} m` : undefined,
    },
  ]
  if (d.satellites.length)
    panels.push({
      name: 'Satellites tracked',
      unit: 'satellites',
      points: sort(d.satellites),
      step: true,
    })
  if (d.holdoverHours.length)
    panels.push({
      name: 'Holdover remaining',
      unit: 'h',
      points: sort(d.holdoverHours),
      step: false,
    })

  const top = d.title ? 44 : 22
  const plotB = o.height - M.bottom
  const plotR = o.width - M.right
  const gap = 34
  const ph = (plotB - top - gap * (panels.length - 1)) / panels.length
  const times = [
    ...panels.flatMap((p) => p.points.map((q) => q.time)),
    ...d.alarms.map((a) => a.time),
  ]
  const x = makeXAxis(times, M.left, plotR)

  let body = heading(d.title ?? 'GNSS error and timing', M.left)
  panels.forEach((p, i) => {
    const t0 = top + i * (ph + gap)
    const vals = [...p.points.map((q) => q.value), ...(p.limit ? [p.limit] : []), 0]
    const y = scaleLinear()
      .domain([0, Math.max(...vals)])
      .nice()
      .range([t0 + ph, t0 + 4])
    body += text(M.left, t0 - 6, `${p.name} (${p.unit})`, { size: 11, weight: 700, fill: MUTED })
    body += leftTicks(
      y.ticks(3).map((v) => ({ y: y(v), label: fmt(v) })),
      M.left,
      plotR,
    )
    if (p.limit)
      body +=
        `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(y(p.limit))}" y2="${n(y(p.limit))}" stroke="${INK}" stroke-width="1.6" stroke-dasharray="6 4"/>` +
        text(plotR - 4, y(p.limit) - 5, p.limitLabel ?? '', {
          size: 11,
          weight: 600,
          anchor: 'end',
        })
    const st = seriesStyle(i)
    const pts: [number, number][] = []
    p.points.forEach((q, k) => {
      const px = x.position(q.time)
      if (p.step && k > 0) pts.push([px, pts[pts.length - 1]![1]])
      pts.push([px, y(q.value)])
    })
    body += `<path d="${pathOf(pts)}" fill="none" stroke="${st.color}" stroke-width="2.2" stroke-linejoin="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>`
    const every = Math.max(1, Math.ceil(p.points.length / 8))
    p.points.forEach((q, k) => {
      if (k % every === 0 || k === p.points.length - 1)
        body += marker(st.marker, x.position(q.time), y(q.value), st.color)
    })
  })
  const alarms = [...d.alarms].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  alarms.forEach((a, i) => {
    const px = x.position(a.time)
    body += `<line x1="${n(px)}" x2="${n(px)}" y1="${n(top)}" y2="${n(plotB)}" stroke="${INK}" stroke-width="1.4" stroke-dasharray="2 3"/>`
    body += text(
      px + (px > plotR - 190 ? -6 : 6),
      top + 12 + (i % 3) * 13,
      `${i + 1}. ${a.label}`,
      {
        size: 11,
        weight: 700,
        anchor: px > plotR - 190 ? 'end' : 'start',
      },
    )
  })
  body += bottomAxis(x, M.left, plotR, plotB)
  if (d.simulated) body += simulatedStamp(o.width - 10, 20)

  const maxErr = d.error.reduce((a, b) => (b.value > a.value ? b : a))
  const over = d.errorLimitM ? sort(d.error).find((p) => p.value > d.errorLimitM!) : undefined
  const minSats = d.satellites.length
    ? d.satellites.reduce((a, b) => (b.value < a.value ? b : a))
    : undefined
  const minHold = d.holdoverHours.length
    ? d.holdoverHours.reduce((a, b) => (b.value < a.value ? b : a))
    : undefined
  const summary =
    `${d.title ?? 'GNSS error and timing'}${d.simulated ? ' (simulated)' : ''}${d.receiver ? `, receiver class: ${d.receiver}` : ''}: ` +
    `horizontal error peaks at ${fmt(maxErr.value)} m at ${utcShort(maxErr.time)}` +
    (over ? `; it first passes the ${fmt(d.errorLimitM!)} m limit at ${utcShort(over.time)}` : '') +
    '. ' +
    (minSats
      ? `The fewest satellites tracked is ${fmt(minSats.value)} at ${utcShort(minSats.time)}. `
      : '') +
    (minHold
      ? `Holdover remaining is lowest at ${fmt(minHold.value)} hours at ${utcShort(minHold.time)}. `
      : '') +
    (alarms.length
      ? `Timing alarms: ${alarms.map((a, i) => `${i + 1}. ${a.label} at ${utcShort(a.time)}`).join('; ')}.`
      : 'No timing alarms are marked.')
  const times2 = sort(d.error).map((p) => p.time)
  /** The last reading at or before a time, so series that sample at other times still line up. */
  const at = (arr: z.infer<typeof Point>[], t: string): string => {
    const hit = sort(arr)
      .filter((p) => Date.parse(p.time) <= Date.parse(t))
      .at(-1)
    return hit ? fmt(hit.value) : ''
  }
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'GNSS error and timing',
      summary: summary.trim(),
      body,
      idKey: hashKey(d),
    }),
    summary: summary.trim(),
    table: {
      caption: d.title ?? 'GNSS error and timing',
      columns: ['Time', 'Horizontal error (m)', 'Satellites tracked', 'Holdover remaining (h)'],
      rows: thin(times2, 48).map((t) => [
        utcShort(t),
        at(d.error, t),
        at(d.satellites, t),
        at(d.holdoverHours, t),
      ]),
    },
  }
}

export const gnssErrorKind: FigureKind<GnssErrorData> = {
  kind: 'space_gnss_error',
  schema: GnssErrorData,
  render,
  defaultHeight: 520,
}
