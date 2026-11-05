// bar and stacked_bar: vertical bars with the value written on or above each bar. Stacked
// segments differ by fill pattern as well as color, and carry their own value when they fit.
import { scaleBand, scaleLinear, type ScaleBand, type ScaleLinear } from 'd3-scale'
import { z } from 'zod'
import { AXIS, GRID, INK, MUTED, seriesStyle } from './theme'
import { fmt, frame, hashId, heading, legend, n, patternDef, text, wrap } from './svg'
import type { FigureKind, FigureResult } from './types'

const Common = {
  title: z.string().max(200).optional(),
  yLabel: z.string().max(80).optional(),
  unit: z.string().max(20).optional(),
}

export const BarData = z.object({
  ...Common,
  bars: z
    .array(z.object({ label: z.string().min(1).max(60), value: z.number().finite() }))
    .min(1)
    .max(24),
})
export type BarData = z.infer<typeof BarData>

export const StackedBarData = z
  .object({
    ...Common,
    categories: z.array(z.string().min(1).max(60)).min(1).max(24),
    series: z
      .array(
        z.object({ name: z.string().min(1).max(60), values: z.array(z.number().finite().min(0)) }),
      )
      .min(1)
      .max(6),
  })
  .refine((d) => d.series.every((s) => s.values.length === d.categories.length), {
    message: 'every series needs one value per category',
  })
export type StackedBarData = z.infer<typeof StackedBarData>

const M = { left: 58, right: 20, bottom: 54 }

interface Layout {
  top: number
  plotH: number
  plotR: number
}

function axes(
  d: { title?: string | undefined; yLabel?: string | undefined; unit?: string | undefined },
  labels: string[],
  max: number,
  o: { width: number; height: number },
  top: number,
): {
  body: string
  y: ScaleLinear<number, number>
  band: ScaleBand<string>
  lay: Layout
} {
  const lay: Layout = { top, plotH: o.height - top - M.bottom, plotR: o.width - M.right }
  const y = scaleLinear()
    .domain([0, max])
    .nice()
    .range([top + lay.plotH, top])
  const band = scaleBand<string>().domain(labels).range([M.left, lay.plotR]).padding(0.28)
  let body = ''
  for (const t of y.ticks(5)) {
    const py = y(t)
    body += `<line x1="${M.left}" x2="${n(lay.plotR)}" y1="${n(py)}" y2="${n(py)}" stroke="${GRID}"/>`
    body += text(M.left - 8, py + 4, fmt(t), { size: 11, anchor: 'end', fill: MUTED })
  }
  body += `<line x1="${M.left}" x2="${n(lay.plotR)}" y1="${n(top + lay.plotH)}" y2="${n(top + lay.plotH)}" stroke="${AXIS}" stroke-width="1.5"/>`
  const maxChars = Math.max(6, Math.floor(band.step() / 6.4))
  labels.forEach((l) => {
    const cx = band(l)! + band.bandwidth() / 2
    wrap(l, maxChars, 3).forEach((ln, i) => {
      body += text(cx, top + lay.plotH + 16 + i * 14, ln, { size: 11, anchor: 'middle' })
    })
  })
  if (d.yLabel || d.unit)
    body += text(0, 0, [d.yLabel, d.unit && `(${d.unit})`].filter(Boolean).join(' '), {
      size: 12,
      anchor: 'middle',
      fill: MUTED,
      extra: `transform="translate(14 ${n(top + lay.plotH / 2)}) rotate(-90)"`,
    })
  return { body, y, band, lay }
}

function renderBar(d: BarData, o: { width: number; height: number }): FigureResult {
  const unit = d.unit ? ` ${d.unit}` : ''
  const top = d.title ? 36 : 14
  const labels = d.bars.map((b) => b.label)
  const a = axes(d, labels, Math.max(0, ...d.bars.map((b) => b.value)), o, top)
  const st = seriesStyle(0)
  let body = heading(d.title, M.left) + a.body
  for (const b of d.bars) {
    const x = a.band(b.label)!
    const y0 = a.y(0)
    const y1 = a.y(b.value)
    body += `<rect x="${n(x)}" y="${n(Math.min(y0, y1))}" width="${n(a.band.bandwidth())}" height="${n(Math.abs(y0 - y1))}" fill="${st.color}"/>`
    body += text(x + a.band.bandwidth() / 2, Math.min(y0, y1) - 6, fmt(b.value), {
      size: 12,
      weight: 700,
      anchor: 'middle',
    })
  }
  const top1 = [...d.bars].sort((p, q) => q.value - p.value)[0]!
  const summary =
    `${d.title ?? 'Bar chart'}: bar chart of ${d.bars.length} categories. ` +
    d.bars.map((b) => `${b.label} ${fmt(b.value)}${unit}`).join('; ') +
    `. Highest: ${top1.label}.`
  return {
    svg: frame({ ...o, title: d.title ?? 'Bar chart', summary, body, idKey: JSON.stringify(d) }),
    summary,
    table: {
      caption: d.title,
      columns: ['Category', d.unit ? `Value (${d.unit})` : 'Value'],
      rows: d.bars.map((b) => [b.label, fmt(b.value)]),
    },
  }
}

function renderStacked(d: StackedBarData, o: { width: number; height: number }): FigureResult {
  const unit = d.unit ? ` ${d.unit}` : ''
  const id = hashId(JSON.stringify(d))
  const defs = d.series.map((_, i) => patternDef(`p${id}-${i}`, seriesStyle(i))).join('')
  const totals = d.categories.map((_, ci) => d.series.reduce((s, se) => s + se.values[ci]!, 0))
  const lg = legend(
    d.series.map((s, i) => ({
      name: s.name,
      swatch: (x, y) =>
        `<rect x="${n(x)}" y="${n(y - 7)}" width="26" height="14" fill="url(#p${id}-${i})" stroke="${INK}" stroke-width="0.8"/>`,
    })),
    M.left,
    d.title ? 42 : 14,
    o.width - M.right,
  )
  const top = (d.title ? 42 : 14) + lg.height + 10
  const a = axes(d, d.categories, Math.max(0, ...totals), o, top)
  let body = heading(d.title, M.left) + lg.svg + a.body
  d.categories.forEach((c, ci) => {
    let acc = 0
    const x = a.band(c)!
    d.series.forEach((s, si) => {
      const v = s.values[ci]!
      const yTop = a.y(acc + v)
      const yBot = a.y(acc)
      acc += v
      if (v <= 0) return
      const h = yBot - yTop
      body += `<rect x="${n(x)}" y="${n(yTop)}" width="${n(a.band.bandwidth())}" height="${n(h)}" fill="url(#p${id}-${si})" stroke="#ffffff" stroke-width="1"/>`
      if (h >= 18) {
        const cx = x + a.band.bandwidth() / 2
        body += `<rect x="${n(cx - 14)}" y="${n(yTop + h / 2 - 8)}" width="28" height="16" rx="3" fill="#ffffff" fill-opacity="0.92"/>`
        body += text(cx, yTop + h / 2 + 4, fmt(v), { size: 11, weight: 700, anchor: 'middle' })
      }
    })
    body += text(x + a.band.bandwidth() / 2, a.y(totals[ci]!) - 6, fmt(totals[ci]!), {
      size: 12,
      weight: 700,
      anchor: 'middle',
    })
  })
  const summary =
    `${d.title ?? 'Stacked bar chart'}: stacked bar chart of ${d.categories.length} categories split into ${d.series.map((s) => s.name).join(', ')}. ` +
    d.categories
      .map(
        (c, ci) =>
          `${c} total ${fmt(totals[ci]!)}${unit} (${d.series.map((s) => `${s.name} ${fmt(s.values[ci]!)}`).join(', ')})`,
      )
      .join('; ') +
    '.'
  return {
    svg: frame({ ...o, title: d.title ?? 'Stacked bar chart', summary, defs, body, idKey: id }),
    summary,
    table: {
      caption: d.title,
      columns: ['Category', ...d.series.map((s) => s.name), 'Total'],
      rows: d.categories.map((c, ci) => [
        c,
        ...d.series.map((s) => fmt(s.values[ci]!)),
        fmt(totals[ci]!),
      ]),
    },
  }
}

export const barKind: FigureKind<BarData> = { kind: 'bar', schema: BarData, render: renderBar }
export const stackedBarKind: FigureKind<StackedBarData> = {
  kind: 'stacked_bar',
  schema: StackedBarData,
  render: renderStacked,
}
