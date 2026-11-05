// Decision timing (spec 0448 FR-12): decisions against ground-truth events, scored like a
// forecast-verification contingency table. A decision matches an event when its kind is one the
// config accepts, it falls inside the lead window (before the event) or the grace window (after
// it), and, with area matching on, the areas agree. An event with a matching decision is a hit,
// without one a miss; a decision that matches no event is a false alarm. POD = H/(H+M),
// FAR = FA/(H+FA), CSI = H/(H+M+FA), the NWS definitions with decisions as the warnings.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  mean,
  minutesText,
  ms,
  ratio,
  ratioText,
  sameArea,
  stringList,
  type Metric,
  type MetricOutput,
} from './types'

export const DecisionTimingConfig = z.object({
  /** Decision kinds that count as warnings; all kinds when empty. */
  decisionKinds: stringList.default([]),
  /** Event kinds that are scored; all kinds when empty. */
  eventKinds: stringList.default([]),
  /** A decision this many minutes before an event, at most, can match it. */
  leadWindowMin: z.number().min(0).default(120),
  /** A decision this many minutes after the event began can still match it (zero lead or less). */
  graceWindowMin: z.number().min(0).default(0),
  /** Require the decision and event areas to agree (a missing area matches anything). */
  matchArea: z.boolean().default(true),
})
export type DecisionTimingConfig = z.infer<typeof DecisionTimingConfig>

export interface DecisionTimingInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

interface EventScore {
  event: GroundTruthEvent
  hit: boolean
  leadMin: number | null
  decisionId: string | null
}

function accepts(list: string[], kind: string): boolean {
  return list.length === 0 || list.includes(kind)
}

function matches(d: MetricDecision, e: GroundTruthEvent, c: DecisionTimingConfig): boolean {
  const leadMin = (ms(e.time) - ms(d.time)) / 60_000
  if (leadMin > c.leadWindowMin || leadMin < -c.graceWindowMin) return false
  return !c.matchArea || sameArea(d.area, e.area)
}

function scoreEvent(
  e: GroundTruthEvent,
  decisions: MetricDecision[],
  c: DecisionTimingConfig,
): EventScore {
  const found = decisions
    .filter((d) => matches(d, e, c))
    .sort((a, b) => ms(a.time) - ms(b.time) || a.id.localeCompare(b.id))[0]
  if (!found) return { event: e, hit: false, leadMin: null, decisionId: null }
  return {
    event: e,
    hit: true,
    leadMin: (ms(e.time) - ms(found.time)) / 60_000,
    decisionId: found.id,
  }
}

const CAVEAT =
  'Lead time is measured on hits only. A decision that matched no event is a false alarm and does not change lead time, so an unverified warning never shortens or lengthens the mean.'

function resultTables(scores: EventScore[], falseAlarms: MetricDecision[]) {
  return [
    {
      title: 'Events',
      columns: ['Event', 'Kind', 'Area', 'Time', 'Outcome', 'Lead time', 'Decision'],
      rows: scores.map((s) => [
        s.event.id,
        s.event.kind,
        s.event.area ?? '',
        s.event.time,
        s.hit ? 'Hit' : 'Miss',
        minutesText(s.leadMin),
        s.decisionId ?? '',
      ]),
    },
    {
      title: 'False alarms',
      columns: ['Decision', 'Kind', 'Area', 'Time'],
      rows: falseAlarms.map((d) => [d.id, d.kind, d.area ?? '', d.time]),
    },
  ]
}

export function computeDecisionTiming(
  inputs: DecisionTimingInputs,
  config: DecisionTimingConfig,
): MetricOutput {
  const events = inputs.events.filter((e) => accepts(config.eventKinds, e.kind))
  const decisions = inputs.decisions.filter((d) => accepts(config.decisionKinds, d.kind))
  const scores = events
    .map((e) => scoreEvent(e, decisions, config))
    .sort((a, b) => ms(a.event.time) - ms(b.event.time) || a.event.id.localeCompare(b.event.id))
  const hits = scores.filter((s) => s.hit).length
  const misses = scores.length - hits
  // A decision covering several events is not a false alarm; one covering none is.
  const falseAlarms = decisions.filter((d) => !events.some((e) => matches(d, e, config)))
  const pod = ratio(hits, hits + misses)
  const far = ratio(falseAlarms.length, hits + falseAlarms.length)
  const csi = ratio(hits, hits + misses + falseAlarms.length)
  const leads = scores.flatMap((s) => (s.leadMin === null ? [] : [s.leadMin]))
  const meanLead = mean(leads)
  return {
    metricId: 'decision_timing',
    title: 'Decision timing',
    config,
    inputs: [
      { label: 'Ground-truth events scored', value: String(events.length) },
      { label: 'Decisions scored', value: String(decisions.length) },
      { label: 'Lead window', value: `${config.leadWindowMin} min before the event` },
      { label: 'Grace window', value: `${config.graceWindowMin} min after the event` },
      { label: 'Area match', value: config.matchArea ? 'required' : 'ignored' },
    ],
    summary: [
      { label: 'Hits', value: String(hits) },
      { label: 'Misses', value: String(misses) },
      { label: 'False alarms', value: String(falseAlarms.length) },
      { label: 'POD (probability of detection)', value: ratioText(pod) },
      { label: 'FAR (false alarm ratio)', value: ratioText(far) },
      { label: 'CSI (critical success index)', value: ratioText(csi) },
      { label: 'Mean lead time', value: minutesText(meanLead) },
    ],
    tables: resultTables(scores, falseAlarms),
    caveats: [
      CAVEAT,
      ...(events.length === 0 ? ['No ground-truth events were scored.'] : []),
      ...(decisions.length === 0 ? ['No decisions were recorded, so every event is a miss.'] : []),
    ],
    data: {
      hits,
      misses,
      falseAlarms: falseAlarms.length,
      pod,
      far,
      csi,
      meanLeadMin: meanLead,
      leadMinByEvent: Object.fromEntries(scores.map((s) => [s.event.id, s.leadMin])),
    },
  }
}

export const decisionTiming: Metric<DecisionTimingConfig, DecisionTimingInputs> = {
  id: 'decision_timing',
  title: 'Decision timing',
  configSchema: DecisionTimingConfig,
  compute: computeDecisionTiming,
}
