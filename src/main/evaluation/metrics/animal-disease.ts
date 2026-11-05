// The animal disease metrics (spec 0460 FR-11): depopulation timing against the plan's 24 hour
// goal (per premises), surveillance on schedule, continuity of business and disposal backlog.
// Each shows the inputs it used. Targets are the exercise designer's: the 24 hour goal is the
// HPAI Red Book's (May 2017) and is the default only for that metric; service targets for
// permits and the sampling due dates are set in the scenario, not assumed.
import { z } from 'zod'
import { HPAI_DEPOPULATION_GOAL_HOURS } from '@shared/animal-disease/plan-rules'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  NOT_AVAILABLE,
  minutesText,
  ms,
  ratio,
  ratioText,
  type Metric,
  type MetricOutput,
} from './types'

/** Decision kinds the metrics read: the toolkit's decision form ids. */
export const ANIMAL_DECISION_KINDS = {
  recordDepopulation: 'animal_record_depopulation',
  recordSample: 'animal_record_sample',
  permitDecision: 'animal_movement_permit_decision',
  chooseDisposalSite: 'animal_choose_disposal_site',
} as const

const premisesOf = (e: { attrs: Record<string, unknown>; id: string }): string =>
  typeof e.attrs.premises === 'string' ? e.attrs.premises : e.id

const premisesField = (d: MetricDecision): string => String(d.fields.premises ?? '').trim()

const lastPerPremises = (
  decisions: readonly MetricDecision[],
  kind: string,
): Map<string, MetricDecision> => {
  const out = new Map<string, MetricDecision>()
  for (const d of [...decisions].sort((a, b) => ms(a.time) - ms(b.time)))
    if (d.kind === kind && premisesField(d)) out.set(premisesField(d), d)
  return out
}

/** The first decision per premises, which is the one the clock stops at. */
const firstPerPremises = (
  decisions: readonly MetricDecision[],
  kind: string,
): Map<string, MetricDecision> => {
  const out = new Map<string, MetricDecision>()
  for (const d of [...decisions].sort((a, b) => ms(a.time) - ms(b.time)))
    if (d.kind === kind && premisesField(d) && !out.has(premisesField(d)))
      out.set(premisesField(d), d)
  return out
}

interface Bag {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

// ---- depopulation timing -----------------------------------------------------------------------

export const DepopTimingConfig = z.object({
  /** Hours from the presumptive positive to completed depopulation: the HPAI Red Book goal. */
  goalHours: z.number().positive().default(HPAI_DEPOPULATION_GOAL_HOURS),
})
export type DepopTimingConfig = z.infer<typeof DepopTimingConfig>

export function computeDepopTiming(inputs: Bag, config: DepopTimingConfig): MetricOutput {
  const presumptive = inputs.events.filter((e) => e.kind === 'presumptive_positive')
  const done = lastPerPremises(inputs.decisions, ANIMAL_DECISION_KINDS.recordDepopulation)
  const rows = presumptive.map((e) => {
    const id = premisesOf(e)
    const d = done.get(id)
    const minutes = d ? (ms(d.time) - ms(e.time)) / 60_000 : null
    const outcome =
      minutes === null ? 'open' : minutes <= config.goalHours * 60 ? 'within goal' : 'late'
    return { id, at: e.time, doneAt: d?.time ?? null, minutes, outcome }
  })
  const n = (o: string): number => rows.filter((r) => r.outcome === o).length
  const finished = rows.flatMap((r) => (r.minutes === null ? [] : [r.minutes]))
  const worst = finished.length ? Math.max(...finished) : null
  return {
    metricId: 'animal_depop_timing',
    title: 'Depopulation timing',
    config,
    inputs: [
      { label: 'Presumptive positive premises', value: String(rows.length) },
      {
        label: 'Goal',
        value: `${config.goalHours} h from the presumptive positive (HPAI Red Book, May 2017, unless the designer changed it)`,
      },
    ],
    summary: [
      { label: 'Depopulated within goal', value: `${n('within goal')} of ${rows.length}` },
      { label: 'Share within goal', value: ratioText(ratio(n('within goal'), rows.length)) },
      { label: 'Completed late', value: String(n('late')) },
      { label: 'Still open', value: String(n('open')) },
      { label: 'Longest time to complete', value: minutesText(worst) },
    ],
    tables: [
      {
        title: 'Premises',
        columns: [
          'Premises',
          'Presumptive positive',
          'Depopulation complete',
          'Minutes',
          'Outcome',
        ],
        rows: rows.map((r) => [
          r.id,
          r.at,
          r.doneAt ?? NOT_AVAILABLE,
          r.minutes === null ? NOT_AVAILABLE : String(Math.round(r.minutes)),
          r.outcome,
        ]),
      },
    ],
    caveats: [
      'The goal is a plan goal, not a legal deadline; with limited crews the plan puts the premises with the most potential for spread first.',
      ...(rows.length === 0 ? ['No presumptive positive premises were scored.'] : []),
    ],
    data: {
      premises: rows.length,
      withinGoal: n('within goal'),
      late: n('late'),
      open: n('open'),
      shareWithinGoal: ratio(n('within goal'), rows.length),
      longestMinutes: worst,
    },
  }
}

export const animalDepopTiming: Metric<DepopTimingConfig, Bag> = {
  id: 'animal_depop_timing',
  title: 'Depopulation timing',
  configSchema: DepopTimingConfig,
  compute: computeDepopTiming,
}

// ---- surveillance on schedule ---------------------------------------------------------------------

export const SurveillanceConfig = z.object({
  /** Minutes after the due time a sample still counts as on schedule. */
  graceMinutes: z.number().min(0).default(0),
})
export type SurveillanceConfig = z.infer<typeof SurveillanceConfig>

export function computeSurveillance(inputs: Bag, config: SurveillanceConfig): MetricOutput {
  const due = inputs.events.filter((e) => e.kind === 'sampling_due')
  const taken = firstPerPremises(inputs.decisions, ANIMAL_DECISION_KINDS.recordSample)
  const rows = due.map((e) => {
    const id = premisesOf(e)
    const d = taken.get(id)
    const lateMin = d ? (ms(d.time) - ms(e.time)) / 60_000 : null
    const outcome =
      lateMin === null ? 'not sampled' : lateMin <= config.graceMinutes ? 'on schedule' : 'late'
    return {
      id,
      designation: String(e.attrs.designation ?? ''),
      dueAt: e.time,
      sampledAt: d?.time ?? null,
      outcome,
    }
  })
  const n = (o: string): number => rows.filter((r) => r.outcome === o).length
  return {
    metricId: 'animal_surveillance_on_schedule',
    title: 'Surveillance on schedule',
    config,
    inputs: [
      { label: 'Premises with a sample due', value: String(rows.length) },
      { label: 'Grace', value: `${config.graceMinutes} min after the due time` },
    ],
    summary: [
      { label: 'Sampled on schedule', value: `${n('on schedule')} of ${rows.length}` },
      { label: 'Share on schedule', value: ratioText(ratio(n('on schedule'), rows.length)) },
      { label: 'Sampled late', value: String(n('late')) },
      { label: 'Not sampled', value: String(n('not sampled')) },
    ],
    tables: [
      {
        title: 'Premises',
        columns: ['Premises', 'Designation', 'Due', 'Sampled', 'Outcome'],
        rows: rows.map((r) => [
          r.id,
          r.designation,
          r.dueAt,
          r.sampledAt ?? NOT_AVAILABLE,
          r.outcome,
        ]),
      },
    ],
    caveats: [
      'Due times follow the interval for each designation in the plan the scenario names (the FMD Red Book table is a guideline); the state plan governs.',
      ...(rows.length === 0 ? ['No sample due dates were scored.'] : []),
    ],
    data: {
      due: rows.length,
      onSchedule: n('on schedule'),
      late: n('late'),
      notSampled: n('not sampled'),
      shareOnSchedule: ratio(n('on schedule'), rows.length),
    },
  }
}

export const animalSurveillance: Metric<SurveillanceConfig, Bag> = {
  id: 'animal_surveillance_on_schedule',
  title: 'Surveillance on schedule',
  configSchema: SurveillanceConfig,
  compute: computeSurveillance,
}

// ---- continuity of business -----------------------------------------------------------------------

export const ContinuityConfig = z.object({
  /** Hours from a permit request to its decision: the designer's service target. */
  serviceTargetHours: z.number().positive().default(24),
})
export type ContinuityConfig = z.infer<typeof ContinuityConfig>

const ISSUING = ['issue', 'issue_with_conditions']

export function computeContinuity(inputs: Bag, config: ContinuityConfig): MetricOutput {
  const requests = inputs.events.filter((e) => e.kind === 'permit_request')
  const decided = firstPerPremises(inputs.decisions, ANIMAL_DECISION_KINDS.permitDecision)
  const rows = requests.map((e) => {
    const id = premisesOf(e)
    const d = decided.get(id)
    const hours = d ? (ms(d.time) - ms(e.time)) / 3_600_000 : null
    const verdict = d ? String(d.fields.decision ?? '') : ''
    const unaffected = e.attrs.unaffected !== false
    return {
      id,
      unaffected,
      requestedAt: e.time,
      decidedAt: d?.time ?? null,
      hours,
      onTime: hours !== null && hours <= config.serviceTargetHours,
      issued: ISSUING.includes(verdict),
      verdict: d ? verdict : 'no decision',
    }
  })
  const unaffected = rows.filter((r) => r.unaffected)
  const decidedRows = rows.filter((r) => r.hours !== null)
  const onTime = rows.filter((r) => r.onTime).length
  const able = unaffected.filter((r) => r.issued).length
  return {
    metricId: 'animal_continuity',
    title: 'Continuity of business',
    config,
    inputs: [
      {
        label: 'Permit requests',
        value: `${rows.length} (${unaffected.length} from unaffected premises)`,
      },
      {
        label: 'Service target',
        value: `decision within ${config.serviceTargetHours} h of the request (set by the designer)`,
      },
    ],
    summary: [
      { label: 'Decided within the service target', value: `${onTime} of ${rows.length}` },
      { label: 'Share decided within target', value: ratioText(ratio(onTime, rows.length)) },
      { label: 'Requests with no decision', value: String(rows.length - decidedRows.length) },
      {
        label: 'Unaffected premises able to move product',
        value: `${able} of ${unaffected.length}`,
      },
      {
        label: 'Share of unaffected premises able to move',
        value: ratioText(ratio(able, unaffected.length)),
      },
    ],
    tables: [
      {
        title: 'Permit requests',
        columns: ['Premises', 'Unaffected', 'Requested', 'Decided', 'Hours', 'Decision'],
        rows: rows.map((r) => [
          r.id,
          r.unaffected ? 'yes' : 'no',
          r.requestedAt,
          r.decidedAt ?? NOT_AVAILABLE,
          r.hours === null ? NOT_AVAILABLE : String(Math.round(r.hours * 10) / 10),
          r.verdict,
        ]),
      },
    ],
    caveats: [
      "The service target is the exercise designer's. Denying a permit can be the right decision; the share able to move product is context, not a score.",
      ...(rows.length === 0 ? ['No permit requests were scored.'] : []),
    ],
    data: {
      requests: rows.length,
      unaffected: unaffected.length,
      decidedOnTime: onTime,
      noDecision: rows.length - decidedRows.length,
      ableToMove: able,
      shareOnTime: ratio(onTime, rows.length),
      shareAbleToMove: ratio(able, unaffected.length),
    },
  }
}

export const animalContinuity: Metric<ContinuityConfig, Bag> = {
  id: 'animal_continuity',
  title: 'Continuity of business',
  configSchema: ContinuityConfig,
  compute: computeContinuity,
}

// ---- disposal backlog -------------------------------------------------------------------------------

export const DisposalBacklogConfig = z.object({
  /** Hours a depopulated premises may wait for a disposal site decision. */
  maxWaitHours: z.number().positive().default(12),
})
export type DisposalBacklogConfig = z.infer<typeof DisposalBacklogConfig>

export function computeDisposalBacklog(inputs: Bag, config: DisposalBacklogConfig): MetricOutput {
  const complete = inputs.events.filter((e) => e.kind === 'depop_complete')
  const chosen = firstPerPremises(inputs.decisions, ANIMAL_DECISION_KINDS.chooseDisposalSite)
  const rows = complete.map((e) => {
    const id = premisesOf(e)
    const d = chosen.get(id)
    const head = typeof e.attrs.head === 'number' ? e.attrs.head : 0
    const waited = d ? Math.max(0, (ms(d.time) - ms(e.time)) / 3_600_000) : null
    const outcome = waited === null ? 'waiting' : waited <= config.maxWaitHours ? 'in time' : 'late'
    return { id, head, completeAt: e.time, chosenAt: d?.time ?? null, waited, outcome }
  })
  const n = (o: string): number => rows.filter((r) => r.outcome === o).length
  const waitingHead = rows.filter((r) => r.outcome === 'waiting').reduce((s, r) => s + r.head, 0)
  const lateHead = rows.filter((r) => r.outcome === 'late').reduce((s, r) => s + r.head, 0)
  return {
    metricId: 'animal_disposal_backlog',
    title: 'Disposal backlog',
    config,
    inputs: [
      { label: 'Premises depopulated', value: String(rows.length) },
      {
        label: 'Wait allowed for a disposal decision',
        value: `${config.maxWaitHours} h after depopulation`,
      },
    ],
    summary: [
      { label: 'Disposal site chosen in time', value: `${n('in time')} of ${rows.length}` },
      { label: 'Chosen late', value: String(n('late')) },
      { label: 'Still waiting', value: String(n('waiting')) },
      { label: 'Head waiting with no site', value: String(waitingHead) },
      { label: 'Head that waited past the limit', value: String(lateHead) },
    ],
    tables: [
      {
        title: 'Premises',
        columns: ['Premises', 'Head', 'Depopulated', 'Site chosen', 'Hours waited', 'Outcome'],
        rows: rows.map((r) => [
          r.id,
          String(r.head),
          r.completeAt,
          r.chosenAt ?? NOT_AVAILABLE,
          r.waited === null ? NOT_AVAILABLE : String(Math.round(r.waited * 10) / 10),
          r.outcome,
        ]),
      },
    ],
    caveats: [
      "The wait limit is the designer's. Site capacity and travel come from the scenario's capacity model, which is simulated.",
      ...(rows.length === 0 ? ['No depopulations were scored.'] : []),
    ],
    data: {
      premises: rows.length,
      inTime: n('in time'),
      late: n('late'),
      waiting: n('waiting'),
      waitingHead,
      lateHead,
    },
  }
}

export const animalDisposalBacklog: Metric<DisposalBacklogConfig, Bag> = {
  id: 'animal_disposal_backlog',
  title: 'Disposal backlog',
  configSchema: DisposalBacklogConfig,
  compute: computeDisposalBacklog,
}

export const ANIMAL_METRICS = [
  animalDepopTiming,
  animalSurveillance,
  animalContinuity,
  animalDisposalBacklog,
] as const
