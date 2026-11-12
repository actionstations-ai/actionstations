// The animal disease simulations as case-data generators (spec 0448 FR-10, spec 0460 FR-7, FR-8).
// Each is a pure function of its parameters; the framework labels the output simulated. Premises
// are fictional points the scenario places, and every label says simulated, so none of it can
// pass as a record of a real outbreak or a forecast.
import { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../../case-data/generators'
import { FMD_SAMPLING } from '@shared/animal-disease/plan-rules'
import { makeRng } from '../../epidemiology/simulate/rng'
import { designateOnDay } from '../figure-data'
import { computeZones } from '../zones'
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

/**
 * Scoring events for the first detection: a sample due for each at-risk and contact premises in
 * the control area (intervals from the FMD table, a guideline), and permit requests from some
 * premises that are not infected. The designer replaces them with the scenario's own plan.
 */
function responseEvents(
  premises: ReturnType<typeof generatePremises>,
  run: ReturnType<typeof runSpread>,
  seed: number,
) {
  const first = [...run.infections].sort((a, b) => a.detectedDay - b.detectedDay)[0]
  if (!first) return []
  const placed = premises.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon }))
  const ip = placed.filter((p) => p.id === first.premisesId)
  const zones = computeZones({ plan: 'hpai', infected: ip, premises: placed })
  const day = first.detectedDay
  const t0 = Date.parse(run.params.startDate)
  const rng = makeRng(seed + 101)
  const out: ReturnType<typeof eventEntry>[] = []
  for (const p of designateOnDay(premises, run, day, zones)) {
    if (p.designation === 'contact' || p.designation === 'at-risk') {
      const days = FMD_SAMPLING.find((r) => r.designation === p.designation)!.intervalDays
      out.push(
        eventEntry(iso(t0 + (day + days) * DAY_MS), `sample-due-${p.id}`, 'sampling_due', {
          premises: p.id,
          designation: p.designation,
          intervalDays: days,
        }),
      )
    }
    const inArea = zones.placements.find((z) => z.id === p.id)?.zone
    if (
      p.designation !== 'infected' &&
      (inArea === 'infected zone' || inArea === 'buffer zone') &&
      p.head > 100 &&
      rng.chance(0.35)
    )
      out.push(
        eventEntry(
          iso(t0 + day * DAY_MS + (6 + rng.int(36)) * HOUR_MS),
          `permit-request-${p.id}`,
          'permit_request',
          { premises: p.id, species: p.species, unaffected: true },
        ),
      )
  }
  return out
}

const SPREAD_EXAMPLE = {
  premises: {
    seed: 7,
    county: 'Tamarack County',
    center: { lat: 44.3, lon: -93.9 },
    radiusKm: 40,
    hubs: 4,
    inventory: [
      { species: 'turkeys', farms: 14, meanHead: 30000 },
      { species: 'layers', farms: 6, meanHead: 90000 },
      { species: 'swine', farms: 25, meanHead: 2500 },
      { species: 'dairy cattle', farms: 20, meanHead: 300 },
    ],
  },
  index: ['P-001'],
  spread: {
    seed: 11,
    startDate: '2026-10-19T00:00:00Z',
    days: 40,
    baseDailyProb: 0.03,
    kernelScaleKm: 3,
    maxKernelKm: 12,
    linksPerPremises: 1.2,
    movementDailyProb: 0.02,
    latentDays: 2,
    detectionDelayDays: [2, 5],
    depopulationDelayDays: 1,
    controlsFromDay: 6,
    controlEffect: 0.2,
  },
} satisfies z.input<typeof SpreadGeneratorParams>

const SPREAD_FIELDS = {
  premises: {
    label: 'Fictional premises',
    help: 'JSON object: seed (whole number), county (a fictional name), center ({ lat, lon }), radiusKm (5 to 200), hubs (1 to 12) and inventory, a list of { species, farms, meanHead } lines.',
  },
  index: {
    label: 'Index premises',
    help: 'Premises codes infected on day 0, such as P-001 (up to 5). Leave empty to start at the first premises.',
  },
  spread: {
    label: 'Spread settings',
    help: 'JSON object: seed, startDate (ISO), days (5 to 120), baseDailyProb and movementDailyProb (0 to 1 per day), kernelScaleKm and maxKernelKm, linksPerPremises, latentDays, detectionDelayDays ([min, max]), depopulationDelayDays, controlsFromDay and controlEffect (0 to 1, the share of movement spread left once controls start).',
  },
}

function spreadFor(p: z.output<typeof SpreadGeneratorParams>) {
  const premises = generatePremises(p.premises)
  const index = p.index.length ? p.index : [premises[0]!.id]
  return { premises, run: runSpread(premises, { ...p.spread, index }) }
}

const spreadGenerator: SimulatedGenerator<z.output<typeof SpreadGeneratorParams>> = {
  id: 'animal-premises-spread',
  label: 'Simulated premises and spread (fictional premises, distance and movement links)',
  params: SpreadGeneratorParams,
  description:
    'Fictional premises for a county from a farm inventory, and an infection spreading between them by distance and along movement links, with controls that cut movement from a chosen day. It writes the premises map, presumptive positives, samples due and permit requests for scoring, the confirmed premises curve and the tracing links.',
  toolkits: ['animal_disease'],
  example: SPREAD_EXAMPLE,
  fields: SPREAD_FIELDS,
  generate(p) {
    const { premises, run } = spreadFor(p)
    const t0 = Date.parse(run.params.startDate)
    const range = { start: iso(t0), end: iso(t0 + run.params.days * DAY_MS) }
    const byId = new Map(premises.map((q) => [q.id, q]))
    const response = responseEvents(premises, run, p.spread.seed ?? 11)
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
        label: 'Simulated presumptive positives, samples due and permit requests (for scoring)',
        kind: 'reports',
        range,
        data: [...events, ...response].sort((a, b) => a.t.localeCompare(b.t)),
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
  description:
    'The same simulated outbreak, then depopulation crews and disposal sites working through the infected premises as a queue. It writes depopulation completions for scoring against the 24-hour goal, the schedule by premises and the head still waiting.',
  toolkits: ['animal_disease'],
  example: {
    ...SPREAD_EXAMPLE,
    crews: 4,
    methods: DEFAULT_METHODS,
    disposalSites: DEFAULT_SITES,
    mobilizationHours: 4,
  } satisfies z.input<typeof DepopGeneratorParams>,
  fields: {
    ...SPREAD_FIELDS,
    crews: { label: 'Depopulation crews', help: 'Crews working at once, 1 to 200.' },
    methods: {
      label: 'Depopulation methods',
      help: 'JSON list of { id, species (the species it may be used for), headPerCrewHour }.',
    },
    disposalSites: {
      label: 'Disposal sites',
      help: 'JSON list of { id, capacityHeadPerDay, travelHours (by road from the premises) }.',
    },
    mobilizationHours: {
      label: 'Mobilization (hours)',
      help: 'Hours from a presumptive positive until a crew can start, 0 to 72.',
    },
  },
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
            head: byId.get(r.id)?.head ?? 0,
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
