// ensemble_plume: every member of an ensemble forecast of one quantity over time as a thin
// line, with the ensemble mean, the 10th to 90th percentile band and optional thresholds. The
// summary says how many members cross each threshold and when the mean peaks.
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { INK, MUTED, GRID } from '../theme'
import { frame, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import { utcLabel } from './radar'

export const PlumeData = z
  .object({
    title: z.string().max(200).optional(),
    origin: z.enum(['historical', 'simulated']),
    /** What is forecast, for example "Storm total rainfall at Cedar Ridge". */
    quantity: z.string().min(2).max(100),
    unit: z.string().max(20),
    system: z.string().min(2).max(60),
    /** Forecast issue time, ISO 8601. */
    issued: z.iso.datetime({ offset: true }),
    times: z
      .array(z.iso.datetime({ offset: true }))
      .min(2)
      .max(120),
    members: z.array(z.array(z.number().finite())).min(2).max(100),
    thresholds: z
      .array(z.object({ value: z.number().finite(), label: z.string().min(1).max(40) }))
      .max(4)
      .default([]),
  })
  .superRefine((d, ctx) =>
    d.members.forEach((m, i) => {
      if (m.length !== d.times.length)
        ctx.addIssue({
          code: 'custom',
          path: ['members', i],
          message: `member ${i + 1} has ${m.length} values for ${d.times.length} times`,
        })
    }),
  )
export type PlumeData = z.infer<typeof PlumeData>

const quantile = (sorted: number[], q: number): number => {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  return sorted[lo]! + (sorted[Math.min(lo + 1, sorted.length - 1)]! - sorted[lo]!) * (pos - lo)
}

const num = (v: number): string =>
  Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)

function render(d: PlumeData, o: { width: number; height: number }): FigureResult {
  const left = 64
  const right = 24
  const top = d.title ? 40 : 18
  const bottom = 70
  const plotW = o.width - left - right
  const plotH = o.height - top - bottom
  const stats = d.times.map((_, i) => {
    const col = d.members.map((m) => m[i]!).sort((a, b) => a - b)
    return {
      mean: col.reduce((s, v) => s + v, 0) / col.length,
      p10: quantile(col, 0.1),
      p90: quantile(col, 0.9),
      max: col[col.length - 1]!,
      min: col[0]!,
    }
  })
  const all = [...d.members.flat(), ...d.thresholds.map((t) => t.value)]
  const y = scaleLinear()
    .domain([Math.min(...all, 0), Math.max(...all)])
    .nice(5)
    .range([top + plotH, top])
  const t0 = Date.parse(d.times[0]!)
  const t1 = Date.parse(d.times[d.times.length - 1]!)
  const xOf = (i: number): number =>
    left + ((Date.parse(d.times[i]!) - t0) / (t1 - t0 || 1)) * plotW
  let body = d.title ? text(16, 22, d.title, { size: 15, weight: 700 }) : ''
  body += `<rect x="${left}" y="${top}" width="${plotW}" height="${plotH}" fill="#fff" stroke="${INK}" stroke-width="0.8"/>`
  for (const t of y.ticks(5))
    body += `<path d="M${left} ${n(y(t))}H${left + plotW}" stroke="${GRID}" stroke-width="0.7"/>${text(left - 6, y(t) + 4, String(t), { size: 10, anchor: 'end', fill: MUTED })}`
  body += text(left - 40, top + plotH / 2, `${d.quantity} (${d.unit})`, {
    size: 11,
    fill: MUTED,
    anchor: 'middle',
    extra: `transform="rotate(-90 ${left - 40} ${top + plotH / 2})"`,
  })
  const band =
    [
      ...stats.map((s, i) => `${i ? 'L' : 'M'}${n(xOf(i))} ${n(y(s.p90))}`),
      ...stats.map(
        (s, i) => `L${n(xOf(stats.length - 1 - i))} ${n(y(stats[stats.length - 1 - i]!.p10))}`,
      ),
    ].join('') + 'Z'
  body += `<path d="${band}" fill="#cfe0f7" opacity="0.8"/>`
  for (const m of d.members)
    body += `<path d="${m.map((v, i) => `${i ? 'L' : 'M'}${n(xOf(i))} ${n(y(v))}`).join('')}" fill="none" stroke="#6f7b87" stroke-width="0.8" opacity="0.7"/>`
  body += `<path d="${stats.map((s, i) => `${i ? 'L' : 'M'}${n(xOf(i))} ${n(y(s.mean))}`).join('')}" fill="none" stroke="#1f5fbf" stroke-width="3"/>`
  d.thresholds.forEach((t, k) => {
    body += `<path d="M${left} ${n(y(t.value))}H${left + plotW}" stroke="#b3121b" stroke-width="1.6" stroke-dasharray="${k % 2 ? '2 3' : '8 4'}"/>${text(left + plotW - 4, y(t.value) - 4, `${t.label} (${num(t.value)} ${d.unit})`, { size: 10, weight: 700, anchor: 'end', fill: '#b3121b' })}`
  })
  const step = Math.max(1, Math.ceil(d.times.length / 10))
  d.times.forEach((t, i) => {
    if (i % step) return
    const dt = new Date(t)
    body += `<path d="M${n(xOf(i))} ${top + plotH}v4" stroke="${INK}"/>${text(xOf(i), top + plotH + 16, `${String(dt.getUTCHours()).padStart(2, '0')}Z`, { size: 10, anchor: 'middle', fill: MUTED })}`
  })
  const lx = left
  const ly = top + plotH + 36
  body += `<path d="M${lx} ${ly}h22" stroke="#6f7b87" stroke-width="1"/>${text(lx + 28, ly + 4, `${d.members.length} members`, { size: 10, fill: MUTED })}`
  body += `<path d="M${lx + 120} ${ly}h22" stroke="#1f5fbf" stroke-width="3"/>${text(lx + 148, ly + 4, 'Mean', { size: 10, fill: MUTED })}`
  body += `<rect x="${lx + 196}" y="${ly - 5}" width="22" height="10" fill="#cfe0f7"/>${text(lx + 224, ly + 4, '10th to 90th percentile', { size: 10, fill: MUTED })}`
  const originWord = d.origin === 'historical' ? 'Historical data' : 'Simulated data'
  body += text(
    left,
    ly + 22,
    `${d.system} issued ${utcLabel(d.issued)} · ${originWord} · exercise figure`,
    { size: 11, fill: MUTED },
  )

  const peak = stats.reduce((b, s, i) => (s.mean > stats[b]!.mean ? i : b), 0)
  const finalMax = stats[stats.length - 1]!
  const sentences = [
    `The ensemble mean peaks at ${num(stats[peak]!.mean)} ${d.unit} at ${utcLabel(d.times[peak]!)}; the members' highest values range from ${num(Math.min(...d.members.map((m) => Math.max(...m))))} to ${num(Math.max(...d.members.map((m) => Math.max(...m))))} ${d.unit}.`,
  ]
  const rows: string[][] = [
    ['Ensemble mean peak', `${num(stats[peak]!.mean)} ${d.unit} at ${utcLabel(d.times[peak]!)}`],
    [
      'Last time, 10th to 90th percentile',
      `${num(finalMax.p10)} to ${num(finalMax.p90)} ${d.unit}`,
    ],
  ]
  for (const t of d.thresholds) {
    const over = d.members.filter((m) => Math.max(...m) >= t.value).length
    const pct = Math.round((over / d.members.length) * 100)
    rows.push([
      `Members reaching ${t.label} (${num(t.value)} ${d.unit})`,
      `${over} of ${d.members.length} (${pct} percent)`,
    ])
    sentences.push(
      `${over} of ${d.members.length} members (${pct} percent) reach ${t.label}, ${num(t.value)} ${d.unit}.`,
    )
  }
  const summary = `Ensemble plume of ${d.quantity} from ${d.system}, issued ${utcLabel(d.issued)}, ${originWord.toLowerCase()}. ${sentences.join(' ')}`
  const table = {
    caption: `${d.quantity}: ensemble statistics by time`,
    columns: ['Time', `Mean (${d.unit})`, '10th percentile', '90th percentile', 'Highest member'],
    rows: [] as string[][],
  }
  const tstep = Math.max(1, Math.ceil(d.times.length / 24))
  d.times.forEach((t, i) => {
    if (i % tstep === 0)
      table.rows.push([
        utcLabel(t),
        num(stats[i]!.mean),
        num(stats[i]!.p10),
        num(stats[i]!.p90),
        num(stats[i]!.max),
      ])
  })
  void rows
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: `Ensemble plume: ${d.quantity}`,
      summary,
      body,
      idKey: `plu${d.system}${d.issued}${d.quantity}`,
    }),
    summary,
    table,
  }
}

export const plumeKind: FigureKind<PlumeData> = {
  kind: 'ensemble_plume',
  schema: PlumeData,
  render,
  defaultHeight: 520,
}
