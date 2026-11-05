// Zone calculator (spec 0460 FR-6): from the infected premises and the plan's minimum sizes,
// the zones and areas, the premises that fall in each, and the designations each can take. The
// HPAI minimums come from plan-rules.ts (Red Book, May 2017); the FMD plan's zone sizes are not
// verified in this project, so an FMD run needs the designer to state them. A designer override
// is allowed and recorded with its reason, and a size under the plan minimum is warned about.
import {
  HPAI_PLAN,
  HPAI_ZONE_MINIMUMS,
  FMD_PLAN,
  type Designation,
  type PlanEdition,
  type ZoneKind,
  type ZoneMinimums,
} from '@shared/animal-disease/plan-rules'
import { AppError } from '../../lib/errors'
import { circleRing, haversineKm, type LatLon } from './geo'

export interface PlacedPremises extends LatLon {
  id: string
  name?: string
}

export interface ZoneInput {
  plan: 'hpai' | 'fmd'
  /** Infected premises, by id and position. */
  infected: readonly PlacedPremises[]
  /** Every other premises to place in a zone. */
  premises: readonly PlacedPremises[]
  /** Sizes the designer states: required for FMD, an override for HPAI. */
  sizes?: Partial<ZoneMinimums>
  /** Why the designer's sizes differ from the plan minimums. */
  reason?: string
}

export interface ZoneRow {
  kind: ZoneKind
  extentKm: number
  description: string
  /** Where the number comes from: the plan minimum or the designer's reason. */
  basis: string
}

export interface PremisesPlacement {
  id: string
  zone: ZoneKind | 'free area'
  /** Distance to the closest infected premises. */
  distanceKm: number
  /** Designations the response team can give a premises in this place. */
  options: Designation[]
}

export interface ControlAreaGroup {
  infected: string[]
  premises: string[]
}

export interface ZoneResult {
  plan: PlanEdition
  sizes: ZoneMinimums
  zones: ZoneRow[]
  placements: PremisesPlacement[]
  /** Infected premises whose control areas overlap are one area. */
  controlAreas: ControlAreaGroup[]
  /** Circles for each infected premises, as GeoJSON polygon rings, for the premises map. */
  rings: { around: string; kind: ZoneKind; radiusKm: number; ring: [number, number][] }[]
  warnings: string[]
}

const KEYS = ['infectedZoneKm', 'bufferZoneKm', 'controlAreaKm', 'surveillanceZoneKm'] as const

function resolveSizes(input: ZoneInput): {
  sizes: ZoneMinimums
  warnings: string[]
  plan: PlanEdition
} {
  const warnings: string[] = []
  if (input.plan === 'fmd') {
    const s = input.sizes ?? {}
    if (KEYS.some((k) => s[k] === undefined))
      throw new AppError(
        'VALIDATION',
        `The ${FMD_PLAN.label} zone sizes are not built in; state all four sizes (infectedZoneKm, bufferZoneKm, controlAreaKm, surveillanceZoneKm) from your plan.`,
      )
    return { sizes: s as ZoneMinimums, warnings, plan: FMD_PLAN }
  }
  const sizes: ZoneMinimums = { ...HPAI_ZONE_MINIMUMS, ...input.sizes }
  for (const k of KEYS)
    if (sizes[k] < HPAI_ZONE_MINIMUMS[k])
      warnings.push(
        `${k} is ${sizes[k]} km, under the ${HPAI_PLAN.label} minimum of ${HPAI_ZONE_MINIMUMS[k]} km; the state plan and an epidemiologic reason must support it.`,
      )
  if (input.sizes && KEYS.some((k) => input.sizes![k] !== undefined) && !input.reason?.trim())
    warnings.push('The sizes were changed with no reason recorded.')
  return { sizes, warnings, plan: HPAI_PLAN }
}

const OPTIONS: Record<ZoneKind | 'free area', Designation[]> = {
  'infected zone': ['infected', 'suspect', 'contact', 'at-risk'],
  'buffer zone': ['at-risk', 'free'],
  'control area': ['at-risk', 'free'],
  'surveillance zone': ['free', 'suspect'],
  'free area': ['free'],
  'containment vaccination zone': ['vaccinated'],
  'protection vaccination zone': ['vaccinated'],
}

function placeOne(distanceKm: number, s: ZoneMinimums): ZoneKind | 'free area' {
  if (distanceKm <= s.infectedZoneKm) return 'infected zone'
  if (distanceKm <= s.controlAreaKm) return 'buffer zone'
  if (distanceKm <= s.controlAreaKm + s.surveillanceZoneKm) return 'surveillance zone'
  return 'free area'
}

function clusterInfected(infected: readonly PlacedPremises[], controlAreaKm: number): string[][] {
  const parent = infected.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
  for (let i = 0; i < infected.length; i++)
    for (let j = i + 1; j < infected.length; j++)
      if (haversineKm(infected[i]!, infected[j]!) <= 2 * controlAreaKm) parent[find(i)] = find(j)
  const groups = new Map<number, string[]>()
  infected.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p.id]))
  return [...groups.values()]
}

/** The distance from a premises to the closest infected premises, in kilometers. */
export function nearestInfectedKm(p: LatLon, infected: readonly LatLon[]): number {
  let best = Infinity
  for (const i of infected) best = Math.min(best, haversineKm(p, i))
  return best
}

export function computeZones(input: ZoneInput): ZoneResult {
  if (input.infected.length === 0)
    throw new AppError('VALIDATION', 'Name at least one infected premises to draw zones around.')
  const { sizes, warnings, plan } = resolveSizes(input)
  const customized = KEYS.some((k) => input.sizes?.[k] !== undefined)
  const basis = customized
    ? `designer's sizes${input.reason?.trim() ? `: ${input.reason.trim()}` : ''}`
    : `plan minimum (${plan.label})`
  const ids = input.infected.map((p) => p.id).join(', ')
  const zones: ZoneRow[] = [
    {
      kind: 'infected zone',
      extentKm: sizes.infectedZoneKm,
      description: `Within ${sizes.infectedZoneKm} km of ${ids}`,
      basis,
    },
    {
      kind: 'buffer zone',
      extentKm: sizes.bufferZoneKm,
      description: `From ${sizes.infectedZoneKm} km to ${sizes.controlAreaKm} km of ${ids}`,
      basis,
    },
    {
      kind: 'control area',
      extentKm: sizes.controlAreaKm,
      description: `Infected zone and buffer zone together: ${sizes.controlAreaKm} km from ${ids}`,
      basis,
    },
    {
      kind: 'surveillance zone',
      extentKm: sizes.surveillanceZoneKm,
      description: `A band ${sizes.surveillanceZoneKm} km wide outside the control area`,
      basis,
    },
  ]
  const infectedIds = new Set(input.infected.map((p) => p.id))
  const placements: PremisesPlacement[] = [
    ...input.infected,
    ...input.premises.filter((p) => !infectedIds.has(p.id)),
  ].map((p) => {
    const isIp = infectedIds.has(p.id)
    const distanceKm = isIp ? 0 : nearestInfectedKm(p, input.infected)
    const zone = placeOne(distanceKm, sizes)
    return {
      id: p.id,
      zone,
      distanceKm: Math.round(distanceKm * 100) / 100,
      options: isIp ? (['infected'] as Designation[]) : OPTIONS[zone],
    }
  })
  const rings = input.infected.flatMap((p) =>
    (
      [
        ['infected zone', sizes.infectedZoneKm],
        ['control area', sizes.controlAreaKm],
        ['surveillance zone', sizes.controlAreaKm + sizes.surveillanceZoneKm],
      ] as const
    ).map(([kind, radiusKm]) => ({
      around: p.id,
      kind,
      radiusKm,
      ring: circleRing(p, radiusKm),
    })),
  )
  return {
    plan,
    sizes,
    zones,
    placements,
    controlAreas: groupAreas(input.infected, placements, sizes.controlAreaKm, input.premises),
    rings,
    warnings,
  }
}

function groupAreas(
  infected: readonly PlacedPremises[],
  placements: PremisesPlacement[],
  controlAreaKm: number,
  premises: readonly PlacedPremises[],
): ControlAreaGroup[] {
  const base = clusterInfected(infected, controlAreaKm)
  const byId = new Map([...infected, ...premises].map((p) => [p.id, p]))
  return base.map((ids) => ({
    infected: ids,
    premises: placements
      .filter(
        (q) => (q.zone === 'infected zone' || q.zone === 'buffer zone') && !ids.includes(q.id),
      )
      .filter((q) => {
        const p = byId.get(q.id)
        return p !== undefined && ids.some((i) => haversineKm(p, byId.get(i)!) <= controlAreaKm)
      })
      .map((q) => q.id),
  }))
}
