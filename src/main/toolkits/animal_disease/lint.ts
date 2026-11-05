// Format and consistency checks the animal disease toolkit names (spec 0460 FR-4): premises
// designation words, designation changes, zone sizes against the plan minimums, the stamping-out
// goal, sampling intervals and the order of laboratory results. Pure functions over structured
// inputs; each returns problems and never throws. The numbers live in plan-rules.ts, tagged
// with the plan edition they come from.
import {
  DESIGNATIONS,
  FMD_SAMPLING,
  HPAI_DEPOPULATION_GOAL_HOURS,
  HPAI_PLAN,
  HPAI_ZONE_MINIMUMS,
  designationChangeAllowed,
  type Designation,
} from '@shared/animal-disease/plan-rules'

export const ANIMAL_LINT_RULES = [
  'animal_designation_terms',
  'animal_designation_change',
  'animal_zone_sizes',
  'animal_depop_window',
  'animal_sampling_interval',
  'animal_lab_sequence',
] as const

export interface AnimalLintProblem {
  rule: (typeof ANIMAL_LINT_RULES)[number]
  message: string
  where: string
}

const isDesignation = (v: string): v is Designation =>
  (DESIGNATIONS as readonly string[]).includes(v)

/** A premises designation must be one of the plan words. */
export function checkDesignationTerm(where: string, value: string): AnimalLintProblem[] {
  if (isDesignation(value)) return []
  return [
    {
      rule: 'animal_designation_terms',
      where,
      message: `"${value}" is not a premises designation in the response plans; use ${DESIGNATIONS.join(', ')}.`,
    },
  ]
}

/** Only an at-risk premises can become a monitored premises. */
export function checkDesignationChange(from: string, to: string): AnimalLintProblem[] {
  if (!isDesignation(from) || !isDesignation(to)) return []
  if (designationChangeAllowed(from, to)) return []
  return [
    {
      rule: 'animal_designation_change',
      where: 'designation',
      message: `A ${from} premises cannot become a ${to} premises: only an at-risk premises can become monitored (${HPAI_PLAN.label}).`,
    },
  ]
}

export interface ZoneEntry {
  kind: string
  extentKm: number
}

/** HPAI zone entries must reach the plan minimums (3 km, 7 km, 10 km, a surveillance zone 10 km wide). */
export function checkHpaiZoneSizes(zones: readonly ZoneEntry[]): AnimalLintProblem[] {
  const min: Record<string, number> = {
    'infected zone': HPAI_ZONE_MINIMUMS.infectedZoneKm,
    'buffer zone': HPAI_ZONE_MINIMUMS.bufferZoneKm,
    'control area': HPAI_ZONE_MINIMUMS.controlAreaKm,
    'surveillance zone': HPAI_ZONE_MINIMUMS.surveillanceZoneKm,
  }
  const out: AnimalLintProblem[] = []
  for (const z of zones) {
    const need = min[z.kind]
    if (need === undefined || z.extentKm >= need) continue
    out.push({
      rule: 'animal_zone_sizes',
      where: z.kind,
      message: `The ${z.kind} is ${z.extentKm} km; the plan minimum is ${need} km (${HPAI_PLAN.label}). State the epidemiologic reason or use the minimum.`,
    })
  }
  return out
}

/**
 * The plan goal is depopulation within 24 hours of the presumptive positive. A later planned
 * completion is allowed when the plan page says why.
 */
export function checkDepopulationWindow(input: {
  presumptiveMs: number
  completeMs: number
  delayReason?: string
}): AnimalLintProblem[] {
  const hours = (input.completeMs - input.presumptiveMs) / 3_600_000
  if (hours <= HPAI_DEPOPULATION_GOAL_HOURS || input.delayReason?.trim()) return []
  return [
    {
      rule: 'animal_depop_window',
      where: 'targetCompleteAt',
      message: `Planned completion is ${Math.round(hours)} hours after the presumptive positive; the plan goal is ${HPAI_DEPOPULATION_GOAL_HOURS} hours (${HPAI_PLAN.label}). Give the reason it cannot be met or move the time.`,
    },
  ]
}

/** FMD sampling intervals by designation (FMD Red Book, October 2020, Table 4-2). */
export function checkSamplingInterval(
  designation: string,
  intervalDays: number,
): AnimalLintProblem[] {
  const rule = FMD_SAMPLING.find((r) => r.designation === designation)
  if (!rule || rule.intervalDays === intervalDays) return []
  return [
    {
      rule: 'animal_sampling_interval',
      where: 'samplingIntervalDays',
      message: `A ${designation} premises is sampled every ${rule.intervalDays} days in the FMD plan, not every ${intervalDays}.`,
    },
  ]
}

/** A network laboratory reports the presumptive result; the national reference laboratory confirms. */
export function checkLabSequence(stage: string, laboratory: string): AnimalLintProblem[] {
  const reference = /national (?:veterinary services|reference) laborator|NVSL/i.test(laboratory)
  if (stage === 'presumptive' && reference)
    return [
      {
        rule: 'animal_lab_sequence',
        where: 'laboratory',
        message:
          'A presumptive result comes from a network laboratory; the national reference laboratory confirms.',
      },
    ]
  if (stage === 'confirmed' && !reference)
    return [
      {
        rule: 'animal_lab_sequence',
        where: 'laboratory',
        message: 'A confirmation comes from the national reference laboratory.',
      },
    ]
  return []
}
