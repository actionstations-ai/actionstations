// The metric registry (spec 0448 FR-12). A toolkit names metrics by id with a config;
// `runMetric` validates the config, hands the metric the inputs it reads and stamps the result.
// Packs configure metrics; they cannot add one (metrics are app code). The three generic metrics
// are registered here; a field adds its own with `registerMetric` (id, config schema, compute).
import type {
  GroundTruthEvent,
  MetricDecision,
  MetricRef,
  MetricResult,
  ModeledSeries,
} from '@shared/schemas/metrics'
import { AppError } from '../../lib/errors'
import {
  criticalResultCommunication,
  duplicateRecordsCreated,
  reconciliationProgress,
  restoreOrderScore,
  safeCareLosses,
  timeToDowntimeProcedures,
} from './clinical'
import {
  pickCriticalResults,
  pickDowntime,
  pickDuplicates,
  pickReconciliation,
  pickRestoreOrder,
  pickSafeCare,
} from './clinical-inputs'
import { accountability } from './accountability'
import { corrections } from './corrections'
import { decisionTiming } from './decision-timing'
import { destinationFit } from './destination-fit'
import { holdingStatementTime } from './holding-statement-time'
import { needsCoverage } from './needs-coverage'
import { notificationClocksMet, type RegulationClocks } from './notification-clocks'
import { serviceLevel } from './service-level'
import { timeToCompletion } from './time-to-completion'
import { messageConsistency, type FactStatement, type KeyFact } from './message-consistency'
import { protectiveActionDistance } from './protective-action-distance'
import { protectionCoverage } from './protection-coverage'
import { reporterHandling } from './reporter-handling'
import { spillNotificationTimeliness } from './spill-notifications'
import { statementAccuracy, type StatementCheck } from './statement-accuracy'
import { thresholdTiming } from './threshold-timing'
import { triageCompletion } from './triage-completion'
import type { Metric } from './types'
import { verification } from './verification'

/** Everything any metric may read; a metric uses the part it needs. */
export interface MetricInputBag {
  events?: GroundTruthEvent[]
  decisions?: MetricDecision[]
  series?: ModeledSeries[]
  facts?: KeyFact[]
  statements?: FactStatement[]
  /** Statement claims checked against the fact sheet (media environment). */
  checks?: StatementCheck[]
  /** Datasets a field metric reads that the generic ones do not, by dataset id. */
  datasets?: Record<string, unknown>
  /** Regulatory clocks as the facilitator tracked them in Facilitate. */
  clocks?: RegulationClocks[]
}

export const BUILTIN_METRIC_IDS = [
  'decision_timing',
  'threshold_timing',
  'message_consistency',
  'holding_statement_time',
  'statement_accuracy',
  'corrections',
  'reporter_handling',
  'verification',
  'triage_completion',
  'destination_fit',
  'protective_action_distance',
  'accountability',
  'protection_coverage',
] as const

interface Entry {
  metric: Metric<unknown, unknown>
  pick: (bag: MetricInputBag) => unknown
}

const entries = new Map<string, Entry>()

const METRIC_ID = /^[a-z][a-z0-9_]{0,63}$/

/**
 * Add a metric. `pick` chooses the part of the input bag the metric reads (the whole bag when
 * omitted). The same metric twice is a no-op; a different one under a taken id throws.
 */
export function registerMetric<Config, Inputs>(
  metric: Metric<Config, Inputs>,
  pick: (bag: MetricInputBag) => Inputs = (bag) => bag as unknown as Inputs,
): void {
  if (!METRIC_ID.test(metric.id)) throw new Error(`Metric id "${metric.id}" is not valid`)
  const existing = entries.get(metric.id)
  if (existing && existing.metric !== (metric as unknown as Metric<unknown, unknown>))
    throw new Error(`Metric "${metric.id}" is already registered`)
  entries.set(metric.id, { metric: metric as unknown as Metric<unknown, unknown>, pick })
}

registerMetric(decisionTiming, (b) => ({ events: b.events ?? [], decisions: b.decisions ?? [] }))
registerMetric(thresholdTiming, (b) => ({ series: b.series ?? [], decisions: b.decisions ?? [] }))
registerMetric(messageConsistency, (b) => ({
  facts: b.facts ?? [],
  statements: b.statements ?? [],
}))
registerMetric(protectionCoverage, (b) => ({
  series: b.series ?? [],
  decisions: b.decisions ?? [],
}))
// The media environment's metrics (events and decisions, except accuracy: checked claims).
const eventsAndDecisions = (b: MetricInputBag) => ({
  events: b.events ?? [],
  decisions: b.decisions ?? [],
})
registerMetric(holdingStatementTime, eventsAndDecisions)
registerMetric(statementAccuracy, (b) => ({ checks: b.checks ?? [] }))
registerMetric(corrections, eventsAndDecisions)
registerMetric(reporterHandling, eventsAndDecisions)
registerMetric(verification, eventsAndDecisions)
// The clinical systems metrics (health informatics, spec 0451).
registerMetric(timeToDowntimeProcedures, pickDowntime)
registerMetric(safeCareLosses, pickSafeCare)
registerMetric(criticalResultCommunication, pickCriticalResults)
registerMetric(reconciliationProgress, pickReconciliation)
registerMetric(duplicateRecordsCreated, pickDuplicates)
registerMetric(restoreOrderScore, pickRestoreOrder)
// EMS, fire and hazmat metrics (events from the simulated incident, decisions of the toolkit forms).
registerMetric(triageCompletion, eventsAndDecisions)
registerMetric(destinationFit, eventsAndDecisions)
registerMetric(protectiveActionDistance, eventsAndDecisions)
registerMetric(accountability, eventsAndDecisions)
// Environmental response (spec 0455): required notifications matched by the party notified.
registerMetric(spillNotificationTimeliness, eventsAndDecisions)
// Human services (spec 0464): generic service level, time to completion and needs coverage.
registerMetric(serviceLevel, (b) => ({ series: b.series ?? [] }))
registerMetric(timeToCompletion, eventsAndDecisions)
registerMetric(needsCoverage, eventsAndDecisions)
// Any regulation's notification clocks, from the facilitator's compliance record (#1137).
registerMetric(notificationClocksMet, (b) => b.clocks ?? [])

export const metricIds = (): string[] => [...entries.keys()].sort()
export const isMetricId = (id: string): boolean => entries.has(id)
export const metricTitle = (id: string): string | undefined => entries.get(id)?.metric.title

export interface RunContext {
  sessionId?: string
  now?: () => Date
}

/** Run one named metric. An unknown id or a config that does not fit is a validation error. */
export function runMetric(ref: MetricRef, bag: MetricInputBag, ctx: RunContext = {}): MetricResult {
  const entry = entries.get(ref.id)
  if (!entry) throw new AppError('VALIDATION', `Unknown metric: ${ref.id}`)
  let out
  try {
    out = entry.metric.compute(entry.pick(bag), entry.metric.configSchema.parse(ref.config))
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

/** Config keys a metric takes as lists. A toolkit config holds only text, numbers and booleans, so a list is written as comma-separated text. */
const LIST_KEYS: Record<string, readonly string[]> = {
  decision_timing: ['decisionKinds', 'eventKinds'],
  message_consistency: ['partners'],
  spill_notification_timeliness: ['decisionKinds', 'eventKinds', 'partyFields'],
}

/**
 * A metric a toolkit names, as a ref `runMetric` can run: list settings written as
 * "a, b, c" become arrays; everything else passes through.
 */
export function metricRefFromToolkit(m: {
  id: string
  config: Record<string, string | number | boolean>
}): MetricRef {
  const lists = new Set(LIST_KEYS[m.id] ?? [])
  const config: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(m.config))
    config[k] =
      lists.has(k) && typeof v === 'string'
        ? v
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : v
  return { id: m.id, config }
}
