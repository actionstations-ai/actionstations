// epi_lab_board, epi_dispensing and epi_wastewater (spec 0457 FR-5).
//
// epi_lab_board: laboratory surge board. One row per laboratory or specimen stream with a bar
// of received specimens split into positive (solid), negative (dotted) and pending (hatched),
// and turnaround against its target stated in words with a shape (circle within target, square
// over target).
// epi_dispensing and epi_wastewater are time series with the field's own summary on top; they
// draw through the generic time_series kind so axes, thresholds and tables behave the same.
import { z } from 'zod'
import { AXIS, INK, MUTED, seriesStyle } from '../theme'
import { fmt, frame, hashId, heading, legend, n, patternDef, text, wrap } from '../svg'
import { timeSeriesKind, type TimeSeriesData } from '../time-series'
import type { FigureKind, FigureResult } from '../types'

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date or time')

// ---- laboratory surge board --------------------------------------------------------------------

export const EpiLabBoardData = z.object({
  title: z.string().max(200).optional(),
  asOf: isoDate.optional(),
  rows: z
    .array(
      z
        .object({
          name: z.string().min(1).max(60),
          received: z.number().int().min(0).max(1_000_000),
          pending: z.number().int().min(0).max(1_000_000),
          positive: z.number().int().min(0).max(1_000_000),
          /** Median hours from receipt to result for completed specimens. */
          turnaroundHours: z.number().min(0).max(1000).optional(),
          targetHours: z.number().min(0).max(1000),
        })
        .refine((r) => r.pending + r.positive <= r.received, {
          message: 'pending plus positive cannot exceed received',
        }),
    )
    .min(1)
    .max(12),
})
export type EpiLabBoardData = z.infer<typeof EpiLabBoardData>

const BARS = [seriesStyle(1), seriesStyle(2), seriesStyle(3)] // positive, negative, pending

function renderLabBoard(d: EpiLabBoardData, o: { width: number; height: number }): FigureResult {
  const id = hashId(JSON.stringify(d))
  const names = ['Positive', 'Negative', 'Pending']
  const defs = BARS.map((s, i) => patternDef(`p${id}-${i}`, s)).join('')
  const lg = legend(
    names.map((name, i) => ({
      name,
      swatch: (x: number, y: number) =>
        `<rect x="${n(x)}" y="${n(y - 7)}" width="26" height="14" fill="url(#p${id}-${i})" stroke="${INK}" stroke-width="0.8"/>`,
    })),
    24,
    d.title ? 42 : 14,
    o.width - 24,
  )
  const top = (d.title ? 42 : 14) + lg.height + 6
  const rowH = 46
  const labelW = 150
  const tatW = 200
  const barX = 24 + labelW
  const barW = o.width - barX - tatW - 24
  const max = Math.max(1, ...d.rows.map((r) => r.received))
  const height = top + d.rows.length * rowH + 14
  let body = heading(d.title, 24) + lg.svg
  const statuses: string[] = []
  d.rows.forEach((r, i) => {
    const y = top + i * rowH
    const negative = r.received - r.pending - r.positive
    body += `<line x1="24" x2="${n(o.width - 24)}" y1="${n(y)}" y2="${n(y)}" stroke="#d8c79e"/>`
    wrap(r.name, 22, 2).forEach((ln, k) => {
      body += text(24, y + 20 + k * 14, ln, { size: 12.5, weight: 700 })
    })
    let x = barX
    ;[r.positive, negative, r.pending].forEach((v, k) => {
      if (v <= 0) return
      const w = (v / max) * barW
      body += `<rect x="${n(x)}" y="${n(y + 8)}" width="${n(w)}" height="22" fill="url(#p${id}-${k})" stroke="#ffffff" stroke-width="0.6"/>`
      x += w
    })
    body += text(
      barX,
      y + 43,
      `${fmt(r.received)} received, ${fmt(r.positive)} positive, ${fmt(r.pending)} pending`,
      { size: 11, fill: MUTED },
    )
    const over = r.turnaroundHours !== undefined && r.turnaroundHours > r.targetHours
    const known = r.turnaroundHours !== undefined
    const status = !known
      ? 'No completed result yet'
      : over
        ? `Over target by ${fmt(r.turnaroundHours! - r.targetHours)} h`
        : 'Within target'
    statuses.push(status)
    const sx = o.width - tatW
    if (known) {
      body += over
        ? `<rect x="${n(sx)}" y="${n(y + 11)}" width="12" height="12" fill="${INK}"/>`
        : `<circle cx="${n(sx + 6)}" cy="${n(y + 17)}" r="6.5" fill="#ffffff" stroke="${INK}" stroke-width="2.2"/>`
    }
    body += text(
      sx + 20,
      y + 21,
      known
        ? `${fmt(r.turnaroundHours!)} h (target ${fmt(r.targetHours)} h)`
        : `Target ${fmt(r.targetHours)} h`,
      { size: 12, weight: 700 },
    )
    body += text(sx + 20, y + 38, status, { size: 11.5, fill: MUTED })
  })
  body += `<line x1="24" x2="${n(o.width - 24)}" y1="${n(top + d.rows.length * rowH)}" y2="${n(top + d.rows.length * rowH)}" stroke="${AXIS}" stroke-width="1.5"/>`
  const totals = d.rows.reduce(
    (a, r) => ({
      received: a.received + r.received,
      pending: a.pending + r.pending,
      positive: a.positive + r.positive,
    }),
    { received: 0, pending: 0, positive: 0 },
  )
  const over = d.rows.filter(
    (r) => r.turnaroundHours !== undefined && r.turnaroundHours > r.targetHours,
  )
  const summary =
    `${d.title ?? 'Laboratory surge board'}${d.asOf ? ` as of ${new Date(Date.parse(d.asOf)).toISOString().slice(0, 16)}Z` : ''}: ` +
    `${d.rows.length} streams, ${fmt(totals.received)} specimens received, ${fmt(totals.positive)} positive, ${fmt(totals.pending)} pending. ` +
    (over.length
      ? `Over the turnaround target: ${over.map((r) => r.name).join(', ')}.`
      : 'All streams with results are within their turnaround target.')
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Laboratory surge board',
      summary,
      defs,
      body,
      idKey: id,
    }),
    summary,
    table: {
      caption: d.title,
      columns: [
        'Stream',
        'Received',
        'Positive',
        'Negative',
        'Pending',
        'Turnaround (h)',
        'Target (h)',
        'Status',
      ],
      rows: d.rows.map((r, i) => [
        r.name,
        String(r.received),
        String(r.positive),
        String(r.received - r.pending - r.positive),
        String(r.pending),
        r.turnaroundHours === undefined ? '' : fmt(r.turnaroundHours),
        fmt(r.targetHours),
        statuses[i]!,
      ]),
    },
  }
}

export const epiLabBoardKind: FigureKind<EpiLabBoardData> = {
  kind: 'epi_lab_board',
  schema: EpiLabBoardData,
  render: renderLabBoard,
}

// ---- dispensing throughput ---------------------------------------------------------------------

export const EpiDispensingData = z.object({
  title: z.string().max(200).optional(),
  /** Interval start times in minutes from opening. */
  intervals: z
    .array(
      z.object({
        startMin: z.number().min(0).max(1440),
        arrivals: z.number().int().min(0).max(100_000),
        served: z.number().int().min(0).max(100_000),
        queue: z.number().int().min(0).max(100_000),
      }),
    )
    .min(2)
    .max(200),
  intervalMinutes: z.number().int().min(1).max(120).default(15),
  stations: z.number().int().min(1).max(500).optional(),
  /** Plan: people per hour. Drawn as a threshold on a per-interval basis. */
  planPerHour: z.number().min(0).max(100_000).optional(),
})
export type EpiDispensingData = z.infer<typeof EpiDispensingData>

function renderDispensing(
  d: EpiDispensingData,
  o: { width: number; height: number },
): FigureResult {
  const k = d.intervalMinutes / 60
  const planPerInterval = d.planPerHour === undefined ? undefined : d.planPerHour * k
  const ts: TimeSeriesData = {
    title: d.title ?? 'Dispensing site throughput',
    xLabel: 'Minutes from opening',
    yLabel: `People per ${d.intervalMinutes} minutes, and people in the queue`,
    series: [
      { name: 'Arrivals', points: d.intervals.map((i) => ({ x: i.startMin, y: i.arrivals })) },
      { name: 'Served', points: d.intervals.map((i) => ({ x: i.startMin, y: i.served })) },
      {
        name: 'Queue at end of interval',
        points: d.intervals.map((i) => ({ x: i.startMin, y: i.queue })),
      },
    ],
    thresholds:
      planPerInterval === undefined
        ? []
        : [{ value: Math.round(planPerInterval), label: `Plan (${d.planPerHour} per hour)` }],
    annotations: [],
  }
  const base = timeSeriesKind.render(ts, o)
  const served = d.intervals.reduce((s, i) => s + i.served, 0)
  const arrived = d.intervals.reduce((s, i) => s + i.arrivals, 0)
  const hours = (d.intervals.length * d.intervalMinutes) / 60
  const peak = d.intervals.reduce((b, i) => (i.queue > b.queue ? i : b), d.intervals[0]!)
  const rate = served / hours
  const summary =
    `${d.title ?? 'Dispensing site throughput'}: ${fmt(arrived)} arrivals and ${fmt(served)} served over ${fmt(hours)} hours` +
    `${d.stations ? ` with ${d.stations} stations` : ''}, ${fmt(rate)} people per hour` +
    `${d.planPerHour === undefined ? '' : ` against a plan of ${fmt(d.planPerHour)}`}. ` +
    `The queue peaks at ${fmt(peak.queue)} people at minute ${fmt(peak.startMin)}. ${base.summary}`
  return { svg: base.svg, summary, ...(base.table ? { table: base.table } : {}) }
}

export const epiDispensingKind: FigureKind<EpiDispensingData> = {
  kind: 'epi_dispensing',
  schema: EpiDispensingData,
  render: renderDispensing,
}

// ---- wastewater series -------------------------------------------------------------------------

export const EpiWastewaterData = z
  .object({
    title: z.string().max(200).optional(),
    site: z.string().max(100).optional(),
    pathogen: z.string().max(60).optional(),
    unit: z.string().max(40).optional(),
    points: z
      .array(z.object({ date: isoDate, value: z.number().finite() }))
      .min(2)
      .max(2000),
    /** The scale's own level starts as published with the data: name and the value where it begins. */
    levels: z
      .array(z.object({ name: z.string().min(1).max(40), from: z.number().finite() }))
      .max(6)
      .default([]),
    /** Where the data came from: "Simulated" or the source and retrieval date. */
    origin: z.string().min(1).max(200),
  })
  .refine((d) => d.levels.length === 0 || d.origin.length > 0, { message: 'origin is required' })
export type EpiWastewaterData = z.infer<typeof EpiWastewaterData>

function renderWastewater(
  d: EpiWastewaterData,
  o: { width: number; height: number },
): FigureResult {
  const label = [d.pathogen, d.site].filter(Boolean).join(', ')
  const ts: TimeSeriesData = {
    title: d.title ?? `Wastewater ${label ? `(${label})` : 'series'}`,
    yLabel: d.unit ? `Wastewater level (${d.unit})` : 'Wastewater level',
    series: [
      { name: label || 'Wastewater', points: d.points.map((p) => ({ x: p.date, y: p.value })) },
    ],
    thresholds: d.levels
      .filter((l) => l.from > 0)
      .map((l) => ({ value: l.from, label: `${l.name} begins` })),
    annotations: [],
  }
  const base = timeSeriesKind.render(ts, o)
  const last = d.points[d.points.length - 1]!
  const levelOf = (v: number): string | undefined =>
    [...d.levels]
      .sort((a, b) => a.from - b.from)
      .filter((l) => v >= l.from)
      .pop()?.name
  const lastLevel = levelOf(last.value)
  const summary =
    `${ts.title}: ${d.points.length} samples. Origin: ${d.origin}. ` +
    (d.levels.length
      ? `Levels as published with the data: ${d.levels.map((l) => `${l.name} from ${fmt(l.from)}`).join(', ')}. `
      : '') +
    (lastLevel ? `The last sample is at level ${lastLevel}. ` : '') +
    base.summary
  return { svg: base.svg, summary, ...(base.table ? { table: base.table } : {}) }
}

export const epiWastewaterKind: FigureKind<EpiWastewaterData> = {
  kind: 'epi_wastewater',
  schema: EpiWastewaterData,
  render: renderWastewater,
}
