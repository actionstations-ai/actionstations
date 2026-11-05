// Shared helpers for the media environment metrics (spec 0458 FR-9). Ground truth arrives as
// events (first public signal, errors found, reporter queries, verification items) and the
// players' work as decisions of the media_environment forms; both use the plain metric types.
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { ms } from './types'

/** Event kinds the media metrics read from the scenario's ground truth. */
export const MEDIA_EVENT_KINDS = {
  signal: 'first_public_signal',
  error: 'error_found',
  query: 'reporter_query',
  item: 'verification_item',
} as const

export const eventsOfKind = (events: GroundTruthEvent[], kind: string): GroundTruthEvent[] =>
  events
    .filter((e) => e.kind === kind)
    .sort((a, b) => ms(a.time) - ms(b.time) || a.id.localeCompare(b.id))

export const decisionsOfKind = (decisions: MetricDecision[], kind: string): MetricDecision[] =>
  decisions
    .filter((d) => d.kind === kind)
    .sort((a, b) => ms(a.time) - ms(b.time) || a.id.localeCompare(b.id))

/** Minutes from `from` to `to` (negative when `to` is earlier). */
export const minutesBetween = (from: string, to: string): number => (ms(to) - ms(from)) / 60_000

/** A decision field as trimmed text ("" when absent). */
export function fieldText(d: MetricDecision, key: string): string {
  const v = d.fields[key]
  return typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v)
}

/** A string attribute of an event ("" when absent). */
export function attrText(e: GroundTruthEvent, key: string): string {
  const v = e.attrs[key]
  return typeof v === 'string' ? v : ''
}
