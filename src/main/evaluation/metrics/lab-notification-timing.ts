// Notification timing for a laboratory incident (spec 0466 FR-10): each notification the exercise
// requires against its deadline, from the moment the incident was discovered. A notification is
// a `lab_notify_party` decision (who) or a `lab_submit_written_report` decision (which report);
// the designer lists what is required and how many minutes each is allowed, so the same metric
// serves a select agent entity (immediate notices and a 7-day report), an NIH-funded institution
// (30 days) and an institution's own deadlines. Minutes early or late are shown for each, with a
// count of missed notifications (made late, or never made). The deadlines are the designer's
// exercise values; the product tells users to follow their registration and institutional policy.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  minutesText,
  ms,
  NOT_AVAILABLE,
  ratio,
  ratioText,
  stringList,
  type Metric,
  type MetricOutput,
} from './types'

export const LabNotificationTimingConfig = z.object({
  /** The ground-truth event kind that starts every clock. */
  startKind: z.string().min(1).default('incident_discovered'),
  /**
   * Required notifications as "decisionKind:key:minutes:label", where key is the option id the
   * decision's `party` (or `report`) field must carry. No commas inside an entry.
   */
  required: stringList.default([]),
})
export type LabNotificationTimingConfig = z.infer<typeof LabNotificationTimingConfig>

export interface LabNotificationInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

export interface RequiredNotice {
  kind: string
  key: string
  minutes: number
  label: string
}

/** Parse "decisionKind:key:minutes:label"; an entry that does not fit is left out. */
export function parseRequired(entries: readonly string[]): RequiredNotice[] {
  return entries.flatMap((e) => {
    const [kind, key, minutes, ...label] = e.split(':')
    const m = Number(minutes)
    if (!kind || !key || !Number.isFinite(m) || m < 0) return []
    return [{ kind, key, minutes: m, label: label.join(':').trim() || key }]
  })
}

type Outcome = 'on time' | 'late' | 'not made'

function keyOf(d: MetricDecision): string {
  return String(d.fields.party ?? d.fields.report ?? '').trim()
}

export function computeLabNotificationTiming(
  inputs: LabNotificationInputs,
  config: LabNotificationTimingConfig,
): MetricOutput {
  const required = parseRequired(config.required)
  const starts = inputs.events.filter((e) => e.kind === config.startKind).map((e) => ms(e.time))
  const start = starts.length ? Math.min(...starts) : null
  const rows = required.map((r) => {
    const made = inputs.decisions
      .filter((d) => d.kind === r.kind && (r.key === '*' || keyOf(d) === r.key))
      .sort((a, b) => ms(a.time) - ms(b.time))[0]
    const due = start === null ? null : start + r.minutes * 60_000
    const diff = made && due !== null ? (ms(made.time) - due) / 60_000 : null
    const outcome: Outcome = !made ? 'not made' : diff !== null && diff > 0 ? 'late' : 'on time'
    return { r, made, due, diff, outcome }
  })
  const n = (o: Outcome) => rows.filter((x) => x.outcome === o).length
  const missed = n('late') + n('not made')
  return {
    metricId: 'lab_notification_timing',
    title: 'Notification timing',
    config,
    inputs: [
      { label: 'Required notifications', value: String(required.length) },
      {
        label: 'Clock starts at',
        value: start === null ? `no "${config.startKind}" event` : new Date(start).toISOString(),
      },
    ],
    summary: [
      { label: 'Made on time', value: `${n('on time')} of ${required.length}` },
      { label: 'Made late', value: String(n('late')) },
      { label: 'Never made', value: String(n('not made')) },
      { label: 'Missed notifications (late or never made)', value: String(missed) },
      {
        label: 'Share made on time',
        value: ratioText(ratio(n('on time'), required.length)),
      },
    ],
    tables: [
      {
        title: 'Notifications against their deadlines',
        columns: [
          'Notification',
          'Allowed (minutes)',
          'Due',
          'Made',
          'Minutes early (-) or late (+)',
          'Outcome',
        ],
        rows: rows.map((x) => [
          x.r.label,
          String(x.r.minutes),
          x.due === null ? NOT_AVAILABLE : new Date(x.due).toISOString(),
          x.made ? x.made.time : NOT_AVAILABLE,
          x.diff === null ? NOT_AVAILABLE : `${x.diff > 0 ? '+' : ''}${minutesText(x.diff)}`,
          x.outcome,
        ]),
      },
    ],
    caveats: [
      "The deadlines are the exercise designer's. Where a registration or institutional policy is stricter than a regulation, the stricter rule governs.",
      ...(start === null
        ? ['No discovery event was found, so no deadline could be computed.']
        : []),
      ...(required.length === 0 ? ['No required notifications are configured.'] : []),
    ],
    data: {
      required: required.length,
      onTime: n('on time'),
      late: n('late'),
      notMade: n('not made'),
      missed,
      notices: rows.map((x) => ({ label: x.r.label, outcome: x.outcome, minutes: x.diff })),
    },
  }
}

export const labNotificationTiming: Metric<LabNotificationTimingConfig, LabNotificationInputs> = {
  id: 'lab_notification_timing',
  title: 'Notification timing',
  configSchema: LabNotificationTimingConfig,
  compute: computeLabNotificationTiming,
}
