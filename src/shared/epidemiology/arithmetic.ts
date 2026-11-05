// Epidemiology arithmetic shared by the simulation, the figures and the lint rules (spec 0457).
// Pure functions, no Node imports. Pathogen entries carry only public health response facts
// (incubation and infectious periods) with their source; they are teaching values, not guidance.

export const HOUR_MS = 3_600_000
export const DAY_MS = 24 * HOUR_MS

/** A response-facts entry for one pathogen. Hours are measured from the stated anchor. */
export interface PathogenFacts {
  id: string
  name: string
  /** Exposure to symptom onset (rash onset for measles), hours. */
  incubationHours: { min: number; max: number }
  /**
   * Infectious period relative to symptom onset (rash onset for measles): starts `beforeHours`
   * before onset and ends `afterHours` after it. Null where the period depends on treatment or
   * local rules and the entry says so in `note`.
   */
  infectious: { beforeHours: number; afterHours: number } | null
  note: string
  source: string
}

/** The reviewed list (spec 0457 FR-4). Add an entry only with a cited source and a reviewer. */
export const PATHOGENS: readonly PathogenFacts[] = [
  {
    id: 'norovirus',
    name: 'Norovirus',
    incubationHours: { min: 12, max: 48 },
    infectious: { beforeHours: 0, afterHours: 48 },
    note: 'Contagious while symptomatic and for at least 2 days after; food workers are usually excluded until 48 hours after symptoms end.',
    source: 'CDC norovirus clinical information; FDA Food Code',
  },
  {
    id: 'salmonella',
    name: 'Salmonella (nontyphoidal)',
    incubationHours: { min: 6, max: 144 },
    infectious: null,
    note: 'Usually 12 to 72 hours; illness lasts 4 to 7 days; shedding can continue for weeks.',
    source: 'CDC Salmonella clinical overview',
  },
  {
    id: 'measles',
    name: 'Measles',
    incubationHours: { min: 7 * 24, max: 21 * 24 },
    infectious: { beforeHours: 4 * 24, afterHours: 4 * 24 },
    note: 'Anchored on rash onset. Virus can remain airborne in a room up to 2 hours after the person leaves.',
    source: 'CDC measles clinical overview',
  },
  {
    id: 'influenza',
    name: 'Influenza',
    incubationHours: { min: 24, max: 96 },
    infectious: { beforeHours: 24, afterHours: 7 * 24 },
    note: 'Children and immunocompromised people can shed longer.',
    source: 'CDC influenza clinical information',
  },
  {
    id: 'sars_cov_2',
    name: 'SARS-CoV-2',
    incubationHours: { min: 2 * 24, max: 14 * 24 },
    infectious: null,
    note: 'Incubation has been shorter with recent variants; isolation and exposure guidance changes, so use the current local rule and date it.',
    source: 'CDC COVID-19 clinical pages',
  },
  {
    id: 'pertussis',
    name: 'Pertussis',
    incubationHours: { min: 5 * 24, max: 21 * 24 },
    infectious: null,
    note: 'Infectious from cough onset to 3 weeks after, or until 5 days of appropriate antibiotics.',
    source: 'CDC pertussis clinical information',
  },
  {
    id: 'legionella',
    name: 'Legionella',
    incubationHours: { min: 2 * 24, max: 14 * 24 },
    infectious: null,
    note: 'Not spread person to person in nearly all cases; the source is a building water system.',
    source: 'CDC Legionella clinical overview',
  },
]

export const pathogenById = (id: string): PathogenFacts | undefined =>
  PATHOGENS.find((p) => p.id === id)

export interface TimeWindow {
  startMs: number
  endMs: number
}

/**
 * When a case could have been exposed: onset minus the longest incubation period (start) to
 * onset minus the shortest (end).
 */
export function exposureWindowBeforeOnset(onsetMs: number, p: PathogenFacts): TimeWindow {
  return {
    startMs: onsetMs - p.incubationHours.max * HOUR_MS,
    endMs: onsetMs - p.incubationHours.min * HOUR_MS,
  }
}

/** When a case could transmit; null when the pathogen has no fixed period. */
export function infectiousWindow(onsetMs: number, p: PathogenFacts): TimeWindow | null {
  if (!p.infectious) return null
  return {
    startMs: onsetMs - p.infectious.beforeHours * HOUR_MS,
    endMs: onsetMs + p.infectious.afterHours * HOUR_MS,
  }
}

/**
 * The time a contact exposed at `exposureMs` could first and last become ill: exposure plus the
 * shortest and longest incubation period. Monitoring or quarantine covers this span.
 */
export function monitoringWindowAfterExposure(exposureMs: number, p: PathogenFacts): TimeWindow {
  return {
    startMs: exposureMs + p.incubationHours.min * HOUR_MS,
    endMs: exposureMs + p.incubationHours.max * HOUR_MS,
  }
}

/** Whether two spans share any time. */
export const windowsOverlap = (a: TimeWindow, b: TimeWindow): boolean =>
  a.startMs < b.endMs && b.startMs < a.endMs

/** Whether `inner` lies wholly inside `outer`. */
export const windowWithin = (inner: TimeWindow, outer: TimeWindow): boolean =>
  inner.startMs >= outer.startMs && inner.endMs <= outer.endMs

/** Ill over exposed; null when nobody was exposed. */
export const attackRate = (ill: number, exposed: number): number | null =>
  exposed <= 0 ? null : ill / exposed

/** A 2x2 table: a = ill and exposed, b = well and exposed, c = ill and unexposed, d = well and unexposed. */
export interface TwoByTwo {
  a: number
  b: number
  c: number
  d: number
}

export interface Association {
  attackRateExposed: number | null
  attackRateUnexposed: number | null
  relativeRisk: number | null
  oddsRatio: number | null
  /** 95% confidence interval for the odds ratio (Woolf's method, 0.5 added to every cell when one is zero). */
  oddsRatioCi: [number, number] | null
}

const Z_95 = 1.959964

export function association(t: TwoByTwo): Association {
  const exposed = t.a + t.b
  const unexposed = t.c + t.d
  const arE = attackRate(t.a, exposed)
  const arU = attackRate(t.c, unexposed)
  const rr = arE === null || arU === null || arU === 0 ? null : arE / arU
  if (exposed === 0 || unexposed === 0)
    return {
      attackRateExposed: arE,
      attackRateUnexposed: arU,
      relativeRisk: rr,
      oddsRatio: null,
      oddsRatioCi: null,
    }
  const adj = [t.a, t.b, t.c, t.d].some((x) => x === 0) ? 0.5 : 0
  const [a, b, c, d] = [t.a + adj, t.b + adj, t.c + adj, t.d + adj]
  const or = (a * d) / (b * c)
  const se = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d)
  return {
    attackRateExposed: arE,
    attackRateUnexposed: arU,
    relativeRisk: rr,
    oddsRatio: or,
    oddsRatioCi: [Math.exp(Math.log(or) - Z_95 * se), Math.exp(Math.log(or) + Z_95 * se)],
  }
}

/** Basic reproduction number from a final attack fraction in a homogeneous SIR epidemic: R0 = -ln(1 - z) / z. */
export const r0FromFinalSize = (z: number): number | null =>
  z <= 0 || z >= 1 ? null : -Math.log(1 - z) / z

/**
 * Final size z of an SIR epidemic with reproduction number r0 in a fully susceptible population:
 * the root of z = 1 - exp(-r0 z) other than zero (Newton iteration from a good start).
 */
export function finalSize(r0: number): number {
  if (r0 <= 1) return 0
  let z = 1 - Math.exp(-r0)
  for (let i = 0; i < 100; i++) {
    const f = z - 1 + Math.exp(-r0 * z)
    const df = 1 - r0 * Math.exp(-r0 * z)
    const next = z - f / df
    if (Math.abs(next - z) < 1e-12) return next
    z = next
  }
  return z
}
