// hosp_muster_board, hosp_floor_status, hosp_departures_timeline and hosp_port_board (spec 0470
// FR-6). The two accounting boards draw people counted (solid) against people not accounted for
// (hatched) and say the numbers aloud; the departures timeline and the port board draw through
// the generic time series and status board kinds so axes, symbols and tables behave the same.
import { z } from 'zod'
import { AXIS, INK, MUTED, seriesStyle } from '../theme'
import { fmt, frame, hashId, heading, legend, n, patternDef, text, wrap } from '../svg'
import { statusBoardKind } from '../status-board'
import { timeSeriesKind, type TimeSeriesData } from '../time-series'
import type { FigureKind, FigureResult } from '../types'

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date or time')
const COUNTED = seriesStyle(0)
const MISSING = seriesStyle(1)

// ---- muster and accounting ---------------------------------------------------------------------

export const HospMusterBoardData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  rows: z
    .array(
      z
        .object({
          name: z.string().min(1).max(60),
          expected: z.number().int().min(0).max(100_000),
          mustered: z.number().int().min(0).max(100_000),
          cabinsChecked: z.number().int().min(0).max(100_000).optional(),
          cabinsTotal: z.number().int().min(0).max(100_000).optional(),
        })
        .refine((r) => r.mustered <= r.expected, { message: 'mustered cannot exceed expected' }),
    )
    .min(1)
    .max(12),
})
export type HospMusterBoardData = z.infer<typeof HospMusterBoardData>

function renderMuster(d: HospMusterBoardData, o: { width: number; height: number }): FigureResult {
  const id = hashId(JSON.stringify(d))
  const defs = [COUNTED, MISSING].map((s, i) => patternDef(`p${id}-${i}`, s)).join('')
  const lg = legend(
    ['Accounted for', 'Not accounted for'].map((name, i) => ({
      name,
      swatch: (x: number, y: number) =>
        `<rect x="${n(x)}" y="${n(y - 7)}" width="26" height="14" fill="url(#p${id}-${i})" stroke="${INK}" stroke-width="0.8"/>`,
    })),
    24,
    d.title ? 42 : 14,
    o.width - 24,
  )
  const top = (d.title ? 42 : 14) + lg.height + 6
  const rowH = 52
  const barX = 190
  const barW = o.width - barX - 24
  const max = Math.max(1, ...d.rows.map((r) => r.expected))
  let body = heading(d.title, 24) + lg.svg
  d.rows.forEach((r, i) => {
    const y = top + i * rowH
    const missing = r.expected - r.mustered
    body += `<line x1="24" x2="${n(o.width - 24)}" y1="${n(y)}" y2="${n(y)}" stroke="#d8c79e"/>`
    wrap(r.name, 24, 2).forEach((ln, k) => {
      body += text(24, y + 22 + k * 14, ln, { size: 13, weight: 700 })
    })
    const wc = (r.mustered / max) * barW
    const wm = (missing / max) * barW
    if (wc > 0)
      body += `<rect x="${n(barX)}" y="${n(y + 8)}" width="${n(wc)}" height="22" fill="url(#p${id}-0)" stroke="#ffffff" stroke-width="0.6"/>`
    if (wm > 0)
      body += `<rect x="${n(barX + wc)}" y="${n(y + 8)}" width="${n(wm)}" height="22" fill="url(#p${id}-1)" stroke="#ffffff" stroke-width="0.6"/>`
    const cabins =
      r.cabinsTotal === undefined
        ? ''
        : `; cabins checked ${fmt(r.cabinsChecked ?? 0)} of ${fmt(r.cabinsTotal)}`
    body += text(
      barX,
      y + 46,
      `${fmt(r.mustered)} of ${fmt(r.expected)} accounted for, ${fmt(missing)} not accounted for${cabins}`,
      { size: 11.5, fill: MUTED },
    )
  })
  const end = top + d.rows.length * rowH
  body += `<line x1="24" x2="${n(o.width - 24)}" y1="${n(end)}" y2="${n(end)}" stroke="${AXIS}" stroke-width="1.5"/>`
  const expected = d.rows.reduce((s, r) => s + r.expected, 0)
  const mustered = d.rows.reduce((s, r) => s + r.mustered, 0)
  const summary =
    `${d.title ?? 'Muster and accounting board'}${d.asOf ? ` as of ${d.asOf}` : ''}: ` +
    `${fmt(mustered)} of ${fmt(expected)} persons accounted for, ${fmt(expected - mustered)} not accounted for. ` +
    d.rows
      .map((r) => `${r.name}: ${fmt(r.mustered)} of ${fmt(r.expected)}`)
      .join('; ')
      .concat('.')
  return {
    svg: frame({
      width: o.width,
      height: end + 14,
      title: d.title ?? 'Muster and accounting board',
      summary,
      defs,
      body,
      idKey: id,
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Group', 'Expected', 'Accounted for', 'Not accounted for', 'Cabins checked'],
      rows: d.rows.map((r) => [
        r.name,
        String(r.expected),
        String(r.mustered),
        String(r.expected - r.mustered),
        r.cabinsTotal === undefined ? '' : `${r.cabinsChecked ?? 0} of ${r.cabinsTotal}`,
      ]),
    },
  }
}

export const hospMusterBoardKind: FigureKind<HospMusterBoardData> = {
  kind: 'hosp_muster_board',
  schema: HospMusterBoardData,
  render: renderMuster,
}

// ---- floor by floor status ---------------------------------------------------------------------

const FLOOR_STATES = ['clear', 'clearing', 'not_started', 'blocked'] as const
const FLOOR_WORD: Record<(typeof FLOOR_STATES)[number], string> = {
  clear: 'Clear',
  clearing: 'Clearing',
  not_started: 'Not started',
  blocked: 'Blocked',
}

export const HospFloorStatusData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  listPrintedAt: z.string().max(80).optional(),
  floors: z
    .array(
      z
        .object({
          floor: z.string().min(1).max(12),
          registered: z.number().int().min(0).max(5000),
          accounted: z.number().int().min(0).max(5000),
          assistance: z.number().int().min(0).max(5000).default(0),
          state: z.enum(FLOOR_STATES),
        })
        .refine((f) => f.accounted <= f.registered, {
          message: 'accounted cannot exceed registered',
        }),
    )
    .min(1)
    .max(60),
})
export type HospFloorStatusData = z.infer<typeof HospFloorStatusData>

function renderFloors(d: HospFloorStatusData, o: { width: number; height: number }): FigureResult {
  const id = hashId(JSON.stringify(d))
  const defs = [COUNTED, MISSING].map((s, i) => patternDef(`p${id}-${i}`, s)).join('')
  const top = d.title ? 44 : 14
  const rowH = 30
  const barX = 80
  const right = 250
  const barW = o.width - barX - right
  const max = Math.max(1, ...d.floors.map((f) => f.registered))
  let body = heading(d.title, 24)
  if (d.asOf || d.listPrintedAt)
    body += text(
      o.width - 24,
      20,
      [d.asOf ? `Count at ${d.asOf}` : '', d.listPrintedAt ? `list printed ${d.listPrintedAt}` : '']
        .filter(Boolean)
        .join(', '),
      { size: 12, anchor: 'end', fill: MUTED },
    )
  d.floors.forEach((f, i) => {
    const y = top + i * rowH
    const missing = f.registered - f.accounted
    body += text(24, y + 20, `Floor ${f.floor}`, { size: 12.5, weight: 700 })
    const wc = (f.accounted / max) * barW
    const wm = (missing / max) * barW
    if (wc > 0)
      body += `<rect x="${n(barX)}" y="${n(y + 6)}" width="${n(wc)}" height="18" fill="url(#p${id}-0)" stroke="#ffffff" stroke-width="0.6"/>`
    if (wm > 0)
      body += `<rect x="${n(barX + wc)}" y="${n(y + 6)}" width="${n(wm)}" height="18" fill="url(#p${id}-1)" stroke="#ffffff" stroke-width="0.6"/>`
    body += text(
      o.width - right + 12,
      y + 20,
      `${f.accounted} of ${f.registered}; ${missing} not accounted for; ${f.assistance} need help; ${FLOOR_WORD[f.state]}`,
      { size: 11.5, fill: MUTED },
    )
  })
  const end = top + d.floors.length * rowH
  const lg = legend(
    ['Accounted for', 'Not accounted for'].map((name, i) => ({
      name,
      swatch: (x: number, y: number) =>
        `<rect x="${n(x)}" y="${n(y - 7)}" width="26" height="14" fill="url(#p${id}-${i})" stroke="${INK}" stroke-width="0.8"/>`,
    })),
    24,
    end + 18,
    o.width - 24,
  )
  const reg = d.floors.reduce((s, f) => s + f.registered, 0)
  const acc = d.floors.reduce((s, f) => s + f.accounted, 0)
  const help = d.floors.reduce((s, f) => s + f.assistance, 0)
  const summary =
    `${d.title ?? 'Floor evacuation status'}: ${fmt(acc)} of ${fmt(reg)} registered guests accounted for on ${d.floors.length} floors, ` +
    `${fmt(reg - acc)} not accounted for, ${fmt(help)} needing help. ` +
    (d.listPrintedAt ? `The in-house list was printed at ${d.listPrintedAt}.` : '')
  return {
    svg: frame({
      width: o.width,
      height: end + 18 + lg.height + 6,
      title: d.title ?? 'Floor evacuation status',
      summary,
      defs,
      body: body + lg.svg,
      idKey: id,
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Floor', 'Registered', 'Accounted for', 'Not accounted for', 'Need help', 'State'],
      rows: d.floors.map((f) => [
        f.floor,
        String(f.registered),
        String(f.accounted),
        String(f.registered - f.accounted),
        String(f.assistance),
        FLOOR_WORD[f.state],
      ]),
    },
  }
}

export const hospFloorStatusKind: FigureKind<HospFloorStatusData> = {
  kind: 'hosp_floor_status',
  schema: HospFloorStatusData,
  render: renderFloors,
}

// ---- guest departures against clearance --------------------------------------------------------

export const HospDeparturesData = z.object({
  title: z.string().max(200).optional(),
  /** Guests registered at the start; the departures line is drawn against this. */
  guestsRegistered: z.number().int().min(1).max(50_000),
  /** Cumulative guests departed at each time. */
  points: z
    .array(z.object({ time: isoDate, departed: z.number().int().min(0).max(50_000) }))
    .min(2)
    .max(200),
  /** Road, airport or flight clearance times: after these no one can leave by that method. */
  closures: z
    .array(z.object({ time: isoDate, label: z.string().min(1).max(80) }))
    .max(8)
    .default([]),
})
export type HospDeparturesData = z.infer<typeof HospDeparturesData>

function renderDepartures(
  d: HospDeparturesData,
  o: { width: number; height: number },
): FigureResult {
  const title = d.title ?? 'Guest departures against clearance'
  const ts: TimeSeriesData = {
    title,
    yLabel: 'Guests departed (cumulative)',
    series: [
      {
        name: 'Guests departed',
        points: d.points.map((p) => ({ x: p.time, y: p.departed })),
      },
    ],
    thresholds: [{ value: d.guestsRegistered, label: 'All registered guests' }],
    annotations: d.closures.map((c) => ({ x: c.time, label: c.label })),
  }
  const base = timeSeriesKind.render(ts, o)
  const last = [...d.points].sort((a, b) => Date.parse(a.time) - Date.parse(b.time)).pop()!
  const summary =
    `${title}: ${fmt(last.departed)} of ${fmt(d.guestsRegistered)} registered guests have departed, ${fmt(d.guestsRegistered - last.departed)} remain. ` +
    (d.closures.length
      ? `Clearance times: ${d.closures.map((c) => `${c.label} at ${c.time.slice(0, 16)}Z`).join('; ')}. `
      : '') +
    base.summary
  return { svg: base.svg, summary, ...(base.table ? { table: base.table } : {}) }
}

export const hospDeparturesKind: FigureKind<HospDeparturesData> = {
  kind: 'hosp_departures_timeline',
  schema: HospDeparturesData,
  render: renderDepartures,
}

// ---- itinerary port status ---------------------------------------------------------------------

export const HospPortBoardData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  ports: z
    .array(
      z.object({
        port: z.string().min(1).max(60),
        eta: z.string().min(1).max(40),
        status: z.enum(['open', 'restricted', 'closed', 'unknown']),
        note: z.string().max(240).optional(),
      }),
    )
    .min(1)
    .max(14),
})
export type HospPortBoardData = z.infer<typeof HospPortBoardData>

const PORT_STATE = {
  open: 'ok',
  restricted: 'degraded',
  closed: 'down',
  unknown: 'unknown',
} as const

function renderPorts(d: HospPortBoardData, o: { width: number; height: number }): FigureResult {
  const title = d.title ?? 'Itinerary port status'
  const base = statusBoardKind.render(
    {
      title,
      ...(d.asOf ? { asOf: d.asOf } : {}),
      rows: d.ports.map((p) => ({
        name: `${p.port}, ${p.eta}`,
        state: PORT_STATE[p.status],
        ...(p.note ? { detail: p.note } : {}),
      })),
    },
    o,
  )
  const closed = d.ports.filter((p) => p.status === 'closed').map((p) => p.port)
  const restricted = d.ports.filter((p) => p.status === 'restricted').map((p) => p.port)
  const summary =
    `${title}: ${d.ports.length} ports in itinerary order. ` +
    (closed.length ? `Closed: ${closed.join(', ')}. ` : 'No port is closed. ') +
    (restricted.length ? `Restricted: ${restricted.join(', ')}. ` : '') +
    'This is a schematic board, not a map.'
  return { svg: base.svg, summary, ...(base.table ? { table: base.table } : {}) }
}

export const hospPortBoardKind: FigureKind<HospPortBoardData> = {
  kind: 'hosp_port_board',
  schema: HospPortBoardData,
  render: renderPorts,
}
