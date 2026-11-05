// Time to holding statement (spec 0458 FR-9): minutes from the first public signal in the
// scenario's ground truth to the first holding statement decision. The window comes from the
// organization's communications plan (configurable); with no window the time is reported
// without a verdict. A discussion aid, not a field standard.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { decisionsOfKind, eventsOfKind, MEDIA_EVENT_KINDS, minutesBetween } from './media-inputs'
import { minutesText, NOT_AVAILABLE, type Metric, type MetricOutput } from './types'

export const HoldingStatementTimeConfig = z.object({
  /** Minutes the communications plan allows from first signal; 0 means no window. */
  windowMin: z.number().min(0).default(60),
  /** Ground-truth event kind that marks the first public signal. */
  signalKind: z.string().default(MEDIA_EVENT_KINDS.signal),
  /** Decision kind of a holding statement (the toolkit form id). */
  decisionKind: z.string().default('issue_holding_statement'),
})
export type HoldingStatementTimeConfig = z.infer<typeof HoldingStatementTimeConfig>

export interface HoldingStatementTimeInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

export function computeHoldingStatementTime(
  inputs: HoldingStatementTimeInputs,
  config: HoldingStatementTimeConfig,
): MetricOutput {
  const signal = eventsOfKind(inputs.events, config.signalKind)[0]
  const statements = decisionsOfKind(inputs.decisions, config.decisionKind)
  const first = signal
    ? statements.find((d) => minutesBetween(signal.time, d.time) >= 0)
    : undefined
  const minutes = signal && first ? minutesBetween(signal.time, first.time) : null
  const windowOn = config.windowMin > 0
  const within = minutes === null || !windowOn ? null : minutes <= config.windowMin
  return {
    metricId: 'holding_statement_time',
    title: 'Time to holding statement',
    config,
    inputs: [
      { label: 'First public signal', value: signal ? signal.time : NOT_AVAILABLE },
      { label: 'Holding statements recorded', value: String(statements.length) },
      {
        label: 'Window from the communications plan',
        value: windowOn ? `${config.windowMin} min` : 'none set',
      },
    ],
    summary: [
      { label: 'Time from first signal to first holding statement', value: minutesText(minutes) },
      {
        label: 'Within the window',
        value: within === null ? NOT_AVAILABLE : within ? 'Yes' : 'No',
      },
    ],
    tables: [
      {
        title: 'Holding statements',
        columns: ['Time', 'Minutes after first signal', 'Channel', 'Approved by'],
        rows: statements.map((d) => [
          d.time,
          signal ? minutesText(minutesBetween(signal.time, d.time)) : NOT_AVAILABLE,
          String(d.fields.channel ?? ''),
          String(d.fields.approver ?? ''),
        ]),
      },
    ],
    caveats: [
      'Time is measured from the first public signal in the scenario, not from when the team learned of it.',
      'A statement before the signal is not counted. The metric does not judge the statement; accuracy is scored separately.',
      ...(signal
        ? []
        : ['The scenario has no first public signal event, so no time can be computed.']),
    ],
    data: { minutes, within, windowMin: config.windowMin, statements: statements.length },
  }
}

export const holdingStatementTime: Metric<HoldingStatementTimeConfig, HoldingStatementTimeInputs> =
  {
    id: 'holding_statement_time',
    title: 'Time to holding statement',
    configSchema: HoldingStatementTimeConfig,
    compute: computeHoldingStatementTime,
  }
