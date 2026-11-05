// Disclosures on time (spec 0467 FR-9): each configured clock (regulator, customers, market) met
// or missed, with its trigger and the time of the decision. The scenario's ground truth holds one
// `ai_disclosure_due` event per clock that applies to the role the scenario assumes (provider,
// deployer or victim), with the due time and the recipient; a notice of that recipient recorded
// at or before the due time meets the clock.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  AI_DECISION_KINDS as K,
  AI_EVENT_KINDS,
  eventsOf,
  firstOf,
  minutesFrom,
  ofKind,
  textAttr,
} from './ai-incident-inputs'
import { minutesText, ms, ratio, ratioText, type Metric, type MetricOutput } from './types'

export const AiDisclosuresConfig = z.object({
  dueKind: z.string().default(AI_EVENT_KINDS.disclosureDue),
})
export type AiDisclosuresConfig = z.infer<typeof AiDisclosuresConfig>

export interface AiDisclosureInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

/** The decision kind that records a notice to each recipient the clocks name. */
const RECIPIENT_KIND: Record<string, string> = {
  regulator: K.regulator,
  customers: K.customers,
  bank: K.bank,
  vendor: K.vendor,
  market: K.regulator,
}

type Status = 'met' | 'missed' | 'not made'

export function computeAiDisclosures(
  inputs: AiDisclosureInputs,
  config: AiDisclosuresConfig,
): MetricOutput {
  const clocks = eventsOf(inputs.events, config.dueKind)
  const rows = clocks.map((c) => {
    const recipient = textAttr(c, 'recipient')
    const kind = RECIPIENT_KIND[recipient]
    const sent = kind ? firstOf(ofKind(inputs.decisions, kind)) : undefined
    const status: Status = !sent ? 'not made' : ms(sent.time) <= ms(c.time) ? 'met' : 'missed'
    return {
      c,
      recipient,
      sent,
      status,
      margin: sent ? minutesFrom(sent.time, c.time) : null,
    }
  })
  const met = rows.filter((r) => r.status === 'met').length
  return {
    metricId: 'ai_disclosures_on_time',
    title: 'Disclosures on time',
    config,
    inputs: [
      { label: 'Clocks that apply', value: String(rows.length) },
      { label: 'Notices recorded', value: String(rows.filter((r) => r.sent).length) },
    ],
    summary: [
      { label: 'Clocks met', value: `${met} of ${rows.length}` },
      { label: 'Share met', value: ratioText(ratio(met, rows.length)) },
      { label: 'Clocks missed', value: String(rows.filter((r) => r.status === 'missed').length) },
      {
        label: 'No notice recorded',
        value: String(rows.filter((r) => r.status === 'not made').length),
      },
    ],
    tables: [
      {
        title: 'Clocks',
        columns: ['Clock', 'Recipient', 'Trigger', 'Due', 'Notice recorded', 'Status', 'Margin'],
        rows: rows.map((r) => [
          r.c.id,
          r.recipient,
          textAttr(r.c, 'trigger'),
          r.c.time,
          r.sent?.time ?? '',
          r.status,
          r.margin === null ? '' : minutesText(r.margin),
        ]),
      },
    ],
    caveats: [
      'The clocks come from the regulation the scenario configures and the role it assumes. Which duties apply to a real organization is for its counsel to decide; this is not legal advice.',
      'A margin is the time left (positive) or overrun (negative) when the notice was recorded.',
      ...(rows.length === 0
        ? [
            'No clock applies in this scenario, which is correct for a victim of fraud with no AI system of its own.',
          ]
        : []),
    ],
    data: {
      clocks: rows.length,
      met,
      status: Object.fromEntries(rows.map((r) => [r.c.id, r.status])),
    },
  }
}

export const aiDisclosuresOnTime: Metric<AiDisclosuresConfig, AiDisclosureInputs> = {
  id: 'ai_disclosures_on_time',
  title: 'Disclosures on time',
  configSchema: AiDisclosuresConfig,
  compute: computeAiDisclosures,
}
