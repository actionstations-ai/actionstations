// boom_plan (spec 0455 FR-5, #762): the protective booming strategy on a map with the state of
// each deployment. A boom's strategy is drawn by line style (containment solid, deflection
// dashed, exclusion dotted) and its state by a symbol and a word, so neither relies on color.
// The sensitive sites are marked, the summary says which have no boom, and the table lists every
// boom with its length, strategy, state and time. Drawn from data, never an AI image.
import { z } from 'zod'
import { INK, MUTED } from '../theme'
import { fmt, frame, hashId, heading, legend, n, text } from '../svg'
import type { FigureKind, FigureResult, FigureTable } from '../types'
import {
  HALO,
  esiLegend,
  fit,
  mapBackground,
  mapFurniture,
  pathOf,
  shorelineSvg,
  type Pt,
} from './map-frame'
import { distanceM } from '../../../toolkits/spill/simulate'

const Lon = z.number().finite().min(-180).max(180)
const Lat = z.number().finite().min(-90).max(90)
const Position = z.tuple([Lon, Lat])

export const STRATEGIES = ['containment', 'deflection', 'exclusion'] as const
export const BOOM_STATES = ['planned', 'deploying', 'in_place', 'needs_repair'] as const

export const BoomPlanData = z.object({
  title: z.string().max(200).optional(),
  source: z.string().min(1).max(160).default('Exercise plan'),
  shorelines: z
    .array(
      z.object({ esi: z.string().max(12).optional(), points: z.array(Position).min(2).max(1000) }),
    )
    .max(2000)
    .default([]),
  sites: z
    .array(z.object({ name: z.string().min(1).max(80), lon: Lon, lat: Lat }))
    .max(10)
    .default([]),
  booms: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        strategy: z.enum(STRATEGIES),
        state: z.enum(BOOM_STATES),
        lengthFt: z.number().finite().min(0).max(100_000),
        points: z.array(Position).min(2).max(50),
        /** Time the boom is, or will be, in place ("1330"). */
        time: z.string().max(30).default(''),
      }),
    )
    .min(1)
    .max(12),
})
export type BoomPlanData = z.infer<typeof BoomPlanData>

const STRATEGY_STYLE = {
  containment: { label: 'Containment boom', dash: undefined, width: 4 },
  deflection: { label: 'Deflection boom', dash: '12 5', width: 4 },
  exclusion: { label: 'Exclusion boom', dash: '2 5', width: 5 },
} as const
const STATE_LABEL = {
  planned: 'Planned',
  deploying: 'Deploying',
  in_place: 'In place',
  needs_repair: 'Needs repair',
} as const

/** A symbol for a state, centered on (x, y). */
function stateMark(state: BoomPlanData['booms'][number]['state'], x: number, y: number): string {
  const base = `stroke="${INK}" stroke-width="2"`
  switch (state) {
    case 'planned':
      return `<circle cx="${n(x)}" cy="${n(y)}" r="7" fill="#ffffff" ${base}/>`
    case 'deploying':
      return `<path d="M${n(x)} ${n(y - 8)}L${n(x + 8)} ${n(y + 6)}L${n(x - 8)} ${n(y + 6)}Z" fill="#ffffff" ${base}/>`
    case 'in_place':
      return `<rect x="${n(x - 7)}" y="${n(y - 7)}" width="14" height="14" fill="${INK}" ${base}/>`
    case 'needs_repair':
      return `<path d="M${n(x - 7)} ${n(y - 7)}L${n(x + 7)} ${n(y + 7)}M${n(x + 7)} ${n(y - 7)}L${n(x - 7)} ${n(y + 7)}" stroke="${INK}" stroke-width="3.5"/>`
  }
}

const mid = (pts: readonly Pt[]): Pt => pts[Math.floor(pts.length / 2)]!

/** Sites with no boom segment within 400 meters of them. */
export function unprotectedSites(d: BoomPlanData): string[] {
  return d.sites
    .filter(
      (s) =>
        !d.booms.some((b) =>
          b.points.some(
            (p) => distanceM({ lon: s.lon, lat: s.lat }, { lon: p[0], lat: p[1] }) <= 400,
          ),
        ),
    )
    .map((s) => s.name)
}

function summarize(d: BoomPlanData): string {
  const count = (st: string) => d.booms.filter((b) => b.state === st).length
  const total = d.booms.reduce((a, b) => a + b.lengthFt, 0)
  const parts = [
    `${d.title ?? 'Protective booming strategy'}: map of ${d.booms.length} boom segments (${fmt(total)} feet in all) and ${d.sites.length} sensitive sites.`,
    `${d.source}.`,
    `${count('in_place')} in place, ${count('deploying')} deploying, ${count('planned')} planned, ${count('needs_repair')} need repair.`,
  ]
  for (const b of d.booms)
    parts.push(
      `${b.name}: ${STRATEGY_STYLE[b.strategy].label.toLowerCase()}, ${fmt(b.lengthFt)} feet, ${STATE_LABEL[b.state].toLowerCase()}${b.time ? `, ${b.time}` : ''}.`,
    )
  const bare = unprotectedSites(d)
  parts.push(bare.length ? `No boom near: ${bare.join(', ')}.` : 'Every site has boom near it.')
  return parts.join(' ')
}

function tableOf(d: BoomPlanData): FigureTable {
  return {
    caption: d.title ?? 'Protective booming strategy',
    columns: ['Boom', 'Strategy', 'Length (ft)', 'State', 'Time'],
    rows: d.booms.map((b) => [
      b.name,
      STRATEGY_STYLE[b.strategy].label,
      fmt(b.lengthFt),
      STATE_LABEL[b.state],
      b.time,
    ]),
  }
}

function render(d: BoomPlanData, o: { width: number; height: number }): FigureResult {
  const summary = summarize(d)
  const topStart = d.title ? 42 : 14
  const lg = legend(
    [
      ...STRATEGIES.map((s) => ({
        name: STRATEGY_STYLE[s].label,
        swatch: (x: number, y: number) =>
          `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + 28)}" y2="${n(y)}" stroke="${INK}" stroke-width="${STRATEGY_STYLE[s].width}"${STRATEGY_STYLE[s].dash ? ` stroke-dasharray="${STRATEGY_STYLE[s].dash}"` : ''}/>`,
      })),
      ...BOOM_STATES.map((s) => ({
        name: STATE_LABEL[s],
        swatch: (x: number, y: number) => stateMark(s, x + 14, y),
      })),
    ],
    36,
    topStart,
    o.width - 24,
  )
  const top = topStart + lg.height + 4
  const rect = { x: 36, y: top, w: o.width - 60, h: o.height - top - 34 }
  const pts: Pt[] = [...d.booms.flatMap((b) => b.points), ...d.sites.map((s): Pt => [s.lon, s.lat])]
  const proj = fit(pts, rect, 0.18)
  const clipId = `c${hashId(JSON.stringify(d))}`
  const defs = `<clipPath id="${clipId}"><rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.w)}" height="${n(rect.h)}"/></clipPath>`
  let body = heading(d.title, 36) + lg.svg + mapBackground(rect, proj)
  const shore = shorelineSvg(d.shorelines, proj)
  body += `<g clip-path="url(#${clipId})">${shore.svg}`
  for (const b of d.booms) {
    const st = STRATEGY_STYLE[b.strategy]
    body += `<path d="${pathOf(b.points, proj)}" fill="none" stroke="#ffffff" stroke-width="${st.width + 4}" stroke-linecap="round"/>`
    body += `<path d="${pathOf(b.points, proj)}" fill="none" stroke="${INK}" stroke-width="${st.width}" stroke-linecap="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>`
  }
  body += '</g>'
  for (const b of d.booms) {
    const m = mid(b.points)
    const x = proj.x(m[0])
    const y = proj.y(m[1])
    body += stateMark(b.state, x, y)
    body += text(x + 12, y - 10, b.name, { size: 11, weight: 700, extra: HALO })
  }
  for (const s of d.sites) {
    const x = proj.x(s.lon)
    const y = proj.y(s.lat)
    body += `<path d="M${n(x)} ${n(y - 8)}L${n(x + 8)} ${n(y)}L${n(x)} ${n(y + 8)}L${n(x - 8)} ${n(y)}Z" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`
    body += text(x + 12, y + 18, s.name, { size: 12, weight: 600, extra: HALO })
  }
  body += mapFurniture(proj, rect)
  const el = esiLegend(shore.groups, rect.x + 14, rect.y + 24)
  if (el.height)
    body += `<rect x="${n(rect.x + 6)}" y="${n(rect.y + 6)}" width="236" height="${n(el.height + 22)}" fill="#ffffff" fill-opacity="0.9"/>${el.svg}`
  body += text(o.width - 24, o.height - 10, d.source, {
    size: 11,
    anchor: 'end',
    fill: MUTED,
    weight: 600,
  })
  body += text(
    36,
    o.height - 10,
    'Diamonds are sensitive sites. Boom that is not tended is not protecting.',
    { size: 11, fill: MUTED },
  )
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Protective booming strategy',
      summary,
      defs,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: tableOf(d),
  }
}

export const boomPlanKind: FigureKind<BoomPlanData> = {
  kind: 'boom_plan',
  schema: BoomPlanData,
  render,
  defaultHeight: 480,
}
