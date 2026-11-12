// Notification clocks met (#1137): each reporting clock of one regulation, as the facilitator
// tracked it in Facilitate. A clock starts when its trigger fires (by an MSEL row, by hand, or by
// a decision whose form fires it) and is closed when the facilitator records it filed, missed or
// waived. A filing at or before the deadline meets it, a later one misses it; a clock still
// running at the end of the exercise is open, and one whose deadline passed with nothing filed is
// missed. Any regulation works: the toolkit names it in the config.
import { z } from 'zod'
import type { ClockStatus } from '@shared/compliance/clock'
import { ratio, ratioText, type Metric, type MetricOutput } from './types'

export const NotificationClocksConfig = z.object({
  /** The regulation whose clocks are scored (a regulation pack id, such as `hipaa_breach`). */
  regulation: z.string().min(1).max(64),
})
export type NotificationClocksConfig = z.infer<typeof NotificationClocksConfig>

/** One clock of a regulation at the end of the exercise (scenario times, "YYYY-MM-DDTHH:MM"). */
export interface ClockRecord {
  id: string
  label: string
  recipient: string
  status: ClockStatus
  startedAt?: string
  dueAt?: string
  /** When the facilitator recorded it filed (met) or missed. */
  closedAt?: string
  note?: string
  /** The triggers it waits for, by label, while it has not started. */
  waitingFor: string[]
}

/** The clocks of one regulation, as the facilitator session left them. */
export interface RegulationClocks {
  regulationId: string
  label: string
  citation: string
  clocks: ClockRecord[]
}

export type NotificationClocksInputs = RegulationClocks[]

type Outcome = 'met' | 'missed' | 'open' | 'waived' | 'not started'

const OUTCOME: Record<ClockStatus, Outcome> = {
  met: 'met',
  missed: 'missed',
  overdue: 'missed',
  running: 'open',
  due_soon: 'open',
  waived: 'waived',
  waiting: 'not started',
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  met: 'Met',
  missed: 'Missed',
  open: 'Open at the end of the exercise',
  waived: 'Waived',
  'not started': 'Not started',
}

const when = (iso: string | undefined): string => (iso ? iso.replace('T', ' ') : '')

function caveats(rows: { c: ClockRecord; outcome: Outcome }[]): string[] {
  const out: string[] = []
  const notStarted = rows.filter((r) => r.outcome === 'not started')
  if (notStarted.length === rows.length) {
    const triggers = [...new Set(notStarted.flatMap((r) => r.c.waitingFor))]
    out.push(
      `No clock started: its trigger (${triggers.join(', ') || 'none named'}) was never fired in Facilitate.`,
    )
  }
  if (rows.some((r) => r.outcome === 'open'))
    out.push(
      'A clock still open ran past the end of the exercise with its deadline ahead. Record the notice as filed in Facilitate when players complete it, or read it as planned rather than done.',
    )
  out.push(
    'Clocks are scored from what the facilitator recorded in Facilitate (filed, missed or waived), on the scenario calendar.',
  )
  return out
}

export function computeNotificationClocks(
  inputs: NotificationClocksInputs,
  config: NotificationClocksConfig,
): MetricOutput {
  const reg = inputs.find((r) => r.regulationId === config.regulation)
  if (!reg) throw new Error(`the regulation "${config.regulation}" is not available`)
  const rows = reg.clocks.map((c) => ({ c, outcome: OUTCOME[c.status] }))
  const count = (o: Outcome) => rows.filter((r) => r.outcome === o).length
  const decided = count('met') + count('missed')
  return {
    metricId: 'notification_clocks_met',
    title: 'Notification clocks met',
    config,
    inputs: [
      { label: 'Regulation', value: `${reg.label} (${reg.citation})` },
      { label: 'Clocks', value: String(rows.length) },
      { label: 'Clocks started', value: String(rows.length - count('not started')) },
    ],
    summary: [
      { label: 'Met', value: String(count('met')) },
      { label: 'Missed', value: String(count('missed')) },
      { label: 'Open at the end', value: String(count('open')) },
      { label: 'Waived', value: String(count('waived')) },
      { label: 'Not started', value: String(count('not started')) },
      { label: 'Share met (met or missed)', value: ratioText(ratio(count('met'), decided)) },
    ],
    tables: [
      {
        title: 'Clocks',
        columns: ['Clock', 'Recipient', 'Started', 'Due', 'Recorded', 'Outcome', 'Note'],
        rows: rows.map(({ c, outcome }) => [
          c.label,
          c.recipient,
          when(c.startedAt),
          when(c.dueAt),
          when(c.closedAt),
          OUTCOME_LABEL[outcome],
          c.note ?? '',
        ]),
      },
    ],
    caveats: caveats(rows),
    data: {
      met: count('met'),
      missed: count('missed'),
      open: count('open'),
      waived: count('waived'),
      notStarted: count('not started'),
      byClock: Object.fromEntries(rows.map(({ c, outcome }) => [c.id, outcome])),
    },
  }
}

export const notificationClocksMet: Metric<NotificationClocksConfig, NotificationClocksInputs> = {
  id: 'notification_clocks_met',
  title: 'Notification clocks met',
  configSchema: NotificationClocksConfig,
  compute: computeNotificationClocks,
}
