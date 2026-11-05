// space_magnetometer, space_solar_wind and space_gic_series: line charts on a UTC time axis with
// optional reference lines and event markers (spec 0468 FR-5). Each series differs by color,
// dash and marker, every marker is labeled in words, and every figure has a summary and a table.
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { makeXAxis } from '../axis'
import { fmt, frame, heading, legend, marker, n, text } from '../svg'
import { INK, MUTED, seriesStyle } from '../theme'
import type { FigureKind, FigureResult } from '../types'
import {
  IsoTime,
  Title,
  bottomAxis,
  hashKey,
  leftTicks,
  pathOf,
  simulatedStamp,
  thin,
  utcShort,
} from './common'

const Point = z.object({ time: IsoTime, value: z.number().finite() })
const Mark = z.object({ time: IsoTime, label: z.string().min(1).max(80) })
const Threshold = z.object({ value: z.number().finite(), label: z.string().min(1).max(80) })

interface LineSpec {
  title: string
  yLabel: string
  unit: string
  series: { name: string; points: z.infer<typeof Point>[] }[]
  thresholds: z.infer<typeof Threshold>[]
  marks: z.infer<typeof Mark>[]
  markLabel: string
  simulated: boolean
  idData: unknown
  /** A closing sentence for the summary. */
  extra?: string
}

const M = { left: 66, right: 24, bottom: 54 }

function renderLines(spec: LineSpec, o: { width: number; height: number }): FigureResult {
  const series = spec.series.map((s) => ({
    ...s,
    points: [...s.points].sort((a, b) => Date.parse(a.time) - Date.parse(b.time)),
  }))
  const all = series.flatMap((s) => s.points)
  const showLegend = series.length > 1
  const top = spec.title ? 44 : 22
  const plotB = o.height - M.bottom - (showLegend ? 22 : 0)
  const plotR = o.width - M.right
  const x = makeXAxis([...all.map((p) => p.time), ...spec.marks.map((m) => m.time)], M.left, plotR)
  const vals = [...all.map((p) => p.value), ...spec.thresholds.map((t) => t.value)]
  const y = scaleLinear()
    .domain([Math.min(...vals), Math.max(...vals)])
    .nice()
    .range([plotB, top + 14])

  let body = heading(spec.title, M.left)
  body += leftTicks(
    y.ticks(5).map((v) => ({ y: y(v), label: fmt(v) })),
    M.left,
    plotR,
  )
  body += text(14, (top + plotB) / 2, spec.yLabel, {
    size: 11,
    fill: MUTED,
    extra: `transform="rotate(-90 14 ${n((top + plotB) / 2)})"`,
  })
  for (const t of spec.thresholds) {
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(y(t.value))}" y2="${n(y(t.value))}" stroke="${INK}" stroke-width="1.6" stroke-dasharray="6 4"/>`
    body += text(M.left + 6, y(t.value) - 5, t.label, { size: 11, weight: 600 })
  }
  series.forEach((s, i) => {
    const st = seriesStyle(i)
    body += `<path d="${pathOf(s.points.map((p) => [x.position(p.time), y(p.value)]))}" fill="none" stroke="${st.color}" stroke-width="2.2" stroke-linejoin="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>`
    const every = Math.max(1, Math.ceil(s.points.length / 8))
    s.points.forEach((p, k) => {
      if (k % every === 0 || k === s.points.length - 1)
        body += marker(st.marker, x.position(p.time), y(p.value), st.color)
    })
  })
  const marks = [...spec.marks].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  marks.forEach((m, i) => {
    const px = x.position(m.time)
    body += `<line x1="${n(px)}" x2="${n(px)}" y1="${n(top + 14)}" y2="${n(plotB)}" stroke="${INK}" stroke-width="1.4" stroke-dasharray="2 3"/>`
    body += text(px + 4, top + 26 + (i % 3) * 13, `${i + 1}. ${m.label}`, {
      size: 11,
      weight: 700,
      anchor: px > plotR - 170 ? 'end' : 'start',
      extra: px > plotR - 170 ? `dx="-8"` : '',
    })
  })
  body += bottomAxis(x, M.left, plotR, plotB)
  if (showLegend)
    body += legend(
      series.map((s, i) => ({
        name: s.name,
        swatch: (sx, sy) =>
          `<line x1="${n(sx)}" x2="${n(sx + 28)}" y1="${n(sy)}" y2="${n(sy)}" stroke="${seriesStyle(i).color}" stroke-width="2.4"${seriesStyle(i).dash ? ` stroke-dasharray="${seriesStyle(i).dash}"` : ''}/>`,
      })),
      M.left,
      o.height - 14,
      o.width - 10,
    ).svg
  if (spec.simulated) body += simulatedStamp(o.width - 10, 20)

  const parts = series.map((s) => {
    const hi = s.points.reduce((a, b) => (b.value > a.value ? b : a))
    const lo = s.points.reduce((a, b) => (b.value < a.value ? b : a))
    return `${s.name} ranges from ${fmt(lo.value)} to ${fmt(hi.value)} ${spec.unit} (maximum at ${utcShort(hi.time)})`
  })
  const summary =
    `${spec.title}${spec.simulated ? ' (simulated)' : ''}: ${parts.join('; ')}. ` +
    (marks.length
      ? `${spec.markLabel}: ${marks.map((m, i) => `${i + 1}. ${m.label} at ${utcShort(m.time)}`).join('; ')}. `
      : '') +
    (spec.thresholds.length
      ? `Reference lines: ${spec.thresholds.map((t) => `${t.label} (${fmt(t.value)} ${spec.unit})`).join('; ')}. `
      : '') +
    (spec.extra ?? '')
  const rows: [string, string, string][] = series.flatMap((s) =>
    s.points.map(
      (p) => [p.time, s.name, `${fmt(p.value)} ${spec.unit}`] as [string, string, string],
    ),
  )
  rows.sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]))
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: spec.title,
      summary: summary.trim(),
      body,
      idKey: hashKey(spec.idData),
    }),
    summary: summary.trim(),
    table: {
      caption: spec.title,
      columns: ['Time', 'Series', `Value (${spec.unit})`],
      rows: thin(rows, 60).map(([t, name, v]) => [utcShort(t), name, v]),
    },
  }
}

export const MagnetometerData = z.object({
  title: Title,
  station: z.string().max(80).optional(),
  /** Components or stations, each a series of nT. */
  series: z
    .array(z.object({ name: z.string().min(1).max(40), points: z.array(Point).min(1).max(3000) }))
    .min(1)
    .max(3),
  simulated: z.boolean().default(false),
})
export type MagnetometerData = z.infer<typeof MagnetometerData>

export const magnetometerKind: FigureKind<MagnetometerData> = {
  kind: 'space_magnetometer',
  schema: MagnetometerData,
  defaultHeight: 400,
  render: (d, o) =>
    renderLines(
      {
        title: d.title ?? `Magnetometer${d.station ? `, ${d.station}` : ''}`,
        yLabel: 'Field (nT)',
        unit: 'nT',
        series: d.series,
        thresholds: [],
        marks: [],
        markLabel: '',
        simulated: d.simulated,
        idData: d,
      },
      o,
    ),
}

export const SolarWindData = z.object({
  title: Title,
  /** Solar wind speed at the upstream monitor, km/s. */
  points: z.array(Point).min(1).max(3000),
  /** Shock or arrival times at the monitor. */
  marks: z.array(Mark).max(6).default([]),
  thresholds: z.array(Threshold).max(4).default([]),
  simulated: z.boolean().default(false),
})
export type SolarWindData = z.infer<typeof SolarWindData>

export const solarWindKind: FigureKind<SolarWindData> = {
  kind: 'space_solar_wind',
  schema: SolarWindData,
  defaultHeight: 380,
  render: (d, o) =>
    renderLines(
      {
        title: d.title ?? 'Solar wind speed at the upstream monitor',
        yLabel: 'Speed (km/s)',
        unit: 'km/s',
        series: [{ name: 'Solar wind speed', points: d.points }],
        thresholds: d.thresholds,
        marks: d.marks,
        markLabel: 'Events',
        simulated: d.simulated,
        idData: d,
      },
      o,
    ),
}

export const GicSeriesData = z.object({
  title: Title,
  /** The monitored transformer neutral or substation. */
  site: z.string().min(1).max(120),
  /** Neutral current in amperes. */
  points: z.array(Point).min(1).max(3000),
  /** Operator actions: the procedure applied, reactive resources on line, and so on. */
  actions: z.array(Mark).max(8).default([]),
  alarmAmps: z.number().finite().positive().optional(),
  simulated: z.boolean().default(false),
})
export type GicSeriesData = z.infer<typeof GicSeriesData>

export const gicSeriesKind: FigureKind<GicSeriesData> = {
  kind: 'space_gic_series',
  schema: GicSeriesData,
  defaultHeight: 400,
  render: (d, o) => {
    const first = d.alarmAmps
      ? [...d.points]
          .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
          .find((p) => Math.abs(p.value) >= d.alarmAmps!)
      : undefined
    return renderLines(
      {
        title: d.title ?? `Neutral current, ${d.site}`,
        yLabel: 'Neutral current (A)',
        unit: 'A',
        series: [{ name: d.site, points: d.points }],
        thresholds: d.alarmAmps
          ? [{ value: d.alarmAmps, label: `Alarm ${fmt(d.alarmAmps)} A` }]
          : [],
        marks: d.actions,
        markLabel: 'Operator actions',
        simulated: d.simulated,
        idData: d,
        extra: first ? `The alarm level was first reached at ${utcShort(first.time)}.` : undefined,
      },
      o,
    )
  },
}
