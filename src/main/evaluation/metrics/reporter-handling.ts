// Reporter handling (spec 0458 FR-9): reporter queries (ground truth, each with a stated
// deadline) against the responses recorded. A response answers a query when its `inquiry` field
// names the query's id. Counts queries answered before the deadline, the share answered, and the
// mix of on the record, background, decline and no comment.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  attrText,
  choiceLabel,
  decisionsOfKind,
  eventsOfKind,
  fieldText,
  MEDIA_EVENT_KINDS,
  minutesBetween,
} from './media-inputs'
import {
  minutesText,
  NOT_AVAILABLE,
  ms,
  ratio,
  ratioText,
  type Metric,
  type MetricOutput,
} from './types'

export const ReporterHandlingConfig = z.object({
  queryKind: z.string().default(MEDIA_EVENT_KINDS.query),
  decisionKind: z.string().default('respond_to_reporter'),
})
export type ReporterHandlingConfig = z.infer<typeof ReporterHandlingConfig>

export interface ReporterHandlingInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const norm = (s: string) => s.trim().toLowerCase()
const MODES = ['On the record', 'Background', 'Decline', 'No comment'] as const

export function computeReporterHandling(
  inputs: ReporterHandlingInputs,
  config: ReporterHandlingConfig,
): MetricOutput {
  const queries = eventsOfKind(inputs.events, config.queryKind)
  const responses = decisionsOfKind(inputs.decisions, config.decisionKind)
  const rows = queries.map((q) => {
    const answer = responses.find((r) => norm(fieldText(r, 'inquiry')) === norm(q.id))
    const deadline = attrText(q, 'deadline')
    const onTime = answer && deadline ? ms(answer.time) <= ms(deadline) : null
    return { q, answer, deadline, onTime }
  })
  const answered = rows.filter((r) => r.answer)
  const dated = rows.filter((r) => r.deadline)
  const onTimeCount = dated.filter((r) => r.onTime).length
  const mode = (m: string) =>
    answered.filter((r) => choiceLabel(r.answer!, 'response_mode', MODES) === m).length
  return {
    metricId: 'reporter_handling',
    title: 'Reporter handling',
    config,
    inputs: [
      { label: 'Reporter queries', value: String(queries.length) },
      { label: 'Responses recorded', value: String(responses.length) },
    ],
    summary: [
      { label: 'Queries answered', value: `${answered.length} of ${queries.length}` },
      { label: 'Share answered', value: ratioText(ratio(answered.length, queries.length)) },
      {
        label: 'Answered before the stated deadline',
        value: dated.length ? `${onTimeCount} of ${dated.length}` : NOT_AVAILABLE,
      },
      ...MODES.map((m) => ({ label: m, value: String(mode(m)) })),
    ],
    tables: [
      {
        title: 'Queries',
        columns: ['Query', 'Received', 'Deadline', 'Answered after', 'Response', 'Before deadline'],
        rows: rows.map((r) => [
          r.q.id,
          r.q.time,
          r.deadline || NOT_AVAILABLE,
          r.answer ? minutesText(minutesBetween(r.q.time, r.answer.time)) : NOT_AVAILABLE,
          r.answer ? choiceLabel(r.answer, 'response_mode', MODES) : 'No response',
          r.onTime === null ? NOT_AVAILABLE : r.onTime ? 'Yes' : 'No',
        ]),
      },
    ],
    caveats: [
      'A response counts only when its inquiry field names the query id; enter the id from the inject.',
      'The metric counts "no comment" but cannot judge whether a fact could have been given instead; that is a discussion point for the hot wash.',
    ],
    data: {
      queries: queries.length,
      answered: answered.length,
      onTime: onTimeCount,
      dated: dated.length,
      share: ratio(answered.length, queries.length),
      modes: Object.fromEntries(MODES.map((m) => [m, mode(m)])),
    },
  }
}

export const reporterHandling: Metric<ReporterHandlingConfig, ReporterHandlingInputs> = {
  id: 'reporter_handling',
  title: 'Reporter handling',
  configSchema: ReporterHandlingConfig,
  compute: computeReporterHandling,
}
