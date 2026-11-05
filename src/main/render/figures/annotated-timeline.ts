// annotated_timeline: events (numbered markers) and spans (hatched bars) on lanes along a time
// axis. Events are numbered in time order and keyed below the chart, so labels never collide.
import { z } from 'zod'
import { makeXAxis, sameXKind, toNumber, XValue, xLabel } from './axis'
import { AXIS, GRID, INK, MUTED, seriesStyle } from './theme'
import { frame, hashId, heading, n, patternDef, text, textWidth, wrap } from './svg'
import type { FigureKind, FigureResult } from './types'

export const TimelineData = z
  .object({
    title: z.string().max(200).optional(),
    xLabel: z.string().max(80).optional(),
    lanes: z.array(z.string().min(1).max(40)).max(8).default([]),
    events: z
      .array(
        z.object({
          x: XValue,
          label: z.string().min(1).max(120),
          detail: z.string().max(240).optional(),
          lane: z.string().max(40).optional(),
        }),
      )
      .max(30)
      .default([]),
    spans: z
      .array(
        z.object({
          from: XValue,
          to: XValue,
          label: z.string().min(1).max(80),
          lane: z.string().max(40).optional(),
        }),
      )
      .max(20)
      .default([]),
  })
  .refine((d) => d.events.length + d.spans.length > 0, { message: 'needs an event or a span' })
  .refine(
    (d) => sameXKind([...d.events.map((e) => e.x), ...d.spans.flatMap((s) => [s.from, s.to])]),
    { message: 'x values must be all numbers or all date-time strings' },
  )
  .refine((d) => d.spans.every((s) => toNumber(s.to) >= toNumber(s.from)), {
    message: 'a span must end after it starts',
  })
export type TimelineData = z.infer<typeof TimelineData>

const M = { left: 20, right: 24, laneLabel: 110, laneH: 56 }

function render(d: TimelineData, o: { width: number; height: number }): FigureResult {
  const events = [...d.events].sort((a, b) => toNumber(a.x) - toNumber(b.x))
  const lanes = d.lanes.length
    ? d.lanes
    : [
        ...new Set(
          [...events.map((e) => e.lane), ...d.spans.map((s) => s.lane)].filter(
            (l): l is string => !!l,
          ),
        ),
      ]
  const laneNames = lanes.length ? lanes : ['']
  const laneOf = (l: string | undefined): number =>
    Math.max(0, laneNames.indexOf(l ?? laneNames[0]!))
  const showLaneLabels = laneNames.length > 1 || laneNames[0] !== ''
  const left = M.left + (showLaneLabels ? M.laneLabel : 0)
  const plotR = o.width - M.right
  const top = d.title ? 40 : 12
  const plotH = laneNames.length * M.laneH
  const keyChars = Math.floor((o.width - 40) / 6.6)
  const keys = events.map((e, i) =>
    wrap(`${i + 1}. ${xLabel(e.x)} - ${e.label}${e.detail ? ` (${e.detail})` : ''}`, keyChars, 2),
  )
  const keyLines = keys.reduce((a, k) => a + k.length, 0)
  const height = top + plotH + 44 + keyLines * 16 + 12
  const x = makeXAxis(
    [...events.map((e) => e.x), ...d.spans.flatMap((s) => [s.from, s.to])],
    left + 14,
    plotR - 14,
  )
  const id = hashId(JSON.stringify(d))
  const defs = laneNames.map((_, i) => patternDef(`t${id}-${i}`, seriesStyle(i))).join('')

  let body = heading(d.title, M.left)
  laneNames.forEach((l, i) => {
    const y = top + i * M.laneH
    body += `<rect x="${left}" y="${y}" width="${n(plotR - left)}" height="${M.laneH}" fill="${i % 2 ? '#ffffff' : '#f6efdc'}"/>`
    if (showLaneLabels) body += text(M.left, y + M.laneH / 2 + 4, l, { size: 12, weight: 600 })
  })
  for (const t of x.ticks)
    body += `<line x1="${n(t.pos)}" x2="${n(t.pos)}" y1="${top}" y2="${top + plotH}" stroke="${GRID}"/>`
  body += `<line x1="${left}" x2="${n(plotR)}" y1="${top + plotH}" y2="${top + plotH}" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const t of x.ticks)
    body += text(t.pos, top + plotH + 16, t.label, { size: 11, anchor: 'middle', fill: MUTED })
  if (d.xLabel)
    body += text((left + plotR) / 2, top + plotH + 34, d.xLabel, {
      size: 12,
      anchor: 'middle',
      fill: MUTED,
    })

  for (const s of d.spans) {
    const li = laneOf(s.lane)
    const x0 = x.position(s.from)
    const x1 = x.position(s.to)
    const y = top + li * M.laneH + 30
    body += `<rect x="${n(x0)}" y="${y}" width="${n(Math.max(2, x1 - x0))}" height="16" fill="url(#t${id}-${li})" stroke="${INK}" stroke-width="0.8"/>`
    const w = textWidth(s.label, 11) + 8
    const lx = w < x1 - x0 - 6 ? x0 + 3 : Math.min(x1 + 4, plotR - w)
    body += `<rect x="${n(lx)}" y="${y + 1}" width="${n(w)}" height="14" rx="3" fill="#ffffff" fill-opacity="0.94"/>`
    body += text(lx + 4, y + 12, s.label, { size: 11, weight: 600 })
  }
  events.forEach((e, i) => {
    const li = laneOf(e.lane)
    const cx = x.position(e.x)
    const cy = top + li * M.laneH + 15
    body += `<line x1="${n(cx)}" x2="${n(cx)}" y1="${n(cy)}" y2="${n(top + (li + 1) * M.laneH)}" stroke="${INK}" stroke-width="1"/>`
    body += `<circle cx="${n(cx)}" cy="${n(cy)}" r="10" fill="${INK}" stroke="#ffffff" stroke-width="1.5"/>`
    body += text(cx, cy + 4, String(i + 1), {
      size: 11,
      weight: 700,
      fill: '#ffffff',
      anchor: 'middle',
    })
  })
  let ky = top + plotH + 58
  for (const lines of keys)
    for (const ln of lines) {
      body += text(M.left, ky, ln, { size: 12 })
      ky += 16
    }

  const summary =
    `${d.title ?? 'Timeline'}: timeline with ${events.length} events and ${d.spans.length} spans` +
    `${showLaneLabels ? ` on ${laneNames.length} lanes (${laneNames.join(', ')})` : ''}. ` +
    events
      .map((e, i) => `${i + 1}. ${xLabel(e.x)}: ${e.label}${e.detail ? ` (${e.detail})` : ''}.`)
      .join(' ') +
    (d.spans.length
      ? ' Spans: ' +
        d.spans.map((s) => `${s.label} from ${xLabel(s.from)} to ${xLabel(s.to)}`).join('; ') +
        '.'
      : '')
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Timeline',
      summary,
      defs,
      body,
      idKey: id,
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Item', 'Time', 'Lane', 'What', 'Detail'],
      rows: [
        ...events.map((e, i) => [
          String(i + 1),
          xLabel(e.x),
          e.lane ?? '',
          e.label,
          e.detail ?? '',
        ]),
        ...d.spans.map((s) => [
          'Span',
          `${xLabel(s.from)} to ${xLabel(s.to)}`,
          s.lane ?? '',
          s.label,
          '',
        ]),
      ],
    },
  }
}

export const annotatedTimelineKind: FigureKind<TimelineData> = {
  kind: 'annotated_timeline',
  schema: TimelineData,
  render,
}
