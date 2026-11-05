// Contact reach (spec 0457 FR-12): of the contacts a team had to reach, how many it reached
// within the designer's target, how many were reached late, how many could not be reached at all
// and how many are still open. The target is set by the exercise designer; no national target is
// assumed. Contacts are exercise data (fictional people), listed by code.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  mean,
  minutesText,
  ms,
  NOT_AVAILABLE,
  ratio,
  ratioText,
  type Metric,
  type MetricOutput,
} from './types'

export const ContactReachConfig = z.object({
  /** Hours from the moment a contact is listed to the moment the contact is reached. */
  targetHours: z.number().positive().default(24),
  /** Count only contacts classified as close contacts. */
  closeOnly: z.boolean().default(true),
})
export type ContactReachConfig = z.infer<typeof ContactReachConfig>

export interface ContactRecord {
  id: string
  /** Close contact under the rule in use; absent counts as close. */
  close?: boolean
  /** When the contact was listed (the clock starts here), ISO. */
  listedAt: string
  /** When the team reached the contact, ISO; absent when not reached. */
  reachedAt?: string | null
  /** The team gave up: no working number, left the area, refused. */
  unreachable?: boolean
}

export interface ContactReachInputs {
  contacts: ContactRecord[]
}

type Outcome = 'on time' | 'late' | 'unreachable' | 'open'

function outcomeOf(
  c: ContactRecord,
  targetMin: number,
): { outcome: Outcome; minutes: number | null } {
  if (c.reachedAt) {
    const minutes = (ms(c.reachedAt) - ms(c.listedAt)) / 60_000
    return { outcome: minutes <= targetMin ? 'on time' : 'late', minutes }
  }
  return { outcome: c.unreachable ? 'unreachable' : 'open', minutes: null }
}

export function computeContactReach(
  inputs: ContactReachInputs,
  config: ContactReachConfig,
): MetricOutput {
  const counted = inputs.contacts.filter((c) => !config.closeOnly || c.close !== false)
  const targetMin = config.targetHours * 60
  const scored = counted.map((c) => ({ c, ...outcomeOf(c, targetMin) }))
  const n = (o: Outcome) => scored.filter((s) => s.outcome === o).length
  const reached = scored.flatMap((s) => (s.minutes === null ? [] : [s.minutes]))
  const sorted = [...reached].sort((a, b) => a - b)
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]!
      : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
    : null
  const total = counted.length
  return {
    metricId: 'contact_reach',
    title: 'Contact reach',
    config,
    inputs: [
      { label: 'Contacts listed', value: String(inputs.contacts.length) },
      {
        label: 'Contacts counted',
        value: `${total}${config.closeOnly ? ' (close contacts only)' : ''}`,
      },
      {
        label: 'Target',
        value: `reached within ${config.targetHours} h of being listed (set by the designer)`,
      },
    ],
    summary: [
      { label: 'Reached within target', value: `${n('on time')} of ${total}` },
      { label: 'Share reached within target', value: ratioText(ratio(n('on time'), total)) },
      { label: 'Reached late', value: String(n('late')) },
      { label: 'Unreachable', value: `${n('unreachable')} of ${total}` },
      { label: 'Share unreachable', value: ratioText(ratio(n('unreachable'), total)) },
      { label: 'Still open (not reached, not given up)', value: String(n('open')) },
      { label: 'Mean time to reach', value: minutesText(mean(reached)) },
      { label: 'Median time to reach', value: minutesText(median) },
    ],
    tables: [
      {
        title: 'Contacts',
        columns: ['Contact', 'Listed', 'Reached', 'Minutes to reach', 'Outcome'],
        rows: scored.map(({ c, outcome, minutes }) => [
          c.id,
          c.listedAt,
          c.reachedAt ?? NOT_AVAILABLE,
          minutes === null ? NOT_AVAILABLE : String(Math.round(minutes)),
          outcome,
        ]),
      },
    ],
    caveats: [
      "The target is the exercise designer's, not a national standard. An unreachable contact is a result, not an omission.",
      ...(total === 0 ? ['No contacts were counted.'] : []),
    ],
    data: {
      counted: total,
      onTime: n('on time'),
      late: n('late'),
      unreachable: n('unreachable'),
      open: n('open'),
      shareOnTime: ratio(n('on time'), total),
      shareUnreachable: ratio(n('unreachable'), total),
      meanMinutes: mean(reached),
      medianMinutes: median,
    },
  }
}

export const contactReach: Metric<ContactReachConfig, ContactReachInputs> = {
  id: 'contact_reach',
  title: 'Contact reach',
  configSchema: ContactReachConfig,
  compute: computeContactReach,
}

/**
 * The contacts of an investigation from what the scenario listed and what the team recorded: a
 * `contact_listed` event starts the clock for one contact (`attrs.contact` is its code and
 * `attrs.close` says whether it is a close contact); the latest `record_contact_outcome`
 * decision for that code says it was reached (the decision's time) or could not be.
 */
export function contactsFromBag(
  events: readonly GroundTruthEvent[],
  decisions: readonly MetricDecision[],
): ContactRecord[] {
  const outcomes = decisions
    .filter((d) => d.kind === 'record_contact_outcome')
    .sort((a, b) => ms(a.time) - ms(b.time))
  return events
    .filter((e) => e.kind === 'contact_listed')
    .map((e) => {
      const code = typeof e.attrs.contact === 'string' ? e.attrs.contact : e.id
      const last = outcomes.filter((d) => String(d.fields.contact ?? '').trim() === code).at(-1)
      const outcome = String(last?.fields.outcome ?? '')
      return {
        id: code,
        close: e.attrs.close !== false,
        listedAt: e.time,
        ...(last && outcome === 'reached' ? { reachedAt: last.time } : {}),
        ...(last && outcome === 'unreachable' ? { unreachable: true } : {}),
      }
    })
}
