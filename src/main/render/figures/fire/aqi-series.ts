// wildfire_aqi_series (spec 0461 FR-7): the Air Quality Index over time at one or more places,
// drawn over the six EPA category bands with the category names written in the bands, and local
// thresholds (a school district's own AQI trigger) as dashed lines. Category breakpoints are the
// AQI ranges 0-50, 51-100, 101-150, 151-200, 201-300 and 301 and above.
import { line } from 'd3-shape'
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { aqiCategory } from '../../../toolkits/wildfire/lint-air'
import { makeXAxis, sameXKind, toNumber, XValue, xLabel } from '../axis'
import { AXIS, INK, MUTED, seriesStyle } from '../theme'
import { fmt, frame, heading, legend, marker, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'

const BANDS: ReadonlyArray<{ name: string; from: number; to: number; fill: string }> = [
  { name: 'Good', from: 0, to: 50, fill: '#d7f0d9' },
  { name: 'Moderate', from: 51, to: 100, fill: '#fff3b0' },
  { name: 'Unhealthy for Sensitive Groups', from: 101, to: 150, fill: '#ffd9a8' },
  { name: 'Unhealthy', from: 151, to: 200, fill: '#f6b8b3' },
  { name: 'Very Unhealthy', from: 201, to: 300, fill: '#dcc6ee' },
  { name: 'Hazardous', from: 301, to: 500, fill: '#e3b7c0' },
]

export const AqiSeriesData = z
  .object({
    title: z.string().max(200).optional(),
    basis: z.enum(['historical', 'simulated']),
    series: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          points: z
            .array(z.object({ x: XValue, aqi: z.number().finite().min(0).max(500) }))
            .min(1)
            .max(2000),
        }),
      )
      .min(1)
      .max(4),
    thresholds: z
      .array(z.object({ value: z.number().min(0).max(500), label: z.string().min(1).max(80) }))
      .max(4)
      .default([]),
  })
  .refine((d) => sameXKind(d.series.flatMap((s) => s.points.map((p) => p.x))), {
    message: 'x values must be all numbers or all date-time strings',
  })
export type AqiSeriesData = z.infer<typeof AqiSeriesData>

const M = { left: 58, right: 16 }

function render(d: AqiSeriesData, o: { width: number; height: number }): FigureResult {
  const top = (d.title ? 40 : 12) + 28
  const plotB = o.height - 48
  const plotR = o.width - M.right
  const peak = Math.max(...d.series.flatMap((s) => s.points.map((p) => p.aqi)))
  const yMax = BANDS.find((b) => peak <= b.to)?.to ?? 500
  const y = scaleLinear().domain([0, yMax]).range([plotB, top])
  const xs = d.series.flatMap((s) => s.points.map((p) => p.x))
  const x = makeXAxis(xs, M.left, plotR)

  let body = heading(d.title, M.left)
  body += legend(
    d.series.map((s, i) => ({
      name: s.name,
      swatch: (sx, sy) => {
        const st = seriesStyle(i)
        return (
          `<line x1="${n(sx)}" y1="${n(sy)}" x2="${n(sx + 26)}" y2="${n(sy)}" stroke="${st.color}" stroke-width="2.5"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>` +
          marker(st.marker, sx + 13, sy, st.color)
        )
      },
    })),
    M.left,
    d.title ? 42 : 14,
    plotR,
  ).svg
  for (const b of BANDS) {
    if (b.from >= yMax) continue
    const y1 = y(Math.min(b.to, yMax))
    const y0 = y(b.from === 0 ? 0 : b.from - 1)
    body += `<rect x="${M.left}" y="${n(y1)}" width="${n(plotR - M.left)}" height="${n(y0 - y1)}" fill="${b.fill}"/>`
    if (y0 - y1 >= 14)
      body += text(plotR - 6, y1 + 14, `${b.name} (${b.from}-${b.to === 500 ? '500' : b.to})`, {
        size: 11,
        weight: 600,
        anchor: 'end',
        fill: '#2a2118',
      })
  }
  for (const t of y.ticks(5)) {
    body += text(M.left - 8, y(t) + 4, fmt(t), { size: 11, anchor: 'end', fill: MUTED })
  }
  body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(plotB)}" y2="${n(plotB)}" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const t of x.ticks) {
    body += `<line x1="${n(t.pos)}" x2="${n(t.pos)}" y1="${n(plotB)}" y2="${n(plotB + 5)}" stroke="${AXIS}"/>`
    body += text(t.pos, plotB + 18, t.label, { size: 11, anchor: 'middle', fill: MUTED })
  }
  body += text(0, 0, 'AQI', {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
    extra: `transform="translate(14 ${n((top + plotB) / 2)}) rotate(-90)"`,
  })
  for (const t of d.thresholds) {
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(y(t.value))}" y2="${n(y(t.value))}" stroke="${INK}" stroke-width="1.8" stroke-dasharray="5 4"/>`
    body += text(M.left + 6, y(t.value) - 5, `${t.label} (AQI ${fmt(t.value)})`, {
      size: 11,
      weight: 700,
    })
  }
  d.series.forEach((s, i) => {
    const st = seriesStyle(i)
    const pts = [...s.points].sort((a, b) => toNumber(a.x) - toNumber(b.x))
    const path = line<{ x: XValue; aqi: number }>()
      .x((p) => x.position(p.x))
      .y((p) => y(p.aqi))(pts)
    body += `<path d="${path}" fill="none" stroke="${st.color}" stroke-width="2.6" stroke-linejoin="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>`
    const every = Math.max(1, Math.ceil(pts.length / 12))
    pts.forEach((p, k) => {
      if (k % every === 0 || k === pts.length - 1)
        body += marker(st.marker, x.position(p.x), y(p.aqi), st.color)
    })
  })

  const parts = [
    `${d.title ?? 'Air Quality Index'}: line chart of AQI at ${d.series.length} place${d.series.length === 1 ? '' : 's'} over the EPA category bands.`,
  ]
  for (const s of d.series) {
    const pts = [...s.points].sort((a, b) => toNumber(a.x) - toNumber(b.x))
    const max = pts.reduce((a, p) => (p.aqi > a.aqi ? p : a), pts[0]!)
    parts.push(
      `${s.name} peaks at AQI ${Math.round(max.aqi)} (${aqiCategory(Math.round(max.aqi))}) at ${xLabel(max.x)}.`,
    )
    for (const t of d.thresholds) {
      const hit = pts.find((p) => p.aqi >= t.value)
      parts.push(
        hit
          ? `${s.name} reaches ${t.label} (AQI ${fmt(t.value)}) at ${xLabel(hit.x)}.`
          : `${s.name} never reaches ${t.label} (AQI ${fmt(t.value)}).`,
      )
    }
  }
  parts.push(
    d.basis === 'simulated'
      ? 'Simulated values from a simple smoke rule, not measurements.'
      : 'Historical readings.',
  )
  const summary = parts.join(' ')
  const keys = new Map<number, XValue>()
  for (const s of d.series) for (const p of s.points) keys.set(toNumber(p.x), p.x)
  const order = [...keys.entries()].sort((a, b) => a[0] - b[0])
  const lookup = d.series.map((s) => new Map(s.points.map((p) => [toNumber(p.x), p.aqi])))
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Air Quality Index',
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Time', ...d.series.flatMap((s) => [`${s.name} AQI`, `${s.name} category`])],
      rows: order.map(([k, xv]) => [
        xLabel(xv),
        ...lookup.flatMap((m) => {
          const v = m.get(k)
          return v === undefined ? ['', ''] : [String(Math.round(v)), aqiCategory(Math.round(v))]
        }),
      ]),
    },
  }
}

export const aqiSeriesKind: FigureKind<AqiSeriesData> = {
  kind: 'wildfire_aqi_series',
  schema: AqiSeriesData,
  render,
}
