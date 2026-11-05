// humanitarian_pipeline (spec 0469 FR-8): stock on hand projected against consumption and the
// shipments on the way, with the break day, the lead time of a reorder and the latest day to
// order. The arithmetic is shared (src/shared/humanitarian/pipeline.ts) and is stated in the
// summary and table, so the picture adds nothing the text does not say.
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { breakDay, daysOfStock, latestOrderDay, stockCurve } from '@shared/humanitarian/pipeline'
import { AXIS, GRID, INK, MUTED, seriesStyle } from '../theme'
import { fmt, frame, heading, marker, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'

export const PipelineData = z.object({
  title: z.string().max(200).optional(),
  commodity: z.string().min(1).max(80),
  unit: z.string().min(1).max(30),
  stockOnHand: z.number().finite().min(0),
  dailyConsumption: z.number().finite().positive(),
  shipments: z
    .array(
      z.object({
        day: z.number().finite().min(0).max(365),
        quantity: z.number().finite().positive(),
        label: z.string().max(60).optional(),
      }),
    )
    .max(12)
    .default([]),
  leadTimeDays: z.number().finite().min(0).max(365),
  horizonDays: z.number().int().min(7).max(365).default(60),
  simulated: z.boolean().default(true),
})
export type PipelineData = z.infer<typeof PipelineData>

const M = { left: 64, right: 24, top: 40, bottom: 56 }

function render(d: PipelineData, o: { width: number; height: number }): FigureResult {
  const input = {
    stockOnHand: d.stockOnHand,
    dailyConsumption: d.dailyConsumption,
    shipments: d.shipments,
  }
  const brk = breakDay(input, d.horizonDays)
  const cover = daysOfStock(d.stockOnHand, d.dailyConsumption)!
  const curve = stockCurve(input, d.horizonDays)
  const lastOrder = brk === undefined ? undefined : latestOrderDay(brk, d.leadTimeDays)
  const maxY = Math.max(1, ...curve.map((p) => p.stock))
  const x = scaleLinear()
    .domain([0, d.horizonDays])
    .range([M.left, o.width - M.right])
  const y = scaleLinear()
    .domain([0, maxY])
    .nice()
    .range([o.height - M.bottom, M.top])
  const title = d.title ?? `${d.commodity} pipeline`
  let body = heading(title, M.left)
  for (const t of y.ticks(5)) {
    body += `<line x1="${M.left}" x2="${n(o.width - M.right)}" y1="${n(y(t))}" y2="${n(y(t))}" stroke="${GRID}"/>`
    body += text(M.left - 8, y(t) + 4, fmt(t), { size: 11, anchor: 'end', fill: MUTED })
  }
  for (const t of x.ticks(8)) {
    body += `<line x1="${n(x(t))}" x2="${n(x(t))}" y1="${o.height - M.bottom}" y2="${o.height - M.bottom + 5}" stroke="${AXIS}"/>`
    body += text(x(t), o.height - M.bottom + 19, `Day ${fmt(t)}`, {
      size: 11,
      anchor: 'middle',
      fill: MUTED,
    })
  }
  body += `<line x1="${M.left}" x2="${n(o.width - M.right)}" y1="${n(y(0))}" y2="${n(y(0))}" stroke="${AXIS}" stroke-width="1.5"/>`
  if (brk !== undefined && lastOrder !== undefined) {
    const a = Math.max(0, lastOrder)
    body += `<rect x="${n(x(a))}" y="${M.top}" width="${n(x(brk) - x(a))}" height="${n(y(0) - M.top)}" fill="#f1d9d9" fill-opacity="0.7"/>`
    body += text(x(a) + 4, M.top + 14, `Reorder lead time ${fmt(d.leadTimeDays)} days`, {
      size: 11,
      fill: INK,
    })
    body += `<line x1="${n(x(brk))}" x2="${n(x(brk))}" y1="${M.top}" y2="${n(y(0))}" stroke="#b3121b" stroke-width="2.5" stroke-dasharray="6 3"/>`
    body += text(x(brk) - 4, M.top + 30, `Break: day ${fmt(brk)}`, {
      size: 12,
      weight: 700,
      anchor: 'end',
      fill: '#b3121b',
    })
  }
  const path = curve.map((p, i) => `${i ? 'L' : 'M'}${n(x(p.day))} ${n(y(p.stock))}`).join('')
  body += `<path d="${path}" fill="none" stroke="${seriesStyle(0).color}" stroke-width="2.5"/>`
  for (const s of d.shipments.filter((s) => brk === undefined || s.day <= brk)) {
    const py = y(curve.filter((p) => p.day === s.day).at(-1)?.stock ?? 0)
    body += marker('triangle', x(s.day), py, '#1b7a3a')
    body += text(x(s.day), py - 10, `+${fmt(s.quantity)}`, {
      size: 11,
      weight: 700,
      anchor: 'middle',
    })
  }
  body += text(0, 0, `Stock (${d.unit})`, {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
    extra: `transform="translate(14 ${n((M.top + o.height - M.bottom) / 2)}) rotate(-90)"`,
  })
  const summary =
    `${title}: ${fmt(d.stockOnHand)} ${d.unit} on hand at ${fmt(d.dailyConsumption)} ${d.unit} a day is ${fmt(cover)} days of stock. ` +
    (d.shipments.length
      ? `Shipments: ${d.shipments.map((s) => `${fmt(s.quantity)} ${d.unit} on day ${fmt(s.day)}`).join('; ')}. `
      : 'No shipments are due. ') +
    (brk === undefined
      ? `Stock does not run out within ${d.horizonDays} days.`
      : `Stock runs out on day ${fmt(brk)}. A reorder takes ${fmt(d.leadTimeDays)} days, so ` +
        (lastOrder! >= 0
          ? `the latest day to order is day ${fmt(lastOrder!)}.`
          : `the latest day to order was ${fmt(-lastOrder!)} days ago: any reorder now arrives after the break.`)) +
    (d.simulated ? ' Simulated pipeline.' : '')
  return {
    svg: frame({ ...o, title, summary, body, idKey: JSON.stringify(d) }),
    summary,
    table: {
      caption: title,
      columns: ['Measure', 'Value'],
      rows: [
        ['Stock on hand', `${fmt(d.stockOnHand)} ${d.unit}`],
        ['Daily consumption', `${fmt(d.dailyConsumption)} ${d.unit}`],
        ['Days of stock', fmt(cover)],
        ...d.shipments.map((s) => [
          s.label ?? 'Shipment',
          `${fmt(s.quantity)} ${d.unit}, day ${fmt(s.day)}`,
        ]),
        ['Reorder lead time', `${fmt(d.leadTimeDays)} days`],
        ['Break day', brk === undefined ? `none within ${d.horizonDays} days` : fmt(brk)],
        ['Latest day to order', lastOrder === undefined ? 'not needed' : fmt(lastOrder)],
      ],
    },
  }
}

export const humanitarianPipelineKind: FigureKind<PipelineData> = {
  kind: 'humanitarian_pipeline',
  schema: PipelineData,
  render,
  defaultHeight: 340,
}
