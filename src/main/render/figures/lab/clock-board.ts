// lab_notification_clock_board (spec 0466 FR-5, FR-7): every notification a laboratory incident
// requires, whom it goes to, when it is due and where it stands. Status is a word and a symbol
// as well as a color, so the board reads in grayscale and aloud. Drawn from data; never an image.
import { z } from 'zod'
import { INK, MUTED, STATUS_STYLES, type StatusState } from '../theme'
import { frame, heading, n, text, wrap } from '../svg'
import type { FigureKind, FigureResult } from '../types'

export const NOTIFICATION_STATES = [
  'not_started',
  'open',
  'due_soon',
  'made',
  'made_late',
  'late',
  'waived',
] as const
export type NotificationState = (typeof NOTIFICATION_STATES)[number]

/** The word, the board color class and the symbol each state is drawn with. */
export const NOTIFICATION_STYLE: Record<NotificationState, { label: string; tone: StatusState }> = {
  not_started: { label: 'Not started', tone: 'unknown' },
  open: { label: 'Open', tone: 'unknown' },
  due_soon: { label: 'Due soon', tone: 'degraded' },
  made: { label: 'Made', tone: 'ok' },
  made_late: { label: 'Made late', tone: 'down' },
  late: { label: 'Late', tone: 'down' },
  waived: { label: 'Waived', tone: 'unknown' },
}

export const LabClockBoardData = z.object({
  title: z.string().max(200).optional(),
  /** Exercise time the board is drawn at, as text ("Wed 2026-10-21 14:00"). */
  asOf: z.string().max(80).optional(),
  rows: z
    .array(
      z.object({
        notification: z.string().min(1).max(120),
        recipient: z.string().max(120).default(''),
        /** The rule in words: "Immediately", "Within 7 calendar days". */
        rule: z.string().max(160).default(''),
        /** When it is due, as text; empty while the clock has not started. */
        due: z.string().max(60).default(''),
        status: z.enum(NOTIFICATION_STATES),
        /** When it was made, as text, and how far from the deadline ("12 min early"). */
        made: z.string().max(60).default(''),
        note: z.string().max(160).default(''),
      }),
    )
    .min(1)
    .max(24),
})
export type LabClockBoardData = z.infer<typeof LabClockBoardData>

function symbol(tone: StatusState, x: number, y: number): string {
  const s = STATUS_STYLES[tone]
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

function render(d: LabClockBoardData, o: { width: number; height: number }): FigureResult {
  const headH = d.title ? 36 : 8
  const cols = {
    what: 16,
    due: Math.round(o.width * 0.4),
    status: Math.round(o.width * 0.64),
  }
  const whatChars = Math.floor((cols.due - cols.what - 8) / 6.6)
  const dueChars = Math.floor((cols.status - cols.due - 8) / 6.4)
  const statusChars = Math.floor((o.width - cols.status - 40) / 6.2)
  const rows = d.rows.map((r) => ({
    r,
    what: wrap(r.notification, whatChars, 2),
    to: wrap(r.recipient, whatChars, 1),
    rule: wrap(r.rule, dueChars, 2),
    made: wrap([r.made, r.note].filter(Boolean).join(' · '), statusChars, 2),
  }))
  const heights = rows.map((x) =>
    Math.max(
      46,
      14 + (x.what.length + x.to.length) * 15,
      14 + (x.rule.length + 1) * 15,
      30 + x.made.length * 14,
    ),
  )
  const total = headH + 26 + heights.reduce((a, b) => a + b, 0) + 8
  let body = heading(d.title, 16)
  if (d.asOf)
    body += text(o.width - 16, 20, `As of ${d.asOf}`, { size: 12, anchor: 'end', fill: MUTED })
  let y = headH
  body += `<rect x="0" y="${y}" width="${o.width}" height="26" fill="#14100c"/>`
  for (const [x, label] of [
    [cols.what, 'Notification and recipient'],
    [cols.due, 'Due'],
    [cols.status, 'Status'],
  ] as const)
    body += text(x, y + 17, label, { size: 12, weight: 700, fill: '#ffffff' })
  y += 26
  rows.forEach((x, i) => {
    const h = heights[i]!
    const style = NOTIFICATION_STYLE[x.r.status]
    const st = STATUS_STYLES[style.tone]
    body += `<rect x="0" y="${y}" width="${o.width}" height="${h}" fill="${st.tint}"/>`
    body += `<line x1="0" x2="${o.width}" y1="${y + h}" y2="${y + h}" stroke="#ffffff" stroke-width="2"/>`
    body += `<rect x="0" y="${y}" width="6" height="${h}" fill="${st.color}"/>`
    x.what.forEach((ln, k) => {
      body += text(cols.what, y + 20 + k * 15, ln, { size: 13, weight: 600 })
    })
    x.to.forEach((ln, k) => {
      body += text(cols.what, y + 20 + (x.what.length + k) * 15, ln, { size: 12, fill: MUTED })
    })
    if (x.r.due) body += text(cols.due, y + 20, x.r.due, { size: 12.5, weight: 600 })
    x.rule.forEach((ln, k) => {
      body += text(cols.due, y + 36 + k * 15, ln, { size: 11.5, fill: INK })
    })
    body += symbol(style.tone, cols.status + 8, y + 18)
    body += text(cols.status + 24, y + 23, style.label, { size: 13.5, weight: 700, fill: st.color })
    x.made.forEach((ln, k) => {
      body += text(cols.status, y + 40 + k * 14, ln, { size: 11.5, fill: INK })
    })
    y += h
  })

  const count = (s: NotificationState) => d.rows.filter((r) => r.status === s).length
  const missed = count('late') + count('made_late')
  const summary =
    `${d.title ?? 'Notification clocks'}${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.rows.length} notifications, ` +
    `${count('made')} made on time, ${missed} missed (${count('late')} still late, ${count('made_late')} made late), ` +
    `${count('due_soon') + count('open')} open, ${count('not_started')} not started. ` +
    d.rows
      .map(
        (r) =>
          `${r.notification}${r.recipient ? ` to ${r.recipient}` : ''}: ${NOTIFICATION_STYLE[r.status].label}` +
          `${r.due ? `, due ${r.due}` : ''}${r.made ? `, made ${r.made}` : ''}`,
      )
      .join('; ') +
    '.'
  return {
    svg: frame({
      width: o.width,
      height: Math.max(total, 60),
      title: d.title ?? 'Notification clocks',
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Notification', 'Recipient', 'Rule', 'Due', 'Status', 'Made'],
      rows: d.rows.map((r) => [
        r.notification,
        r.recipient,
        r.rule,
        r.due,
        NOTIFICATION_STYLE[r.status].label,
        [r.made, r.note].filter(Boolean).join(' · '),
      ]),
    },
  }
}

export const labClockBoardKind: FigureKind<LabClockBoardData> = {
  kind: 'lab_notification_clock_board',
  schema: LabClockBoardData,
  render,
}
