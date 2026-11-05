// A state board for the justice figure kinds (spec 0465 FR-8): one row per unit, housing area or
// court function with a colored state that also has a symbol and the field's own word, so the
// board reads in grayscale and aloud. Shared by the unit status, jail population and court
// continuity kinds; it sizes itself to its rows. Pure and deterministic.
import { INK, MUTED, STATUS_STYLES, type StatusState } from '../theme'
import { frame, heading, n, text, wrap } from '../svg'
import type { FigureResult } from '../types'

export interface BoardRow {
  name: string
  state: StatusState
  /** The field's word for the state ("On scene", "Count not clear"). */
  word: string
  detail: string
}

export interface BoardInput {
  title?: string
  asOf?: string
  nameHeader: string
  rows: BoardRow[]
  /** Sentence that opens the summary. */
  lead: string
  columns: [string, string, string]
}

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

export function renderBoard(input: BoardInput, width: number): FigureResult {
  const { rows } = input
  const headH = input.title ? 36 : 8
  const colName = 20
  const colState = Math.round(width * 0.3)
  const colDetail = Math.round(width * 0.5)
  const charsDetail = Math.floor((width - colDetail - 16) / 6.4)
  const lines = rows.map((r) => wrap(r.detail, charsDetail, 3))
  const heights = lines.map((l) => Math.max(40, 18 + Math.max(1, l.length) * 15))
  const total = headH + 26 + heights.reduce((a, b) => a + b, 0) + 8
  let body = heading(input.title, 16)
  if (input.asOf)
    body += text(width - 16, 20, `As of ${input.asOf}`, { size: 12, anchor: 'end', fill: MUTED })
  let y = headH
  body += `<rect x="0" y="${y}" width="${width}" height="26" fill="#14100c"/>`
  const heads: [number, string][] = [
    [colName, input.columns[0]],
    [colState, input.columns[1]],
    [colDetail, input.columns[2]],
  ]
  for (const [x, label] of heads)
    body += text(x, y + 17, label, { size: 12, weight: 700, fill: '#ffffff' })
  y += 26
  rows.forEach((r, i) => {
    const h = heights[i]!
    const st = STATUS_STYLES[r.state]
    body += `<rect x="0" y="${y}" width="${width}" height="${h}" fill="${st.tint}"/>`
    body += `<line x1="0" x2="${width}" y1="${y + h}" y2="${y + h}" stroke="#ffffff" stroke-width="2"/>`
    body += `<rect x="0" y="${y}" width="6" height="${h}" fill="${st.color}"/>`
    body += text(colName, y + h / 2 + 5, r.name, { size: 14, weight: 600 })
    body += symbol(r.state, colState + 8, y + h / 2)
    body += text(colState + 24, y + h / 2 + 5, r.word, { size: 13, weight: 700, fill: st.color })
    lines[i]!.forEach((ln, k) => {
      body += text(colDetail, y + 22 + k * 15, ln, { size: 12, fill: INK })
    })
    y += h
  })
  const summary =
    `${input.lead} ` +
    rows.map((r) => `${r.name}: ${r.word}${r.detail ? ` (${r.detail})` : ''}`).join('; ') +
    '.'
  return {
    svg: frame({
      width,
      height: Math.max(total, 60),
      title: input.title ?? input.nameHeader,
      summary,
      body,
      idKey: JSON.stringify(input),
    }),
    summary,
    table: {
      caption: input.title,
      columns: [input.nameHeader, 'State', 'Detail'],
      rows: rows.map((r) => [r.name, r.word, r.detail]),
    },
  }
}
