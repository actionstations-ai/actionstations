// The simulated governance incident (spec 0459 FR-6): a fact timeline that sharpens over hours
// (early facts incomplete or wrong), a financial impact range that widens and narrows, and
// recovery progress per function that respects dependencies. Simple parametric code, pure and
// deterministic: the same parameters give the same data. Everything is labeled simulated by the
// framework; the facts name fictional plants and systems only.
import { z } from 'zod'
import type { GroundTruthEvent, ModeledSeries } from '@shared/schemas/metrics'
import { makeRng } from './rng'

const HOUR_MS = 3_600_000

export const INCIDENT_TYPES = ['ransomware', 'data_theft', 'site_loss', 'cloud_outage'] as const
export type IncidentType = (typeof INCIDENT_TYPES)[number]

export const GovFunctionSpec = z.object({
  name: z.string().min(1).max(80),
  /** Recovery time objective from the business impact analysis, in hours. */
  rtoHours: z.number().min(0.5).max(720),
  /** Hours of the function's own recovery work once its dependencies are back. */
  workHours: z.number().min(0.25).max(240),
  dependsOn: z.array(z.string().max(80)).max(8).default([]),
})
export type GovFunctionSpec = z.infer<typeof GovFunctionSpec>

export const DEFAULT_FUNCTIONS: GovFunctionSpec[] = [
  { name: 'Network and identity', rtoHours: 4, workHours: 3, dependsOn: [] },
  { name: 'ERP and billing', rtoHours: 8, workHours: 5, dependsOn: ['Network and identity'] },
  { name: 'Plant scheduling', rtoHours: 12, workHours: 8, dependsOn: ['Network and identity'] },
  { name: 'Order entry', rtoHours: 8, workHours: 2, dependsOn: ['ERP and billing'] },
  {
    name: 'Shipping and logistics',
    rtoHours: 24,
    workHours: 6,
    dependsOn: ['ERP and billing', 'Plant scheduling'],
  },
  { name: 'Payroll', rtoHours: 48, workHours: 6, dependsOn: ['ERP and billing'] },
]

/** True when every dependency names a function in the list and there is no cycle. */
export function dependenciesValid(fns: readonly GovFunctionSpec[]): boolean {
  const names = new Set(fns.map((f) => f.name))
  if (names.size !== fns.length) return false
  if (fns.some((f) => f.dependsOn.some((d) => !names.has(d) || d === f.name))) return false
  const done = new Set<string>()
  let progressed = true
  while (progressed && done.size < fns.length) {
    progressed = false
    for (const f of fns)
      if (!done.has(f.name) && f.dependsOn.every((d) => done.has(d))) {
        done.add(f.name)
        progressed = true
      }
  }
  return done.size === fns.length
}

export const GovIncidentParams = z.object({
  incidentType: z.enum(INCIDENT_TYPES).default('ransomware'),
  startDate: z.iso.datetime().default('2026-10-22T11:15:00Z'),
  seed: z
    .number()
    .int()
    .min(0)
    .max(2 ** 31)
    .default(7),
  /** How many plants (or sites) the incident finally reaches. */
  plantsAffected: z.number().int().min(1).max(8).default(2),
  /** Middle of the final financial impact, in millions of dollars. */
  financialMidpointUsdM: z.number().min(0.1).max(5000).default(8),
  /** A third party (a supplier or cloud provider) controls part of the recovery. */
  thirdParty: z.boolean().default(false),
  horizonHours: z.number().int().min(24).max(168).default(72),
  functions: z.array(GovFunctionSpec).min(1).max(12).default(DEFAULT_FUNCTIONS),
})
export type GovIncidentParams = z.infer<typeof GovIncidentParams>

// ---- facts -------------------------------------------------------------------------------

export interface SimFact {
  id: string
  hour: number
  statement: string
  /** False for an early statement that later facts overturn. */
  accurate: boolean
  /** The id of the earlier fact this one corrects or sharpens. */
  revises?: string
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** The fact timeline: early facts are incomplete or wrong and later facts correct them. */
export function factTimeline(p: GovIncidentParams): SimFact[] {
  const n = p.plantsAffected
  const sites = plural(n, 'plant', 'plants')
  const f = (
    id: number,
    hour: number,
    statement: string,
    accurate = true,
    revises?: number,
  ): SimFact => ({
    id: `fact-${id}`,
    hour,
    statement,
    accurate,
    ...(revises ? { revises: `fact-${revises}` } : {}),
  })
  switch (p.incidentType) {
    case 'data_theft':
      return [
        f(1, 0, 'A file server at Plant 1 shows unusual outbound transfers.'),
        f(2, 1, 'No customer data is involved.', false),
        f(3, 3, 'An extortion message arrives threatening to publish files.'),
        f(4, 6, 'Outbound transfers began 11 days before discovery.', true, 2),
        f(
          5,
          12,
          `Files from ${sites} were copied, including some with personal information.`,
          true,
          2,
        ),
        f(6, 20, 'Production systems were not affected.'),
      ]
    case 'site_loss':
      return [
        f(1, 0, 'Power is lost at the Plant 1 data hall.'),
        f(2, 1, 'Power should return within two hours.', false),
        f(3, 4, 'A switchgear fault will take days to repair.', true, 2),
        f(4, 6, `Operations are being moved from ${sites} to the alternate site.`),
        f(5, 14, 'The alternate site has seats for half the staff.'),
      ]
    case 'cloud_outage':
      return [
        f(1, 0, 'Customer tickets report that the order portal is unavailable.'),
        f(2, 1, 'The outage is caused by an internal change.', false),
        f(3, 2, 'The provider status page says it is investigating a regional issue.', true, 2),
        f(
          4,
          6,
          p.thirdParty
            ? 'The provider has no estimate for restoration.'
            : 'The provider estimates restoration within a day.',
        ),
        f(5, 10, `Workloads for ${sites} depend on the same region.`),
      ]
    default:
      return [
        f(1, 0, 'Encryption is found on production scheduling servers at Plant 1.'),
        f(2, 1, 'Only one plant appears affected.', false),
        f(3, 2, 'A note demands payment within seven days and threatens to publish stolen files.'),
        f(4, 4, 'There is no evidence that data left the network.', false),
        f(5, 5, `${sites} are affected.`, true, 2),
        f(6, 10, 'Files were copied from file servers before encryption.', true, 4),
        f(7, 14, 'Finance and payroll systems are confirmed unaffected.'),
        f(8, 24, 'Restores from backup are confirmed viable for scheduling.'),
      ]
  }
}

// ---- impact range ------------------------------------------------------------------------

export interface ImpactPoint {
  hour: number
  low: number
  high: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * The estimated impact range in millions of dollars. It starts wide, widens again when the scope
 * is revised upward (about hour 8), then narrows toward the final figure. The final figure always
 * lies inside the range.
 */
export function impactRange(p: GovIncidentParams): ImpactPoint[] {
  const final = p.financialMidpointUsdM * (p.plantsAffected / 2)
  const out: ImpactPoint[] = []
  for (let h = 0; h <= p.horizonHours; h += 3) {
    const spread = 1 + 3 * Math.exp(-h / 18) + 1.2 * Math.exp(-(((h - 8) / 3) ** 2))
    out.push({ hour: h, low: round2(final / spread), high: round2(final * spread) })
  }
  return out
}

// ---- recovery ----------------------------------------------------------------------------

export interface FunctionRecovery {
  name: string
  rtoHours: number
  startHour: number
  /** Hours from discovery until the function is back; null when it is not back by the horizon. */
  recoveredHour: number | null
  withinRto: boolean
}

const SEVERITY: Record<IncidentType, number> = {
  ransomware: 1.6,
  data_theft: 0.35,
  site_loss: 1.3,
  cloud_outage: 1.0,
}

const quarter = (n: number): number => Math.round(n * 4) / 4

/** Each function starts when its dependencies are back and takes its own work time. */
export function recoverySchedule(p: GovIncidentParams): FunctionRecovery[] {
  const rng = makeRng(p.seed)
  const mult = SEVERITY[p.incidentType] * (p.thirdParty ? 1.25 : 1)
  const finish = new Map<string, number>()
  const out = new Map<string, FunctionRecovery>()
  const remaining = [...p.functions]
  while (remaining.length) {
    const i = remaining.findIndex((f) => f.dependsOn.every((d) => finish.has(d)))
    if (i < 0) break
    const [fn] = remaining.splice(i, 1)
    const start = Math.max(1, ...fn!.dependsOn.map((d) => finish.get(d)!))
    const end = quarter(start + fn!.workHours * mult * (1 + rng.uniform(0, 0.4)))
    finish.set(fn!.name, end)
    out.set(fn!.name, {
      name: fn!.name,
      rtoHours: fn!.rtoHours,
      startHour: start,
      recoveredHour: end <= p.horizonHours ? end : null,
      withinRto: end <= fn!.rtoHours,
    })
  }
  return p.functions.flatMap((f) => (out.has(f.name) ? [out.get(f.name)!] : []))
}

/** Percent recovered per function at each whole hour, 0 before it starts and 100 once it is back. */
export function recoverySeries(
  p: GovIncidentParams,
  schedule: readonly FunctionRecovery[],
  t0: number,
): ModeledSeries[] {
  return schedule.map((r) => {
    const end = r.recoveredHour ?? p.horizonHours + 1
    const points = []
    for (let h = 0; h <= p.horizonHours; h++) {
      const pct =
        h <= r.startHour ? 0 : h >= end ? 100 : ((h - r.startHour) / (end - r.startHour)) * 100
      points.push({
        time: new Date(t0 + h * HOUR_MS).toISOString(),
        value: Math.round(pct * 10) / 10,
      })
    }
    return { zone: r.name, quantity: 'recovery_pct', points }
  })
}

// ---- events and datasets -----------------------------------------------------------------

const at = (t0: number, hour: number): string => new Date(t0 + hour * HOUR_MS).toISOString()

/** The fact timeline as ground-truth events, with the discovery and the continuing investigation. */
export function factEvents(p: GovIncidentParams): GroundTruthEvent[] {
  const t0 = Date.parse(p.startDate)
  const events: GroundTruthEvent[] = [
    {
      id: 'discovered',
      time: at(t0, 0),
      kind: 'discovered',
      attrs: { incidentType: p.incidentType },
    },
    {
      id: 'investigation-continues',
      time: at(t0, 2),
      kind: 'investigation_continues',
      attrs: {
        note: 'The investigation is continuing. A materiality determination does not wait for it to finish.',
      },
    },
  ]
  for (const fact of factTimeline(p))
    events.push({
      id: fact.id,
      time: at(t0, fact.hour),
      kind: 'fact',
      attrs: {
        statement: fact.statement,
        accurate: fact.accurate,
        ...(fact.revises ? { revises: fact.revises } : {}),
      },
    })
  return events
}

/** Recovery events: when each function came back, against its RTO. */
export function recoveryEvents(
  p: GovIncidentParams,
  schedule: readonly FunctionRecovery[],
): GroundTruthEvent[] {
  const t0 = Date.parse(p.startDate)
  const events: GroundTruthEvent[] = [
    {
      id: 'discovered',
      time: at(t0, 0),
      kind: 'discovered',
      attrs: { incidentType: p.incidentType },
    },
  ]
  for (const r of schedule)
    events.push({
      id: `recovered-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      time: at(t0, r.recoveredHour ?? p.horizonHours),
      area: r.name,
      kind: r.recoveredHour === null ? 'function_not_recovered' : 'function_recovered',
      attrs: {
        function: r.name,
        rtoHours: r.rtoHours,
        recoveredHour: r.recoveredHour,
        withinRto: r.withinRto,
        dependsOn: p.functions.find((f) => f.name === r.name)?.dependsOn ?? [],
      },
    })
  return events
}

/** The impact range as two modeled series, in millions of dollars. */
export function impactSeries(p: GovIncidentParams): ModeledSeries[] {
  const t0 = Date.parse(p.startDate)
  const pts = impactRange(p)
  const series = (quantity: string, pick: (x: ImpactPoint) => number): ModeledSeries => ({
    zone: 'Financial impact',
    quantity,
    points: pts.map((x) => ({ time: at(t0, x.hour), value: pick(x) })),
  })
  return [series('impact_low_usd_m', (x) => x.low), series('impact_high_usd_m', (x) => x.high)]
}
