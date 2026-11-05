// Shared helpers for the clinical care metrics (spec 0452 FR-14). Ground truth arrives as events
// of the kinds below (what the scenario scripted: an abnormal early warning score, a critical lab,
// the victims and their correct tags, the priority list for an evacuation, a harm event) and the
// players' work as decisions of the clinical_care forms, whose form id is the decision kind.
// A choice field holds an option id (a slug of its label), so comparisons use slugs: "Immediate
// (red)" and "immediate_red" are the same answer.
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { decisionsOfKind, eventsOfKind, fieldText, minutesBetween } from './media-inputs'

export { decisionsOfKind, eventsOfKind, fieldText, minutesBetween }

/** Event kinds the clinical metrics read from the scenario's ground truth. */
export const CLINICAL_EVENT_KINDS = {
  abnormalScore: 'abnormal_early_warning_score',
  criticalLab: 'critical_lab',
  victim: 'triage_victim',
  evacuationKey: 'evacuation_priority',
  infectionCase: 'infection_case',
  harmEvent: 'harm_event',
  downtimeStart: 'downtime_start',
} as const

/** Decision kinds (the clinical_care form ids). */
export const CLINICAL_DECISION_KINDS = {
  assign: 'assign_nurse',
  rapidResponse: 'call_rapid_response',
  escalate: 'escalate_staffing_shortage',
  evacuationOrder: 'set_evacuation_order',
  triage: 'triage_arrival',
  isolate: 'isolate_or_cohort',
  transfer: 'request_transfer',
  disclose: 'disclose_event',
  notify: 'notify',
} as const

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** Whether a recorded choice is the given label (or its option id). */
export const sameChoice = (value: string, label: string): boolean => slug(value) === slug(label)

/** Whether a recorded choice starts with a word ("immediate_red" starts with "immediate"). */
export const choiceStarts = (value: string, word: string): boolean =>
  slug(value) === slug(word) || slug(value).startsWith(`${slug(word)}_`)

export const attr = (e: GroundTruthEvent, key: string): string => {
  const v = e.attrs[key]
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}

export const attrList = (e: GroundTruthEvent, key: string): string[] => {
  const v = e.attrs[key]
  return Array.isArray(v) ? v.map((x) => String(x)) : []
}

export const numberField = (d: MetricDecision, key: string): number | null => {
  const v = d.fields[key]
  const n = typeof v === 'number' ? v : Number(v)
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? null : n
}

/** Names from a typed list ("A, B and C", one per line, numbered), in order, trimmed. */
export function namesFromText(text: string): string[] {
  return text
    .split(/\r?\n|;|,|\band\b/i)
    .map((s) => s.replace(/^\s*\d+[.)]?\s*/, '').trim())
    .filter(Boolean)
}

export const sameText = (a: string, b: string): boolean => slug(a) === slug(b)
