// spill_trajectory_map (spec 0455 FR-5, #762): where the oil is forecast to be at chosen times,
// as the best-estimate outline and its uncertainty envelope, over the shoreline drawn by ESI
// class. Each time has its own outline style and a label; the oil's center, the places and the
// first contact with the shore are named in the summary and the table. Drawn from data (a
// simulated run or an imported one), labeled with its source, never an AI image.
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
  movedText,
  pathOf,
  ringCenter,
  shorelineSvg,
  type Pt,
} from './map-frame'

const Lon = z.number().finite().min(-180).max(180)
const Lat = z.number().finite().min(-90).max(90)
const Position = z.tuple([Lon, Lat])
const Ring = z.array(Position).min(3).max(600)

export const SpillTrajectoryData = z.object({
  title: z.string().max(200).optional(),
  source: z.string().min(1).max(160).default('Simulated for the exercise'),
  origin: z.object({ lon: Lon, lat: Lat, label: z.string().max(60).default('Release') }),
  shorelines: z
    .array(
      z.object({ esi: z.string().max(12).optional(), points: z.array(Position).min(2).max(1000) }),
    )
    .max(2000)
    .default([]),
  /** The oil at chosen times, earliest first. */
  outlines: z
    .array(
      z.object({
        hour: z.number().finite().min(0),
        label: z.string().min(1).max(40),
        best: Ring,
        uncertainty: Ring.optional(),
      }),
    )
    .min(1)
    .max(5),
  places: z
    .array(z.object({ name: z.string().min(1).max(60), lon: Lon, lat: Lat }))
    .max(8)
    .default([]),
  /** First contact with a named shoreline or site, in hours after the release. */
  landfalls: z
    .array(z.object({ name: z.string().min(1).max(80), hour: z.number().finite().min(0) }))
    .max(8)
    .default([]),
})
export type SpillTrajectoryData = z.infer<typeof SpillTrajectoryData>

/** Outline dash and weight by time: later outlines are drawn lighter and more broken. */
const OUTLINE = [
  { dash: undefined, width: 3, fill: 0.5 },
  { dash: '10 4', width: 2.6, fill: 0.34 },
  { dash: '4 3', width: 2.4, fill: 0.24 },
  { dash: '12 3 2 3', width: 2.2, fill: 0.16 },
  { dash: '2 4', width: 2.2, fill: 0.1 },
] as const
const OIL = '#14100c'

function summarize(d: SpillTrajectoryData): string {
  const o = { lon: d.origin.lon, lat: d.origin.lat }
  const parts = [
    `${d.title ?? 'Oil trajectory'}: map of the forecast position of the oil at ${d.outlines.map((x) => x.label).join(', ')}, with an uncertainty outline, over the shoreline by ESI class.`,
    `${d.source}. This is an exercise model, not a forecast.`,
  ]
  for (const out of d.outlines) {
    const c = ringCenter(out.best)
    parts.push(
      `${out.label} (hour ${fmt(out.hour)}): the center of the oil is ${movedText(o, c)} of the ${d.origin.label.toLowerCase()}.`,
    )
  }
  for (const l of d.landfalls) parts.push(`${l.name}: first contact at hour ${fmt(l.hour)}.`)
  if (!d.landfalls.length) parts.push('No landfall is shown.')
  return parts.join(' ')
}

function tableOf(d: SpillTrajectoryData): FigureTable {
  const o = { lon: d.origin.lon, lat: d.origin.lat }
  return {
    caption: d.title ?? 'Oil trajectory',
    columns: ['Time', 'Hour', 'Center of the oil'],
    rows: [
      ...d.outlines.map((x) => [x.label, fmt(x.hour), movedText(o, ringCenter(x.best))]),
      ...d.landfalls.map((l) => [`Landfall: ${l.name}`, fmt(l.hour), 'first contact']),
    ],
  }
}

function render(d: SpillTrajectoryData, o: { width: number; height: number }): FigureResult {
  const summary = summarize(d)
  const topStart = d.title ? 42 : 14
  const lg = legend(
    d.outlines.flatMap((x, i) => [
      {
        name: x.label,
        swatch: (px: number, py: number) =>
          `<rect x="${n(px)}" y="${n(py - 7)}" width="26" height="14" fill="${OIL}" fill-opacity="${OUTLINE[i]!.fill}" stroke="${OIL}" stroke-width="${OUTLINE[i]!.width}"${OUTLINE[i]!.dash ? ` stroke-dasharray="${OUTLINE[i]!.dash}"` : ''}/>`,
      },
    ]),
    36,
    topStart,
    o.width - 24,
  )
  const top = topStart + lg.height + 4
  const rect = { x: 36, y: top, w: o.width - 60, h: o.height - top - 34 }
  const all: Pt[] = [
    [d.origin.lon, d.origin.lat],
    ...d.outlines.flatMap((x) => [...x.best, ...(x.uncertainty ?? [])]),
    ...d.places.map((p): Pt => [p.lon, p.lat]),
    ...d.shorelines.flatMap((s) => s.points).slice(0, 4000),
  ]
  // Fit the oil and the places; shoreline lines far away are clipped by the frame.
  const focus: Pt[] = [
    [d.origin.lon, d.origin.lat],
    ...d.outlines.flatMap((x) => [...x.best, ...(x.uncertainty ?? [])]),
    ...d.places.map((p): Pt => [p.lon, p.lat]),
  ]
  const proj = fit(focus.length > 1 ? focus : all, rect, 0.15)
  const clipId = `c${hashId(JSON.stringify(d))}`
  const defs = `<clipPath id="${clipId}"><rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.w)}" height="${n(rect.h)}"/></clipPath>`

  let body = heading(d.title, 36) + lg.svg + mapBackground(rect, proj)
  const shore = shorelineSvg(d.shorelines, proj)
  body += `<g clip-path="url(#${clipId})">${shore.svg}`
  // Latest first so the earliest, strongest outline sits on top.
  for (let i = d.outlines.length - 1; i >= 0; i--) {
    const x = d.outlines[i]!
    const st = OUTLINE[i]!
    if (x.uncertainty)
      body += `<path d="${pathOf(x.uncertainty, proj, true)}" fill="none" stroke="${MUTED}" stroke-width="1.4" stroke-dasharray="2 4"/>`
    body += `<path d="${pathOf(x.best, proj, true)}" fill="${OIL}" fill-opacity="${st.fill}" stroke="${OIL}" stroke-width="${st.width}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>`
  }
  body += '</g>'
  d.outlines.forEach((x) => {
    const c = ringCenter(x.best)
    const cx = proj.x(c.lon)
    const cy = proj.y(c.lat)
    // A cross at the center keeps a small slick visible when its outline is a few pixels wide.
    body += `<path d="M${n(cx - 6)} ${n(cy)}L${n(cx + 6)} ${n(cy)}M${n(cx)} ${n(cy - 6)}L${n(cx)} ${n(cy + 6)}" stroke="${OIL}" stroke-width="3" stroke-linecap="round"/>`
    body += text(cx, cy - 12, x.label, { size: 11, weight: 700, anchor: 'middle', extra: HALO })
  })
  body += `<circle cx="${n(proj.x(d.origin.lon))}" cy="${n(proj.y(d.origin.lat))}" r="6" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>`
  body += text(proj.x(d.origin.lon) + 10, proj.y(d.origin.lat) - 8, d.origin.label, {
    size: 12,
    weight: 700,
    extra: HALO,
  })
  for (const p of d.places) {
    const x = proj.x(p.lon)
    const y = proj.y(p.lat)
    body += `<path d="M${n(x)} ${n(y - 7)}L${n(x + 7)} ${n(y)}L${n(x)} ${n(y + 7)}L${n(x - 7)} ${n(y)}Z" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`
    body += text(x + 11, y + 4, p.name, { size: 12, weight: 600, extra: HALO })
  }
  body += mapFurniture(proj, rect)
  const el = esiLegend(shore.groups, rect.x + 14, rect.y + 24)
  if (el.height)
    body += `<rect x="${n(rect.x + 6)}" y="${n(rect.y + 6)}" width="236" height="${n(el.height + 22)}" fill="#ffffff" fill-opacity="0.85"/>${el.svg}`
  body += text(o.width - 24, o.height - 10, d.source, {
    size: 11,
    anchor: 'end',
    fill: MUTED,
    weight: 600,
  })
  body += text(36, o.height - 10, 'Uncertainty outline dotted.', { size: 11, fill: MUTED })

  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Oil trajectory',
      summary,
      defs,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: tableOf(d),
  }
}

export const spillTrajectoryKind: FigureKind<SpillTrajectoryData> = {
  kind: 'spill_trajectory_map',
  schema: SpillTrajectoryData,
  render,
  defaultHeight: 480,
}
