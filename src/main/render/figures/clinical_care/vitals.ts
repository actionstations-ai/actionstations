// vitals_monitor and vitals_flowsheet (spec 0452 FR-5): a bedside monitor panel with a trend
// line per parameter and its alarm limits, and a flowsheet table of readings over hours with
// out-of-limit values marked in words. Values are stated numerically; the panel says it is
// simulated and never presents a waveform as a real patient's. Alarm states carry words (ALARM
// HIGH, ALARM LOW) and a symbol, never color alone.
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { frame, heading, n, text } from '../svg'
import { AXIS, GRID, INK, MUTED } from '../theme'
import type { FigureKind, FigureResult, FigureTable } from '../types'

const Point = z.object({
  /** Minutes (or any increasing number) on the time axis. */
  x: z.number().finite(),
  y: z.number().finite(),
  /** Second value of a pair (diastolic pressure). */
  y2: z.number().finite().optional(),
})

const Parameter = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
  label: z.string().min(1).max(60),
  unit: z.string().max(20).default(''),
  points: z.array(Point).min(1).max(240),
  /** Alarm limits applied to `y`. */
  low: z.number().finite().optional(),
  high: z.number().finite().optional(),
})
type Parameter = z.infer<typeof Parameter>

export const VitalsMonitorData = z.object({
  title: z.string().max(200).optional(),
  patient: z.string().max(120).default('Simulated patient'),
  /** What the x values mean ("Minutes since 06:00"). */
  xLabel: z.string().max(80).default('Minutes'),
  parameters: z.array(Parameter).min(1).max(8),
})
export type VitalsMonitorData = z.infer<typeof VitalsMonitorData>

export type AlarmState = 'high' | 'low' | 'ok'

export function alarmState(p: { low?: number; high?: number }, y: number): AlarmState {
  if (p.high !== undefined && y > p.high) return 'high'
  if (p.low !== undefined && y < p.low) return 'low'
  return 'ok'
}

const ALARM_WORD: Record<AlarmState, string> = {
  high: 'ALARM HIGH',
  low: 'ALARM LOW',
  ok: 'Within limits',
}

const latest = (p: Parameter) => [...p.points].sort((a, b) => a.x - b.x).at(-1)!
const valueText = (p: Parameter, pt: { y: number; y2?: number }): string =>
  pt.y2 === undefined ? `${pt.y}` : `${pt.y}/${pt.y2}`
const limits = (p: Parameter): string =>
  p.low === undefined && p.high === undefined
    ? 'no limits set'
    : `limits ${p.low ?? 'none'} to ${p.high ?? 'none'}`

const ROW_H = 74

function monitorSummary(d: VitalsMonitorData): string {
  const parts = d.parameters.map((p) => {
    const l = latest(p)
    const state = alarmState(p, l.y)
    return `${p.label} ${valueText(p, l)}${p.unit ? ' ' + p.unit : ''} (${ALARM_WORD[state]}; ${limits(p)})`
  })
  return `${d.title ?? 'Bedside monitor'} for ${d.patient}: ${parts.join('; ')}. Simulated data, not a real patient.`
}

function monitorTable(d: VitalsMonitorData): FigureTable {
  const xs = [...new Set(d.parameters.flatMap((p) => p.points.map((pt) => pt.x)))].sort(
    (a, b) => a - b,
  )
  return {
    caption: `${d.patient}: readings (${d.xLabel})`,
    columns: [d.xLabel, ...d.parameters.map((p) => `${p.label}${p.unit ? ` (${p.unit})` : ''}`)],
    rows: xs.map((x) => [
      String(x),
      ...d.parameters.map((p) => {
        const pt = p.points.find((q) => q.x === x)
        return pt ? valueText(p, pt) : ''
      }),
    ]),
  }
}

function renderMonitor(d: VitalsMonitorData, o: { width: number; height: number }): FigureResult {
  const top = d.title ? 34 : 10
  const height = top + d.parameters.length * ROW_H + 26
  const summary = monitorSummary(d)
  const labelW = 190
  const plotL = 12 + labelW
  const plotR = o.width - 200
  let body = heading(d.title, 12)
  d.parameters.forEach((p, i) => {
    const y0 = top + i * ROW_H
    const l = latest(p)
    const state = alarmState(p, l.y)
    const xs = p.points.map((q) => q.x)
    const ys = p.points.flatMap((q) => [q.y, ...(q.y2 !== undefined ? [q.y2] : [])])
    const lo = Math.min(...ys, ...(p.low !== undefined ? [p.low] : []))
    const hi = Math.max(...ys, ...(p.high !== undefined ? [p.high] : []))
    const pad = (hi - lo || 1) * 0.15
    const sx = scaleLinear()
      .domain([Math.min(...xs), Math.max(...xs) || 1])
      .range([plotL, plotR])
    const sy = scaleLinear()
      .domain([lo - pad, hi + pad])
      .range([y0 + ROW_H - 12, y0 + 8])
    body += `<rect x="12" y="${y0}" width="${n(o.width - 24)}" height="${ROW_H - 6}" fill="#f4f1ea" stroke="${GRID}"/>`
    body += text(22, y0 + 24, p.label, { size: 13, weight: 700 })
    body += text(22, y0 + 44, `${p.unit}  ${limits(p)}`, { size: 11, fill: MUTED })
    for (const [lim, name] of [
      [p.high, 'high'],
      [p.low, 'low'],
    ] as const) {
      if (lim === undefined) continue
      const ly = sy(lim)
      body += `<line x1="${n(plotL)}" x2="${n(plotR)}" y1="${n(ly)}" y2="${n(ly)}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="5 4"/>`
      body += text(plotR + 4, ly + 4, `${name === 'high' ? 'H' : 'L'} ${lim}`, {
        size: 10,
        fill: MUTED,
      })
    }
    const sorted = [...p.points].sort((a, b) => a.x - b.x)
    const path = (key: 'y' | 'y2') =>
      sorted
        .filter((q) => (key === 'y' ? true : q.y2 !== undefined))
        .map((q, k) => `${k ? 'L' : 'M'}${n(sx(q.x))} ${n(sy(key === 'y' ? q.y : q.y2!))}`)
        .join('')
    body += `<path d="${path('y')}" fill="none" stroke="${INK}" stroke-width="2"/>`
    if (sorted.some((q) => q.y2 !== undefined))
      body += `<path d="${path('y2')}" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="6 3"/>`
    body += `<circle cx="${n(sx(l.x))}" cy="${n(sy(l.y))}" r="4" fill="${INK}"/>`
    const sym = state === 'ok' ? '' : state === 'high' ? '▲ ' : '▼ '
    body += text(o.width - 24, y0 + 32, valueText(p, l), {
      size: 26,
      weight: 700,
      anchor: 'end',
      fill: state === 'ok' ? INK : '#b3121b',
    })
    body += text(o.width - 24, y0 + 52, `${sym}${ALARM_WORD[state]}`, {
      size: 11,
      weight: 700,
      anchor: 'end',
      fill: state === 'ok' ? MUTED : '#b3121b',
    })
  })
  const by = top + d.parameters.length * ROW_H + 6
  body += `<line x1="${plotL}" x2="${n(plotR)}" y1="${by - 8}" y2="${by - 8}" stroke="${AXIS}" stroke-width="0"/>`
  body += text(
    12,
    by + 12,
    `Simulated data for exercise use, not a real patient. Time axis: ${d.xLabel}.`,
    {
      size: 11,
      fill: MUTED,
    },
  )
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Bedside monitor',
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: monitorTable(d),
  }
}

export const vitalsMonitorKind: FigureKind<VitalsMonitorData> = {
  kind: 'vitals_monitor',
  schema: VitalsMonitorData,
  render: renderMonitor,
  defaultHeight: 420,
}

// ---------------------------------------------------------------- flowsheet

export const VitalsFlowsheetData = z
  .object({
    title: z.string().max(200).optional(),
    patient: z.string().max(120).default('Simulated patient'),
    columns: z
      .array(
        z.object({
          label: z.string().min(1).max(40),
          unit: z.string().max(20).default(''),
          low: z.number().finite().optional(),
          high: z.number().finite().optional(),
        }),
      )
      .min(1)
      .max(9),
    rows: z
      .array(
        z.object({
          time: z.string().min(1).max(20),
          /** One value per column: a number, text ("118/72"), or null for not taken. */
          values: z.array(z.union([z.number().finite(), z.string().max(30), z.null()])),
        }),
      )
      .min(1)
      .max(48),
  })
  .refine((d) => d.rows.every((r) => r.values.length === d.columns.length), {
    message: 'every row needs one value per column',
  })
export type VitalsFlowsheetData = z.infer<typeof VitalsFlowsheetData>

function cellState(
  c: VitalsFlowsheetData['columns'][number],
  v: number | string | null,
): AlarmState {
  const num = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.split('/')[0]) : NaN
  return Number.isFinite(num) ? alarmState(c, num) : 'ok'
}

const cellText = (v: number | string | null): string => (v === null ? '' : String(v))

function renderFlowsheet(
  d: VitalsFlowsheetData,
  o: { width: number; height: number },
): FigureResult {
  const top = d.title ? 36 : 8
  const inner = o.width - 24
  const first = 90
  const colW = (inner - first) / d.columns.length
  let body = heading(d.title, 12)
  body += `<rect x="12" y="${top}" width="${n(inner)}" height="40" fill="${INK}"/>`
  body += text(20, top + 25, 'Time', { size: 12, weight: 700, fill: '#ffffff' })
  d.columns.forEach((c, i) => {
    const x = 12 + first + i * colW
    body += text(x + colW - 8, top + 17, c.label, {
      size: 11,
      weight: 700,
      fill: '#ffffff',
      anchor: 'end',
    })
    if (c.unit)
      body += text(x + colW - 8, top + 32, c.unit, { size: 10, fill: '#ffffff', anchor: 'end' })
  })
  let flagged = 0
  d.rows.forEach((r, ri) => {
    const y = top + 40 + ri * 28
    body += `<rect x="12" y="${y}" width="${n(inner)}" height="28" fill="${ri % 2 ? '#ffffff' : '#f6efdc'}"/>`
    body += text(20, y + 19, r.time, { size: 13, weight: 600 })
    r.values.forEach((v, i) => {
      const c = d.columns[i]!
      const state = cellState(c, v)
      const x = 12 + first + i * colW
      if (state !== 'ok') {
        flagged++
        body += `<rect x="${n(x + 2)}" y="${y + 2}" width="${n(colW - 4)}" height="24" fill="none" stroke="#b3121b" stroke-width="2"/>`
      }
      const mark = state === 'high' ? 'H ' : state === 'low' ? 'L ' : ''
      body += text(x + colW - 8, y + 19, `${mark}${cellText(v)}`, {
        size: 13,
        weight: state === 'ok' ? 400 : 700,
        anchor: 'end',
        fill: state === 'ok' ? INK : '#b3121b',
      })
    })
  })
  const height = top + 40 + d.rows.length * 28 + 30
  body += text(
    12,
    height - 10,
    'H above and L below the limit for the column. Simulated data, not a real patient.',
    {
      size: 11,
      fill: MUTED,
    },
  )
  const summary =
    `${d.title ?? 'Vital signs flowsheet'} for ${d.patient}: ${d.rows.length} readings from ${d.rows[0]!.time} to ${d.rows.at(-1)!.time} ` +
    `of ${d.columns.map((c) => c.label).join(', ')}. ${flagged} values are outside their limits (marked H or L).`
  const table: FigureTable = {
    caption: `${d.patient}: flowsheet`,
    columns: ['Time', ...d.columns.map((c) => `${c.label}${c.unit ? ` (${c.unit})` : ''}`)],
    rows: d.rows.map((r) => [
      r.time,
      ...r.values.map((v, i) => {
        const s = cellState(d.columns[i]!, v)
        return `${s === 'high' ? 'H ' : s === 'low' ? 'L ' : ''}${cellText(v)}`
      }),
    ]),
  }
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Vital signs flowsheet',
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table,
  }
}

export const vitalsFlowsheetKind: FigureKind<VitalsFlowsheetData> = {
  kind: 'vitals_flowsheet',
  schema: VitalsFlowsheetData,
  render: renderFlowsheet,
  defaultHeight: 300,
}
