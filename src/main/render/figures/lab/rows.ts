// A table whose flagged rows stand out (spec 0466 FR-7): the inventory reconciliation, the sample
// loss register and the access log all need "this row is the problem". A flag is a tinted row, a
// symbol and a word, so it reads in grayscale and aloud. Shared by the three lab table kinds.
import { INK, MUTED, STATUS_STYLES } from '../theme'
import { n, text, wrap } from '../svg'

export type RowFlag = 'attention' | 'critical'

export interface FlagRow {
  cells: string[]
  flag?: RowFlag
  /** The word shown beside the symbol ("Discrepancy", "At risk"). */
  flagText?: string
}

const TONE = { attention: STATUS_STYLES.degraded, critical: STATUS_STYLES.down } as const

function flagSymbol(flag: RowFlag, x: number, y: number): string {
  const s = TONE[flag]
  return flag === 'critical'
    ? `<rect x="${n(x - 7)}" y="${n(y - 7)}" width="14" height="14" fill="${s.color}"/><path d="M${n(x - 4)} ${n(y - 4)}L${n(x + 4)} ${n(y + 4)}M${n(x + 4)} ${n(y - 4)}L${n(x - 4)} ${n(y + 4)}" stroke="#ffffff" stroke-width="2"/>`
    : `<path d="M${n(x)} ${n(y - 8)}L${n(x + 8)} ${n(y + 7)}L${n(x - 8)} ${n(y + 7)}Z" fill="${s.color}"/>`
}

export interface FlagTableInput {
  columns: string[]
  rows: FlagRow[]
  width: number
  /** Column indexes whose cells are numbers (right aligned). */
  numeric?: number[]
  /** Top of the table in the figure. */
  top: number
}

/** The SVG body of the table and the y where it ends. */
export function renderFlagTable(i: FlagTableInput): { body: string; end: number } {
  const flagW = 118
  const inner = i.width - 24 - flagW
  const weights = i.columns.map((c, k) =>
    Math.min(34, Math.max(6, c.length, ...i.rows.map((r) => (r.cells[k] ?? '').length))),
  )
  const sum = weights.reduce((a, b) => a + b, 0)
  const widths = weights.map((w) => (w / sum) * inner)
  const xs = widths.map((_, k) => 12 + widths.slice(0, k).reduce((a, b) => a + b, 0))
  const num = new Set(i.numeric ?? [])
  const flagX = 12 + inner
  let body = `<rect x="12" y="${i.top}" width="${n(inner + flagW)}" height="28" fill="${INK}"/>`
  i.columns.forEach((c, k) => {
    body += text(num.has(k) ? xs[k]! + widths[k]! - 8 : xs[k]! + 8, i.top + 18, c, {
      size: 12,
      weight: 700,
      fill: '#ffffff',
      anchor: num.has(k) ? 'end' : 'start',
    })
  })
  body += text(flagX + 8, i.top + 18, 'Flag', { size: 12, weight: 700, fill: '#ffffff' })
  let y = i.top + 28
  i.rows.forEach((r, ri) => {
    const wrapped = r.cells.map((c, k) =>
      wrap(c, Math.max(4, Math.floor((widths[k]! - 16) / 6.6)), 3),
    )
    const h = 12 + Math.max(1, ...wrapped.map((w) => w.length)) * 16
    const fill = r.flag ? TONE[r.flag].tint : ri % 2 ? '#ffffff' : '#f6efdc'
    body += `<rect x="12" y="${n(y)}" width="${n(inner + flagW)}" height="${h}" fill="${fill}"/>`
    if (r.flag)
      body += `<rect x="12" y="${n(y)}" width="5" height="${h}" fill="${TONE[r.flag].color}"/>`
    wrapped.forEach((lines, k) => {
      lines.forEach((ln, l) => {
        body += text(num.has(k) ? xs[k]! + widths[k]! - 8 : xs[k]! + 8, y + 18 + l * 16, ln, {
          size: 13,
          anchor: num.has(k) ? 'end' : 'start',
          weight: r.flag ? 600 : 400,
        })
      })
    })
    if (r.flag) {
      body += flagSymbol(r.flag, flagX + 14, y + 16)
      body += text(
        flagX + 28,
        y + 20,
        r.flagText ?? (r.flag === 'critical' ? 'Problem' : 'Check'),
        {
          size: 12,
          weight: 700,
          fill: TONE[r.flag].color,
        },
      )
    }
    y += h
  })
  body += `<line x1="12" x2="${n(12 + inner + flagW)}" y1="${n(y)}" y2="${n(y)}" stroke="${INK}" stroke-width="1.5"/>`
  return { body, end: y }
}

export const CAPTION = { fill: MUTED, size: 11 } as const
