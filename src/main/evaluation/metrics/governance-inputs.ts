// What the governance metrics read (spec 0459 FR-9): the discovery and recovery events of the
// simulated incident, and the decisions of the governance toolkit's forms. The form ids are the
// decision kinds; a choice field holds the option id (a slug of its label).
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { ms } from './types'

export const GOV_EVENT = {
  discovered: 'discovered',
  recovered: 'function_recovered',
  notRecovered: 'function_not_recovered',
} as const

export const GOV_FORM = {
  determination: 'gov_materiality_determination',
  disclosure: 'gov_disclosure_decision',
  ransom: 'gov_ransom_payment',
  continuity: 'gov_activate_continuity',
  board: 'gov_escalate_board',
  notice: 'gov_regulator_notice',
  succession: 'gov_succession_delegation',
} as const

export const GOV_FORM_IDS: string[] = Object.values(GOV_FORM)

const byTime = <T extends { time: string; id: string }>(a: T, b: T): number =>
  ms(a.time) - ms(b.time) || a.id.localeCompare(b.id)

export const eventsOfKind = (events: readonly GroundTruthEvent[], kind: string) =>
  events.filter((e) => e.kind === kind).sort(byTime)

export const decisionsOfKind = (decisions: readonly MetricDecision[], kind: string) =>
  decisions.filter((d) => d.kind === kind).sort(byTime)

/** Hours between two ISO times, one decimal; negative when `to` is first. */
export const hoursBetween = (from: string, to: string): number =>
  Math.round(((ms(to) - ms(from)) / 3_600_000) * 10) / 10

export const hoursText = (h: number | null): string => (h === null ? 'n/a' : `${h} h`)

/** A field's text value, trimmed; empty when absent or not text. */
export function textOf(d: MetricDecision, field: string): string {
  const v = d.fields[field]
  return typeof v === 'string' ? v.trim() : ''
}

export function numberAttr(e: GroundTruthEvent, key: string): number | null {
  const v = e.attrs[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function stringsAttr(e: GroundTruthEvent, key: string): string[] {
  const v = e.attrs[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
