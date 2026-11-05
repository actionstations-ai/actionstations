// triage_counts: patients tagged so far, by priority, at each reporting time (spec 0456 FR-4).
// Stacked columns whose segments differ by pattern and carry their own number; the legend and
// the table use the priority words.
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { AXIS, GRID, MUTED } from '../theme'
import { frame, hashId, heading, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import { PRIORITIES, priorityDefs, prioritySwatch, type PriorityId } from './priorities'

const Count = z.number().int().min(0).max(100000)

export const TriageCountsData = z.object({
  title: z.string().max(200).optional(),
  /** The triage method in use, named in the summary. */
  method: z.string().max(60).optional(),
  /** Time the last patient was categorized, when known. */
  triageCompleteAt: z.string().max(40).optional(),
  points: z
    .array(
      z.object({
        time: z.string().min(1).max(40),
        immediate: Count,
        delayed: Count,
        minor: Count,
        expectant: Count,
        deceased: Count.default(0),
      }),
    )
    .min(1)
    .max(16),
})
export type TriageCountsData = z.infer<typeof TriageCountsData>

type Point = TriageCountsData['points'][number]
const total = (p: Point): number => p.immediate + p.delayed + p.minor + p.expectant + p.deceased
const M = { left: 52, right: 20, top: 56, bottom: 40 }

function legendSvg(key: string): string {
  let x = M.left
  let out = ''
  for (const p of PRIORITIES) {
    out += prioritySwatch(key, p, x, 30, 22, 14)
    out += text(x + 28, 41, p.label, { size: 12, fill: MUTED })
    x += 28 + p.label.length * 7 + 22
  }
  return out
}

function columns(
  d: TriageCountsData,
  o: { width: number; height: number },
  key: string,
): { body: string } {
  const max = Math.max(...d.points.map(total), 1)
  const plotB = o.height - M.bottom
  const y = scaleLinear().domain([0, max]).nice().range([plotB, M.top])
  const step = (o.width - M.left - M.right) / d.points.length
  const bw = Math.min(70, step * 0.62)
  let body = ''
  for (const t of y.ticks(5)) {
    body += `<line x1="${M.left}" x2="${n(o.width - M.right)}" y1="${n(y(t))}" y2="${n(y(t))}" stroke="${GRID}"/>`
    body += text(M.left - 8, y(t) + 4, String(t), { size: 11, anchor: 'end', fill: MUTED })
  }
  d.points.forEach((p, i) => {
    const cx = M.left + step * i + step / 2
    let base = plotB
    for (const s of PRIORITIES) {
      const v = p[s.id as PriorityId]
      if (!v) continue
      const h = plotB - y(v)
      body += prioritySwatch(key, s, cx - bw / 2, base - h, bw, h)
      if (h >= 16) {
        const w = 8 + String(v).length * 8
        body += `<rect x="${n(cx - w / 2)}" y="${n(base - h / 2 - 9)}" width="${w}" height="18" rx="3" fill="#ffffff" stroke="#14100c" stroke-width="1"/>`
        body += text(cx, base - h / 2 + 4.5, String(v), { size: 12, weight: 700, anchor: 'middle' })
      }
      base -= h
    }
    body += text(cx, base - 6, String(total(p)), { size: 12, weight: 700, anchor: 'middle' })
    body += text(cx, plotB + 18, p.time, { size: 11, anchor: 'middle' })
  })
  body += `<line x1="${M.left}" x2="${n(o.width - M.right)}" y1="${plotB}" y2="${plotB}" stroke="${AXIS}" stroke-width="1.5"/>`
  return { body }
}

function summaryOf(d: TriageCountsData): string {
  const last = d.points[d.points.length - 1]!
  const parts = PRIORITIES.filter((s) => last[s.id as PriorityId] > 0).map(
    (s) => `${last[s.id as PriorityId]} ${s.label}`,
  )
  return (
    `${d.title ?? 'Triage counts'}${d.method ? ` (${d.method})` : ''}: at ${last.time}, ${total(last)} patients tagged: ` +
    `${parts.join(', ')}. ` +
    (d.triageCompleteAt
      ? `Triage complete at ${d.triageCompleteAt}.`
      : 'Triage is not marked complete.') +
    ` ${d.points.length} reports from ${d.points[0]!.time} to ${last.time}.`
  )
}

function render(d: TriageCountsData, o: { width: number; height: number }): FigureResult {
  const key = hashId(JSON.stringify(d))
  const summary = summaryOf(d)
  const { body } = columns(d, o, key)
  const svg = frame({
    width: o.width,
    height: o.height,
    title: d.title ?? 'Triage counts',
    summary,
    defs: priorityDefs(key),
    body: heading(d.title ?? 'Triage counts', 16) + legendSvg(key) + body,
    idKey: JSON.stringify(d),
  })
  return {
    svg,
    summary,
    table: {
      caption: d.title ?? 'Triage counts',
      columns: ['Time', ...PRIORITIES.map((p) => p.label), 'Total'],
      rows: d.points.map((p) => [
        p.time,
        ...PRIORITIES.map((s) => String(p[s.id as PriorityId])),
        String(total(p)),
      ]),
    },
  }
}

export const triageCountsKind: FigureKind<TriageCountsData> = {
  kind: 'triage_counts',
  schema: TriageCountsData,
  render,
  defaultHeight: 380,
}
