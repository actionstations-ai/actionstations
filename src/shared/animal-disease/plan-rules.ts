// The response plan rules the animal disease toolkit teaches and checks (spec 0460 FR-4).
// Each rule names the plan and edition it comes from, so a change in a newer edition is an edit
// to this table and nothing else. Numbers are the plans' minimums and guidelines; the state plan
// governs, and an epidemiologic reason can widen a zone.

/** The premises designations in the HPAI and FMD plans (VP is a secondary designation). */
export const DESIGNATIONS = [
  'infected',
  'contact',
  'suspect',
  'at-risk',
  'monitored',
  'free',
  'vaccinated',
] as const
export type Designation = (typeof DESIGNATIONS)[number]

/** The abbreviation the plans use for each designation. */
export const DESIGNATION_ABBREVIATION: Readonly<Record<Designation, string>> = {
  infected: 'IP',
  contact: 'CP',
  suspect: 'SP',
  'at-risk': 'ARP',
  monitored: 'MP',
  free: 'FP',
  vaccinated: 'VP',
}

export const ZONE_KINDS = [
  'infected zone',
  'buffer zone',
  'control area',
  'surveillance zone',
  'free area',
  'containment vaccination zone',
  'protection vaccination zone',
] as const
export type ZoneKind = (typeof ZONE_KINDS)[number]

/** A plan and its edition, as the rules cite them. */
export interface PlanEdition {
  id: 'hpai' | 'fmd'
  title: string
  edition: string
  /** Matches the `plan` field of the products (see the quarantine order schema). */
  label: string
}

export const HPAI_PLAN: PlanEdition = {
  id: 'hpai',
  title: 'HPAI Response Plan: The Red Book',
  edition: 'May 2017',
  label: 'HPAI Red Book (May 2017)',
}
export const FMD_PLAN: PlanEdition = {
  id: 'fmd',
  title: 'FMD Response Plan: The Red Book',
  edition: 'October 2020',
  label: 'FMD Red Book (October 2020)',
}

/** Minimum zone sizes in kilometers, by plan. */
export interface ZoneMinimums {
  /** Radius of the infected zone beyond the infected premises. */
  infectedZoneKm: number
  /** Width of the buffer zone beyond the infected zone. */
  bufferZoneKm: number
  /** Distance the control area reaches beyond the closest infected premises. */
  controlAreaKm: number
  /** Width of the surveillance zone, outside the control area. */
  surveillanceZoneKm: number
}

/** HPAI Red Book (May 2017), Table 5-5: 3 km, 7 km beyond it, 10 km in all, a 10 km wide surveillance zone. */
export const HPAI_ZONE_MINIMUMS: ZoneMinimums = {
  infectedZoneKm: 3,
  bufferZoneKm: 7,
  controlAreaKm: 10,
  surveillanceZoneKm: 10,
}

/** The depopulation goal for HPAI: within 24 hours of the presumptive positive (Red Book, Box 4-3). */
export const HPAI_DEPOPULATION_GOAL_HOURS = 24

/** Sampling guideline for one designation (FMD Red Book, October 2020, Table 4-2). */
export interface SamplingRule {
  designation: Designation | 'surveillance-zone'
  intervalDays: number
  /** Fixed number of days, or the days after the last detected case. */
  duration: { days: number } | { daysAfterLastCase: number }
}

export const FMD_SAMPLING: readonly SamplingRule[] = [
  { designation: 'contact', intervalDays: 5, duration: { days: 14 } },
  { designation: 'at-risk', intervalDays: 10, duration: { daysAfterLastCase: 56 } },
  { designation: 'monitored', intervalDays: 10, duration: { daysAfterLastCase: 56 } },
  { designation: 'surveillance-zone', intervalDays: 21, duration: { daysAfterLastCase: 56 } },
]

/** True when a premises can move from one designation to another under the plans. */
export function designationChangeAllowed(from: Designation, to: Designation): boolean {
  if (to === 'monitored') return from === 'at-risk'
  return true
}

/** The plan a product's `plan` field names, if it is one of the two Red Books. */
export function planOf(label: unknown): PlanEdition | undefined {
  if (typeof label !== 'string') return undefined
  if (/HPAI/i.test(label)) return HPAI_PLAN
  if (/FMD|foot/i.test(label)) return FMD_PLAN
  return undefined
}
