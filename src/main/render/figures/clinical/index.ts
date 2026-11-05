// Clinical systems figure kinds (spec 0451 FR-6, issue #878). Each takes clinical data (feeds,
// queues, units, backlogs, reconciliation counts, a downtime timeline), maps it onto a generic
// kind from spec 0448 for the drawing, and writes its own summary and data table in the field's
// words. Status is always a word and a symbol (the generic kinds draw both). Never AI pixels.
// The ids are the ones the clinical_systems toolkit names, so nursing and pharmacy can use them.
import { z } from 'zod'
import { annotatedTimelineKind, TimelineData } from '../annotated-timeline'
import { stackedBarKind } from '../bar'
import { registerFigureKind } from '../registry'
import { statusBoardKind } from '../status-board'
import { tableKind } from '../table'
import { timeSeriesKind, TimeSeriesData } from '../time-series'
import type { FigureKind, FigureOptions, FigureResult } from '../types'
import { XValue } from '../axis'

const Text = (max: number) => z.string().min(1).max(max)

/** Draw with a generic kind, then replace the summary and table with the clinical ones. */
function viaGeneric<G>(
  kind: FigureKind<G>,
  data: unknown,
  o: FigureOptions,
  summary: string,
  table?: FigureResult['table'],
): FigureResult {
  const drawn = kind.render(kind.schema.parse(data), o)
  return { svg: drawn.svg, summary, table: table ?? drawn.table }
}

// ---- interface_status_dashboard --------------------------------------------------------------

const FEED_STATES = ['up', 'queued', 'stopped', 'error'] as const
const FEED_WORD: Record<(typeof FEED_STATES)[number], string> = {
  up: 'Running',
  queued: 'Queue growing',
  stopped: 'Stopped',
  error: 'In error',
}
const FEED_STATE = { up: 'ok', queued: 'degraded', stopped: 'down', error: 'down' } as const

export const InterfaceDashboardData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  feeds: z
    .array(
      z.object({
        name: Text(80),
        direction: z.enum(['inbound', 'outbound']),
        status: z.enum(FEED_STATES),
        queueDepth: z.number().int().min(0).max(10_000_000),
        lastMessage: z.string().max(40).optional(),
        error: z.string().max(160).optional(),
      }),
    )
    .min(1)
    .max(30),
})
export type InterfaceDashboardData = z.infer<typeof InterfaceDashboardData>

function renderInterfaceDashboard(d: InterfaceDashboardData, o: FigureOptions): FigureResult {
  const counts = FEED_STATES.map((s) => [s, d.feeds.filter((f) => f.status === s).length] as const)
    .filter(([, c]) => c > 0)
    .map(([s, c]) => `${c} ${FEED_WORD[s].toLowerCase()}`)
  const deepest = [...d.feeds].sort((a, b) => b.queueDepth - a.queueDepth)[0]!
  const summary =
    `${d.title ?? 'Interface status'}${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.feeds.length} feeds, ` +
    `${counts.join(', ')}. Deepest queue: ${deepest.name} with ${deepest.queueDepth} messages. ` +
    d.feeds
      .map(
        (f) =>
          `${f.name} (${f.direction}): ${FEED_WORD[f.status]}, queue ${f.queueDepth}` +
          `${f.lastMessage ? `, last message ${f.lastMessage}` : ''}${f.error ? `, ${f.error}` : ''}`,
      )
      .join('; ') +
    '.'
  return viaGeneric(
    statusBoardKind,
    {
      title: d.title ?? 'Interface status',
      asOf: d.asOf,
      rows: d.feeds.map((f) => ({
        name: f.name,
        state: FEED_STATE[f.status],
        detail:
          `${FEED_WORD[f.status]} · ${f.direction} · queue ${f.queueDepth}` +
          (f.error ? ` · ${f.error}` : ''),
        updated: f.lastMessage ? `last message ${f.lastMessage}` : undefined,
      })),
    },
    o,
    summary,
    {
      caption: d.title ?? 'Interface status',
      columns: ['Feed', 'Direction', 'Status', 'Queue depth', 'Last message', 'Error'],
      rows: d.feeds.map((f) => [
        f.name,
        f.direction,
        FEED_WORD[f.status],
        String(f.queueDepth),
        f.lastMessage ?? '',
        f.error ?? '',
      ]),
    },
  )
}

export const interfaceStatusDashboardKind: FigureKind<InterfaceDashboardData> = {
  kind: 'interface_status_dashboard',
  schema: InterfaceDashboardData,
  render: renderInterfaceDashboard,
}

// ---- message_queue_series --------------------------------------------------------------------

export const MessageQueueData = z.object({
  title: z.string().max(200).optional(),
  xLabel: z.string().max(80).optional(),
  feeds: z
    .array(
      z.object({
        name: Text(80),
        points: z
          .array(z.object({ x: XValue, y: z.number().min(0).finite() }))
          .min(1)
          .max(2000),
      }),
    )
    .min(1)
    .max(6),
  alertDepth: z.number().min(0).optional(),
})
export type MessageQueueData = z.infer<typeof MessageQueueData>

function renderMessageQueue(d: MessageQueueData, o: FigureOptions): FigureResult {
  const data = TimeSeriesData.parse({
    title: d.title ?? 'Queued messages',
    xLabel: d.xLabel,
    yLabel: 'Queued messages',
    unit: 'messages',
    series: d.feeds.map((f) => ({ name: f.name, points: f.points })),
    thresholds: d.alertDepth === undefined ? [] : [{ value: d.alertDepth, label: 'Alert depth' }],
  })
  const drawn = timeSeriesKind.render(data, o)
  const peaks = d.feeds.map((f) => ({ name: f.name, peak: Math.max(...f.points.map((p) => p.y)) }))
  const worst = [...peaks].sort((a, b) => b.peak - a.peak)[0]!
  const over =
    d.alertDepth === undefined
      ? ''
      : ` ${peaks.filter((p) => p.peak >= d.alertDepth!).length} of ${peaks.length} feeds reach the alert depth of ${d.alertDepth}.`
  return {
    svg: drawn.svg,
    summary: `${drawn.summary} Highest queue: ${worst.name} at ${worst.peak} messages.${over}`,
    table: drawn.table,
  }
}

export const messageQueueSeriesKind: FigureKind<MessageQueueData> = {
  kind: 'message_queue_series',
  schema: MessageQueueData,
  render: renderMessageQueue,
}

// ---- unit_status_board -----------------------------------------------------------------------

export const UnitBoardData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  units: z
    .array(
      z.object({
        name: Text(60),
        state: z.enum(['green', 'amber', 'red']),
        staffOnDowntime: z.number().int().min(0).max(1000).optional(),
        detail: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(30),
})
export type UnitBoardData = z.infer<typeof UnitBoardData>

const UNIT_WORD = {
  green: 'On downtime procedures',
  amber: 'Partly ready',
  red: 'Not ready',
} as const
const UNIT_STATE = { green: 'ok', amber: 'degraded', red: 'down' } as const

function renderUnitBoard(d: UnitBoardData, o: FigureOptions): FigureResult {
  const count = (s: 'green' | 'amber' | 'red') => d.units.filter((u) => u.state === s).length
  const summary =
    `${d.title ?? 'Unit status'}${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.units.length} units, ` +
    `${count('green')} on downtime procedures (green), ${count('amber')} partly ready (amber), ` +
    `${count('red')} not ready (red). ` +
    d.units
      .map(
        (u) =>
          `${u.name}: ${UNIT_WORD[u.state]}${u.staffOnDowntime !== undefined ? `, ${u.staffOnDowntime} staff on downtime` : ''}${u.detail ? `, ${u.detail}` : ''}`,
      )
      .join('; ') +
    '.'
  return viaGeneric(
    statusBoardKind,
    {
      title: d.title ?? 'Unit status',
      asOf: d.asOf,
      rows: d.units.map((u) => ({
        name: u.name,
        state: UNIT_STATE[u.state],
        detail: [
          UNIT_WORD[u.state],
          u.staffOnDowntime !== undefined ? `${u.staffOnDowntime} staff on downtime` : '',
          u.detail ?? '',
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    },
    o,
    summary,
    {
      caption: d.title ?? 'Unit status',
      columns: ['Unit', 'Status', 'Staff on downtime', 'Detail'],
      rows: d.units.map((u) => [
        u.name,
        `${u.state[0]!.toUpperCase()}${u.state.slice(1)}: ${UNIT_WORD[u.state]}`,
        u.staffOnDowntime === undefined ? '' : String(u.staffOnDowntime),
        u.detail ?? '',
      ]),
    },
  )
}

export const unitStatusBoardKind: FigureKind<UnitBoardData> = {
  kind: 'unit_status_board',
  schema: UnitBoardData,
  render: renderUnitBoard,
}

// ---- results_backlog -------------------------------------------------------------------------

export const ResultsBacklogData = z.object({
  title: z.string().max(200).optional(),
  asOf: z.string().max(80).optional(),
  departments: z
    .array(
      z.object({
        name: Text(60),
        waiting: z.number().int().min(0).max(1_000_000),
        oldestMinutes: z.number().int().min(0).max(1_000_000),
        critical: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(20),
})
export type ResultsBacklogData = z.infer<typeof ResultsBacklogData>

export const formatAge = (minutes: number): string =>
  minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`

function renderResultsBacklog(d: ResultsBacklogData, o: FigureOptions): FigureResult {
  const total = d.departments.reduce((a, x) => a + x.waiting, 0)
  const critical = d.departments.reduce((a, x) => a + x.critical, 0)
  const oldest = [...d.departments].sort((a, b) => b.oldestMinutes - a.oldestMinutes)[0]!
  const summary =
    `${d.title ?? 'Results backlog'}${d.asOf ? ` as of ${d.asOf}` : ''}: ${total} results waiting across ${d.departments.length} departments, ` +
    `${critical} flagged critical. Oldest item: ${formatAge(oldest.oldestMinutes)} in ${oldest.name}. ` +
    d.departments
      .map(
        (x) =>
          `${x.name} ${x.waiting} waiting (oldest ${formatAge(x.oldestMinutes)}, ${x.critical} critical)`,
      )
      .join('; ') +
    '.'
  const rows = d.departments.map((x) => [x.name, x.waiting, formatAge(x.oldestMinutes), x.critical])
  const drawn = tableKind.render(
    tableKind.schema.parse({
      title: d.title ?? 'Results backlog',
      caption: d.asOf ? `As of ${d.asOf}` : undefined,
      columns: ['Department', 'Waiting', 'Oldest item', 'Critical'],
      rows: [...rows, ['All departments', total, formatAge(oldest.oldestMinutes), critical]],
    }),
    o,
  )
  return {
    svg: drawn.svg,
    summary,
    table: {
      caption: d.title ?? 'Results backlog',
      columns: ['Department', 'Waiting', 'Oldest item', 'Critical'],
      rows: rows.map((r) => r.map(String)),
    },
  }
}

export const resultsBacklogKind: FigureKind<ResultsBacklogData> = {
  kind: 'results_backlog',
  schema: ResultsBacklogData,
  render: renderResultsBacklog,
}

// ---- reconciliation_progress -----------------------------------------------------------------

export const ReconciliationData = z.object({
  title: z.string().max(200).optional(),
  unit: z.string().max(20).default('items'),
  units: z
    .array(
      z.object({
        name: Text(60),
        done: z.number().int().min(0).max(1_000_000),
        remaining: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1)
    .max(24),
})
export type ReconciliationData = z.infer<typeof ReconciliationData>

export const percentDone = (done: number, remaining: number): number =>
  done + remaining === 0 ? 100 : Math.round((done / (done + remaining)) * 100)

function renderReconciliation(d: ReconciliationData, o: FigureOptions): FigureResult {
  const done = d.units.reduce((a, u) => a + u.done, 0)
  const remaining = d.units.reduce((a, u) => a + u.remaining, 0)
  const summary =
    `${d.title ?? 'Reconciliation progress'}: ${percentDone(done, remaining)} percent complete overall ` +
    `(${done} ${d.unit} done, ${remaining} remaining). ` +
    d.units
      .map(
        (u) =>
          `${u.name} ${percentDone(u.done, u.remaining)} percent (${u.done} done, ${u.remaining} remaining)`,
      )
      .join('; ') +
    '.'
  const drawn = stackedBarKind.render(
    stackedBarKind.schema.parse({
      title: d.title ?? 'Reconciliation progress',
      yLabel: `Back-entered ${d.unit}`,
      unit: d.unit,
      categories: d.units.map((u) => u.name),
      series: [
        { name: 'Done', values: d.units.map((u) => u.done) },
        { name: 'Remaining', values: d.units.map((u) => u.remaining) },
      ],
    }),
    o,
  )
  return {
    svg: drawn.svg,
    summary,
    table: {
      caption: d.title ?? 'Reconciliation progress',
      columns: ['Unit', 'Done', 'Remaining', 'Percent complete'],
      rows: d.units.map((u) => [
        u.name,
        String(u.done),
        String(u.remaining),
        `${percentDone(u.done, u.remaining)}%`,
      ]),
    },
  }
}

export const reconciliationProgressKind: FigureKind<ReconciliationData> = {
  kind: 'reconciliation_progress',
  schema: ReconciliationData,
  render: renderReconciliation,
}

// ---- downtime_timeline -----------------------------------------------------------------------

function renderDowntimeTimeline(d: TimelineData, o: FigureOptions): FigureResult {
  const drawn = annotatedTimelineKind.render(d, o)
  return {
    svg: drawn.svg,
    summary: drawn.summary,
    table: drawn.table,
  }
}

export const downtimeTimelineKind: FigureKind<TimelineData> = {
  kind: 'downtime_timeline',
  schema: TimelineData,
  render: renderDowntimeTimeline,
}

registerFigureKind(interfaceStatusDashboardKind)
registerFigureKind(messageQueueSeriesKind)
registerFigureKind(unitStatusBoardKind)
registerFigureKind(resultsBacklogKind)
registerFigureKind(reconciliationProgressKind)
registerFigureKind(downtimeTimelineKind)
