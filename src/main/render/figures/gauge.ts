// gauge: a half-circle dial with named bands, a needle and the reading written out. Bands carry
// a fill pattern and a label, so a reader who cannot tell the colors apart still reads the state.
import { arc } from 'd3-shape'
import { z } from 'zod'
import { INK, MUTED, STATUS_STYLES, type SeriesStyle, type StatusState } from './theme'
import { fmt, frame, hashId, heading, n, patternDef, text, wrap } from './svg'
import type { FigureKind, FigureResult } from './types'

const State = z.enum(['ok', 'degraded', 'down', 'unknown'])

export const GaugeData = z
  .object({
    title: z.string().max(200).optional(),
    label: z.string().min(1).max(80),
    value: z.number().finite(),
    min: z.number().finite(),
    max: z.number().finite(),
    unit: z.string().max(20).optional(),
    bands: z
      .array(
        z.object({
          from: z.number().finite(),
          to: z.number().finite(),
          label: z.string().min(1).max(60),
          state: State.default('unknown'),
        }),
      )
      .max(8)
      .default([]),
  })
  .refine((d) => d.max > d.min, { message: 'max must be greater than min' })
export type GaugeData = z.infer<typeof GaugeData>

const PATTERN: Record<StatusState, SeriesStyle['pattern']> = {
  ok: 'solid',
  degraded: 'hatch',
  down: 'dots',
  unknown: 'bars',
}

const bandStyle = (s: StatusState): SeriesStyle => ({
  color: STATUS_STYLES[s].color,
  dash: undefined,
  marker: 'circle',
  pattern: PATTERN[s],
})

function bandOf(d: GaugeData): GaugeData['bands'][number] | undefined {
  return d.bands.find((b) => d.value >= b.from && d.value <= b.to)
}

function render(d: GaugeData, o: { width: number; height: number }): FigureResult {
  const unit = d.unit ? ` ${d.unit}` : ''
  const id = hashId(JSON.stringify(d))
  const defs = (['ok', 'degraded', 'down', 'unknown'] as const)
    .map((s) => patternDef(`g${id}-${s}`, bandStyle(s)))
    .join('')
  const titleH = d.title ? 34 : 10
  const cx = o.width / 2
  const r = Math.min(o.width / 2 - 70, o.height - titleH - 110, 220)
  const cy = titleH + r + 24
  const ang = (v: number): number =>
    -Math.PI / 2 + (Math.PI * (Math.min(d.max, Math.max(d.min, v)) - d.min)) / (d.max - d.min)
  const mk = arc<{ a0: number; a1: number }>()
    .innerRadius(r * 0.62)
    .outerRadius(r)
    .startAngle((x) => x.a0)
    .endAngle((x) => x.a1)

  let body = heading(d.title, 20)
  const track = mk({ a0: -Math.PI / 2, a1: Math.PI / 2 })
  body += `<path d="${track}" transform="translate(${n(cx)} ${n(cy)})" fill="#ece6d8" stroke="${INK}" stroke-width="1"/>`
  for (const b of d.bands) {
    const p = mk({ a0: ang(b.from), a1: ang(b.to) })
    body += `<path d="${p}" transform="translate(${n(cx)} ${n(cy)})" fill="url(#g${id}-${b.state})" stroke="#ffffff" stroke-width="2"/>`
  }
  const ticks = [...new Set([d.min, d.max, ...d.bands.flatMap((b) => [b.from, b.to])])].sort(
    (a, b) => a - b,
  )
  for (const t of ticks) {
    const a = ang(t)
    const [sx, sy] = [Math.sin(a), -Math.cos(a)]
    body += text(cx + sx * (r + 14), cy + sy * (r + 14) + 4, fmt(t), {
      size: 11,
      fill: MUTED,
      anchor: sx < -0.2 ? 'end' : sx > 0.2 ? 'start' : 'middle',
    })
  }
  const a = ang(d.value)
  const nx = cx + Math.sin(a) * (r * 0.9)
  const ny = cy - Math.cos(a) * (r * 0.9)
  body += `<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(nx)}" y2="${n(ny)}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`
  body += `<circle cx="${n(cx)}" cy="${n(cy)}" r="8" fill="${INK}"/>`
  body += text(cx, cy + 40, `${fmt(d.value)}${unit}`, { size: 28, weight: 700, anchor: 'middle' })
  const band = bandOf(d)
  const state = band ? `${band.label} (${STATUS_STYLES[band.state].label})` : ''
  body += text(cx, cy + 62, [d.label, state].filter(Boolean).join(' - '), {
    size: 13,
    fill: MUTED,
    anchor: 'middle',
  })
  d.bands.forEach((b, i) => {
    const y = cy + 84 + i * 18
    body += `<rect x="${n(cx - 150)}" y="${n(y - 11)}" width="24" height="13" fill="url(#g${id}-${b.state})" stroke="${INK}" stroke-width="0.8"/>`
    body += text(
      cx - 118,
      y,
      wrap(
        `${b.label}: ${fmt(b.from)} to ${fmt(b.to)}${unit} - ${STATUS_STYLES[b.state].label}`,
        56,
        1,
      )[0]!,
      { size: 12 },
    )
  })

  const summary =
    `${d.title ?? 'Gauge'}: ${d.label} reads ${fmt(d.value)}${unit} on a scale from ${fmt(d.min)} to ${fmt(d.max)}${unit}` +
    (band ? `, in the band ${band.label} (${STATUS_STYLES[band.state].label}).` : '.') +
    (d.bands.length
      ? ` Bands: ${d.bands.map((b) => `${b.label} ${fmt(b.from)} to ${fmt(b.to)}`).join('; ')}.`
      : '')
  return {
    svg: frame({
      width: o.width,
      height: cy + 84 + Math.max(0, d.bands.length - 1) * 18 + 14,
      title: d.title ?? d.label,
      summary,
      defs,
      body,
      idKey: id,
    }),
    summary,
    table: {
      caption: d.title ?? d.label,
      columns: [
        'Band',
        d.unit ? `From (${d.unit})` : 'From',
        d.unit ? `To (${d.unit})` : 'To',
        'State',
        'Current',
      ],
      rows: d.bands.map((b) => [
        b.label,
        fmt(b.from),
        fmt(b.to),
        STATUS_STYLES[b.state].label,
        b === band ? 'Yes' : '',
      ]),
    },
  }
}

export const gaugeKind: FigureKind<GaugeData> = {
  kind: 'gauge',
  schema: GaugeData,
  render,
  defaultHeight: 340,
}
