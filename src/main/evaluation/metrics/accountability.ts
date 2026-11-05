// Command and accountability (spec 0456 FR-11): command transfers that were briefed and announced,
// and the response to each mayday: how long from the call to the first action, and whether an
// accountability report was ordered. Mayday times come from ground truth events when the
// scenario has them; transfers and mayday decisions come from the forms.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  decisionsOfKind,
  EMS_EVENT_KINDS,
  eventsOfKind,
  fieldText,
  minutesBetween,
  norm,
} from './ems-inputs'
import { minutesText, ms, NOT_AVAILABLE, type Metric, type MetricOutput } from './types'

export const AccountabilityConfig = z.object({
  transferKind: z.string().default('transfer_command'),
  maydayKind: z.string().default('declare_mayday'),
  /** A mayday answered within this many minutes counts as handled in time. */
  maydayActionMin: z.number().min(0).max(60).default(2),
})
export type AccountabilityConfig = z.infer<typeof AccountabilityConfig>

export interface AccountabilityInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

export function computeAccountability(
  inputs: AccountabilityInputs,
  config: AccountabilityConfig,
): MetricOutput {
  const transfers = decisionsOfKind(inputs.decisions, config.transferKind)
  const calls = decisionsOfKind(inputs.decisions, config.maydayKind)
  const maydays = eventsOfKind(inputs.events, EMS_EVENT_KINDS.mayday)
  const briefed = transfers.filter((t) => fieldText(t, 'briefing').length > 0)
  const announced = transfers.filter((t) => {
    const a = norm(fieldText(t, 'announced'))
    return a !== '' && a !== norm('Not announced')
  })
  const lags = maydays.map((e) => {
    const call = calls.find((c) => ms(c.time) >= ms(e.time))
    return { event: e, call, minutes: call ? minutesBetween(e.time, call.time) : null }
  })
  const handled = lags.filter((l) => l.minutes !== null && l.minutes <= config.maydayActionMin)
  const parOrdered = calls.filter((c) => norm(fieldText(c, 'par')) === 'yes').length
  return {
    metricId: 'accountability',
    title: 'Command and accountability',
    config,
    inputs: [
      { label: 'Command transfers recorded', value: String(transfers.length) },
      { label: 'Maydays in the scenario', value: String(maydays.length) },
      { label: 'Mayday declarations recorded', value: String(calls.length) },
      { label: 'Handled-in-time window', value: `${config.maydayActionMin} min` },
    ],
    summary: [
      { label: 'Transfers with a briefing', value: `${briefed.length} of ${transfers.length}` },
      { label: 'Transfers announced', value: `${announced.length} of ${transfers.length}` },
      { label: 'Maydays handled in time', value: `${handled.length} of ${maydays.length}` },
      {
        label: 'Maydays with an accountability report ordered',
        value: `${parOrdered} of ${calls.length}`,
      },
    ],
    tables: [
      {
        title: 'Command transfers',
        columns: ['Time', 'From', 'To', 'Briefed', 'Announced on'],
        rows: transfers.map((t) => [
          t.time,
          fieldText(t, 'from'),
          fieldText(t, 'to'),
          fieldText(t, 'briefing') ? 'Yes' : 'No',
          fieldText(t, 'announced') || NOT_AVAILABLE,
        ]),
      },
      {
        title: 'Maydays',
        columns: ['Mayday', 'Called', 'Declared by players', 'Minutes to action'],
        rows: lags.map((l) => [
          l.event.id,
          l.event.time,
          l.call?.time ?? 'not declared',
          minutesText(l.minutes),
        ]),
      },
    ],
    caveats: [
      'A transfer counts as briefed when the briefing field has text; the content of the briefing is not scored.',
      ...(maydays.length === 0
        ? ['The scenario has no mayday events, so response time is not scored.']
        : []),
    ],
    data: { transfers: transfers.length, briefed: briefed.length, maydaysHandled: handled.length },
  }
}

export const accountability: Metric<AccountabilityConfig, AccountabilityInputs> = {
  id: 'accountability',
  title: 'Command and accountability',
  configSchema: AccountabilityConfig,
  compute: computeAccountability,
}
