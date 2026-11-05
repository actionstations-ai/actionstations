// Shared inputs of the AI incident metrics (spec 0467 FR-9). Ground truth arrives as events from
// the AI incident generators; the players' work arrives as decisions of the toolkit's forms, whose
// ids are the decision kinds below (a metric and its forms are one contract).
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { choiceKey, choiceLabel, fieldText } from './media-inputs'
import { ms } from './types'

export const AI_EVENT_KINDS = {
  exposure: 'ai_synthetic_first_exposure',
  payment: 'ai_payment_attempt',
  harmOnset: 'ai_harm_onset',
  disclosureDue: 'ai_disclosure_due',
} as const

export const AI_DECISION_KINDS = {
  hold: 'ai_hold_release_payment',
  callback: 'ai_verify_callback',
  declare: 'ai_declare_incident',
  classify: 'ai_classify_serious_incident',
  pause: 'ai_pause_feature',
  evidence: 'ai_preserve_evidence',
  regulator: 'ai_notify_regulator',
  customers: 'ai_notify_customers',
  bank: 'ai_notify_bank_law_enforcement',
  statement: 'ai_issue_statement',
  takedown: 'ai_request_takedown',
  vendor: 'ai_notify_vendor',
} as const

export const minutesFrom = (from: string, to: string): number => (ms(to) - ms(from)) / 60_000

export const firstOf = (decisions: MetricDecision[]): MetricDecision | undefined =>
  [...decisions].sort((a, b) => ms(a.time) - ms(b.time) || a.id.localeCompare(b.id))[0]

/** Decisions of one kind. */
export const ofKind = (decisions: MetricDecision[], kind: string): MetricDecision[] =>
  decisions.filter((d) => d.kind === kind)

/** Whether a choice field of a decision holds this label (an option id or the label itself). */
export function choseLabel(d: MetricDecision, field: string, label: string): boolean {
  return choiceKey(choiceLabel(d, field, [label])) === choiceKey(label)
}

export { choiceLabel, fieldText }

export const eventsOf = (events: GroundTruthEvent[], kind: string): GroundTruthEvent[] =>
  events
    .filter((e) => e.kind === kind)
    .sort((a, b) => ms(a.time) - ms(b.time) || a.id.localeCompare(b.id))

export function numberAttr(e: GroundTruthEvent, key: string): number {
  const v = e.attrs[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function textAttr(e: GroundTruthEvent, key: string): string {
  const v = e.attrs[key]
  return typeof v === 'string' ? v : ''
}

export const money = (v: number): string => new Intl.NumberFormat('en-US').format(v)
