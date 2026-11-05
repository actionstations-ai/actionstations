// A status board drawn as a table of cells with a symbol and a word for the status column, used
// by the evacuation status board and the power shutoff circuit board (spec 0461 FR-7). The board
// sizes itself to its rows; nothing relies on color alone.
import { INK, MUTED } from '../theme'
import { frame, heading, text, wrap } from '../svg'
import { symbolSvg, type StatusLook } from './common'
import type { FigureResult, FigureTable } from '../types'

export interface BoardColumn {
  title: string
  /** Share of the width, summing to about 1. */
  share: number
  align?: 'start' | 'end'
}

export interface BoardCell {
  text: string
  bold?: boolean
  color?: string
}

export interface BoardStatusCell extends BoardCell {
  look: Pick<StatusLook, 'color' | 'tint' | 'symbol'>
}

export interface BoardRow {
  /** Cells in column order; the cell at `statusColumn` is a status cell. */
  cells: (BoardCell | BoardStatusCell)[]
}

export interface BoardSpec {
  title: string | undefined
  caption?: string
  width: number
  columns: BoardColumn[]
  statusColumn: number
  rows: BoardRow[]
  asOf?: string
  summary: string
  idKey: string
  footnote?: string
}

const isStatus = (c: BoardCell | BoardStatusCell): c is BoardStatusCell => 'look' in c

export function renderBoard(spec: BoardSpec): FigureResult {
  const o = { width: spec.width }
  const headTop = spec.title ? 36 : 8
  const xs: number[] = []
  let acc = 12
  for (const c of spec.columns) {
    xs.push(acc)
    acc += Math.round((o.width - 24) * c.share)
  }
  const colW = (i: number): number => Math.round((o.width - 24) * spec.columns[i]!.share) - 10
  const lines = spec.rows.map((r) =>
    r.cells.map((c, i) => wrap(c.text, Math.max(6, Math.floor(colW(i) / 6.6)), 4)),
  )
  const heights = lines.map((l) =>
    Math.max(40, 16 + Math.max(...l.map((x) => Math.max(1, x.length))) * 15),
  )
  const foot = spec.footnote ? wrap(spec.footnote, Math.floor((o.width - 24) / 6.4), 3) : []
  const total =
    headTop + 28 + heights.reduce((a, b) => a + b, 0) + (foot.length ? foot.length * 15 + 16 : 8)
  let body = heading(spec.title, 16)
  if (spec.asOf)
    body += text(o.width - 16, 20, `As of ${spec.asOf}`, { size: 12, anchor: 'end', fill: MUTED })
  let y = headTop
  body += `<rect x="0" y="${y}" width="${o.width}" height="28" fill="#14100c"/>`
  spec.columns.forEach((c, i) => {
    body += text(xs[i]!, y + 18, c.title, { size: 12, weight: 700, fill: '#ffffff' })
  })
  y += 28
  spec.rows.forEach((r, ri) => {
    const h = heights[ri]!
    const status = r.cells[spec.statusColumn]
    const tint = status && isStatus(status) ? status.look.tint : '#ffffff'
    body += `<rect x="0" y="${y}" width="${o.width}" height="${h}" fill="${tint}"/>`
    body += `<line x1="0" x2="${o.width}" y1="${y + h}" y2="${y + h}" stroke="#ffffff" stroke-width="2"/>`
    if (status && isStatus(status))
      body += `<rect x="0" y="${y}" width="6" height="${h}" fill="${status.look.color}"/>`
    r.cells.forEach((c, i) => {
      const lns = lines[ri]![i]!
      const x = xs[i]!
      if (isStatus(c)) {
        body += symbolSvg(c.look.symbol, x + 8, y + h / 2, c.look.color)
        lns.forEach((ln, k) => {
          body += text(x + 24, y + h / 2 + 5 + (k - (lns.length - 1) / 2) * 15, ln, {
            size: 13,
            weight: 700,
            fill: c.look.color,
          })
        })
      } else {
        lns.forEach((ln, k) => {
          body += text(x, y + 25 + k * 15, ln, {
            size: 13,
            weight: c.bold ? 700 : 400,
            fill: c.color ?? INK,
          })
        })
      }
    })
    y += h
  })
  foot.forEach((ln, k) => {
    body += text(12, y + 18 + k * 15, ln, { size: 11, fill: MUTED })
  })
  const table: FigureTable = {
    caption: spec.caption ?? spec.title,
    columns: spec.columns.map((c) => c.title),
    rows: spec.rows.map((r) => r.cells.map((c) => c.text)),
  }
  return {
    svg: frame({
      width: o.width,
      height: Math.max(total, 60),
      title: spec.title ?? 'Status board',
      summary: spec.summary,
      body,
      idKey: spec.idKey,
    }),
    summary: spec.summary,
    table,
  }
}
