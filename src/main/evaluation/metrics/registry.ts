// The built-in metric registry (spec 0448 FR-12). A toolkit names metrics by id with a config;
// `runMetric` validates the config, hands the metric the inputs it reads and stamps the result.
// Packs configure metrics; they cannot add one (metrics are app code).
import type {
  GroundTruthEvent,
  MetricDecision,
  MetricRef,
  MetricResult,
  ModeledSeries,
} from '@shared/schemas/metrics'
import { AppError } from '../../lib/errors'
import { decisionTiming } from './decision-timing'
import { messageConsistency, type FactStatement, type KeyFact } from './message-consistency'
import { thresholdTiming } from './threshold-timing'

/** Everything any metric may read; a metric uses the part it needs. */
export interface MetricInputBag {
  events?: GroundTruthEvent[]
  decisions?: MetricDecision[]
  series?: ModeledSeries[]
  facts?: KeyFact[]
  statements?: FactStatement[]
}

export const METRIC_IDS = ['decision_timing', 'threshold_timing', 'message_consistency'] as const
export type MetricId = (typeof METRIC_IDS)[number]

export const isMetricId = (id: string): id is MetricId =>
  (METRIC_IDS as readonly string[]).includes(id)

export interface RunContext {
  sessionId?: string
  now?: () => Date
}

function compute(ref: MetricRef & { id: MetricId }, bag: MetricInputBag) {
  switch (ref.id) {
    case 'decision_timing':
      return decisionTiming.compute(
        { events: bag.events ?? [], decisions: bag.decisions ?? [] },
        decisionTiming.configSchema.parse(ref.config),
      )
    case 'threshold_timing':
      return thresholdTiming.compute(
        { series: bag.series ?? [], decisions: bag.decisions ?? [] },
        thresholdTiming.configSchema.parse(ref.config),
      )
    case 'message_consistency':
      return messageConsistency.compute(
        { facts: bag.facts ?? [], statements: bag.statements ?? [] },
        messageConsistency.configSchema.parse(ref.config),
      )
  }
}

/** Run one named metric. An unknown id or a config that does not fit is a validation error. */
export function runMetric(ref: MetricRef, bag: MetricInputBag, ctx: RunContext = {}): MetricResult {
  if (!isMetricId(ref.id)) throw new AppError('VALIDATION', `Unknown metric: ${ref.id}`)
  let out
  try {
    out = compute({ ...ref, id: ref.id }, bag)
  } catch (e) {
    if (e instanceof AppError) throw e
    throw new AppError('VALIDATION', `Metric ${ref.id} could not run: ${(e as Error).message}`)
  }
  return {
    ...out,
    computedAt: (ctx.now?.() ?? new Date()).toISOString(),
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  }
}
