// Shared helpers for the EMS, fire and hazmat metrics (spec 0456 FR-11). Ground truth arrives as
// events from the simulated incident (first unit on scene, triage complete, patients, hospitals,
// release zones, plume arrivals); the players' work arrives as decisions of the toolkit forms,
// keyed by form id. Choice answers may be stored as labels or ids, so they are compared with
// punctuation and case removed.
import type { GroundTruthEvent } from '@shared/schemas/metrics'

export { attrText, decisionsOfKind, eventsOfKind, fieldText, minutesBetween } from './media-inputs'

/** Event kinds the simulated incident writes. */
export const EMS_EVENT_KINDS = {
  firstUnit: 'first_unit_on_scene',
  triageComplete: 'triage_complete',
  patient: 'patient',
  hospital: 'hospital',
  zone: 'release_zone',
  arrival: 'plume_arrival',
  mayday: 'mayday',
} as const

/** Lower case with everything but letters and digits removed. */
export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** A number from an event attribute or decision field; null when it is not a finite number. */
export function numberOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN
  return Number.isFinite(n) ? n : null
}

export const listOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

const METERS: Record<string, number> = {
  ft: 0.3048,
  feet: 0.3048,
  m: 1,
  meters: 1,
  mi: 1609.344,
  miles: 1609.344,
  km: 1000,
  kilometers: 1000,
}

/** Meters in `value` of `unit` (the unit as the app writes it or as a form lists it); null if unknown. */
export function toMeters(value: number, unit: string): number | null {
  const f = METERS[unit.trim().toLowerCase()]
  return f === undefined ? null : value * f
}

export const timeOf = (e: GroundTruthEvent): number => Date.parse(e.time)
