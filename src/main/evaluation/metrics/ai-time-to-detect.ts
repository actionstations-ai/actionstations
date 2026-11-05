// Time to detect synthetic media (spec 0467 FR-9): from the first exposure (the call, the first
// post) to the first flag (a callback that found the request not genuine, a payment held, a
// takedown asked for) and to the formal declaration of an incident.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  AI_DECISION_KINDS as K,
  AI_EVENT_KINDS,
  choseLabel,
  eventsOf,
  firstOf,
  minutesFrom,
  ofKind,
} from './ai-incident-inputs'
import { minutesText, NOT_AVAILABLE, type Metric, type MetricOutput } from './types'

export const AiTimeToDetectConfig = z.object({
  exposureKind: z.string().default(AI_EVENT_KINDS.exposure),
  /** Minutes by which the declaration should follow the first flag; shown, never scored. */
  targetMin: z.number().min(0).max(100_000).default(60),
})
export type AiTimeToDetectConfig = z.infer<typeof AiTimeToDetectConfig>

export interface AiDetectInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

/** Decisions that count as the first flag that something is wrong. */
export function flagDecisions(decisions: MetricDecision[]): MetricDecision[] {
  return [
    ...ofKind(decisions, K.callback).filter((d) => choseLabel(d, 'result', 'Not genuine')),
    ...ofKind(decisions, K.hold).filter((d) => choseLabel(d, 'action', 'Hold')),
    ...ofKind(decisions, K.takedown),
  ]
}

export function computeAiTimeToDetect(
  inputs: AiDetectInputs,
  config: AiTimeToDetectConfig,
): MetricOutput {
  const exposures = eventsOf(inputs.events, config.exposureKind)
  const flag = firstOf(flagDecisions(inputs.decisions))
  const declared = firstOf(ofKind(inputs.decisions, K.declare))
  const rows = exposures.map((e) => ({
    e,
    toFlag: flag ? minutesFrom(e.time, flag.time) : null,
    toDeclare: declared ? minutesFrom(e.time, declared.time) : null,
  }))
  const first = rows[0]
  return {
    metricId: 'ai_time_to_detect',
    title: 'Time to detect synthetic media',
    config,
    inputs: [
      { label: 'Exposure events', value: String(exposures.length) },
      { label: 'Decisions read', value: String(inputs.decisions.length) },
      {
        label: 'Counted as a flag',
        value: 'a callback result of not genuine, a payment hold, or a takedown request',
      },
    ],
    summary: [
      { label: 'First exposure to first flag', value: minutesText(first?.toFlag ?? null) },
      { label: 'First exposure to declaration', value: minutesText(first?.toDeclare ?? null) },
      {
        label: 'First flag to declaration',
        value:
          flag && declared ? minutesText(minutesFrom(flag.time, declared.time)) : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'Exposures',
        columns: ['Exposure', 'Time', 'To first flag', 'To declaration'],
        rows: rows.map((r) => [r.e.id, r.e.time, minutesText(r.toFlag), minutesText(r.toDeclare)]),
      },
    ],
    caveats: [
      'Detection times depend on when the exercise showed the first exposure, which the facilitator controls. A discussion aid, not a benchmark.',
      ...(exposures.length === 0 ? ['The scenario has no exposure event to measure from.'] : []),
      ...(!flag ? ['No flag was recorded (no callback, hold or takedown).'] : []),
      ...(!declared ? ['No incident was declared.'] : []),
    ],
    data: {
      toFlagMin: first?.toFlag ?? null,
      toDeclarationMin: first?.toDeclare ?? null,
      targetMin: config.targetMin,
    },
  }
}

export const aiTimeToDetect: Metric<AiTimeToDetectConfig, AiDetectInputs> = {
  id: 'ai_time_to_detect',
  title: 'Time to detect synthetic media',
  configSchema: AiTimeToDetectConfig,
  compute: computeAiTimeToDetect,
}
