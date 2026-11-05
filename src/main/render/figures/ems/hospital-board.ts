// hospital_capacity_board: each receiving hospital with its status (word and symbol), the beds
// it offers by kind and the patients it has received against its stated limit (spec 0456 FR-4).
// A hospital that has received more than it said it could take is marked in words.
import { z } from 'zod'
import { INK, MUTED, STATUS_STYLES, type StatusState } from '../theme'
import { frame, heading, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'

const STATUSES = ['Open', 'Limited intake', 'Diversion', 'Closed'] as const
const STATE_OF: Record<(typeof STATUSES)[number], StatusState> = {
  Open: 'ok',
  'Limited intake': 'degraded',
  Diversion: 'down',
  Closed: 'unknown',
}
const Beds = z.number().int().min(0).max(5000).optional()

export const HospitalBoardData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  hospitals: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        status: z.enum(STATUSES),
        edBeds: Beds,
        traumaBays: Beds,
        burnBeds: Beds,
        pediatricBeds: Beds,
        received: z.number().int().min(0).max(5000).default(0),
        receiveLimit: Beds,
      }),
    )
    .min(1)
    .max(20),
})
export type HospitalBoardData = z.infer<typeof HospitalBoardData>
type Hospital = HospitalBoardData['hospitals'][number]

const ROW = 40
const HEAD = 30
const over = (h: Hospital): boolean => h.receiveLimit !== undefined && h.received > h.receiveLimit
const cell = (v: number | undefined): string => (v === undefined ? 'n/a' : String(v))

function symbolFor(state: StatusState, x: number, y: number, color: string): string {
  if (state === 'ok') return `<circle cx="${n(x)}" cy="${n(y)}" r="7" fill="${color}"/>`
  if (state === 'degraded')
    return `<path d="M${n(x)} ${n(y - 8)}L${n(x + 8)} ${n(y + 7)}L${n(x - 8)} ${n(y + 7)}Z" fill="${color}"/>`
  if (state === 'down')
    return `<rect x="${n(x - 7)}" y="${n(y - 7)}" width="14" height="14" fill="${color}"/>`
  return `<circle cx="${n(x)}" cy="${n(y)}" r="6.5" fill="none" stroke="${color}" stroke-width="2.5"/>`
}

function rowsSvg(d: HospitalBoardData, w: number, top: number): string {
  const x = [16, w * 0.3, w * 0.48, w * 0.58, w * 0.67, w * 0.78]
  let body = `<rect x="0" y="${top}" width="${w}" height="${HEAD}" fill="#14100c"/>`
  ;['Hospital', 'Status', 'ED beds', 'Trauma', 'Burn', 'Peds', 'Received'].forEach((h, i) => {
    const xs = i < 6 ? x[i]! : w - 16
    body += text(xs, top + 20, h, {
      size: 12,
      weight: 700,
      fill: '#ffffff',
      anchor: i < 6 ? 'start' : 'end',
    })
  })
  d.hospitals.forEach((h, i) => {
    const y = top + HEAD + i * ROW
    const st = STATUS_STYLES[STATE_OF[h.status]]
    body += `<rect x="0" y="${y}" width="${w}" height="${ROW}" fill="${st.tint}"/>`
    body += `<rect x="0" y="${y}" width="6" height="${ROW}" fill="${st.color}"/>`
    body += `<line x1="0" x2="${w}" y1="${y + ROW}" y2="${y + ROW}" stroke="#ffffff" stroke-width="2"/>`
    body += text(x[0]!, y + 25, h.name, { size: 14, weight: 600 })
    body += symbolFor(STATE_OF[h.status], x[1]! + 8, y + 20, st.color)
    body += text(x[1]! + 24, y + 25, h.status, { size: 13, weight: 700, fill: st.color })
    ;[h.edBeds, h.traumaBays, h.burnBeds, h.pediatricBeds].forEach((v, k) => {
      body += text(x[2 + k]!, y + 25, cell(v), { size: 14, fill: INK })
    })
    const rec = `${h.received}${h.receiveLimit !== undefined ? ` of ${h.receiveLimit}` : ''}`
    body += text(w - 16, y + 18, rec, { size: 14, weight: 700, anchor: 'end' })
    if (over(h))
      body += text(w - 16, y + 34, 'Over stated limit', {
        size: 11,
        weight: 700,
        anchor: 'end',
        fill: '#b3121b',
      })
  })
  return body
}

function summaryOf(d: HospitalBoardData): string {
  const overs = d.hospitals.filter(over).map((h) => h.name)
  return (
    `${d.title ?? 'Hospital capacity board'}${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.hospitals.length} hospitals. ` +
    d.hospitals
      .map(
        (h) =>
          `${h.name}: ${h.status}, received ${h.received}${h.receiveLimit !== undefined ? ` of ${h.receiveLimit}` : ''}` +
          `, ED beds ${cell(h.edBeds)}, trauma ${cell(h.traumaBays)}, burn ${cell(h.burnBeds)}, pediatric ${cell(h.pediatricBeds)}`,
      )
      .join('; ') +
    '.' +
    (overs.length ? ` Over the stated limit: ${overs.join(', ')}.` : '')
  )
}

function render(d: HospitalBoardData, o: { width: number; height: number }): FigureResult {
  const summary = summaryOf(d)
  const top = d.title ? 36 : 8
  let body = heading(d.title, 16)
  if (d.asOf)
    body += text(o.width - 16, 20, `As of ${d.asOf}`, { size: 12, anchor: 'end', fill: MUTED })
  body += rowsSvg(d, o.width, top)
  return {
    svg: frame({
      width: o.width,
      height: top + HEAD + d.hospitals.length * ROW + 8,
      title: d.title ?? 'Hospital capacity board',
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: d.title,
      columns: [
        'Hospital',
        'Status',
        'ED beds',
        'Trauma bays',
        'Burn beds',
        'Pediatric beds',
        'Received',
        'Limit',
      ],
      rows: d.hospitals.map((h) => [
        h.name,
        h.status,
        cell(h.edBeds),
        cell(h.traumaBays),
        cell(h.burnBeds),
        cell(h.pediatricBeds),
        String(h.received),
        cell(h.receiveLimit),
      ]),
    },
  }
}

export const hospitalBoardKind: FigureKind<HospitalBoardData> = {
  kind: 'hospital_capacity_board',
  schema: HospitalBoardData,
  render,
}
