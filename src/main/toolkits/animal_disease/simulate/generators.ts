// The animal disease simulations as case-data generators (spec 0448 FR-10, spec 0460 FR-7, FR-8).
// Each is a pure function of its parameters; the framework labels the output simulated. Premises
// are fictional points the scenario places, and every label says simulated, so none of it can
// pass as a record of a real outbreak or a forecast.
import { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../../case-data/generators'
import { PremisesParams, generatePremises } from './premises'
import { SpreadParams, presumptiveMs, runSpread } from './spread'
import { DepopMethod, DisposalSite, runDepopulation } from './capacity'

const iso = (ms: number): string => new Date(ms).toISOString()
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** A ground-truth event as a text entry: the case data reports shape (see readGroundTruth). */
const eventEntry = (
  at: string,
  id: string,
  kind: string,
  attrs: Record<string, unknown> = {},
): { t: string; title: string; text: string } => ({
  t: at,
  title: id,
  text: JSON.stringify({ id, kind, attrs }),
})

export const DEFAULT_METHODS = [
  {
    id: 'water-based foam',
    species: ['turkeys', 'layers', 'backyard birds'],
    headPerCrewHour: 600,
  },
  {
    id: 'on-site humane method per state plan',
    species: ['swine', 'dairy cattle'],
    headPerCrewHour: 40,
  },
] satisfies z.input<typeof DepopMethod>[]

export const DEFAULT_SITES = [
  { id: 'Disposal Site 1', capacityHeadPerDay: 60000, travelHours: 1 },
  { id: 'Disposal Site 2', capacityHeadPerDay: 120000, travelHours: 2.5 },
] satisfies z.input<typeof DisposalSite>[]

const SpreadForGenerator = SpreadParams.omit({ index: true })

const SpreadGeneratorParams = z.object({
  premises: PremisesParams.default(() => PremisesParams.parse({})),
  /** Premises ids infected on day 0; the first premises of the first species when absent. */
  index: z.array(z.string()).max(5).default([]),
  spread: SpreadForGenerator.default(() => SpreadForGenerator.parse({})),
})

function spreadFor(p: z.output<typeof SpreadGeneratorParams>) {
  const premises = generatePremises(p.premises)
  const index = p.index.length ? p.index : [premises[0]!.id]
  return { premises, run: runSpread(premises, { ...p.spread, index }) }
}

const spreadGenerator: SimulatedGenerator<z.output<typeof SpreadGeneratorParams>> = {
  id: 'animal-premises-spread',
  label: 'Simulated premises and spread (fictional premises, distance and movement links)',
  params: SpreadGeneratorParams,
  generate(p) {
    const { premises, run } = spreadFor(p)
    const t0 = Date.parse(run.params.startDate)
    const range = { start: iso(t0), end: iso(t0 + run.params.days * DAY_MS) }
    const byId = new Map(premises.map((q) => [q.id, q]))
    const events = run.infections.flatMap((i) => {
      const q = byId.get(i.premisesId)!
      const at = iso(presumptiveMs(run.params.startDate, i))
      return [
        eventEntry(at, `pp-${i.premisesId}`, 'presumptive_positive', {
          premises: i.premisesId,
          species: q.species,
          head: q.head,
        }),
      ]
    })
    return [
      {
        id: 'animal-premises',
        label: 'Simulated fictional premises (not real farms)',
        kind: 'features',
        range,
        data: {
          type: 'FeatureCollection',
          features: premises.map((q) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [q.lon, q.lat] },
            properties: {
              kind: 'animal_premises',
              id: q.id,
              name: q.name,
              species: q.species,
              head: q.head,
              simulated: true,
            },
          })),
        },
      },
      {
        id: 'animal-events',
        label: 'Simulated presumptive positives (for scoring)',
        kind: 'reports',
        range,
        data: events,
      },
      {
        id: 'animal-confirmed-curve',
        label: 'Simulated confirmed premises per day',
        kind: 'series',
        unit: 'premises per day',
        range,
        data: run.daily.map((d) => ({
          t: iso(t0 + d.day * DAY_MS),
          v: { newConfirmed: d.newConfirmed, cumulative: d.cumulativeConfirmed },
        })),
      },
      {
        id: 'animal-tracing',
        label: 'Simulated tracing links between premises (source to target)',
        kind: 'reports',
        range,
        data: run.infections
          .filter((i) => i.source)
          .map((i) => ({
            t: iso(t0 + i.infectedDay * DAY_MS),
            title: `${i.source} to ${i.premisesId}`,
            text: JSON.stringify({
              from: i.source,
              to: i.premisesId,
              via: i.via,
              distanceKm: i.distanceKm,
            }),
          })),
      },
    ] satisfies GeneratedDataset[]
  },
}

const DepopGeneratorParams = SpreadGeneratorParams.extend({
  crews: z.number().int().min(1).max(200).default(4),
  methods: z.array(DepopMethod).default(DEFAULT_METHODS),
  disposalSites: z.array(DisposalSite).default(DEFAULT_SITES),
  mobilizationHours: z.number().min(0).max(72).default(4),
})

const depopGenerator: SimulatedGenerator<z.output<typeof DepopGeneratorParams>> = {
  id: 'animal-depop-capacity',
  label: 'Simulated depopulation and disposal schedule (crews, methods, disposal sites)',
  params: DepopGeneratorParams,
  generate(p) {
    const { premises, run } = spreadFor(p)
    const byId = new Map(premises.map((q) => [q.id, q]))
    const depop = runDepopulation({
      premises: run.infections.map((i) => {
        const q = byId.get(i.premisesId)!
        return {
          id: q.id,
          species: q.species,
          head: q.head,
          presumptiveAt: iso(presumptiveMs(run.params.startDate, i)),
        }
      }),
      crews: p.crews,
      methods: p.methods,
      disposalSites: p.disposalSites,
      mobilizationHours: p.mobilizationHours,
    })
    const first = depop.backlog[0]?.timeMs ?? Date.parse(run.params.startDate)
    const lastMs = depop.results.reduce((m, r) => Math.max(m, r.disposalCompleteMs), first)
    const range = { start: iso(first), end: iso(lastMs) }
    return [
      {
        id: 'animal-depop-events',
        label: 'Simulated depopulation completions (for scoring)',
        kind: 'reports',
        range,
        data: depop.results.map((r) =>
          eventEntry(iso(r.completeMs), `depop-${r.id}`, 'depop_complete', {
            premises: r.id,
            hoursFromPresumptive: r.hoursFromPresumptive,
            withinGoal: r.withinGoal,
          }),
        ),
      },
      {
        id: 'animal-depop-schedule',
        label: 'Simulated depopulation schedule by premises',
        kind: 'reports',
        range,
        data: depop.results.map((r) => ({
          t: iso(r.startMs),
          title: r.id,
          text: [
            'Simulated.',
            `method: ${r.method}`,
            `complete: ${iso(r.completeMs)}`,
            `hours from presumptive positive: ${r.hoursFromPresumptive}`,
            `disposal: ${r.disposalSite}, complete ${iso(r.disposalCompleteMs)}`,
          ].join('\n'),
        })),
      },
      {
        id: 'animal-depop-backlog',
        label: 'Simulated head waiting for depopulation',
        kind: 'series',
        unit: 'head',
        range,
        data: depop.backlog.map((b) => ({ t: iso(b.timeMs), v: b.head })),
      },
    ] satisfies GeneratedDataset[]
  },
}

export const ANIMAL_GENERATORS: readonly SimulatedGenerator<never>[] = [
  spreadGenerator,
  depopGenerator,
] as unknown as readonly SimulatedGenerator<never>[]
