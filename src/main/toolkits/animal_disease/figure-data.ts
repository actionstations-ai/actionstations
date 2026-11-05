// Figure data built from the animal disease simulations (spec 0460 FR-5, FR-7): the premises
// map, table, confirmed-premises curve, tracing diagram and depopulation tracker. A premises
// is designated only from what the response team knows on the chosen day: detected premises are
// infected, premises linked to one by tracing are contact premises, others in the infected zone
// or buffer zone are at-risk, the rest free. Infections not yet detected stay hidden.
import { DAY_MS } from '@shared/epidemiology/arithmetic'
import type { Designation } from '@shared/animal-disease/plan-rules'
import type { Premises } from './simulate/premises'
import type { Infection, SpreadRun } from './simulate/spread'
import type { DepopRun } from './simulate/capacity'
import type { ZoneResult } from './zones'

export interface DesignatedPremises extends Premises {
  designation: Designation
  zone: string
}

/** Designations known on `day` (days from the start of the run). */
export function designateOnDay(
  premises: readonly Premises[],
  run: SpreadRun,
  day: number,
  zones?: ZoneResult,
): DesignatedPremises[] {
  const known = new Map<string, Infection>(
    run.infections.filter((i) => i.detectedDay <= day).map((i) => [i.premisesId, i]),
  )
  const traced = new Set<string>()
  for (const i of known.values())
    for (const other of run.infections)
      if (other.source === i.premisesId || other.premisesId === i.source)
        traced.add(other.premisesId)
  for (const l of run.links)
    if (known.has(l.a)) traced.add(l.b)
    else if (known.has(l.b)) traced.add(l.a)
  const place = new Map((zones?.placements ?? []).map((p) => [p.id, p.zone]))
  return premises.map((p) => {
    const zone = place.get(p.id) ?? 'free area'
    const designation: Designation = known.has(p.id)
      ? 'infected'
      : traced.has(p.id)
        ? 'contact'
        : zone === 'infected zone' || zone === 'buffer zone'
          ? 'at-risk'
          : 'free'
    return { ...p, designation, zone }
  })
}

export function premisesMapData(
  premises: readonly DesignatedPremises[],
  zones: ZoneResult | undefined,
  title?: string,
): Record<string, unknown> {
  const centers = new Map(premises.map((p) => [p.id, p]))
  return {
    ...(title ? { title } : {}),
    premises: premises.map((p) => ({
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      species: p.species,
      head: p.head,
      designation: p.designation,
      zone: p.zone,
    })),
    // The figure takes up to 30 rings: the first ten infected premises.
    rings: (zones?.rings ?? []).slice(0, 30).flatMap((r) => {
      const c = centers.get(r.around)
      return c
        ? [
            {
              around: r.around,
              kind: r.kind,
              center: { lat: c.lat, lon: c.lon },
              radiusKm: r.radiusKm,
            },
          ]
        : []
    }),
    simulated: true,
  }
}

export function premisesTableData(
  premises: readonly DesignatedPremises[],
  asOf: string,
  title?: string,
): Record<string, unknown> {
  return {
    ...(title ? { title } : {}),
    asOf,
    premises: premises
      .filter((p) => p.designation !== 'free')
      .slice(0, 60)
      .map((p) => ({
        id: p.id,
        species: p.species,
        head: p.head,
        designation: p.designation,
        zone: p.zone,
      })),
  }
}

/** Confirmed premises by the day infection started, as the shared epidemic curve takes cases. */
export function curveDataFromSpread(run: SpreadRun, title?: string): Record<string, unknown> {
  const start = run.params.startDate
  return {
    title: title ?? 'Infected premises by estimated infection date (simulated)',
    start,
    binHours: 24,
    bins: run.params.days,
    cases: run.infections.map((i) => ({
      onset: new Date(Date.parse(start) + i.infectedDay * DAY_MS).toISOString(),
      status: 'confirmed',
    })),
  }
}

/** The tracing diagram: index premises, then each premises infected from a detected source. */
export function networkDataFromSpread(
  run: SpreadRun,
  day: number,
  title?: string,
): Record<string, unknown> {
  const known = run.infections.filter((i) => i.detectedDay <= day)
  const ids = new Set(known.map((i) => i.premisesId))
  const generation = new Map<string, number>()
  for (const i of known) {
    if (!i.source) generation.set(i.premisesId, 0)
  }
  for (let pass = 0; pass < 8; pass++)
    for (const i of known)
      if (i.source && generation.has(i.source) && !generation.has(i.premisesId))
        generation.set(i.premisesId, Math.min(6, generation.get(i.source)! + 1))
  return {
    title: title ?? 'Tracing links between detected premises (simulated)',
    nodes: known
      .filter((i) => generation.has(i.premisesId))
      .slice(0, 150)
      .map((i) => ({
        id: i.premisesId,
        label: i.premisesId,
        generation: generation.get(i.premisesId)!,
        status: i.source ? 'case' : 'index',
      })),
    edges: known
      .filter((i) => i.source && ids.has(i.source) && generation.has(i.premisesId))
      .map((i) => ({ from: i.source!, to: i.premisesId })),
  }
}

/** The depopulation tracker as of `asOfMs`. */
export function depopTrackerData(
  run: DepopRun,
  premises: readonly Premises[],
  presumptive: ReadonlyMap<string, number>,
  asOfMs: number,
  title?: string,
): Record<string, unknown> {
  const byId = new Map(premises.map((p) => [p.id, p]))
  const rows = run.results
    .filter((r) => (presumptive.get(r.id) ?? Infinity) <= asOfMs)
    .map((r) => {
      const p = byId.get(r.id)!
      const at = presumptive.get(r.id)!
      const state =
        asOfMs >= r.disposalCompleteMs
          ? 'disposed'
          : asOfMs >= r.completeMs
            ? 'depopulated'
            : asOfMs >= r.startMs
              ? 'in progress'
              : 'queued'
      const done = state === 'depopulated' || state === 'disposed'
      return {
        id: r.id,
        species: p.species,
        head: p.head,
        method: r.method,
        state,
        hours: done ? r.hoursFromPresumptive : Math.round(((asOfMs - at) / 3_600_000) * 10) / 10,
        site: r.disposalSite,
      }
    })
  return {
    ...(title ? { title } : {}),
    asOf: new Date(asOfMs).toISOString().replace('.000Z', 'Z'),
    premises: rows.slice(0, 30),
  }
}
