// Customer notification on time (spec 0462 FR-11): of the direct accounts a recall reaches, how many
// the team named in a notice within the designer's target after the recall decision, how many it
// named late, and how many it never named. The target is the designer's; no regulator target is
// assumed. An account counts once, at the time of the first notice that names it.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { ms, NOT_AVAILABLE, ratio, ratioText, type Metric, type MetricOutput } from './types'

export const LogisticsNotificationConfig = z.object({
  /** Minutes after the recall decision within which an account must be notified. */
  targetMin: z.number().positive().default(240),
})
export type LogisticsNotificationConfig = z.infer<typeof LogisticsNotificationConfig>

export interface LogisticsNotificationInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

/** Account names in a free-text list: split on commas, semicolons and line breaks. */
export function namedAccounts(text: unknown): string[] {
  return String(text ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function computeLogisticsNotification(
  i: LogisticsNotificationInputs,
  c: LogisticsNotificationConfig,
): MetricOutput {
  const recall = [...i.decisions]
    .filter((d) => d.kind === 'logistics_declare_recall')
    .sort((a, b) => ms(a.time) - ms(b.time))[0]
  const notices = [...i.decisions]
    .filter((d) => d.kind === 'logistics_notify_customers')
    .sort((a, b) => ms(a.time) - ms(b.time))
  const first = new Map<string, string>()
  for (const n of notices)
    for (const a of namedAccounts(n.fields.customers))
      if (!first.has(a.toLowerCase())) first.set(a.toLowerCase(), n.time)
  const truth = i.events.find((e) => e.kind === 'trace_answer')
  const expected = typeof truth?.attrs.accounts === 'number' ? truth.attrs.accounts : null
  const onTime = recall
    ? [...first.values()].filter((t) => (ms(t) - ms(recall.time)) / 60_000 <= c.targetMin).length
    : 0
  const named = first.size
  return {
    metricId: 'logistics_notification_timeliness',
    title: 'Customers notified on time',
    config: c,
    inputs: [
      { label: 'Recall decision', value: recall ? recall.time : NOT_AVAILABLE },
      {
        label: 'Target',
        value: `within ${c.targetMin} min of the recall decision (set by the designer)`,
      },
      { label: 'Notices recorded', value: String(notices.length) },
      {
        label: 'Accounts in the real list',
        value: expected === null ? NOT_AVAILABLE : String(expected),
      },
    ],
    summary: [
      { label: 'Accounts named in notices', value: String(named) },
      { label: 'Named within the target', value: String(onTime) },
      { label: 'Named late', value: recall ? String(named - onTime) : NOT_AVAILABLE },
      {
        label: 'Share of the real list notified on time',
        value: ratioText(expected === null ? null : ratio(Math.min(onTime, expected), expected)),
      },
      {
        label: 'Accounts never named',
        value: expected === null ? NOT_AVAILABLE : String(Math.max(0, expected - named)),
      },
    ],
    tables: [
      {
        title: 'First notice naming each account',
        columns: ['Account', 'First notified', 'Minutes after the recall decision'],
        rows: [...first.entries()].map(([a, t]) => [
          a,
          t,
          recall ? String(Math.round((ms(t) - ms(recall.time)) / 60_000)) : NOT_AVAILABLE,
        ]),
      },
    ],
    caveats: [
      'Accounts are matched by name as typed; a misspelled account counts as a different account.',
      ...(recall ? [] : ['No recall decision was recorded, so no notice can be scored on time.']),
    ],
    data: { named, onTime, expected },
  }
}

export const logisticsNotificationTimeliness: Metric<
  LogisticsNotificationConfig,
  LogisticsNotificationInputs
> = {
  id: 'logistics_notification_timeliness',
  title: 'Customers notified on time',
  configSchema: LogisticsNotificationConfig,
  compute: computeLogisticsNotification,
}
