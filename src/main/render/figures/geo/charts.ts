// Earth science chart figures (spec 0450 FR-8): seismogram, aftershock time-magnitude plot with
// cumulative count, early warning timeline, volcano monitoring series and tide gauge / DART
// record. Same rules as every figure: exact, deterministic, a summary and a data table, and no
// meaning carried by color alone (dash, marker and words as well).
import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import { z } from 'zod'
import { XValue, sameXKind, xLabel, toNumber } from '../axis'
import { AXIS, GRID, INK, MUTED } from '../theme'
import { fmt, frame, heading, marker, n, text } from '../svg'
import { timeSeriesKind } from '../time-series'
import type { FigureKind, FigureResult } from '../types'

const Title = z.string().max(200).optional()
const M = { left: 62, right: 24 }

function axes(
  x: (v: number) => number,
  y: (v: number) => number,
  xt: number[],
  yt: number[],
  plot: { l: number; r: number; t: number; b: number },
  xl: (v: number) => string = fmt,
): string {
  let out = ''
  for (const t of yt) {
    out += `<line x1="${plot.l}" x2="${n(plot.r)}" y1="${n(y(t))}" y2="${n(y(t))}" stroke="${GRID}"/>`
    out += text(plot.l - 8, y(t) + 4, fmt(t), { size: 11, anchor: 'end', fill: MUTED })
  }
  out += `<line x1="${plot.l}" x2="${n(plot.r)}" y1="${n(plot.b)}" y2="${n(plot.b)}" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const t of xt) {
    out += `<line x1="${n(x(t))}" x2="${n(x(t))}" y1="${n(plot.b)}" y2="${n(plot.b + 5)}" stroke="${AXIS}"/>`
    out += text(x(t), plot.b + 18, xl(t), { size: 11, anchor: 'middle', fill: MUTED })
  }
  return out
}

// ---- seismogram -----------------------------------------------------------------------------

export const SeismogramData = z.object({
  title: Title,
  network: z.string().max(10).optional(),
  station: z.string().min(1).max(10),
  channel: z.string().max(10).optional(),
  start: z.string().max(40).optional(),
  sampleRateHz: z.number().positive().max(1000),
  unit: z.string().max(20).default('counts'),
  samples: z.array(z.number().finite()).min(2).max(20000),
  picks: z
    .array(z.object({ phase: z.string().min(1).max(8), seconds: z.number().finite().min(0) }))
    .max(6)
    .default([]),
  citation: z.string().max(200).optional(),
})
type SeismogramData = z.infer<typeof SeismogramData>

function seismogram(d: SeismogramData, o: { width: number; height: number }): FigureResult {
  const dur = (d.samples.length - 1) / d.sampleRateHz
  const peak = d.samples.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0)
  const peakAt = d.samples.indexOf(peak) / d.sampleRateHz
  const id = [d.network, d.station, d.channel].filter(Boolean).join('.')
  const top = d.title ? 44 : 18
  const keyH = 18 * Math.max(1, d.picks.length) + (d.citation ? 18 : 0)
  const plot = { l: M.left, r: o.width - M.right, t: top, b: o.height - 48 - keyH }
  const half = Math.max(1, Math.abs(peak)) * 1.1
  const xs = scaleLinear().domain([0, dur]).range([plot.l, plot.r])
  const ys = scaleLinear().domain([-half, half]).range([plot.b, plot.t])
  const step = Math.max(1, Math.floor(d.samples.length / ((plot.r - plot.l) * 2)))
  const trace = line<number>()
    .x((_, i) => xs((i * step) / d.sampleRateHz))
    .y((v) => ys(v))(d.samples.filter((_, i) => i % step === 0))
  let body = heading(d.title, M.left)
  body += axes(xs, ys, xs.ticks(6), ys.ticks(4), plot, (v) => `${fmt(v)}`)
  body += `<line x1="${plot.l}" x2="${n(plot.r)}" y1="${n(ys(0))}" y2="${n(ys(0))}" stroke="${MUTED}" stroke-dasharray="2 3"/>`
  body += `<path d="${trace}" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`
  body += text((plot.l + plot.r) / 2, plot.b + 36, `Seconds${d.start ? ` after ${d.start}` : ''}`, {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
  })
  body += text(0, 0, `${id} (${d.unit})`, {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
    extra: `transform="translate(14 ${n((plot.t + plot.b) / 2)}) rotate(-90)"`,
  })
  d.picks.forEach((p, i) => {
    const px = xs(p.seconds)
    body += `<line x1="${n(px)}" x2="${n(px)}" y1="${plot.t}" y2="${n(plot.b)}" stroke="#b3121b" stroke-width="1.5" stroke-dasharray="6 3"/>`
    body +=
      `<circle cx="${n(px)}" cy="${n(plot.t + 9)}" r="9" fill="#b3121b"/>` +
      text(px, plot.t + 13, p.phase, { size: 11, weight: 700, fill: '#ffffff', anchor: 'middle' })
    body += text(plot.l, plot.b + 54 + i * 18, `${p.phase} arrival at ${fmt(p.seconds)} s`, {
      size: 12,
    })
  })
  if (d.citation) body += text(plot.l, o.height - 8, d.citation, { size: 11, fill: MUTED })
  const summary =
    `${d.title ?? 'Seismogram'}: ${id} trace of ${fmt(dur)} seconds at ${fmt(d.sampleRateHz)} samples per second. ` +
    `Peak amplitude ${fmt(peak)} ${d.unit} at ${fmt(peakAt)} s.` +
    (d.picks.length
      ? ` Arrivals: ${d.picks.map((p) => `${p.phase} at ${fmt(p.seconds)} s`).join(', ')}.`
      : '') +
    (d.citation ? ` Data: ${d.citation}.` : '')
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Seismogram',
      summary,
      body,
      idKey: JSON.stringify(d.picks) + id + d.samples.length + peak,
    }),
    summary,
    table: {
      caption: 'Trace summary',
      columns: ['Item', 'Value'],
      rows: [
        ['Station', id],
        ['Duration (s)', fmt(dur)],
        [`Peak amplitude (${d.unit})`, fmt(peak)],
        ['Peak time (s)', fmt(peakAt)],
        ...d.picks.map((p) => [`${p.phase} arrival (s)`, fmt(p.seconds)]),
      ],
    },
  }
}

// ---- aftershock_plot ------------------------------------------------------------------------

export const AftershockData = z.object({
  title: Title,
  mainshockMagnitude: z.number().finite().min(0).max(10),
  xUnit: z.enum(['hours', 'days']).default('days'),
  events: z
    .array(
      z.object({ t: z.number().finite().min(0), magnitude: z.number().finite().min(-2).max(10) }),
    )
    .min(1)
    .max(5000),
  minMagnitude: z.number().finite().default(2),
})
type AftershockData = z.infer<typeof AftershockData>

function aftershock(d: AftershockData, o: { width: number; height: number }): FigureResult {
  const ev = [...d.events].sort((a, b) => a.t - b.t)
  const tMax = Math.max(...ev.map((e) => e.t)) || 1
  const mMax = Math.max(d.mainshockMagnitude, ...ev.map((e) => e.magnitude))
  const plot = { l: M.left, r: o.width - M.right - 40, t: d.title ? 44 : 18, b: o.height - 66 }
  const xs = scaleLinear().domain([0, tMax]).nice().range([plot.l, plot.r])
  const ys = scaleLinear()
    .domain([d.minMagnitude, Math.ceil(mMax)])
    .range([plot.b, plot.t])
  const cs = scaleLinear().domain([0, ev.length]).nice().range([plot.b, plot.t])
  let body = heading(d.title, M.left)
  body += axes(xs, ys, xs.ticks(7), ys.ticks(5), plot)
  body += text((plot.l + plot.r) / 2, plot.b + 38, `Time since mainshock (${d.xUnit})`, {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
  })
  body += text(0, 0, 'Magnitude', {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
    extra: `transform="translate(14 ${n((plot.t + plot.b) / 2)}) rotate(-90)"`,
  })
  body += text(0, 0, 'Cumulative number', {
    size: 12,
    anchor: 'middle',
    fill: '#1f5fbf',
    extra: `transform="translate(${n(o.width - 12)} ${n((plot.t + plot.b) / 2)}) rotate(90)"`,
  })
  for (const t of cs.ticks(5))
    body += text(plot.r + 6, cs(t) + 4, fmt(t), { size: 11, fill: '#1f5fbf' })
  let count = 0
  const steps = ev.map((e) => [xs(e.t), cs(++count)] as const)
  const path = steps.reduce(
    (p, [x, y], i) => `${p}${i ? `H${n(x)}V${n(y)}` : `M${n(x)} ${n(y)}`}`,
    '',
  )
  body += `<path d="${path}" fill="none" stroke="#1f5fbf" stroke-width="2.5" stroke-dasharray="7 4"/>`
  for (const e of ev)
    body += `<circle cx="${n(xs(e.t))}" cy="${n(ys(e.magnitude))}" r="${n(1.5 + Math.max(0, e.magnitude - d.minMagnitude) * 0.9)}" fill="rgba(179,18,27,0.2)" stroke="#b3121b" stroke-width="1.2"/>`
  body += text(
    plot.l,
    o.height - 10,
    'Circles: individual aftershocks (size and height show magnitude). Dashed line: cumulative count.',
    { size: 11, fill: MUTED },
  )
  const bins = [3, 4, 5, 6]
  const countAtLeast = (m: number): number => ev.filter((e) => e.magnitude >= m).length
  const summary =
    `${d.title ?? 'Aftershock sequence'}: ${ev.length} aftershocks of M ${d.minMagnitude} or larger over ${fmt(tMax)} ${d.xUnit} after an M ${d.mainshockMagnitude} mainshock. ` +
    `Largest M ${fmt(Math.max(...ev.map((e) => e.magnitude)))}. ` +
    bins.map((m) => `${countAtLeast(m)} of M ${m} or larger`).join(', ') +
    '.'
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Aftershock sequence',
      summary,
      body,
      idKey: summary + ev.length,
    }),
    summary,
    table: {
      caption: 'Aftershocks at or above each magnitude',
      columns: ['Magnitude', 'Aftershocks'],
      rows: [
        [`M ${d.minMagnitude} or larger`, String(ev.length)],
        ...bins.map((m) => [`M ${m} or larger`, String(countAtLeast(m))]),
      ],
    },
  }
}

// ---- eew_timeline ---------------------------------------------------------------------------

export const EewTimelineData = z.object({
  title: Title,
  origin: z.string().max(60),
  places: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        distanceKm: z.number().finite().min(0).max(5000),
        /** Seconds after the origin time when the alert reached the place. */
        alertSec: z.number().finite().min(0),
        /** Seconds after the origin time when strong shaking arrived. */
        shakingSec: z.number().finite().min(0),
      }),
    )
    .min(1)
    .max(15),
})
type EewTimelineData = z.infer<typeof EewTimelineData>

function eewTimeline(d: EewTimelineData, o: { width: number; height: number }): FigureResult {
  const rows = [...d.places].sort((a, b) => a.distanceKm - b.distanceKm)
  const xMax = Math.max(...rows.flatMap((r) => [r.alertSec, r.shakingSec])) * 1.1 || 10
  const top = d.title ? 44 : 18
  const rowH = Math.min(46, Math.max(30, (o.height - top - 70) / rows.length))
  const h = top + rows.length * rowH + 70
  const plot = { l: 190, r: o.width - M.right, t: top, b: top + rows.length * rowH }
  const xs = scaleLinear().domain([0, xMax]).nice().range([plot.l, plot.r])
  let body = heading(d.title, 16)
  for (const t of xs.ticks(7)) {
    body += `<line x1="${n(xs(t))}" x2="${n(xs(t))}" y1="${plot.t}" y2="${n(plot.b)}" stroke="${GRID}"/>`
    body += text(xs(t), plot.b + 16, `${fmt(t)} s`, { size: 11, anchor: 'middle', fill: MUTED })
  }
  body += text((plot.l + plot.r) / 2, plot.b + 34, `Seconds after origin time (${d.origin})`, {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
  })
  const verdicts = rows.map((r) => {
    const w = r.shakingSec - r.alertSec
    return { r, w, late: w <= 0 }
  })
  verdicts.forEach(({ r, w, late }, i) => {
    const y = plot.t + i * rowH + rowH / 2
    body += text(16, y - 2, r.name, { size: 12, weight: 600 })
    body += text(16, y + 12, `${fmt(r.distanceKm)} km from the epicenter`, {
      size: 11,
      fill: MUTED,
    })
    const x1 = xs(Math.min(r.alertSec, r.shakingSec))
    const x2 = xs(Math.max(r.alertSec, r.shakingSec))
    body += `<line x1="${n(x1)}" x2="${n(x2)}" y1="${n(y)}" y2="${n(y)}" stroke="${late ? '#b3121b' : '#1b7a3a'}" stroke-width="4" ${late ? 'stroke-dasharray="6 3"' : ''}/>`
    body += marker('circle', xs(r.alertSec), y, '#1f5fbf')
    body += marker('square', xs(r.shakingSec), y, '#b3121b')
    const note = late ? `alert ${fmt(-w)} s after shaking` : `${fmt(w)} s of warning`
    const fits = x2 + 130 <= plot.r
    body += text(fits ? x2 + 10 : x2, fits ? y + 4 : y - 10, note, {
      size: 11,
      weight: 600,
      anchor: fits ? 'start' : 'end',
    })
  })
  body +=
    marker('circle', plot.l, h - 12, '#1f5fbf') +
    text(plot.l + 10, h - 8, 'Alert received', { size: 11, fill: MUTED })
  body +=
    marker('square', plot.l + 130, h - 12, '#b3121b') +
    text(plot.l + 140, h - 8, 'Strong shaking arrives', { size: 11, fill: MUTED })
  const summary =
    `${d.title ?? 'Early warning timeline'}: alert time against strong shaking arrival at ${rows.length} places, origin ${d.origin}. ` +
    verdicts
      .map(
        ({ r, w, late }) =>
          `${r.name} (${fmt(r.distanceKm)} km): ${late ? `alert ${fmt(-w)} seconds after shaking began` : `${fmt(w)} seconds of warning`}`,
      )
      .join('; ') +
    '.'
  return {
    svg: frame({
      width: o.width,
      height: h,
      title: d.title ?? 'Early warning timeline',
      summary,
      body,
      idKey: summary,
    }),
    summary,
    table: {
      caption: 'Alert and shaking times',
      columns: ['Place', 'Distance (km)', 'Alert (s)', 'Shaking (s)', 'Warning (s)'],
      rows: verdicts.map(({ r, w }) => [
        r.name,
        fmt(r.distanceKm),
        fmt(r.alertSec),
        fmt(r.shakingSec),
        w > 0 ? fmt(w) : `none (late by ${fmt(-w)})`,
      ]),
    },
  }
}

// ---- monitoring_series ----------------------------------------------------------------------

const Pt = z.object({ x: XValue, y: z.number().finite() })
export const MonitoringData = z
  .object({
    title: Title,
    panels: z
      .array(
        z.object({
          label: z.string().min(1).max(60),
          unit: z.string().max(20).optional(),
          points: z.array(Pt).min(2).max(2000),
        }),
      )
      .min(1)
      .max(4),
    annotations: z
      .array(z.object({ x: XValue, label: z.string().min(1).max(120) }))
      .max(6)
      .default([]),
  })
  .refine(
    (d) =>
      sameXKind([
        ...d.panels.flatMap((p) => p.points.map((q) => q.x)),
        ...d.annotations.map((a) => a.x),
      ]),
    {
      message: 'x values must be all numbers or all date-time strings',
    },
  )
type MonitoringData = z.infer<typeof MonitoringData>

function monitoring(d: MonitoringData, o: { width: number; height: number }): FigureResult {
  const headH = d.title ? 34 : 4
  const panelH = Math.floor((o.height - headH) / d.panels.length)
  const parts = d.panels.map((p, i) => {
    const r = timeSeriesKind.render(
      {
        title: p.label,
        unit: p.unit,
        series: [{ name: p.label, points: p.points }],
        thresholds: [],
        annotations: i === 0 ? d.annotations : [],
      },
      { width: o.width, height: panelH },
    )
    return { p, r }
  })
  const body =
    heading(d.title, 14) +
    parts
      .map(({ r }, i) => r.svg.replace('<svg ', `<svg x="0" y="${headH + i * panelH}" `))
      .join('')
  const summary =
    `${d.title ?? 'Volcano monitoring'}: ${d.panels.length} stacked panels on one time axis. ` +
    parts.map(({ r }) => r.summary).join(' ')
  return {
    svg: frame({
      width: o.width,
      height: headH + panelH * d.panels.length,
      title: d.title ?? 'Monitoring series',
      summary,
      body,
      idKey: summary,
    }),
    summary,
    table: {
      caption: 'Panel readings',
      columns: ['Panel', 'First', 'Last', 'Peak', 'When peak'],
      rows: d.panels.map((p) => {
        const sorted = [...p.points].sort((a, b) => toNumber(a.x) - toNumber(b.x))
        const peak = sorted.reduce((m, q) => (q.y > m.y ? q : m), sorted[0]!)
        const u = p.unit ? ` ${p.unit}` : ''
        return [
          p.label,
          `${fmt(sorted[0]!.y)}${u}`,
          `${fmt(sorted[sorted.length - 1]!.y)}${u}`,
          `${fmt(peak.y)}${u}`,
          xLabel(peak.x),
        ]
      }),
    },
  }
}

// ---- gauge_record ---------------------------------------------------------------------------

export const GaugeRecordData = z
  .object({
    title: Title,
    station: z.string().min(1).max(80),
    unit: z.string().max(20).default('m'),
    observed: z.array(Pt).min(2).max(3000),
    predicted: z.array(Pt).max(3000).default([]),
    arrivals: z
      .array(z.object({ x: XValue, label: z.string().min(1).max(120) }))
      .max(6)
      .default([]),
    citation: z.string().max(160).optional(),
  })
  .refine(
    (d) =>
      sameXKind([
        ...d.observed.map((p) => p.x),
        ...d.predicted.map((p) => p.x),
        ...d.arrivals.map((a) => a.x),
      ]),
    {
      message: 'x values must be all numbers or all date-time strings',
    },
  )
type GaugeRecordData = z.infer<typeof GaugeRecordData>

function gaugeRecord(d: GaugeRecordData, o: { width: number; height: number }): FigureResult {
  const series = [{ name: `${d.station} observed`, points: d.observed }]
  if (d.predicted.length) series.push({ name: 'Predicted tide', points: d.predicted })
  const base = timeSeriesKind.render(
    {
      title: d.title ?? `${d.station} water level`,
      yLabel: 'Water level',
      unit: d.unit,
      series,
      thresholds: [],
      annotations: d.arrivals,
    },
    o,
  )
  const peak = d.observed.reduce((m, p) => (p.y > m.y ? p : m), d.observed[0]!)
  const trough = d.observed.reduce((m, p) => (p.y < m.y ? p : m), d.observed[0]!)
  const summary =
    `${d.title ?? 'Tide gauge record'}: ${d.station}. Highest observed level ${fmt(peak.y)} ${d.unit} at ${xLabel(peak.x)}; lowest ${fmt(trough.y)} ${d.unit} at ${xLabel(trough.x)}; range ${fmt(peak.y - trough.y)} ${d.unit}.` +
    (d.arrivals.length
      ? ` ${d.arrivals.map((a, i) => `Note ${i + 1} at ${xLabel(a.x)}: ${a.label}`).join('. ')}.`
      : '') +
    (d.citation ? ` Data: ${d.citation}.` : '')
  const every = Math.max(1, Math.floor(d.observed.length / 24))
  const predictedAt = new Map(d.predicted.map((p) => [toNumber(p.x), p.y]))
  const table = {
    caption: `Water level at ${d.station} (${d.unit}), sampled`,
    columns: d.predicted.length ? ['Time', 'Observed', 'Predicted tide'] : ['Time', 'Observed'],
    rows: d.observed
      .filter((_, i) => i % every === 0 || i === d.observed.length - 1)
      .map((p) =>
        d.predicted.length
          ? [xLabel(p.x), fmt(p.y), fmt(predictedAt.get(toNumber(p.x)) ?? NaN).replace('NaN', '')]
          : [xLabel(p.x), fmt(p.y)],
      ),
  }
  return {
    svg: base.svg.replace(
      /<desc id="([^"]+)">[^<]*<\/desc>/,
      `<desc id="$1">${summary.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</desc>`,
    ),
    summary,
    table,
  }
}

export const GEO_CHART_KINDS: FigureKind<never>[] = [
  { kind: 'seismogram', schema: SeismogramData, render: seismogram, defaultHeight: 360 },
  { kind: 'aftershock_plot', schema: AftershockData, render: aftershock, defaultHeight: 400 },
  { kind: 'eew_timeline', schema: EewTimelineData, render: eewTimeline, defaultHeight: 400 },
  { kind: 'monitoring_series', schema: MonitoringData, render: monitoring, defaultHeight: 620 },
  { kind: 'gauge_record', schema: GaugeRecordData, render: gaugeRecord, defaultHeight: 380 },
] as unknown as FigureKind<never>[]
