// rain_stage: rainfall bars above a river stage line on one time axis, so the response of the
// river to the rain is visible (spec 0454 FR-5).
import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import { z } from 'zod'
import { makeXAxis } from '../axis'
import { fmt, frame, heading, marker, n, text } from '../svg'
import { AXIS, GRID, INK, MUTED, seriesStyle } from '../theme'
import type { FigureKind, FigureResult } from '../types'
import { GaugeSchema, IsoTime, TimedValue, hashKey, localTime, thin, withUnit } from './common'

export const RainStageData = z.object({
  title: z.string().max(200).optional(),
  gauge: GaugeSchema,
  /** Rainfall in inches for each period ending at `time` (hourly is typical). */
  rain: z
    .array(z.object({ time: IsoTime, inches: z.number().finite().min(0) }))
    .min(1)
    .max(500),
  stage: z.array(TimedValue).min(1).max(1500),
  floodStage: z.number().finite().optional(),
  /** Length of one rainfall period in hours, to size the bars. */
  periodHours: z.number().positive().max(24).default(1),
})
export type RainStageData = z.infer<typeof RainStageData>

const M = { left: 64, right: 24, bottom: 50 }
const t = (iso: string): number => Date.parse(iso)

function render(d: RainStageData, o: { width: number; height: number }): FigureResult {
  const u = d.gauge.unit
  const total = d.rain.reduce((s, r) => s + r.inches, 0)
  const peakRain = d.rain.reduce((a, b) => (b.inches > a.inches ? b : a))
  const peakStage = d.stage.reduce((a, b) => (b.value > a.value ? b : a))
  const summary =
    `${d.title ?? 'Rainfall and stage'}: ${fmt(total)} inches of rain in ${d.rain.length} periods; the heaviest period ends ${localTime(peakRain.time, d.gauge.timeZone)} with ${fmt(peakRain.inches)} inches. ` +
    `${d.gauge.name} peaks at ${withUnit(peakStage.value, u)} at ${localTime(peakStage.time, d.gauge.timeZone)}` +
    (d.floodStage !== undefined
      ? `; flood stage is ${withUnit(d.floodStage, u)} and the stage ${peakStage.value >= d.floodStage ? 'reaches or passes it' : 'stays below it'}.`
      : '.')

  const top = d.title ? 58 : 30
  const rainH = (o.height - top - M.bottom) * 0.32
  const gap = 44
  const stageTop = top + rainH + gap
  const plotB = o.height - M.bottom
  const plotR = o.width - M.right
  const x = makeXAxis([...d.rain.map((r) => r.time), ...d.stage.map((s) => s.time)], M.left, plotR)
  const barW = Math.max(2, (plotR - M.left) / Math.max(d.rain.length, 1) - 2)
  const ry = scaleLinear()
    .domain([0, Math.max(...d.rain.map((r) => r.inches), 0.5)])
    .nice()
    .range([top + rainH, top])
  const sVals = [
    ...d.stage.map((s) => s.value),
    ...(d.floodStage !== undefined ? [d.floodStage] : []),
  ]
  const sy = scaleLinear()
    .domain([Math.min(...sVals), Math.max(...sVals)])
    .nice()
    .range([plotB, stageTop])

  let body = heading(d.title, M.left)
  body += text(M.left, top - 3, 'Rainfall (inches per period)', { size: 11, fill: MUTED })
  for (const tk of ry.ticks(3)) {
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(ry(tk))}" y2="${n(ry(tk))}" stroke="${GRID}"/>`
    body += text(M.left - 8, ry(tk) + 4, fmt(tk), { size: 11, anchor: 'end', fill: MUTED })
  }
  const rs = seriesStyle(0)
  for (const r of d.rain) {
    const px = x.position(r.time)
    body += `<rect x="${n(px - barW / 2)}" y="${n(ry(r.inches))}" width="${n(barW)}" height="${n(ry(0) - ry(r.inches))}" fill="${rs.color}"/>`
  }
  body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(ry(0))}" y2="${n(ry(0))}" stroke="${AXIS}"/>`
  body += text(M.left, stageTop - 12, `River ${u === 'ft' ? 'stage' : 'flow'} (${u})`, {
    size: 11,
    fill: MUTED,
  })
  for (const tk of sy.ticks(4)) {
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(sy(tk))}" y2="${n(sy(tk))}" stroke="${GRID}"/>`
    body += text(M.left - 8, sy(tk) + 4, fmt(tk), { size: 11, anchor: 'end', fill: MUTED })
  }
  if (d.floodStage !== undefined) {
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(sy(d.floodStage))}" y2="${n(sy(d.floodStage))}" stroke="${INK}" stroke-width="1.6" stroke-dasharray="6 4"/>`
    body += text(M.left + 6, sy(d.floodStage) + 15, `Flood stage ${withUnit(d.floodStage, u)}`, {
      size: 11,
      weight: 600,
    })
  }
  const ss = seriesStyle(1)
  const sorted = [...d.stage].sort((a, b) => t(a.time) - t(b.time))
  body += `<path d="${
    line<TimedValue>()
      .x((p) => x.position(p.time))
      .y((p) => sy(p.value))(sorted) ?? ''
  }" fill="none" stroke="${ss.color}" stroke-width="2.6" stroke-linejoin="round"/>`
  const every = Math.max(1, Math.ceil(sorted.length / 10))
  sorted.forEach((p, k) => {
    if (k % every === 0 || k === sorted.length - 1)
      body += marker(ss.marker, x.position(p.time), sy(p.value), ss.color)
  })
  body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(plotB)}" y2="${n(plotB)}" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const tk of x.ticks) {
    body += `<line x1="${n(tk.pos)}" x2="${n(tk.pos)}" y1="${n(plotB)}" y2="${n(plotB + 5)}" stroke="${AXIS}"/>`
    body += text(tk.pos, plotB + 18, tk.label, { size: 11, anchor: 'middle', fill: MUTED })
  }
  body += text((M.left + plotR) / 2, plotB + 38, `Time (${d.gauge.timeZone ?? 'UTC'})`, {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
  })

  const rows = [
    ...d.rain.map((r) => [r.time, 'Rain', `${fmt(r.inches)} in`] as [string, string, string]),
    ...d.stage.map(
      (s) =>
        [s.time, u === 'ft' ? 'Stage' : 'Flow', withUnit(s.value, u)] as [string, string, string],
    ),
  ].sort((a, b) => t(a[0]) - t(b[0]))
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Rainfall and stage',
      summary,
      body,
      idKey: hashKey(d),
    }),
    summary,
    table: {
      caption: d.title ?? `${d.gauge.name}: rainfall and stage`,
      columns: ['Time', 'Measure', 'Value'],
      rows: thin(rows, 60).map(([time, kind, v]) => [localTime(time, d.gauge.timeZone), kind, v]),
    },
  }
}

export const rainStageKind: FigureKind<RainStageData> = {
  kind: 'rain_stage',
  schema: RainStageData,
  render,
  defaultHeight: 440,
}
