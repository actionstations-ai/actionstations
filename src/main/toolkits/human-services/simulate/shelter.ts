// Shelter population growth and the needs of the residents (spec 0464 FR-9). Evacuees arrive
// over a bell-shaped curve around a peak hour; they fill the open shelters in the order given
// and spill to the next when one is full; each resident draws needs from configurable rates.
// Needs are support requests (equipment, communication access, personal assistance, medication,
// supervision), not diagnoses. Residents are exercise references. Every number is simulated.
import { z } from 'zod'
import { makeRng } from './rng'

export const NEED_CATEGORIES = [
  'electricity_for_medical_equipment',
  'communication_access',
  'personal_assistance',
  'medication_support',
  'supervision',
] as const
export type NeedCategory = (typeof NEED_CATEGORIES)[number]
export const NEED_LABEL: Record<NeedCategory, string> = {
  electricity_for_medical_equipment: 'Electricity for medical equipment',
  communication_access: 'Communication access',
  personal_assistance: 'Personal assistance',
  medication_support: 'Medications and refrigeration',
  supervision: 'Supervision',
}

const Rate = (v: number) => z.number().min(0).max(1).default(v)

export const ShelterParams = z.object({
  seed: z.number().int().default(1),
  startTime: z.iso.datetime().default('2026-11-02T12:00:00Z'),
  hours: z.number().min(6).max(240).default(48),
  /** Shelters in the order they fill; `opensHour` is hours after the start. */
  sites: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        capacity: z.number().int().min(10).max(5000),
        opensHour: z.number().min(0).max(240),
      }),
    )
    .min(1)
    .max(8)
    .default([
      { name: 'Eastside High School (simulated)', capacity: 220, opensHour: 2 },
      { name: 'Ridge Middle School (simulated)', capacity: 300, opensHour: 8 },
    ]),
  evacuees: z.number().int().min(10).max(50_000).default(400),
  peakHour: z.number().min(0).max(240).default(14),
  /** Standard deviation of arrivals around the peak, in hours. */
  spreadHours: z.number().min(1).max(48).default(6),
  /** Hours after the start when the hazard reaches the county (for threshold timing). */
  hazardArrivalHour: z.number().min(0).max(240).default(18),
  /** Share of residents with each need. */
  needsRates: z
    .object({
      electricity_for_medical_equipment: Rate(0.04),
      communication_access: Rate(0.03),
      personal_assistance: Rate(0.05),
      medication_support: Rate(0.08),
      supervision: Rate(0.015),
    })
    .default({
      electricity_for_medical_equipment: 0.04,
      communication_access: 0.03,
      personal_assistance: 0.05,
      medication_support: 0.08,
      supervision: 0.015,
    }),
})
export type ShelterParams = z.output<typeof ShelterParams>

export interface ShelterNeed {
  id: string
  /** Hours after the start when the need is recorded. */
  hour: number
  site: string
  resident: string
  category: NeedCategory
}

export interface ShelterRun {
  params: ShelterParams
  /** Population per site at the end of each hour (index = hour). */
  population: Record<string, number[]>
  /** First hour when the open shelters could not hold the evacuees, or undefined. */
  demandExceedsCapacityHour?: number
  needs: ShelterNeed[]
  /** Evacuees who found no space (all shelters full). */
  turnedAway: number
}

const gauss = (h: number, mu: number, sd: number): number => Math.exp(-0.5 * ((h - mu) / sd) ** 2)

export function runShelters(raw: z.input<typeof ShelterParams>): ShelterRun {
  const p = ShelterParams.parse(raw)
  const rng = makeRng(p.seed)
  const hours = Math.floor(p.hours)
  const weights = Array.from({ length: hours }, (_, h) => gauss(h + 0.5, p.peakHour, p.spreadHours))
  const wSum = weights.reduce((a, b) => a + b, 0)
  const pop: Record<string, number[]> = Object.fromEntries(
    p.sites.map((s) => [s.name, [] as number[]]),
  )
  const current: Record<string, number> = Object.fromEntries(p.sites.map((s) => [s.name, 0]))
  const needs: ShelterNeed[] = []
  let pending = 0
  let turnedAway = 0
  let residentNo = 0
  let exceeds: number | undefined
  for (let h = 0; h < hours; h++) {
    // Evacuees who arrive before any shelter is open wait outside and are registered when one opens.
    pending += Math.round((weights[h]! / wSum) * p.evacuees)
    const open = p.sites.filter((s) => s.opensHour <= h)
    if (open.length) {
      for (; pending > 0; pending--) {
        const site = open.find((s) => current[s.name]! < s.capacity)
        if (!site) {
          turnedAway++
          if (exceeds === undefined) exceeds = h
          continue
        }
        current[site.name]!++
        residentNo++
        const ref = `R-${String(residentNo).padStart(3, '0')}`
        for (const cat of NEED_CATEGORIES)
          if (rng.chance(p.needsRates[cat]))
            needs.push({
              id: `need-${String(needs.length + 1).padStart(4, '0')}`,
              hour: h + rng.next(),
              site: site.name,
              resident: ref,
              category: cat,
            })
      }
    }
    for (const s of p.sites) pop[s.name]!.push(current[s.name]!)
  }
  return {
    params: p,
    population: pop,
    ...(exceeds !== undefined ? { demandExceedsCapacityHour: exceeds } : {}),
    needs,
    turnedAway,
  }
}

/** Needs by category counted over a run: how many were recorded. */
export function needCounts(run: ShelterRun): Record<NeedCategory, number> {
  const out = Object.fromEntries(NEED_CATEGORIES.map((c) => [c, 0])) as Record<NeedCategory, number>
  for (const n of run.needs) out[n.category]++
  return out
}
