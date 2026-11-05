// Time to completion (spec 0464 FR-11): the time from a start (an event or a decision) to the
// completion of each member of a population: doors open after the decision to open a shelter,
// every student released after the site was activated, every displaced child located after the
// plan was activated. A member is completed by a decision of a given kind that names it (or, when
// a decision carries no member, by that decision alone). Open members, the median and the slowest
// are reported; nothing is averaged over members that never finished. Justice and humanitarian
// configure the same metric for their own populations.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { choiceKey, decisionsOfKind, eventsOfKind, fieldText } from './media-inputs'
import { minutesText, ms, NOT_AVAILABLE, ratio, type Metric, type MetricOutput } from './types'

export const TimeToCompletionConfig = z
  .object({
    /** What is being completed, in words ("students released"). */
    populationLabel: z.string().min(1).max(80).default('members'),
    /** The start is the first ground-truth event of this kind... */
    startEventKind: z.string().max(80).optional(),
    /** ...or the first decision of this kind. */
    startDecisionKind: z.string().max(80).optional(),
    /** Decision kind that completes a member. */
    completionDecisionKind: z.string().min(1).max(80),
    /** Decision field that names the member completed ("student"); without it each decision is one member. */
    memberField: z.string().max(80).optional(),
    /** "field:value": a decision completes a member only when the field starts with the value (as words). */
    completionRequires: z.string().max(200).optional(),
    /** Ground-truth event kind whose events are the population ("student"). */
    populationEventKind: z.string().max(80).optional(),
    /** Event attribute that holds the member's id ("ref"). */
    populationKey: z.string().max(80).default('ref'),
    /** Members whose event has this attribute set to true are left out ("unaccompanied"). */
    excludeAttr: z.string().max(80).optional(),
    /** Minutes within which a completion counts as on target. */
    targetMin: z.number().min(0).max(100_000).optional(),
  })
  .refine((c) => c.startEventKind !== undefined || c.startDecisionKind !== undefined, {
    message: 'a start event kind or a start decision kind is required',
  })
export type TimeToCompletionConfig = z.infer<typeof TimeToCompletionConfig>

export interface TimeToCompletionInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const norm = (s: string): string => choiceKey(s)

function median(values: number[]): number | null {
  if (!values.length) return null
  const v = [...values].sort((a, b) => a - b)
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2
}

function startTime(i: TimeToCompletionInputs, c: TimeToCompletionConfig): number | null {
  const first = c.startEventKind
    ? eventsOfKind(i.events, c.startEventKind)[0]?.time
    : decisionsOfKind(i.decisions, c.startDecisionKind!)[0]?.time
  return first === undefined ? null : ms(first)
}

function qualifies(d: MetricDecision, c: TimeToCompletionConfig): boolean {
  if (!c.completionRequires) return true
  const at = c.completionRequires.indexOf(':')
  if (at < 1) return true
  const field = c.completionRequires.slice(0, at).trim()
  const value = c.completionRequires.slice(at + 1).trim()
  return norm(fieldText(d, field)).startsWith(norm(value))
}

interface Member {
  id: string
  doneAt: number | null
}

function members(i: TimeToCompletionInputs, c: TimeToCompletionConfig): Member[] {
  const done = new Map<string, { at: number; label: string }>()
  decisionsOfKind(i.decisions, c.completionDecisionKind)
    .filter((d) => qualifies(d, c))
    .forEach((d, n) => {
      const label = c.memberField ? fieldText(d, c.memberField) : `decision ${n + 1}`
      const key = norm(label)
      if (!key) return
      const at = ms(d.time)
      const prev = done.get(key)
      if (prev === undefined || at < prev.at) done.set(key, { at, label })
    })
  if (!c.populationEventKind) return [...done.values()].map((v) => ({ id: v.label, doneAt: v.at }))
  return eventsOfKind(i.events, c.populationEventKind)
    .filter((e) => !(c.excludeAttr && e.attrs[c.excludeAttr] === true))
    .map((e) => {
      const raw = e.attrs[c.populationKey]
      const label = typeof raw === 'string' ? raw : e.id
      return { id: label, doneAt: done.get(norm(label))?.at ?? null }
    })
}

export function computeTimeToCompletion(
  inputs: TimeToCompletionInputs,
  config: TimeToCompletionConfig,
): MetricOutput {
  const start = startTime(inputs, config)
  const all = members(inputs, config)
  const elapsed = (m: Member): number | null =>
    start === null || m.doneAt === null ? null : (m.doneAt - start) / 60_000
  const times = all.flatMap((m) => {
    const e = elapsed(m)
    return e === null ? [] : [e]
  })
  const open = all.filter((m) => m.doneAt === null)
  const within =
    config.targetMin === undefined ? null : times.filter((t) => t <= config.targetMin!).length
  const label = config.populationLabel
  return {
    metricId: 'time_to_completion',
    title: 'Time to completion',
    config,
    inputs: [
      { label: 'Population', value: `${all.length} ${label}` },
      {
        label: 'Start',
        value:
          start === null
            ? 'not found'
            : `${config.startEventKind ?? config.startDecisionKind} at ${new Date(start).toISOString()}`,
      },
      { label: 'Completed by', value: `decision ${config.completionDecisionKind}` },
      ...(config.targetMin !== undefined
        ? [{ label: 'Target', value: `${config.targetMin} min` }]
        : []),
    ],
    summary: [
      { label: `Completed (${label})`, value: `${all.length - open.length} of ${all.length}` },
      { label: 'Still open', value: String(open.length) },
      { label: 'Median time', value: minutesText(median(times)) },
      { label: 'Slowest completed', value: minutesText(times.length ? Math.max(...times) : null) },
      ...(within !== null ? [{ label: 'Within target', value: `${within} of ${all.length}` }] : []),
    ],
    tables: [
      {
        title: `Slowest and open (${label})`,
        columns: ['Member', 'Minutes from start', 'Status'],
        rows: [
          ...open.map((m) => [m.id, NOT_AVAILABLE, 'Open']),
          ...[...all]
            .filter((m) => m.doneAt !== null)
            .sort((a, b) => (elapsed(b) ?? 0) - (elapsed(a) ?? 0))
            .slice(0, 10)
            .map((m) => [m.id, minutesText(elapsed(m)), 'Completed']),
        ].slice(0, 40),
      },
    ],
    caveats: [
      'Median and slowest are over members that completed; members still open are listed separately and are not counted as zero or averaged in.',
      ...(start === null ? ['The start was not found, so no time could be computed.'] : []),
      ...(all.length === 0 ? ['The population is empty.'] : []),
    ],
    data: {
      population: all.length,
      completed: all.length - open.length,
      open: open.length,
      medianMin: median(times),
      slowestMin: times.length ? Math.max(...times) : null,
      withinTarget: within,
      shareComplete: ratio(all.length - open.length, all.length),
    },
  }
}

export const timeToCompletion: Metric<TimeToCompletionConfig, TimeToCompletionInputs> = {
  id: 'time_to_completion',
  title: 'Time to completion',
  configSchema: TimeToCompletionConfig,
  compute: computeTimeToCompletion,
}
