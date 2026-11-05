// time_series: one or more series over time (or any numeric x), horizontal thresholds and
// numbered annotations. Series differ by color, dash and marker; annotations are numbered and
// keyed under the chart so no label sits on top of the data.
import { line } from 'd3-shape'
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { makeXAxis, sameXKind, XValue, xLabel } from './axis'
import { AXIS, GRID, INK, MUTED, seriesStyle } from './theme'
import { fmt, frame, heading, legend, marker, n, text, wrap } from './svg'
import type { FigureKind, FigureResult, FigureTable } from './types'

const Point = z.object({ x: XValue, y: z.number().finite() })

export const TimeSeriesData = z
  .object({
    title: z.string().max(200).optional(),
    xLabel: z.string().max(80).optional(),
    yLabel: z.string().max(80).optional(),
    unit: z.string().max(20).optional(),
    series: z
      .array(z.object({ name: z.string().min(1).max(80), points: z.array(Point).min(1).max(2000) }))
      .min(1)
      .max(6),
    thresholds: z
      .array(z.object({ value: z.number().finite(), label: z.string().min(1).max(80) }))
      .max(6)
      .default([]),
    annotations: z
      .array(z.object({ x: XValue, label: z.string().min(1).max(160) }))
      .max(9)
      .default([]),
  })
  .refine(
    (d) =>
      sameXKind([
        ...d.series.flatMap((s) => s.points.map((p) => p.x)),
        ...d.annotations.map((a) => a.x),
      ]),
    { message: 'x values must be all numbers or all date-time strings' },
  )
export type TimeSeriesData = z.infer<typeof TimeSeriesData>

const M = { left: 58, right: 24 }

function summarize(d: TimeSeriesData): string {
  const unit = d.unit ? ` ${d.unit}` : ''
  const parts = [
    `${d.title ?? 'Time series'}: line chart of ${d.series.length} series` +
      `${d.yLabel ? ` of ${d.yLabel}` : ''}.`,
  ]
  for (const s of d.series) {
    const pts = [...s.points].sort((a, b) => cmp(a.x, b.x))
    const ys = pts.map((p) => p.y)
    const first = pts[0]!
    const last = pts[pts.length - 1]!
    const peak = pts[ys.indexOf(Math.max(...ys))]!
    parts.push(
      `${s.name} goes from ${fmt(first.y)}${unit} at ${xLabel(first.x)} to ${fmt(last.y)}${unit} ` +
        `at ${xLabel(last.x)}, peaking at ${fmt(peak.y)}${unit} at ${xLabel(peak.x)}.`,
    )
    for (const t of d.thresholds) {
      const hit = pts.find((p) => p.y >= t.value)
      if (hit)
        parts.push(`${s.name} reaches ${t.label} (${fmt(t.value)}${unit}) at ${xLabel(hit.x)}.`)
    }
  }
  for (const [i, a] of d.annotations.entries())
    parts.push(`Note ${i + 1} at ${xLabel(a.x)}: ${a.label}.`)
  return parts.join(' ')
}

const cmp = (a: XValue, b: XValue): number =>
  (typeof a === 'number' ? a : Date.parse(a)) - (typeof b === 'number' ? b : Date.parse(b))

function tableOf(d: TimeSeriesData): FigureTable {
  const keys = new Map<number, XValue>()
  for (const s of d.series)
    for (const p of s.points) keys.set(typeof p.x === 'number' ? p.x : Date.parse(p.x), p.x)
  const xs = [...keys.entries()].sort((a, b) => a[0] - b[0])
  const lookup = d.series.map(
    (s) => new Map(s.points.map((p) => [typeof p.x === 'number' ? p.x : Date.parse(p.x), p.y])),
  )
  const unit = d.unit ? ` (${d.unit})` : ''
  return {
    caption: d.title,
    columns: [d.xLabel ?? 'Time', ...d.series.map((s) => `${s.name}${unit}`)],
    rows: xs.map(([k, x]) => [xLabel(x), ...lookup.map((m) => (m.has(k) ? fmt(m.get(k)!) : ''))]),
  }
}

function render(d: TimeSeriesData, o: { width: number; height: number }): FigureResult {
  const summary = summarize(d)
  const keyLines = d.annotations.length
  const lg = legend(
    d.series.map((s, i) => ({
      name: s.name,
      swatch: (x, y) => {
        const st = seriesStyle(i)
        return (
          `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + 26)}" y2="${n(y)}" stroke="${st.color}" stroke-width="2.5"` +
          `${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>` +
          marker(st.marker, x + 13, y, st.color)
        )
      },
    })),
    M.left,
    d.title ? 42 : 14,
    o.width - M.right,
  )
  const top = (d.title ? 42 : 14) + lg.height + 6
  const bottom = 44 + keyLines * 16
  const plotH = o.height - top - bottom
  const plotR = o.width - M.right

  const allY = [
    ...d.series.flatMap((s) => s.points.map((p) => p.y)),
    ...d.thresholds.map((t) => t.value),
  ]
  const yScale = scaleLinear()
    .domain([Math.min(0, ...allY), Math.max(...allY)])
    .nice()
    .range([top + plotH, top])
  const xs = [
    ...d.series.flatMap((s) => s.points.map((p) => p.x)),
    ...d.annotations.map((a) => a.x),
  ]
  const x = makeXAxis(xs, M.left, plotR)

  let body = heading(d.title, M.left)
  body += lg.svg
  for (const t of yScale.ticks(5)) {
    const y = yScale(t)
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(y)}" y2="${n(y)}" stroke="${GRID}" stroke-width="1"/>`
    body += text(M.left - 8, y + 4, fmt(t), { size: 11, anchor: 'end', fill: MUTED })
  }
  body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(top + plotH)}" y2="${n(top + plotH)}" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const t of x.ticks) {
    body += `<line x1="${n(t.pos)}" x2="${n(t.pos)}" y1="${n(top + plotH)}" y2="${n(top + plotH + 5)}" stroke="${AXIS}"/>`
    body += text(t.pos, top + plotH + 18, t.label, { size: 11, anchor: 'middle', fill: MUTED })
  }
  if (d.xLabel)
    body += text((M.left + plotR) / 2, top + plotH + 36, d.xLabel, {
      size: 12,
      anchor: 'middle',
      fill: MUTED,
    })
  if (d.yLabel || d.unit)
    body += text(0, 0, [d.yLabel, d.unit && `(${d.unit})`].filter(Boolean).join(' '), {
      size: 12,
      anchor: 'middle',
      fill: MUTED,
      extra: `transform="translate(14 ${n(top + plotH / 2)}) rotate(-90)"`,
    })

  for (const t of d.thresholds) {
    const y = yScale(t.value)
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(y)}" y2="${n(y)}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="3 3"/>`
    body += text(M.left + 6, y - 5, `${t.label} (${fmt(t.value)}${d.unit ? ' ' + d.unit : ''})`, {
      size: 11,
      weight: 600,
      anchor: 'start',
    })
  }

  d.series.forEach((s, i) => {
    const st = seriesStyle(i)
    const pts = [...s.points].sort((a, b) => cmp(a.x, b.x))
    const path = line<{ x: XValue; y: number }>()
      .x((p) => x.position(p.x))
      .y((p) => yScale(p.y))(pts)
    body += `<path d="${path}" fill="none" stroke="${st.color}" stroke-width="2.5" stroke-linejoin="round"${
      st.dash ? ` stroke-dasharray="${st.dash}"` : ''
    }/>`
    const every = Math.max(1, Math.ceil(pts.length / 12))
    pts.forEach((p, k) => {
      if (k % every === 0 || k === pts.length - 1)
        body += marker(st.marker, x.position(p.x), yScale(p.y), st.color)
    })
  })

  d.annotations.forEach((a, i) => {
    const px = x.position(a.x)
    body += `<line x1="${n(px)}" x2="${n(px)}" y1="${n(top)}" y2="${n(top + plotH)}" stroke="${INK}" stroke-width="1" stroke-dasharray="1 3"/>`
    body +=
      `<circle cx="${n(px)}" cy="${n(top + 9)}" r="9" fill="${INK}"/>` +
      text(px, top + 13, String(i + 1), {
        size: 11,
        weight: 700,
        fill: '#ffffff',
        anchor: 'middle',
      })
    const key = wrap(
      `${i + 1}. ${xLabel(a.x)}: ${a.label}`,
      Math.floor((plotR - M.left) / (13 * 0.56)),
      1,
    )[0]!
    body += text(M.left, top + plotH + 54 + i * 16, key, { size: 12, fill: INK })
  })

  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Time series',
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: tableOf(d),
  }
}

export const timeSeriesKind: FigureKind<TimeSeriesData> = {
  kind: 'time_series',
  schema: TimeSeriesData,
  render,
}
