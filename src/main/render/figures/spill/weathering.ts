// oil_weathering (spec 0455 FR-5, #765): the mass balance of a release over time as stacked
// areas: recovered, remaining on the water, naturally dispersed and evaporated. The layers sum
// to the volume released at each time. Layers differ by fill pattern as well as color, the chart
// carries its source ("Simulated for the exercise" or the imported model), and the data table
// gives every number.
import { area, stack, stackOrderNone, stackOffsetNone } from 'd3-shape'
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { AXIS, GRID, INK, MUTED, seriesStyle } from '../theme'
import { fmt, frame, hashId, heading, legend, n, patternDef, text, wrap } from '../svg'
import type { FigureKind, FigureResult, FigureTable } from '../types'

const Step = z.object({
  hour: z.number().finite().min(0),
  recovered: z.number().finite().min(0),
  remaining: z.number().finite().min(0),
  dispersed: z.number().finite().min(0),
  evaporated: z.number().finite().min(0),
})

export const OilWeatheringData = z
  .object({
    title: z.string().max(200).optional(),
    unit: z.enum(['bbl', 'gal', 'm3']).default('bbl'),
    product: z.string().max(80).optional(),
    /** Where the numbers come from; always printed on the figure. */
    source: z.string().min(1).max(160).default('Simulated for the exercise'),
    steps: z.array(Step).min(2).max(500),
    /** Hours at which to call out an event (response starts, landfall). */
    marks: z
      .array(z.object({ hour: z.number().finite().min(0), label: z.string().min(1).max(100) }))
      .max(6)
      .default([]),
  })
  .refine((d) => d.steps.every((s, i) => i === 0 || s.hour > d.steps[i - 1]!.hour), {
    message: 'steps must be in increasing order of hour',
    path: ['steps'],
  })
export type OilWeatheringData = z.infer<typeof OilWeatheringData>

const LAYERS = [
  { key: 'recovered', name: 'Recovered' },
  { key: 'remaining', name: 'Remaining on the water' },
  { key: 'dispersed', name: 'Dispersed' },
  { key: 'evaporated', name: 'Evaporated' },
] as const
type LayerKey = (typeof LAYERS)[number]['key']

const UNIT_LABEL = { bbl: 'barrels', gal: 'gallons', m3: 'cubic meters' } as const
const M = { left: 62, right: 24 }

const total = (s: OilWeatheringData['steps'][number]): number =>
  s.recovered + s.remaining + s.dispersed + s.evaporated

function summarize(d: OilWeatheringData): string {
  const last = d.steps[d.steps.length - 1]!
  const t = total(last)
  const pct = (v: number): string => (t > 0 ? `${Math.round((v / t) * 100)} percent` : '0 percent')
  const unit = UNIT_LABEL[d.unit]
  const parts = [
    `${d.title ?? 'Oil weathering and mass balance'}: stacked area chart of ${d.product ?? 'the oil'} released, by hour, in ${unit}.`,
    `${d.source}.`,
    `By hour ${fmt(last.hour)}, ${fmt(t)} ${unit} had been released: ${fmt(last.evaporated)} evaporated (${pct(last.evaporated)}), ` +
      `${fmt(last.dispersed)} dispersed (${pct(last.dispersed)}), ${fmt(last.recovered)} recovered (${pct(last.recovered)}) ` +
      `and ${fmt(last.remaining)} remaining on the water (${pct(last.remaining)}).`,
  ]
  const peak = d.steps.reduce((a, s) => (s.remaining > a.remaining ? s : a), d.steps[0]!)
  parts.push(
    `The most oil on the water was ${fmt(peak.remaining)} ${unit} at hour ${fmt(peak.hour)}.`,
  )
  for (const [i, m] of d.marks.entries())
    parts.push(`Mark ${i + 1} at hour ${fmt(m.hour)}: ${m.label}.`)
  return parts.join(' ')
}

function tableOf(d: OilWeatheringData): FigureTable {
  const unit = UNIT_LABEL[d.unit]
  return {
    caption: d.title ?? 'Oil weathering and mass balance',
    columns: ['Hour', ...LAYERS.map((l) => `${l.name} (${unit})`), `Released (${unit})`],
    rows: d.steps.map((s) => [
      fmt(s.hour),
      ...LAYERS.map((l) => fmt(s[l.key as LayerKey])),
      fmt(total(s)),
    ]),
  }
}

function render(d: OilWeatheringData, o: { width: number; height: number }): FigureResult {
  const summary = summarize(d)
  const id = hashId(JSON.stringify(d))
  const defs = LAYERS.map((_, i) => patternDef(`w${id}-${i}`, seriesStyle(i))).join('')
  const topStart = d.title ? 42 : 14
  const lg = legend(
    LAYERS.map((l, i) => ({
      name: l.name,
      swatch: (x, y) =>
        `<rect x="${n(x)}" y="${n(y - 8)}" width="26" height="14" fill="url(#w${id}-${i})" stroke="${INK}" stroke-width="1"/>`,
    })),
    M.left,
    topStart,
    o.width - M.right,
  )
  const top = topStart + lg.height + 6
  const keyLines = d.marks.length
  const bottom = 62 + keyLines * 16
  const plotH = o.height - top - bottom
  const plotR = o.width - M.right

  const maxTotal = Math.max(...d.steps.map(total))
  const y = scaleLinear()
    .domain([0, maxTotal])
    .nice()
    .range([top + plotH, top])
  const hours = d.steps.map((s) => s.hour)
  const x = scaleLinear()
    .domain([hours[0]!, hours[hours.length - 1]!])
    .range([M.left, plotR])

  let body = heading(d.title, M.left) + lg.svg
  for (const t of y.ticks(5)) {
    const py = y(t)
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(py)}" y2="${n(py)}" stroke="${GRID}"/>`
    body += text(M.left - 8, py + 4, fmt(t), { size: 11, anchor: 'end', fill: MUTED })
  }
  const stacked = stack<OilWeatheringData['steps'][number], LayerKey>()
    .keys(LAYERS.map((l) => l.key))
    .order(stackOrderNone)
    .offset(stackOffsetNone)(d.steps)
  stacked.forEach((layer, i) => {
    const path = area<(typeof layer)[number]>()
      .x((_, k) => x(d.steps[k]!.hour))
      .y0((p) => y(p[0]))
      .y1((p) => y(p[1]))(layer)
    body += `<path d="${path}" fill="url(#w${id}-${i})" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`
  })
  body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(top + plotH)}" y2="${n(top + plotH)}" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const t of x.ticks(8)) {
    body += `<line x1="${n(x(t))}" x2="${n(x(t))}" y1="${n(top + plotH)}" y2="${n(top + plotH + 5)}" stroke="${AXIS}"/>`
    body += text(x(t), top + plotH + 18, fmt(t), { size: 11, anchor: 'middle', fill: MUTED })
  }
  body += text((M.left + plotR) / 2, top + plotH + 36, 'Hours since the release began', {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
  })
  body += text(0, 0, UNIT_LABEL[d.unit], {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
    extra: `transform="translate(14 ${n(top + plotH / 2)}) rotate(-90)"`,
  })
  d.marks.forEach((m, i) => {
    const px = x(Math.max(hours[0]!, Math.min(hours[hours.length - 1]!, m.hour)))
    body += `<line x1="${n(px)}" x2="${n(px)}" y1="${n(top)}" y2="${n(top + plotH)}" stroke="${INK}" stroke-width="1.2" stroke-dasharray="3 3"/>`
    body +=
      `<circle cx="${n(px)}" cy="${n(top + 9)}" r="9" fill="${INK}"/>` +
      text(px, top + 13, String(i + 1), {
        size: 11,
        weight: 700,
        fill: '#ffffff',
        anchor: 'middle',
      })
    const key = wrap(`${i + 1}. Hour ${fmt(m.hour)}: ${m.label}`, 110, 1)[0]!
    body += text(M.left, top + plotH + 54 + i * 16, key, { size: 12, fill: INK })
  })
  body += text(plotR, o.height - 8, d.source, { size: 11, anchor: 'end', fill: MUTED, weight: 600 })

  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Oil weathering and mass balance',
      summary,
      defs,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: tableOf(d),
  }
}

export const oilWeatheringKind: FigureKind<OilWeatheringData> = {
  kind: 'oil_weathering',
  schema: OilWeatheringData,
  render,
  defaultHeight: 400,
}
