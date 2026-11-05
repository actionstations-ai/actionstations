// Justice time to decision (spec 0465 FR-12, ADR-0132): the minutes from a scenario event to the
// decision that answers it. One mode starts at the first event of a kind and ends when every
// required decision has been made (time to unified command: the first arrival to a command post
// and unified command; time to a family center; time to an accurate count). The paired mode starts
// one clock per event and matches decisions by a shared name (time to restore each court
// function against its own recovery time objective). It scores timing and coordination, never
// tactics, and shows the events and decisions it used. Targets are the designer's.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { minutesText, ms, NOT_AVAILABLE, stringList, type Metric, type MetricOutput } from './types'

export const JusticeTimeToDecisionConfig = z.object({
  /** Shown as the metric's heading, for example "Time to unified command". */
  label: z.string().default('Time to decision'),
  /** The event whose first occurrence (or each occurrence, when paired) starts the clock. */
  startEventKind: z.string(),
  /** Decision kinds that answer it; in the single mode all of them must be made. */
  requiredDecisionKinds: stringList,
  /** Pair events and decisions by this name: an event attr and a decision field of the same name. */
  pairBy: z.string().optional(),
  /** Target in minutes, set by the designer. A paired event's own `rtoHours` attr takes precedence. */
  targetMin: z.number().positive().optional(),
})
export type JusticeTimeToDecisionConfig = z.infer<typeof JusticeTimeToDecisionConfig>

export interface JusticeTimeToDecisionInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const norm = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .toLowerCase()

const firstDecision = (
  decisions: MetricDecision[],
  kinds: string[],
  after: number,
  pair?: { name: string; value: string },
): MetricDecision | undefined =>
  decisions
    .filter(
      (d) =>
        kinds.includes(d.kind) &&
        ms(d.time) >= after &&
        (!pair || norm(d.fields[pair.name]) === pair.value),
    )
    .sort((a, b) => ms(a.time) - ms(b.time))[0]

const verdict = (minutes: number | null, target: number | undefined): string =>
  minutes === null
    ? 'not made'
    : target === undefined
      ? 'made'
      : minutes <= target
        ? 'within target'
        : 'late'

function single(
  inputs: JusticeTimeToDecisionInputs,
  c: JusticeTimeToDecisionConfig,
  kinds: string[],
): MetricOutput {
  const start = inputs.events
    .filter((e) => e.kind === c.startEventKind)
    .sort((a, b) => ms(a.time) - ms(b.time))[0]
  const rows = kinds.map((k) => {
    const d = start ? firstDecision(inputs.decisions, [k], ms(start.time)) : undefined
    return {
      kind: k,
      decision: d,
      minutes: d && start ? (ms(d.time) - ms(start.time)) / 60_000 : null,
    }
  })
  const done = rows.every((r) => r.minutes !== null)
  const total = done ? Math.max(...rows.map((r) => r.minutes!)) : null
  return {
    metricId: 'justice_time_to_decision',
    title: c.label,
    config: c,
    inputs: [
      {
        label: 'Clock starts at',
        value: start ? `${c.startEventKind} at ${start.time}` : `no ${c.startEventKind} event`,
      },
      { label: 'Decisions required', value: kinds.join(', ') },
      {
        label: 'Target',
        value: c.targetMin ? `${c.targetMin} min (set by the designer)` : 'none set',
      },
    ],
    summary: [
      { label: 'Time to completion', value: minutesText(total) },
      { label: 'Result', value: total === null ? 'not complete' : verdict(total, c.targetMin) },
      {
        label: 'Decisions made',
        value: `${rows.filter((r) => r.minutes !== null).length} of ${rows.length}`,
      },
    ],
    tables: [
      {
        title: 'Decisions',
        columns: ['Decision', 'Made at', 'Minutes from start'],
        rows: rows.map((r) => [
          r.kind,
          r.decision?.time ?? NOT_AVAILABLE,
          r.minutes === null ? NOT_AVAILABLE : String(Math.round(r.minutes * 10) / 10),
        ]),
      },
    ],
    caveats: [
      'Scores the timing of command and coordination decisions, not tactics. Targets are the exercise designer’s.',
      ...(start ? [] : ['The scenario has no start event, so no time is computed.']),
    ],
    data: {
      minutes: total,
      complete: done,
      decisionsMade: rows.filter((r) => r.minutes !== null).length,
    },
  }
}

function paired(
  inputs: JusticeTimeToDecisionInputs,
  c: JusticeTimeToDecisionConfig,
  kinds: string[],
  by: string,
): MetricOutput {
  const starts = inputs.events.filter(
    (e) => e.kind === c.startEventKind && e.attrs[by] !== undefined,
  )
  const rows = starts.map((e) => {
    const key = norm(e.attrs[by])
    const d = firstDecision(inputs.decisions, kinds, ms(e.time), { name: by, value: key })
    const minutes = d ? (ms(d.time) - ms(e.time)) / 60_000 : null
    const rto = typeof e.attrs.rtoHours === 'number' ? e.attrs.rtoHours * 60 : c.targetMin
    return { key, label: String(e.attrs.label ?? e.attrs[by]), minutes, rto, decision: d }
  })
  const made = rows.filter((r) => r.minutes !== null)
  const within = rows.filter((r) => r.minutes !== null && r.rto !== undefined && r.minutes <= r.rto)
  return {
    metricId: 'justice_time_to_decision',
    title: c.label,
    config: c,
    inputs: [
      {
        label: 'One clock per',
        value: `${c.startEventKind} event, matched to a decision by ${by}`,
      },
      { label: 'Decisions that answer it', value: kinds.join(', ') },
      {
        label: 'Targets',
        value: 'each event’s own recovery time objective, else the designer’s target',
      },
    ],
    summary: [
      { label: 'Answered', value: `${made.length} of ${rows.length}` },
      { label: 'Within target', value: `${within.length} of ${rows.length}` },
      {
        label: 'Latest answer',
        value: minutesText(made.length ? Math.max(...made.map((r) => r.minutes!)) : null),
      },
    ],
    tables: [
      {
        title: 'By item',
        columns: ['Item', 'Minutes to decision', 'Target (min)', 'Result'],
        rows: rows.map((r) => [
          r.label,
          r.minutes === null ? NOT_AVAILABLE : String(Math.round(r.minutes * 10) / 10),
          r.rto === undefined ? NOT_AVAILABLE : String(Math.round(r.rto)),
          verdict(r.minutes, r.rto),
        ]),
      },
    ],
    caveats: [
      'Scores the timing of the decision to restore, not whether the restoration worked. Recovery time objectives are the court’s own.',
      ...(rows.length === 0 ? [`No ${c.startEventKind} events carry "${by}".`] : []),
    ],
    data: { answered: made.length, withinTarget: within.length, total: rows.length },
  }
}

export function computeJusticeTimeToDecision(
  inputs: JusticeTimeToDecisionInputs,
  config: JusticeTimeToDecisionConfig,
): MetricOutput {
  const kinds = stringList.parse(config.requiredDecisionKinds)
  return config.pairBy
    ? paired(inputs, config, kinds, config.pairBy)
    : single(inputs, config, kinds)
}

export const justiceTimeToDecision: Metric<
  JusticeTimeToDecisionConfig,
  JusticeTimeToDecisionInputs
> = {
  id: 'justice_time_to_decision',
  title: 'Time to decision',
  configSchema: JusticeTimeToDecisionConfig,
  compute: computeJusticeTimeToDecision,
}
