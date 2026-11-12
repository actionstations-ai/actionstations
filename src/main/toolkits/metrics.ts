// Toolkit metrics at evaluation (spec 0448 FR-12, FR-13). The scenario's toolkits name metrics
// by id with a configuration; this gathers what each reads (ground truth and modeled series
// from the scenario's case data, decisions from the session log's `data.structured`, key facts
// from the evaluation record), runs the metric registry and stores the results with the
// evaluation, where the Evaluation tab and the after-action report read them.
import { caseClockFor, onCaseClock } from '@shared/case-time'
import type { EvaluationRecord } from '@shared/schemas/evaluation'
import type { DecisionRecord } from '@shared/schemas/decisions'
import type { MetricDecision, MetricResult } from '@shared/schemas/metrics'
import type { Toolkit, ToolkitMetric } from '@shared/toolkits'
import { caseDir, readManifest } from '../case-data/store'
import { regulationClocksProvider } from '../compliance/clock-measure'
import { syncAarDocument, readAar } from '../aar/store'
import {
  decisionsFromLog,
  readGroundTruth,
  readModeledSeries,
  type LogEntryLike,
} from '../evaluation/metrics/inputs'
import {
  isMetricId,
  metricTitle,
  runMetric,
  type MetricInputBag,
} from '../evaluation/metrics/registry'
import { readEvaluation, saveMetricResults } from '../evaluation/store'
import { readFacilitatorState } from '../facilitator/state'
import { logFile, newestSessionId, readAll } from '../live/log-read'
import { getScenario } from '../scenario/store'
import { resolveToolkits } from './registry'

export interface PlannedMetric {
  id: string
  title: string
  toolkitId: string
  toolkitName: string
  /** The metric needs key facts the evaluator has not entered. */
  needsKeyFacts: boolean
  /** The metric needs claims checked against the fact sheet that the evaluator has not entered. */
  needsStatementChecks: boolean
}

export interface MetricsPlan {
  metrics: PlannedMetric[]
  /** The session whose log a run reads (the newest), when there is one. */
  sessionId?: string
}

export interface MetricsRun {
  results: MetricResult[]
  /** Metrics that could not run, each with the reason in words. */
  skipped: { id: string; reason: string }[]
  record: EvaluationRecord
}

interface Configured {
  toolkit: Toolkit
  ref: ToolkitMetric
}

/** The scenario's configured metrics, the first toolkit to name a metric id and label winning. */
async function configuredMetrics(root: string, scenarioId: string): Promise<Configured[]> {
  const scenario = await getScenario(root, scenarioId)
  const seen = new Set<string>()
  const out: Configured[] = []
  for (const toolkit of await resolveToolkits(scenario.toolkits))
    for (const ref of toolkit.metrics) {
      // A toolkit may configure one metric several ways (a label tells them apart).
      const key = `${ref.id}\u0000${ref.label ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ toolkit, ref })
    }
  return out
}

/** What a run would compute, for the Evaluation tab. */
export async function metricsPlan(root: string, scenarioId: string): Promise<MetricsPlan> {
  const [configured, record, sessionId] = await Promise.all([
    configuredMetrics(root, scenarioId),
    readEvaluation(root, scenarioId),
    newestSessionId(root, scenarioId),
  ])
  const hasFacts = (record.keyFacts ?? []).length > 0
  const hasChecks = (record.statementChecks ?? []).some((c) => !c.suggested)
  return {
    metrics: configured.map(({ toolkit, ref }) => ({
      id: ref.id,
      title: ref.label ?? metricTitle(ref.id) ?? ref.id,
      toolkitId: toolkit.id,
      toolkitName: toolkit.name,
      needsKeyFacts: ref.id === 'message_consistency' && !hasFacts,
      needsStatementChecks: ref.id === 'statement_accuracy' && !hasChecks,
    })),
    ...(sessionId ? { sessionId } : {}),
  }
}

async function caseDataset(root: string, scenarioId: string, id: string | undefined) {
  if (!id) return undefined
  const manifest = await readManifest(root, scenarioId)
  const dataset = manifest?.datasets.find((d) => d.id === id)
  if (!dataset?.file) throw new Error(`the case dataset "${id}" is not in this scenario`)
  return { file: dataset.file, rangeStart: dataset.range?.start, mapping: manifest?.timeMapping }
}

/**
 * What a field metric reads beyond ground truth and decisions (case study runs, a dataset the
 * generic loader does not know). A field registers one provider per metric id.
 */
export type MetricInputProvider = (ctx: {
  root: string
  scenarioId: string
  ref: ToolkitMetric
  /** What the generic loader read: the decisions and, when the metric names one, ground truth. */
  bag?: MetricInputBag
}) => Promise<Partial<MetricInputBag>>

const providers = new Map<string, MetricInputProvider>()

/** Add a provider for a metric id. The same provider twice is a no-op; another under a taken id throws. */
export function registerMetricInputProvider(metricId: string, provider: MetricInputProvider): void {
  const existing = providers.get(metricId)
  if (existing && existing !== provider)
    throw new Error(`Metric input provider for "${metricId}" is already registered`)
  providers.set(metricId, provider)
}

// Any regulation's clocks, as Facilitate tracked them (the notification clocks measure).
registerMetricInputProvider('notification_clocks_met', regulationClocksProvider)

async function inputBag(
  root: string,
  scenarioId: string,
  ref: ToolkitMetric,
  decisions: MetricInputBag['decisions'],
  record: EvaluationRecord,
): Promise<MetricInputBag> {
  const bag: MetricInputBag = {
    decisions,
    facts: record.keyFacts ?? [],
    statements: record.factStatements ?? [],
    checks: record.statementChecks ?? [],
  }
  const dir = caseDir(root, scenarioId)
  const truth = await caseDataset(root, scenarioId, ref.groundTruth)
  if (truth) bag.events = await readGroundTruth(dir, truth.file)
  const series = await caseDataset(root, scenarioId, ref.series)
  if (series) bag.series = await readModeledSeries(dir, series.file)
  // A measure that reads case data compares decisions with it on the case clock (#1136).
  const data = truth ?? series
  if (data) {
    const clock = caseClockFor(data.mapping, {
      rangeStart: data.rangeStart,
      events: bag.events,
      series: bag.series,
    })
    bag.decisions = onCaseClock(decisions ?? [], clock)
  }
  const extra = await providers.get(ref.id)?.({ root, scenarioId, ref, bag })
  return extra ? { ...bag, ...extra } : bag
}

/** A decision the facilitator file holds, in the shape the metrics read. */
function fromRecord(r: DecisionRecord): MetricDecision {
  return {
    id: r.id,
    time: r.time,
    kind: r.kind,
    ...(r.area ? { area: r.area.name } : {}),
    fields: r.fields,
    ...(r.exerciseTime ? { exerciseTime: r.exerciseTime } : {}),
  }
}

/**
 * The decisions of the session log, and those the facilitator recorded in Facilitate without
 * devices (kept in the facilitator file). A decision in both counts once; with a session, a
 * file decision from before the session started belongs to an earlier run and is left out.
 */
async function sessionDecisions(root: string, scenarioId: string, sessionId: string | undefined) {
  const entries = sessionId
    ? ((await readAll(logFile(root, scenarioId, sessionId)).catch(() => [])) as LogEntryLike[])
    : []
  const logged = new Set(
    entries.map((e) => (e.data.structured as { id?: unknown } | undefined)?.id).filter(Boolean),
  )
  const since = entries[0] ? Date.parse(entries[0].at) : -Infinity
  const saved = await readFacilitatorState(root, scenarioId)
    .then((s) => s.decisionRecords ?? [])
    .catch(() => [])
  const extra = saved.filter((r) => !logged.has(r.id) && Date.parse(r.time) >= since)
  return [...decisionsFromLog(entries), ...extra.map(fromRecord)]
}

/**
 * Compute every configured metric for the scenario and store the results. A metric that cannot
 * run (unknown id, a dataset that is missing, a config that does not fit) is listed in `skipped`
 * and the others still run. The after-action report document is refreshed when one exists.
 */
export async function runToolkitMetrics(
  root: string,
  scenarioId: string,
  opts: { sessionId?: string } = {},
): Promise<MetricsRun> {
  const configured = await configuredMetrics(root, scenarioId)
  const sessionId = opts.sessionId ?? (await newestSessionId(root, scenarioId))
  const record = await readEvaluation(root, scenarioId)
  const decisions = await sessionDecisions(root, scenarioId, sessionId)
  const results: MetricResult[] = []
  const skipped: MetricsRun['skipped'] = []
  for (const { ref } of configured) {
    if (!isMetricId(ref.id)) {
      skipped.push({ id: ref.id, reason: 'The app has no metric with this id.' })
      continue
    }
    try {
      const bag = await inputBag(root, scenarioId, ref, decisions, record)
      const result = runMetric(
        { id: ref.id, config: ref.config },
        bag,
        sessionId ? { sessionId } : {},
      )
      results.push(ref.label ? { ...result, title: ref.label } : result)
    } catch (e) {
      skipped.push({ id: ref.id, reason: (e as Error).message })
    }
  }
  const saved = results.length ? await saveMetricResults(root, scenarioId, results) : record
  if (results.length) await refreshAar(root, scenarioId)
  return { results, skipped, record: saved }
}

async function refreshAar(root: string, scenarioId: string): Promise<void> {
  const aar = await readAar(root, scenarioId)
  if (aar) await syncAarDocument(root, scenarioId, aar, 'refresh', { by: 'user', note: 'metrics' })
}
