// Shutoff notification windows (spec 0461 FR-13): each notice a utility sends is judged against the
// window the plan sets for its audience (48-72 hours before for public safety partners, 24-48
// hours for customers, 1-4 hours before, and at de-energization, the example rule in
// toolkits/wildfire/windows.ts). The windows are ground-truth events of kind `notification_window`
// written by the scenario; the notices are the team's `wildfire_send_shutoff_notice` decisions.
// A project may change the windows; the metric reads whatever the scenario wrote.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { ms, type Metric, type MetricOutput } from './types'

export const NotificationWindowsConfig = z.object({
  /** Minutes of slack on each end of a window; 0 holds the notice to the window exactly. */
  graceMin: z.number().min(0).max(240).default(0),
})
export type NotificationWindowsConfig = z.infer<typeof NotificationWindowsConfig>

export interface NotificationWindowsInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

type Result = 'Met' | 'Missed' | 'Not sent'

interface WindowRow {
  label: string
  audience: string
  earliest: number
  latest: number
  inWindow: MetricDecision[]
  forAudience: MetricDecision[]
  result: Result
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Whether a notice's audience fits a window's audience (partners, customers or all). */
export function audienceFits(windowAudience: string, noticeAudience: string): boolean {
  const n = noticeAudience.toLowerCase()
  if (windowAudience === 'all') return true
  if (windowAudience === 'partners') return /partner/.test(n)
  if (windowAudience === 'customers') return /customer|medical|critical/.test(n)
  return n.includes(windowAudience.toLowerCase())
}

export function computeNotificationWindows(
  inputs: NotificationWindowsInputs,
  config: NotificationWindowsConfig,
): MetricOutput {
  const grace = config.graceMin * 60_000
  const notices = inputs.decisions
    .filter((d) => d.kind === 'wildfire_send_shutoff_notice')
    .sort((a, b) => ms(a.time) - ms(b.time))
  const rows: WindowRow[] = inputs.events
    .filter((e) => e.kind === 'notification_window')
    .map((e) => {
      const audience = text(e.attrs.audience) || 'all'
      const earliest = ms(text(e.attrs.earliest) || e.time) - grace
      const latest = ms(text(e.attrs.latest) || e.time) + grace
      const forAudience = notices.filter((d) => audienceFits(audience, text(d.fields.audience)))
      const inWindow = forAudience.filter((d) => ms(d.time) >= earliest && ms(d.time) <= latest)
      const result: Result = inWindow.length ? 'Met' : forAudience.length ? 'Missed' : 'Not sent'
      return {
        label: text(e.attrs.label) || e.id,
        audience,
        earliest,
        latest,
        inWindow,
        forAudience,
        result,
      }
    })
  const met = rows.filter((r) => r.result === 'Met').length
  const iso = (t: number): string => new Date(t).toISOString()
  return {
    metricId: 'wildfire_notification_windows',
    title: 'Shutoff notification windows',
    config,
    inputs: [
      { label: 'Windows', value: String(rows.length) },
      { label: 'Notices sent', value: String(notices.length) },
      { label: 'Grace', value: `${config.graceMin} min` },
      {
        label: 'Rule',
        value: 'Windows written by the scenario (an example rule, edited per project)',
      },
    ],
    summary: [
      { label: 'Windows met', value: `${met} of ${rows.length}` },
      { label: 'Windows missed', value: String(rows.filter((r) => r.result === 'Missed').length) },
      {
        label: 'Windows with no notice',
        value: String(rows.filter((r) => r.result === 'Not sent').length),
      },
    ],
    tables: [
      {
        title: 'Windows',
        columns: ['Window', 'Audience', 'Opens', 'Closes', 'Notices in window', 'Result'],
        rows: rows.map((r) => [
          r.label,
          r.audience,
          iso(r.earliest),
          iso(r.latest),
          String(r.inWindow.length),
          r.result,
        ]),
      },
      {
        title: 'Notices',
        columns: ['Time', 'Audience', 'Channel', 'Circuit'],
        rows: notices.map((d) => [
          d.time,
          text(d.fields.audience),
          text(d.fields.channel),
          d.area ?? '',
        ]),
      },
    ],
    caveats: [
      'The windows are the example rule from one state, not a national requirement; the scenario states the windows it used.',
      'A notice counts for a window when its audience fits and its time falls inside the window.',
      ...(rows.length === 0
        ? ['The scenario wrote no notification windows, so nothing was scored.']
        : []),
    ],
    data: {
      windows: Object.fromEntries(rows.map((r) => [r.label, r.result])),
      met,
      total: rows.length,
    },
  }
}

export const wildfireNotificationWindows: Metric<
  NotificationWindowsConfig,
  NotificationWindowsInputs
> = {
  id: 'wildfire_notification_windows',
  title: 'Shutoff notification windows',
  configSchema: NotificationWindowsConfig,
  compute: computeNotificationWindows,
}
