// status_board: one row per system with a colored state. Each state also has a symbol and a word,
// so the board reads in grayscale and aloud. The board sizes itself to its rows.
import { z } from 'zod'
import { INK, MUTED, STATUS_STYLES, type StatusState } from './theme'
import { frame, heading, n, text, wrap } from './svg'
import type { FigureKind, FigureResult } from './types'

export const StatusBoardData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  rows: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        state: z.enum(['ok', 'degraded', 'down', 'unknown']),
        detail: z.string().max(240).optional(),
        updated: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(30),
})
export type StatusBoardData = z.infer<typeof StatusBoardData>

function symbol(state: StatusState, x: number, y: number): string {
  const s = STATUS_STYLES[state]
  switch (s.symbol) {
    case 'triangle':
      return `<path d="M${n(x)} ${n(y - 8)}L${n(x + 8)} ${n(y + 7)}L${n(x - 8)} ${n(y + 7)}Z" fill="${s.color}"/>`
    case 'square':
      return `<rect x="${n(x - 7)}" y="${n(y - 7)}" width="14" height="14" fill="${s.color}"/><path d="M${n(x - 4)} ${n(y - 4)}L${n(x + 4)} ${n(y + 4)}M${n(x + 4)} ${n(y - 4)}L${n(x - 4)} ${n(y + 4)}" stroke="#ffffff" stroke-width="2"/>`
    case 'ring':
      return `<circle cx="${n(x)}" cy="${n(y)}" r="6.5" fill="none" stroke="${s.color}" stroke-width="2.5"/>`
    default:
      return `<circle cx="${n(x)}" cy="${n(y)}" r="7" fill="${s.color}"/><path d="M${n(x - 3.5)} ${n(y)}L${n(x - 1)} ${n(y + 3)}L${n(x + 4)} ${n(y - 3)}" stroke="#ffffff" stroke-width="2" fill="none"/>`
  }
}

function render(d: StatusBoardData, o: { width: number; height: number }): FigureResult {
  const headH = d.title ? 36 : 8
  const colName = 20
  const colState = Math.round(o.width * 0.34)
  const colDetail = Math.round(o.width * 0.5)
  const charsDetail = Math.floor((o.width - colDetail - 16) / 6.4)
  const lines = d.rows.map((r) => wrap(r.detail ?? '', charsDetail, 3))
  const heights = lines.map((l) => Math.max(40, 18 + Math.max(1, l.length) * 15))
  const total = headH + 26 + heights.reduce((a, b) => a + b, 0) + 8
  let body = heading(d.title, 16)
  if (d.asOf)
    body += text(o.width - 16, 20, `As of ${d.asOf}`, { size: 12, anchor: 'end', fill: MUTED })
  let y = headH
  body += `<rect x="0" y="${y}" width="${o.width}" height="26" fill="#14100c"/>`
  for (const [x, label] of [
    [colName, 'System'],
    [colState, 'State'],
    [colDetail, 'Detail'],
  ] as const)
    body += text(x, y + 17, label, { size: 12, weight: 700, fill: '#ffffff' })
  y += 26
  d.rows.forEach((r, i) => {
    const h = heights[i]!
    const st = STATUS_STYLES[r.state]
    body += `<rect x="0" y="${y}" width="${o.width}" height="${h}" fill="${st.tint}"/>`
    body += `<line x1="0" x2="${o.width}" y1="${y + h}" y2="${y + h}" stroke="#ffffff" stroke-width="2"/>`
    body += `<rect x="0" y="${y}" width="6" height="${h}" fill="${st.color}"/>`
    body += text(colName, y + h / 2 + 5, r.name, { size: 14, weight: 600 })
    body += symbol(r.state, colState + 8, y + h / 2)
    body += text(colState + 24, y + h / 2 + 5, st.label, { size: 14, weight: 700, fill: st.color })
    lines[i]!.forEach((ln, k) => {
      body += text(colDetail, y + 22 + k * 15, ln, { size: 12, fill: INK })
    })
    if (r.updated)
      body += text(o.width - 12, y + h - 8, r.updated, { size: 10, anchor: 'end', fill: MUTED })
    y += h
  })

  const counts = (['down', 'degraded', 'unknown', 'ok'] as const)
    .map((s) => ({ s, c: d.rows.filter((r) => r.state === s).length }))
    .filter((x) => x.c)
  const summary =
    `${d.title ?? 'Status board'}${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.rows.length} systems, ` +
    counts.map((x) => `${x.c} ${STATUS_STYLES[x.s].label.toLowerCase()}`).join(', ') +
    '. ' +
    d.rows
      .map((r) => `${r.name}: ${STATUS_STYLES[r.state].label}${r.detail ? ` (${r.detail})` : ''}`)
      .join('; ') +
    '.'
  const height = Math.max(total, 60)
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Status board',
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['System', 'State', 'Detail', 'Updated'],
      rows: d.rows.map((r) => [
        r.name,
        STATUS_STYLES[r.state].label,
        r.detail ?? '',
        r.updated ?? '',
      ]),
    },
  }
}

export const statusBoardKind: FigureKind<StatusBoardData> = {
  kind: 'status_board',
  schema: StatusBoardData,
  render,
}
