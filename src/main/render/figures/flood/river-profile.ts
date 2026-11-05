// river_profile: the stage at several gauges along one river, upstream to downstream, each shown
// against its own flood stage (spec 0454 FR-5). Categories differ by gauge, so the vertical axis
// is feet above or below that gauge's flood stage, and each marker carries the category word.
import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import { z } from 'zod'
import { fmt, frame, heading, marker, n, text } from '../svg'
import { AXIS, GRID, INK, MUTED } from '../theme'
import type { FigureKind, FigureResult } from '../types'
import {
  CATEGORY_STYLE,
  CATEGORY_WORD,
  CategoryTableSchema,
  categoryOf,
  hashKey,
  withUnit,
} from './common'

export const RiverProfileData = z.object({
  title: z.string().max(200).optional(),
  river: z.string().min(1).max(80),
  /** What the time is, e.g. "Observed 6:00 PM CST Sat Nov 7". */
  asOf: z.string().max(80).optional(),
  gauges: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        /** Distance down the river in miles from the first (most upstream) gauge. */
        mile: z.number().finite(),
        stage: z.number().finite(),
        crest: z.number().finite().optional(),
        categories: CategoryTableSchema.default({}),
      }),
    )
    .min(2)
    .max(12),
})
export type RiverProfileData = z.infer<typeof RiverProfileData>

const M = { left: 64, right: 30, top: 54, bottom: 92 }

/** Feet above (positive) or below flood stage; the flood stage when set, else the minor stage. */
const floodOf = (c: RiverProfileData['gauges'][number]['categories']): number | undefined =>
  c.flood ?? c.minor

function render(d: RiverProfileData, o: { width: number; height: number }): FigureResult {
  const gs = [...d.gauges].sort((a, b) => a.mile - b.mile)
  const rel = (g: (typeof gs)[number], v: number): number => v - (floodOf(g.categories) ?? 0)
  const info = gs.map((g) => {
    const cat = categoryOf(g.categories, g.stage)
    return { g, cat, above: floodOf(g.categories) === undefined ? undefined : rel(g, g.stage) }
  })
  const summary =
    `${d.title ?? `${d.river} profile`}. Stage along ${d.river}, upstream to downstream${d.asOf ? `, ${d.asOf}` : ''}. ` +
    info
      .map(
        ({ g, cat, above }) =>
          `${g.name} (mile ${fmt(g.mile)}) ${withUnit(g.stage, 'ft')}, ${CATEGORY_WORD[cat].toLowerCase()}` +
          (above === undefined
            ? ', no flood stage defined'
            : `, ${fmt(Math.abs(above))} ft ${above >= 0 ? 'above' : 'below'} flood stage`) +
          (g.crest !== undefined ? `, forecast crest ${withUnit(g.crest, 'ft')}` : ''),
      )
      .join('; ') +
    '.'

  const vals = info.flatMap(({ g, above }) => [
    above ?? 0,
    ...(g.crest !== undefined && floodOf(g.categories) !== undefined ? [rel(g, g.crest)] : []),
  ])
  const y = scaleLinear()
    .domain([Math.min(0, ...vals) - 1, Math.max(0, ...vals) + 1])
    .nice()
    .range([o.height - M.bottom, M.top])
  const miles = gs.map((g) => g.mile)
  const x = scaleLinear()
    .domain([Math.min(...miles), Math.max(...miles)])
    .range([M.left + 40, o.width - M.right - 40])
  const xp = (m: number): number =>
    miles[0] === miles.at(-1) ? (M.left + o.width - M.right) / 2 : x(m)

  let body = heading(d.title ?? `${d.river}: stage along the river`, M.left)
  if (d.asOf) body += text(M.left, 38, d.asOf, { size: 12, fill: MUTED })
  for (const tk of y.ticks(6)) {
    body += `<line x1="${M.left}" x2="${n(o.width - M.right)}" y1="${n(y(tk))}" y2="${n(y(tk))}" stroke="${GRID}"/>`
    body += text(M.left - 8, y(tk) + 4, fmt(tk), { size: 11, anchor: 'end', fill: MUTED })
  }
  body += `<line x1="${M.left}" x2="${n(o.width - M.right)}" y1="${n(y(0))}" y2="${n(y(0))}" stroke="${INK}" stroke-width="1.6"/>`
  body += text(o.width - M.right, y(0) - 5, 'Flood stage at each gauge', {
    size: 11,
    weight: 600,
    anchor: 'end',
  })
  body += text(0, 0, 'Feet above (+) or below (-) flood stage', {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
    extra: `transform="translate(14 ${n((M.top + o.height - M.bottom) / 2)}) rotate(-90)"`,
  })
  body += `<line x1="${M.left}" x2="${n(o.width - M.right)}" y1="${n(o.height - M.bottom)}" y2="${n(o.height - M.bottom)}" stroke="${AXIS}" stroke-width="1.5"/>`

  const pts = info.filter((i) => i.above !== undefined)
  body += `<path d="${
    line<(typeof pts)[number]>()
      .x((p) => xp(p.g.mile))
      .y((p) => y(p.above!))(pts) ?? ''
  }" fill="none" stroke="${MUTED}" stroke-width="2" stroke-dasharray="5 4"/>`
  for (const { g, cat, above } of info) {
    const px = xp(g.mile)
    const py = y(above ?? 0)
    if (g.crest !== undefined && floodOf(g.categories) !== undefined)
      body +=
        `<line x1="${n(px)}" x2="${n(px)}" y1="${n(py)}" y2="${n(y(rel(g, g.crest)))}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="2 3"/>` +
        `<path d="M${n(px - 6)} ${n(y(rel(g, g.crest)))}h12" stroke="${INK}" stroke-width="2.5"/>`
    const style = cat === 'none' ? undefined : CATEGORY_STYLE[cat]
    body += marker(style?.marker ?? 'circle', px, py, style?.color ?? INK)
    body += text(
      px,
      py - 12,
      cat === 'none' ? 'Below' : CATEGORY_WORD[cat].replace(' flooding', ''),
      { size: 11, weight: 700, anchor: 'middle', fill: style?.color ?? INK },
    )
    const by = o.height - M.bottom + 16
    body += text(px, by, g.name, { size: 11, anchor: 'middle' })
    body += text(px, by + 14, `mile ${fmt(g.mile)}`, { size: 10.5, anchor: 'middle', fill: MUTED })
    body += text(px, by + 28, withUnit(g.stage, 'ft'), { size: 11, weight: 600, anchor: 'middle' })
    if (g.crest !== undefined)
      body += text(px, by + 42, `crest ${withUnit(g.crest, 'ft')}`, {
        size: 10.5,
        anchor: 'middle',
        fill: MUTED,
      })
  }
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? `${d.river} profile`,
      summary,
      body,
      idKey: hashKey(d),
    }),
    summary,
    table: {
      caption: `${d.river}: gauges from upstream to downstream`,
      columns: [
        'Gauge',
        'River mile',
        'Stage (ft)',
        'Category',
        'Feet above flood stage',
        'Forecast crest (ft)',
      ],
      rows: info.map(({ g, cat, above }) => [
        g.name,
        fmt(g.mile),
        fmt(g.stage),
        CATEGORY_WORD[cat],
        above === undefined ? 'n/a' : fmt(above),
        g.crest === undefined ? '' : fmt(g.crest),
      ]),
    },
  }
}

export const riverProfileKind: FigureKind<RiverProfileData> = {
  kind: 'river_profile',
  schema: RiverProfileData,
  render,
  defaultHeight: 400,
}
