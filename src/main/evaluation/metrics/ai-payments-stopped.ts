// Payments stopped (spec 0467 FR-9): value and count held against those attempted, time from the
// instruction to the hold, and whether a callback on a known number was made. A payment is held
// when a hold (or a hold, recall or freeze request to the bank) was recorded at or before its
// settlement time; one that settled first can still have a recall requested, which is shown
// apart because a request is not a recovery.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  AI_DECISION_KINDS as K,
  AI_EVENT_KINDS,
  choseLabel,
  eventsOf,
  firstOf,
  minutesFrom,
  money,
  numberAttr,
  ofKind,
  textAttr,
} from './ai-incident-inputs'
import { minutesText, ms, ratio, ratioText, type Metric, type MetricOutput } from './types'

export const AiPaymentsStoppedConfig = z.object({
  paymentKind: z.string().default(AI_EVENT_KINDS.payment),
  currency: z.string().max(10).default('USD'),
})
export type AiPaymentsStoppedConfig = z.infer<typeof AiPaymentsStoppedConfig>

export interface AiPaymentInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

/** Decisions that hold funds: a hold, or a bank request to hold, recall or freeze. */
export function holdDecisions(decisions: MetricDecision[]): MetricDecision[] {
  const bank = ofKind(decisions, K.bank).filter(
    (d) =>
      choseLabel(d, 'request', 'Hold funds') ||
      choseLabel(d, 'request', 'Recall request') ||
      choseLabel(d, 'request', 'Freeze beneficiary account'),
  )
  return [...ofKind(decisions, K.hold).filter((d) => choseLabel(d, 'action', 'Hold')), ...bank]
}

type Outcome = 'held' | 'settled, recall requested' | 'settled'

export function computeAiPaymentsStopped(
  inputs: AiPaymentInputs,
  config: AiPaymentsStoppedConfig,
): MetricOutput {
  const attempts = eventsOf(inputs.events, config.paymentKind)
  const holds = holdDecisions(inputs.decisions)
  const recalls = ofKind(inputs.decisions, K.bank).filter((d) =>
    choseLabel(d, 'request', 'Recall request'),
  )
  const firstHold = firstOf(holds)
  const rows = attempts.map((a) => {
    const settleAt = textAttr(a, 'settleAt') || a.time
    const amount = numberAttr(a, 'amount')
    const held = holds.some((h) => ms(h.time) <= ms(settleAt))
    const recalled = recalls.some((r) => ms(r.time) > ms(settleAt))
    const outcome: Outcome = held ? 'held' : recalled ? 'settled, recall requested' : 'settled'
    return { a, amount, settleAt, outcome }
  })
  const sum = (xs: { amount: number }[]): number => xs.reduce((s, x) => s + x.amount, 0)
  const heldRows = rows.filter((r) => r.outcome === 'held')
  const attempted = sum(rows)
  const heldValue = sum(heldRows)
  const callbacks = ofKind(inputs.decisions, K.callback)
  const known = callbacks.filter(
    (d) => !choseLabel(d, 'number_source', 'The number in the request'),
  )
  const firstAttempt = rows[0]?.a
  const toHold = firstHold && firstAttempt ? minutesFrom(firstAttempt.time, firstHold.time) : null
  const heldShare = ratio(heldValue, attempted)
  return {
    metricId: 'ai_payments_stopped',
    title: 'Payments stopped',
    config,
    inputs: [
      {
        label: 'Payments attempted',
        value: `${rows.length}, worth ${money(attempted)} ${config.currency}`,
      },
      { label: 'Holds and bank requests recorded', value: String(holds.length) },
      { label: 'Callbacks recorded', value: String(callbacks.length) },
    ],
    summary: [
      {
        label: 'Held before settlement',
        value: `${heldRows.length} of ${rows.length}, ${money(heldValue)} ${config.currency}`,
      },
      { label: 'Share of value held', value: ratioText(heldShare) },
      {
        label: 'Settled, recall requested',
        value: String(rows.filter((r) => r.outcome === 'settled, recall requested').length),
      },
      {
        label: 'Settled with no recall request',
        value: String(rows.filter((r) => r.outcome === 'settled').length),
      },
      { label: 'Instruction to first hold', value: minutesText(toHold) },
      {
        label: 'Callback on a known number',
        value:
          callbacks.length === 0
            ? 'none made'
            : known.length
              ? 'made'
              : 'only the number in the request',
      },
    ],
    tables: [
      {
        title: 'Payments',
        columns: ['Payment', 'Requested', 'Settles', 'Amount', 'Outcome'],
        rows: rows.map((r) => [r.a.id, r.a.time, r.settleAt, money(r.amount), r.outcome]),
      },
    ],
    caveats: [
      'A recall request is not a recovery: the exercise does not simulate whether a beneficiary bank returns funds.',
      'Settlement times are set by the simulation; real settlement depends on the banks.',
      ...(rows.length === 0 ? ['The scenario has no payment attempts to score.'] : []),
      ...(!firstHold ? ['No hold or bank request was recorded.'] : []),
    ],
    data: {
      attempted,
      heldValue,
      heldCount: heldRows.length,
      attemptedCount: rows.length,
      heldShare,
      instructionToHoldMin: toHold,
      callbackMade: callbacks.length > 0,
      callbackKnownNumber: known.length > 0,
      outcomes: Object.fromEntries(rows.map((r) => [r.a.id, r.outcome])),
    },
  }
}

export const aiPaymentsStopped: Metric<AiPaymentsStoppedConfig, AiPaymentInputs> = {
  id: 'ai_payments_stopped',
  title: 'Payments stopped',
  configSchema: AiPaymentsStoppedConfig,
  compute: computeAiPaymentsStopped,
}
