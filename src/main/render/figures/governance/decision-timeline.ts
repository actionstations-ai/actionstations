// gov_decision_timeline (spec 0459 FR-5): discovery, the materiality determination, board notice,
// the filing and regulator notices on one axis of hours since discovery, with the disclosure
// clocks as spans. Drawn by the annotated timeline kind; the summary adds the intervals a
// debrief asks about (discovery to determination, determination to filing). The same numbers are
// in the data table.
import { z } from 'zod'
import { annotatedTimelineKind } from '../annotated-timeline'
import type { FigureKind, FigureOptions, FigureResult } from '../types'

export const DECISION_EVENT_KINDS = [
  'discovery',
  'determination',
  'board_notice',
  'filing',
  'regulator_notice',
  'insurer_notice',
  'other',
] as const
const KIND_LABEL: Record<(typeof DECISION_EVENT_KINDS)[number], string> = {
  discovery: 'Discovery',
  determination: 'Materiality determination',
  board_notice: 'Board notified',
  filing: 'Filing made',
  regulator_notice: 'Regulator notified',
  insurer_notice: 'Insurer notified',
  other: 'Event',
}

export const GovDecisionTimelineData = z.object({
  title: z.string().max(200).optional(),
  events: z
    .array(
      z.object({
        /** Hours since discovery. */
        hour: z.number().min(0).max(2000),
        kind: z.enum(DECISION_EVENT_KINDS),
        label: z.string().min(1).max(100).optional(),
      }),
    )
    .min(1)
    .max(24),
  /** Clocks that were running: a deadline window in hours since discovery. */
  clocks: z
    .array(
      z
        .object({
          label: z.string().min(1).max(80),
          fromHour: z.number().min(0).max(2000),
          toHour: z.number().min(0).max(2000),
        })
        .refine((c) => c.toHour >= c.fromHour, { message: 'a clock must end after it starts' }),
    )
    .max(8)
    .default([]),
})
export type GovDecisionTimelineData = z.infer<typeof GovDecisionTimelineData>

const hoursText = (h: number): string => `${Math.round(h * 10) / 10} h`
const first = (d: GovDecisionTimelineData, kind: string): number | undefined =>
  d.events.filter((e) => e.kind === kind).sort((a, b) => a.hour - b.hour)[0]?.hour

function intervals(d: GovDecisionTimelineData): string[] {
  const out: string[] = []
  const found = first(d, 'discovery') ?? 0
  const det = first(d, 'determination')
  const filing = first(d, 'filing')
  const board = first(d, 'board_notice')
  if (det !== undefined) out.push(`Discovery to determination: ${hoursText(det - found)}`)
  if (det !== undefined && filing !== undefined)
    out.push(`Determination to filing: ${hoursText(filing - det)}`)
  if (board !== undefined) out.push(`Discovery to board notice: ${hoursText(board - found)}`)
  return out
}

function render(d: GovDecisionTimelineData, o: FigureOptions): FigureResult {
  const title = d.title ?? 'Decision timeline'
  const events = [...d.events].sort((a, b) => a.hour - b.hour)
  const drawn = annotatedTimelineKind.render(
    annotatedTimelineKind.schema.parse({
      title,
      xLabel: 'Hours since discovery',
      lanes: ['Decisions', ...d.clocks.map((_c, i) => `Clock ${i + 1}`)],
      events: events.map((e) => ({
        x: e.hour,
        label: e.label ?? KIND_LABEL[e.kind],
        lane: 'Decisions',
      })),
      spans: d.clocks.map((c, i) => ({
        from: c.fromHour,
        to: c.toHour,
        label: c.label,
        lane: `Clock ${i + 1}`,
      })),
    }),
    o,
  )
  const gaps = intervals(d)
  const columns = ['Hour', 'Event', 'Kind']
  const rows = [
    ...events.map((e) => [hoursText(e.hour), e.label ?? KIND_LABEL[e.kind], KIND_LABEL[e.kind]]),
    ...d.clocks.map((c) => [
      `${hoursText(c.fromHour)} to ${hoursText(c.toHour)}`,
      c.label,
      'Clock',
    ]),
  ]
  const summary =
    `${title}: ${events.length} events` +
    (d.clocks.length ? ` and ${d.clocks.length} clock${d.clocks.length === 1 ? '' : 's'}` : '') +
    ', in hours since discovery. ' +
    events.map((e) => `${hoursText(e.hour)} ${e.label ?? KIND_LABEL[e.kind]}`).join('; ') +
    '. ' +
    (gaps.length ? `${gaps.join('; ')}. ` : '') +
    d.clocks.map((c) => `${c.label}: ${hoursText(c.fromHour)} to ${hoursText(c.toHour)}`).join('; ')
  return { svg: drawn.svg, summary: summary.trim(), table: { caption: title, columns, rows } }
}

export const govDecisionTimelineKind: FigureKind<GovDecisionTimelineData> = {
  kind: 'gov_decision_timeline',
  schema: GovDecisionTimelineData,
  render,
}
