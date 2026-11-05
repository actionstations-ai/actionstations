// table: a plain data table drawn as an image, for injects that are "a table of numbers" (a
// readings sheet, a count by hour). It sizes itself to its rows. Numbers align right.
import { z } from 'zod'
import { INK, MUTED } from './theme'
import { frame, heading, n, text, wrap } from './svg'
import type { FigureKind, FigureResult } from './types'

const Cell = z.union([z.string().max(300), z.number().finite(), z.null()])

export const TableData = z
  .object({
    title: z.string().max(200).optional(),
    caption: z.string().max(200).optional(),
    columns: z.array(z.string().min(1).max(60)).min(1).max(12),
    rows: z.array(z.array(Cell)).min(1).max(60),
  })
  .refine((d) => d.rows.every((r) => r.length === d.columns.length), {
    message: 'every row needs one cell per column',
  })
export type TableData = z.infer<typeof TableData>

const cellText = (v: string | number | null): string => (v === null ? '' : String(v))

function render(d: TableData, o: { width: number; height: number }): FigureResult {
  const rows = d.rows.map((r) => r.map(cellText))
  const weights = d.columns.map((c, i) =>
    Math.min(40, Math.max(6, c.length, ...rows.map((r) => r[i]!.length))),
  )
  const inner = o.width - 24
  const sum = weights.reduce((a, b) => a + b, 0)
  const widths = weights.map((w) => (w / sum) * inner)
  const xs = widths.map((_, i) => 12 + widths.slice(0, i).reduce((a, b) => a + b, 0))
  const numeric = d.columns.map((_, i) =>
    d.rows.every((r) => typeof r[i] === 'number' || r[i] === null),
  )
  const top = d.title ? 36 : 8
  let body = heading(d.title, 12)
  body += `<rect x="12" y="${top}" width="${n(inner)}" height="28" fill="${INK}"/>`
  d.columns.forEach((c, i) => {
    body += text(numeric[i] ? xs[i]! + widths[i]! - 8 : xs[i]! + 8, top + 18, c, {
      size: 12,
      weight: 700,
      fill: '#ffffff',
      anchor: numeric[i] ? 'end' : 'start',
    })
  })
  let y = top + 28
  rows.forEach((r, ri) => {
    const wrapped = r.map((c, i) => wrap(c, Math.max(4, Math.floor((widths[i]! - 16) / 6.6)), 3))
    const h = 12 + Math.max(1, ...wrapped.map((w) => w.length)) * 16
    body += `<rect x="12" y="${n(y)}" width="${n(inner)}" height="${h}" fill="${ri % 2 ? '#ffffff' : '#f6efdc'}"/>`
    wrapped.forEach((lines, i) => {
      lines.forEach((ln, k) => {
        body += text(numeric[i] ? xs[i]! + widths[i]! - 8 : xs[i]! + 8, y + 18 + k * 16, ln, {
          size: 13,
          anchor: numeric[i] ? 'end' : 'start',
        })
      })
    })
    y += h
  })
  body += `<line x1="12" x2="${n(12 + inner)}" y1="${n(y)}" y2="${n(y)}" stroke="${INK}" stroke-width="1.5"/>`
  if (d.caption) body += text(12, y + 18, d.caption, { size: 11, fill: MUTED })
  const height = y + (d.caption ? 28 : 10)

  const summary =
    `${d.title ?? 'Table'}: table with ${d.rows.length} rows and columns ${d.columns.join(', ')}. ` +
    rows
      .slice(0, 3)
      .map((r) => r.map((c, i) => `${d.columns[i]} ${c || 'blank'}`).join(', '))
      .join('; ') +
    (rows.length > 3 ? `; and ${rows.length - 3} more rows.` : '.')
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Table',
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: { caption: d.title ?? d.caption, columns: d.columns, rows },
  }
}

export const tableKind: FigureKind<TableData> = { kind: 'table', schema: TableData, render }
