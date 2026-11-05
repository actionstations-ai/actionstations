// lab_trend and staffing_vs_demand (spec 0452 FR-5). lab_trend draws one test over time against
// its reference range and critical limits; staffing_vs_demand shows nurses needed against nurses
// on duty by hour and says which hours are short. The second reuses the time series drawing.
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { expectedDirection } from '../../../../shared/clinical/lab'
import { timeSeriesKind } from '../time-series'
import { frame, fmt, heading, n, text } from '../svg'
import { AXIS, GRID, INK, MUTED } from '../theme'
import type { FigureKind, FigureResult } from '../types'

export const LabTrendData = z
  .object({
    title: z.string().max(200).optional(),
    test: z.string().min(1).max(60),
    unit: z.string().max(20).default(''),
    xLabel: z.string().max(60).default('Hours'),
    low: z.number().finite().optional(),
    high: z.number().finite().optional(),
    criticalLow: z.number().finite().optional(),
    criticalHigh: z.number().finite().optional(),
    points: z
      .array(
        z.object({
          x: z.number().finite(),
          y: z.number().finite(),
          label: z.string().max(30).optional(),
        }),
      )
      .min(1)
      .max(120),
  })
  .refine((d) => d.low === undefined || d.high === undefined || d.low <= d.high, {
    message: 'low must not exceed high',
  })
export type LabTrendData = z.infer<typeof LabTrendData>

function flagOf(d: LabTrendData, y: number): string {
  if (
    (d.criticalHigh !== undefined && y >= d.criticalHigh) ||
    (d.criticalLow !== undefined && y <= d.criticalLow)
  )
    return 'CRITICAL'
  const range =
    d.low !== undefined && d.high !== undefined
      ? `${d.low}-${d.high}`
      : d.high !== undefined
        ? `<${d.high}`
        : d.low !== undefined
          ? `>${d.low}`
          : ''
  const dir = range ? expectedDirection(String(y), range) : ''
  return dir === 'H' ? 'HIGH' : dir === 'L' ? 'LOW' : ''
}

function renderLab(d: LabTrendData, o: { width: number; height: number }): FigureResult {
  const pts = [...d.points].sort((a, b) => a.x - b.x)
  const top = d.title ? 40 : 14
  const L = 62
  const R = o.width - 24
  const bottom = o.height - 56
  const ys = [
    ...pts.map((p) => p.y),
    ...[d.low, d.high, d.criticalLow, d.criticalHigh].filter((v): v is number => v !== undefined),
  ]
  const sy = scaleLinear()
    .domain([Math.min(...ys), Math.max(...ys)])
    .nice()
    .range([bottom, top])
  const xs = pts.map((p) => p.x)
  const sx = scaleLinear()
    .domain([Math.min(...xs), Math.max(...xs) || 1])
    .range([L, R])
  let body = heading(d.title ?? `${d.test} trend`, 12)
  for (const t of sy.ticks(5)) {
    body += `<line x1="${L}" x2="${R}" y1="${n(sy(t))}" y2="${n(sy(t))}" stroke="${GRID}"/>`
    body += text(L - 8, sy(t) + 4, fmt(t), { size: 11, anchor: 'end', fill: MUTED })
  }
  if (d.low !== undefined || d.high !== undefined) {
    const yTop = sy(d.high ?? sy.domain()[1]!)
    const yBot = sy(d.low ?? sy.domain()[0]!)
    body += `<rect x="${L}" y="${n(yTop)}" width="${n(R - L)}" height="${n(yBot - yTop)}" fill="#e3f3e8" opacity="0.8"/>`
    body += text(
      R - 4,
      yTop + 14,
      `Reference range ${d.low ?? ''}${d.low !== undefined && d.high !== undefined ? ' to ' : ''}${d.high ?? ''}`,
      { size: 11, anchor: 'end', fill: MUTED },
    )
  }
  for (const [v, name] of [
    [d.criticalHigh, 'Critical high'],
    [d.criticalLow, 'Critical low'],
  ] as const)
    if (v !== undefined) {
      body += `<line x1="${L}" x2="${R}" y1="${n(sy(v))}" y2="${n(sy(v))}" stroke="#b3121b" stroke-width="1.5" stroke-dasharray="7 4"/>`
      body += text(L + 4, sy(v) - 4, `${name} ${v}`, { size: 11, fill: '#b3121b' })
    }
  body += `<line x1="${L}" x2="${R}" y1="${bottom}" y2="${bottom}" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const t of sx.ticks(6))
    body += text(sx(t), bottom + 18, fmt(t), { size: 11, anchor: 'middle', fill: MUTED })
  body += text((L + R) / 2, bottom + 38, `${d.xLabel}`, { size: 12, anchor: 'middle', fill: MUTED })
  body += `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${n(sx(p.x))} ${n(sy(p.y))}`).join('')}" fill="none" stroke="${INK}" stroke-width="2.5"/>`
  for (const p of pts) {
    const f = flagOf(d, p.y)
    body += f
      ? `<rect x="${n(sx(p.x) - 5)}" y="${n(sy(p.y) - 5)}" width="10" height="10" fill="#b3121b" stroke="#fff"/>`
      : `<circle cx="${n(sx(p.x))}" cy="${n(sy(p.y))}" r="4" fill="${INK}" stroke="#fff"/>`
  }
  body += text(L + 4, top - 6, `${d.test}${d.unit ? ` (${d.unit})` : ''}`, {
    size: 11,
    weight: 600,
    fill: MUTED,
  })
  const last = pts.at(-1)!
  const lastFlag = flagOf(d, last.y)
  const summary =
    `${d.title ?? `${d.test} trend`}: ${d.test} goes from ${pts[0]!.y} to ${last.y}${d.unit ? ' ' + d.unit : ''} over ${d.xLabel.toLowerCase()} ${pts[0]!.x} to ${last.x}` +
    `${d.low !== undefined || d.high !== undefined ? `; reference range ${d.low ?? 'none'} to ${d.high ?? 'none'}` : ''}` +
    `${d.criticalHigh !== undefined || d.criticalLow !== undefined ? `; critical limits ${d.criticalLow ?? 'none'} and ${d.criticalHigh ?? 'none'}` : ''}. ` +
    `The latest value is ${lastFlag ? lastFlag.toLowerCase() : 'within range'}. Simulated data.`
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? `${d.test} trend`,
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: `${d.test}${d.unit ? ` (${d.unit})` : ''}`,
      columns: [d.xLabel, 'Value', 'Flag'],
      rows: pts.map((p) => [fmt(p.x), String(p.y), flagOf(d, p.y)]),
    },
  }
}

export const labTrendKind: FigureKind<LabTrendData> = {
  kind: 'lab_trend',
  schema: LabTrendData,
  render: renderLab,
  defaultHeight: 340,
}

// ---------------------------------------------------------------- staffing vs demand

export const StaffingVsDemandData = z.object({
  title: z.string().max(200).optional(),
  unit: z.string().max(80).default('Unit'),
  hours: z
    .array(
      z.object({ x: z.number().finite(), needed: z.number().min(0), onDuty: z.number().min(0) }),
    )
    .min(2)
    .max(72),
  xLabel: z.string().max(60).default('Hour of the shift'),
})
export type StaffingVsDemandData = z.infer<typeof StaffingVsDemandData>

function renderStaffing(
  d: StaffingVsDemandData,
  o: { width: number; height: number },
): FigureResult {
  const hours = [...d.hours].sort((a, b) => a.x - b.x)
  const base = timeSeriesKind.render(
    {
      title: d.title ?? `${d.unit}: nurses needed and on duty`,
      xLabel: d.xLabel,
      yLabel: 'Nurses',
      unit: '',
      series: [
        { name: 'Needed', points: hours.map((h) => ({ x: h.x, y: h.needed })) },
        { name: 'On duty', points: hours.map((h) => ({ x: h.x, y: h.onDuty })) },
      ],
      thresholds: [],
      annotations: [],
    } as never,
    o,
  )
  const short = hours.filter((h) => h.onDuty < h.needed)
  const worst = short.reduce<(typeof hours)[number] | undefined>(
    (w, h) => (!w || h.needed - h.onDuty > w.needed - w.onDuty ? h : w),
    undefined,
  )
  const summary =
    `${d.unit}: nurses needed against nurses on duty over ${hours.length} readings. ` +
    (short.length
      ? `Short in ${short.length} of ${hours.length} readings, by up to ${worst!.needed - worst!.onDuty} nurses at ${fmt(worst!.x)}.`
      : 'Staffed at or above need throughout.')
  return {
    svg: base.svg,
    summary,
    table: {
      caption: `${d.unit}: staffing against demand`,
      columns: [d.xLabel, 'Needed', 'On duty', 'Short by'],
      rows: hours.map((h) => [
        fmt(h.x),
        String(h.needed),
        String(h.onDuty),
        String(Math.max(0, h.needed - h.onDuty)),
      ]),
    },
  }
}

export const staffingVsDemandKind: FigureKind<StaffingVsDemandData> = {
  kind: 'staffing_vs_demand',
  schema: StaffingVsDemandData,
  render: renderStaffing,
  defaultHeight: 340,
}
