// The humanitarian simulations as case-data generators (spec 0469 FR-10). Each is a small
// parametric model, a pure function of its parameters and a seed; the framework labels the
// output simulated, so none of it can pass as historical. They write the ground-truth events
// and modeled series the humanitarian metrics read: gaps that open, a registration backlog, a
// pipeline break, an outbreak's first report and a threat level that rises. All names and
// populations are fictional.
import { z } from 'zod'
import { breakDay, daysOfStock, latestOrderDay, stockCurve } from '@shared/humanitarian/pipeline'
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import { runCompartment } from '../epidemiology/simulate/compartment'
import { makeRng } from '../epidemiology/simulate/rng'

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const iso = (ms: number): string => new Date(ms).toISOString()
const Common = z.object({
  startDate: z.iso.datetime().default('2026-10-13T00:00:00Z'),
  seed: z.number().int().min(0).default(1),
})
const range = (t0: number, days: number) => ({ start: iso(t0), end: iso(t0 + days * DAY_MS) })

// ---- arrivals at a site ------------------------------------------------------------------

export const ArrivalsParams = Common.extend({
  days: z.number().int().min(2).max(120).default(14),
  arrivalsPerDay: z.number().min(1).max(100_000).default(800),
  /** Extra arrivals while a surge lasts, as a multiple of the base rate. */
  surgeMultiple: z.number().min(0).max(10).default(1.5),
  surgeStartDay: z.number().int().min(0).default(3),
  surgeDays: z.number().int().min(0).default(4),
  registrationPerDay: z.number().min(1).max(100_000).default(900),
  /** The backlog, in people, that counts as registration falling behind. */
  backlogThreshold: z.number().min(1).default(1500),
})

export function simulateArrivals(p: z.output<typeof ArrivalsParams>) {
  const rng = makeRng(p.seed)
  let backlog = 0
  const rows: { day: number; arrivals: number; registered: number; backlog: number }[] = []
  for (let d = 0; d < p.days; d++) {
    const surge = d >= p.surgeStartDay && d < p.surgeStartDay + p.surgeDays ? p.surgeMultiple : 0
    const arrivals = rng.poisson(p.arrivalsPerDay * (1 + surge))
    const registered = Math.min(backlog + arrivals, p.registrationPerDay)
    backlog = backlog + arrivals - registered
    rows.push({ day: d, arrivals, registered, backlog })
  }
  return rows
}

const arrivalsGenerator: SimulatedGenerator<z.output<typeof ArrivalsParams>> = {
  id: 'humanitarian-arrivals',
  label: 'Simulated arrivals and registration at a site',
  params: ArrivalsParams,
  description:
    'Simulates people arriving at a displacement site each day, with a surge, and the registration team working through them. Writes daily arrivals, people registered and the backlog, and the moment the backlog passes the threshold.',
  toolkits: ['humanitarian'],
  example: {
    startDate: '2026-10-13T00:00:00Z',
    seed: 1,
    days: 14,
    arrivalsPerDay: 800,
    surgeMultiple: 1.5,
    surgeStartDay: 3,
    surgeDays: 4,
    registrationPerDay: 900,
    backlogThreshold: 1500,
  } satisfies z.input<typeof ArrivalsParams>,
  fields: {
    startDate: { label: 'Start (UTC)' },
    seed: {
      label: 'Random seed',
      help: 'Any whole number from 0; the same seed gives the same data.',
    },
    days: { label: 'Days simulated', help: '2 to 120 days.' },
    arrivalsPerDay: { label: 'Arrivals per day', help: 'Base arrivals per day before any surge.' },
    surgeMultiple: {
      label: 'Surge size',
      help: 'Extra arrivals while the surge lasts, as a multiple of the base rate, 0 to 10.',
    },
    surgeStartDay: { label: 'Surge starts (day)', help: 'Day from the start, counting from 0.' },
    surgeDays: { label: 'Surge length (days)' },
    registrationPerDay: {
      label: 'Registrations per day',
      help: 'People the registration team can register in a day.',
    },
    backlogThreshold: {
      label: 'Backlog threshold (people)',
      help: 'The backlog that counts as registration falling behind.',
    },
  },
  generate(p) {
    const t0 = Date.parse(p.startDate)
    const rows = simulateArrivals(p)
    const first = rows.find((r) => r.backlog > p.backlogThreshold)
    return [
      {
        id: 'hum-arrivals',
        label: 'Simulated arrivals, people registered and backlog per day',
        kind: 'series',
        unit: 'people',
        range: range(t0, p.days),
        data: rows.map((r) => ({
          t: iso(t0 + r.day * DAY_MS),
          v: { arrivals: r.arrivals, registered: r.registered, backlog: r.backlog },
        })),
      },
      {
        id: 'hum-arrival-events',
        label: 'Simulated registration events (ground truth)',
        kind: 'reports',
        shape: 'ground-truth',
        data: first
          ? [
              {
                id: 'registration-backlog',
                time: iso(t0 + first.day * DAY_MS + 18 * HOUR_MS),
                kind: 'registration_backlog',
                attrs: { backlog: first.backlog, threshold: p.backlogThreshold },
              },
            ]
          : [],
      },
    ] satisfies GeneratedDataset[]
  },
}

// ---- sudden-onset impact -------------------------------------------------------------------

const AreaSpec = z.object({
  name: z.string().min(1).max(60),
  population: z.number().int().min(100).max(10_000_000),
  /** Share of the population affected, 0 to 1. */
  severity: z.number().min(0).max(1),
})
const DEFAULT_AREAS = [
  { name: 'Karun North', population: 220_000, severity: 0.55 },
  { name: 'Karun South', population: 180_000, severity: 0.4 },
  { name: 'Bel Ravi', population: 90_000, severity: 0.7 },
  { name: 'Soma Valley', population: 120_000, severity: 0.6 },
  { name: 'Hadar', population: 60_000, severity: 0.8 },
]

export const ImpactParams = Common.extend({
  areas: z.array(AreaSpec).min(1).max(20).default(DEFAULT_AREAS),
  /** Severity above which an area's access is cut. */
  accessCutAbove: z.number().min(0).max(1).default(0.75),
  /** Hours until the first area reports; later areas report later. */
  firstReportHours: z.number().min(1).max(240).default(18),
})

export function simulateImpact(p: z.output<typeof ImpactParams>) {
  const rng = makeRng(p.seed)
  return p.areas.map((a, i) => {
    const affected = Math.round(a.population * a.severity * rng.uniform(0.9, 1.1))
    return {
      ...a,
      affected: Math.min(affected, a.population),
      accessCut: a.severity > p.accessCutAbove,
      reportHours: Math.round(p.firstReportHours * (1 + i * 0.5 + rng.uniform(0, 0.3))),
    }
  })
}

const impactGenerator: SimulatedGenerator<z.output<typeof ImpactParams>> = {
  id: 'humanitarian-impact',
  label: 'Simulated sudden-onset impact by admin area',
  params: ImpactParams,
  description:
    'Simulates a sudden-onset disaster across admin areas: people affected in each, areas whose access is cut, and impact reports that arrive later from each area. Writes the area reports and the impact and access-cut events.',
  toolkits: ['humanitarian'],
  example: {
    startDate: '2026-10-13T00:00:00Z',
    seed: 1,
    areas: [
      { name: 'Karun North', population: 220_000, severity: 0.55 },
      { name: 'Karun South', population: 180_000, severity: 0.4 },
      { name: 'Bel Ravi', population: 90_000, severity: 0.7 },
      { name: 'Hadar', population: 60_000, severity: 0.8 },
    ],
    accessCutAbove: 0.75,
    firstReportHours: 18,
  } satisfies z.input<typeof ImpactParams>,
  fields: {
    startDate: { label: 'Start (UTC)' },
    seed: {
      label: 'Random seed',
      help: 'Any whole number from 0; the same seed gives the same data.',
    },
    areas: {
      label: 'Admin areas',
      help: 'Each item: name, population and severity (share of the population affected, 0 to 1).',
    },
    accessCutAbove: {
      label: 'Access cut above severity',
      help: 'Areas with severity above this, 0 to 1, have their access cut.',
    },
    firstReportHours: {
      label: 'First report (hours)',
      help: 'Hours until the first area reports, 1 to 240; later areas report later.',
    },
  },
  generate(p) {
    const t0 = Date.parse(p.startDate)
    const impact = simulateImpact(p)
    return [
      {
        id: 'hum-impact',
        label: 'Simulated people affected by admin area (a teaching model, not an estimate)',
        kind: 'text',
        range: range(t0, 3),
        data: impact.map((a) => ({
          t: iso(t0 + a.reportHours * HOUR_MS),
          title: a.name,
          text: `Simulated. ${a.affected} of ${a.population} people affected${a.accessCut ? '; access is cut' : ''}.`,
        })),
      },
      {
        id: 'hum-impact-events',
        label: 'Simulated impact reports and access cuts (ground truth)',
        kind: 'reports',
        shape: 'ground-truth',
        data: impact.flatMap((a) => [
          {
            id: `impact-${a.name}`,
            time: iso(t0 + a.reportHours * HOUR_MS),
            area: a.name,
            kind: 'impact_reported',
            attrs: { affected: a.affected, population: a.population },
          },
          ...(a.accessCut
            ? [
                {
                  id: `access-${a.name}`,
                  time: iso(t0),
                  area: a.name,
                  kind: 'access_cut',
                  attrs: {},
                },
              ]
            : []),
        ]),
      },
    ] satisfies GeneratedDataset[]
  },
}

// ---- partner reporting into a 3W table -----------------------------------------------------

const PARTNER_NAMES = [
  'Harbourlight Relief',
  'Open Hands Alliance',
  'Kestrel Health Aid',
  'Waterline International',
  'Tamsarian Crescent Society',
  'Lantern Shelter Network',
  'Greenfield Food Programme',
  'Riverbend Protection Group',
]

export const ThreeWParams = Common.extend({
  areas: z
    .array(z.string().min(1).max(60))
    .min(1)
    .max(12)
    .default(['Karun North', 'Karun South', 'Bel Ravi', 'Soma Valley', 'Hadar']),
  sectors: z
    .array(z.string().min(1).max(60))
    .min(1)
    .max(8)
    .default(['Health', 'WASH', 'Shelter', 'Food security']),
  partners: z.number().int().min(1).max(PARTNER_NAMES.length).default(6),
  /** Chance that a partner works in a given area and sector. */
  presence: z.number().min(0).max(1).default(0.35),
  /** Median days a partner takes to report. */
  reportDelayDays: z.number().min(0.1).max(30).default(2),
  days: z.number().int().min(2).max(60).default(10),
  /** People in need per area and sector, for the gap events. */
  needPerCell: z.number().int().min(1).default(20_000),
})

export function simulateThreeW(p: z.output<typeof ThreeWParams>) {
  const rng = makeRng(p.seed)
  const reports: { partner: string; area: string; sector: string; day: number }[] = []
  for (const partner of PARTNER_NAMES.slice(0, p.partners)) {
    const delay = rng.lognormal(p.reportDelayDays, 0.5)
    for (const area of p.areas)
      for (const sector of p.sectors)
        if (rng.chance(p.presence))
          reports.push({
            partner,
            area,
            sector,
            day: Math.min(p.days, Math.ceil(delay + rng.uniform(0, 1))),
          })
  }
  const cells = p.areas.flatMap((area) =>
    p.sectors.map((sector) => {
      const mine = reports.filter((r) => r.area === area && r.sector === sector)
      return {
        area,
        sector,
        firstReportDay: mine.length ? Math.min(...mine.map((r) => r.day)) : undefined,
        mine,
      }
    }),
  )
  return { reports, cells }
}

const threeWGenerator: SimulatedGenerator<z.output<typeof ThreeWParams>> = {
  id: 'humanitarian-3w',
  label: 'Simulated partner reporting into a 3W table',
  params: ThreeWParams,
  description:
    'Simulates fictional partner organizations reporting where they work into a 3W (who does what where) table, some of them late. Writes the partner reports, the area and sector cells where nobody works, and partners reporting per cell by day.',
  toolkits: ['humanitarian'],
  example: {
    startDate: '2026-10-13T00:00:00Z',
    seed: 1,
    areas: ['Karun North', 'Karun South', 'Bel Ravi', 'Hadar'],
    sectors: ['Health', 'WASH', 'Shelter', 'Food security'],
    partners: 6,
    presence: 0.35,
    reportDelayDays: 2,
    days: 10,
    needPerCell: 20_000,
  } satisfies z.input<typeof ThreeWParams>,
  fields: {
    startDate: { label: 'Start (UTC)' },
    seed: {
      label: 'Random seed',
      help: 'Any whole number from 0; the same seed gives the same data.',
    },
    areas: { label: 'Areas', help: 'One admin area per line, 1 to 12.' },
    sectors: { label: 'Sectors', help: 'One sector or cluster per line, 1 to 8.' },
    partners: { label: 'Partners', help: 'Fictional partner organizations reporting, 1 to 8.' },
    presence: {
      label: 'Presence',
      help: 'Chance that a partner works in a given area and sector, 0 to 1.',
    },
    reportDelayDays: {
      label: 'Report delay (days)',
      help: 'Median days a partner takes to report, 0.1 to 30.',
    },
    days: { label: 'Days simulated', help: '2 to 60 days.' },
    needPerCell: {
      label: 'People in need per cell',
      help: 'People in need in each area and sector, used for the gap events.',
    },
  },
  generate(p) {
    const t0 = Date.parse(p.startDate)
    const { reports, cells } = simulateThreeW(p)
    const days = Array.from({ length: p.days + 1 }, (_, d) => d)
    return [
      {
        id: 'hum-3w-reports',
        label: 'Simulated partner 3W reports (fictional organizations)',
        kind: 'text',
        range: range(t0, p.days),
        data: [...reports]
          .sort((a, b) => a.day - b.day)
          .map((r) => ({
            t: iso(t0 + r.day * DAY_MS),
            title: `${r.partner}: ${r.sector}, ${r.area}`,
            text: `Simulated report. ${r.partner} reports activity in ${r.sector} in ${r.area}.`,
          })),
      },
      {
        id: 'hum-gap-events',
        label: 'Simulated coverage gaps: cells where nobody works (ground truth)',
        kind: 'reports',
        shape: 'ground-truth',
        data: cells
          .filter((c) => c.mine.length === 0)
          .map((c) => ({
            id: `gap-${c.area}-${c.sector}`,
            time: iso(t0 + 12 * HOUR_MS),
            area: c.area,
            kind: 'gap_open',
            attrs: { sector: c.sector, gap: `${c.sector} / ${c.area}`, need: p.needPerCell },
          })),
      },
      {
        id: 'hum-3w-coverage',
        label: 'Simulated partners reporting by area and sector, by day',
        kind: 'series',
        shape: 'modeled-series',
        data: cells.map((c) => ({
          zone: `${c.area} / ${c.sector}`,
          quantity: 'partners_reporting',
          points: days.map((d) => ({
            time: iso(t0 + d * DAY_MS),
            value: c.mine.filter((r) => r.day <= d).length,
          })),
        })),
      },
    ] satisfies GeneratedDataset[]
  },
}

// ---- outbreak in a camp --------------------------------------------------------------------

export const CampOutbreakParams = Common.extend({
  population: z.number().int().min(500).max(500_000).default(18_400),
  r0: z.number().min(0.5).max(10).default(2.4),
  days: z.number().int().min(7).max(120).default(45),
  /** Deaths over cases, as a share. */
  caseFatality: z.number().min(0).max(0.5).default(0.02),
  /** Cases at which the site health team would declare an outbreak response. */
  declarationCases: z.number().int().min(1).default(20),
})

const campOutbreakGenerator: SimulatedGenerator<z.output<typeof CampOutbreakParams>> = {
  id: 'humanitarian-camp-outbreak',
  label: 'Simulated outbreak in a displacement site',
  params: CampOutbreakParams,
  description:
    'Simulates an infectious disease outbreak in a displacement site with an SEIR model. Writes cases, deaths and cumulative cases per day, the first report, and the day cases reach the declaration threshold.',
  toolkits: ['humanitarian', 'epidemiology'],
  example: {
    startDate: '2026-10-13T00:00:00Z',
    seed: 1,
    population: 18_400,
    r0: 2.4,
    days: 45,
    caseFatality: 0.02,
    declarationCases: 20,
  } satisfies z.input<typeof CampOutbreakParams>,
  fields: {
    startDate: { label: 'Start (UTC)' },
    seed: {
      label: 'Random seed',
      help: 'Any whole number from 0; the same seed gives the same data.',
    },
    population: { label: 'Site population', help: 'People in the site, 500 to 500,000.' },
    r0: { label: 'R0', help: 'Basic reproduction number, 0.5 to 10.' },
    days: { label: 'Days simulated', help: '7 to 120 days.' },
    caseFatality: { label: 'Case fatality', help: 'Deaths over cases, as a share, 0 to 0.5.' },
    declarationCases: {
      label: 'Declaration threshold (cases)',
      help: 'Cumulative cases at which the site health team would declare an outbreak response.',
    },
  },
  generate(p) {
    const t0 = Date.parse(p.startDate)
    const run = runCompartment({
      model: 'seir',
      population: p.population,
      r0: p.r0,
      latentDays: 2,
      infectiousDays: 5,
      initialInfected: 2,
      days: p.days,
      stochasticSeed: p.seed,
    })
    let cumulative = 0
    const daily = run.days.map((d) => {
      const cases = Math.round(d.newOnsets)
      cumulative += cases
      return { day: d.day - 1, cases, cumulative, deaths: Math.round(cases * p.caseFatality) }
    })
    const firstDay = daily.find((d) => d.cases > 0)
    const threshold = daily.find((d) => d.cumulative >= p.declarationCases)
    return [
      {
        id: 'hum-camp-cases',
        label: 'Simulated cases and deaths per day (a teaching model, not a forecast)',
        kind: 'series',
        unit: 'people',
        range: range(t0, p.days),
        data: daily.map((d) => ({
          t: iso(t0 + d.day * DAY_MS),
          v: { cases: d.cases, deaths: d.deaths, cumulative: d.cumulative },
        })),
      },
      {
        id: 'hum-outbreak-events',
        label: 'Simulated outbreak events (ground truth)',
        kind: 'reports',
        shape: 'ground-truth',
        data: [
          ...(firstDay
            ? [
                {
                  id: 'first-report',
                  time: iso(t0 + firstDay.day * DAY_MS + 9 * HOUR_MS),
                  kind: 'first_report',
                  attrs: {},
                },
              ]
            : []),
          ...(threshold
            ? [
                {
                  id: 'declaration-threshold',
                  time: iso(t0 + threshold.day * DAY_MS + 12 * HOUR_MS),
                  kind: 'declaration_threshold',
                  attrs: { cases: threshold.cumulative },
                },
              ]
            : []),
        ],
      },
    ] satisfies GeneratedDataset[]
  },
}

// ---- pipeline ------------------------------------------------------------------------------

export const PipelineParams = Common.extend({
  commodity: z.string().min(1).max(60).default('Fortified wheat flour'),
  unit: z.string().min(1).max(20).default('tonnes'),
  stockOnHand: z.number().min(0).default(420),
  dailyConsumption: z.number().positive().default(28),
  shipments: z
    .array(z.object({ day: z.number().min(1).max(365), quantity: z.number().positive() }))
    .max(12)
    .default([
      { day: 12, quantity: 200 },
      { day: 30, quantity: 600 },
    ]),
  leadTimeDays: z.number().min(0).max(365).default(21),
  horizonDays: z.number().int().min(7).max(365).default(45),
  /** A shipment held at customs from this day: its arrival moves by `holdDays`. */
  customsHoldShipmentIndex: z.number().int().min(0).optional(),
  holdDays: z.number().min(0).max(120).default(0),
})

export function simulatePipeline(p: z.output<typeof PipelineParams>) {
  const shipments = p.shipments.map((s, i) =>
    i === p.customsHoldShipmentIndex ? { ...s, day: s.day + p.holdDays } : s,
  )
  const input = { stockOnHand: p.stockOnHand, dailyConsumption: p.dailyConsumption, shipments }
  const brk = breakDay(input, p.horizonDays)
  return {
    shipments,
    brk,
    daysOfStock: daysOfStock(p.stockOnHand, p.dailyConsumption)!,
    lastOrder: brk === undefined ? undefined : latestOrderDay(brk, p.leadTimeDays),
    curve: stockCurve(input, p.horizonDays),
    input,
  }
}

const pipelineGenerator: SimulatedGenerator<z.output<typeof PipelineParams>> = {
  id: 'humanitarian-pipeline',
  label: 'Simulated supply pipeline with lead times and a break',
  params: PipelineParams,
  description:
    'Simulates the supply pipeline for one commodity: stock on hand consumed each day, shipments arriving, one optionally held at customs, and the break when stock runs out. Writes stock and days of stock by day and the break, last order day and customs hold events.',
  toolkits: ['humanitarian', 'logistics'],
  example: {
    startDate: '2026-10-13T00:00:00Z',
    seed: 1,
    commodity: 'Fortified wheat flour',
    unit: 'tonnes',
    stockOnHand: 420,
    dailyConsumption: 28,
    shipments: [
      { day: 12, quantity: 200 },
      { day: 30, quantity: 600 },
    ],
    leadTimeDays: 21,
    horizonDays: 45,
    customsHoldShipmentIndex: 1,
    holdDays: 10,
  } satisfies z.input<typeof PipelineParams>,
  fields: {
    startDate: { label: 'Start (UTC)' },
    seed: {
      label: 'Random seed',
      help: 'Any whole number from 0; the same seed gives the same data.',
    },
    commodity: { label: 'Commodity' },
    unit: { label: 'Unit', help: 'Unit the stock is counted in, such as tonnes.' },
    stockOnHand: { label: 'Stock on hand', help: 'Stock at the start, in the unit above.' },
    dailyConsumption: {
      label: 'Daily consumption',
      help: 'Stock used per day, in the unit above.',
    },
    shipments: {
      label: 'Shipments',
      help: 'Each item: day (days after the start it arrives) and quantity (in the unit above).',
    },
    leadTimeDays: {
      label: 'Lead time (days)',
      help: 'Days from order to arrival, which sets the last day an order can still prevent the break.',
    },
    horizonDays: { label: 'Days simulated', help: '7 to 365 days.' },
    customsHoldShipmentIndex: {
      label: 'Shipment held at customs',
      help: 'Optional. Position of the held shipment in the list, counting from 0.',
    },
    holdDays: {
      label: 'Customs hold (days)',
      help: 'Days the held shipment arrives late, 0 to 120.',
    },
  },
  generate(p) {
    const t0 = Date.parse(p.startDate)
    const sim = simulatePipeline(p)
    const days = Array.from({ length: p.horizonDays + 1 }, (_, d) => d)
    const stockAt = (d: number): number => {
      const before = sim.curve.filter((c) => c.day <= d)
      const last = before.at(-1)!
      const next = sim.curve.find((c) => c.day > d)
      if (!next) return last.stock
      return Math.max(0, last.stock - (d - last.day) * p.dailyConsumption)
    }
    return [
      {
        id: 'hum-pipeline-stock',
        label: `Simulated ${p.commodity} stock at the start of each day`,
        kind: 'series',
        unit: p.unit,
        range: range(t0, p.horizonDays),
        data: days.map((d) => ({ t: iso(t0 + d * DAY_MS), v: Math.round(stockAt(d) * 100) / 100 })),
      },
      {
        id: 'hum-pipeline-cover',
        label: 'Simulated days of stock left, by day',
        kind: 'series',
        shape: 'modeled-series',
        data: [
          {
            zone: p.commodity,
            quantity: 'days_of_stock',
            points: days.map((d) => ({
              time: iso(t0 + d * DAY_MS),
              value: Math.round((stockAt(d) / p.dailyConsumption) * 100) / 100,
            })),
          },
        ],
      },
      {
        id: 'hum-pipeline-events',
        label: 'Simulated pipeline events (ground truth)',
        kind: 'reports',
        shape: 'ground-truth',
        data: [
          ...(sim.brk !== undefined
            ? [
                {
                  id: 'pipeline-break',
                  time: iso(t0 + sim.brk * DAY_MS),
                  kind: 'pipeline_break',
                  attrs: { day: sim.brk, commodity: p.commodity },
                },
                {
                  id: 'last-order-day',
                  time: iso(t0 + Math.max(0, sim.lastOrder!) * DAY_MS),
                  kind: 'last_order_day',
                  attrs: { day: sim.lastOrder, leadTimeDays: p.leadTimeDays },
                },
              ]
            : []),
          ...(p.customsHoldShipmentIndex !== undefined && p.shipments[p.customsHoldShipmentIndex]
            ? [
                {
                  id: 'customs-hold',
                  time: iso(
                    t0 + p.shipments[p.customsHoldShipmentIndex]!.day * DAY_MS - 2 * DAY_MS,
                  ),
                  kind: 'customs_hold',
                  attrs: { holdDays: p.holdDays },
                },
              ]
            : []),
        ],
      },
    ] satisfies GeneratedDataset[]
  },
}

// ---- staff security threat level -----------------------------------------------------------

export const ThreatParams = Common.extend({
  area: z.string().min(1).max(60).default('Karun to Hadar corridor'),
  /** Hours from the start to the first sign of the threat (level 1). */
  onsetHours: z.number().min(0).max(720).default(6),
  /** Hours from the first sign to a serious threat (level 3). */
  escalationHours: z.number().min(1).max(720).default(8),
  hours: z.number().int().min(6).max(720).default(48),
})

const threatGenerator: SimulatedGenerator<z.output<typeof ThreatParams>> = {
  id: 'humanitarian-security-threat',
  label: 'Simulated threat level on a corridor (decision timing reference)',
  params: ThreatParams,
  description:
    'Simulates a staff security threat level on a road corridor that rises from none to serious, as a reference for decision timing. Writes the threat level by hour and the onset and serious-threat events.',
  toolkits: ['humanitarian'],
  example: {
    startDate: '2026-10-13T00:00:00Z',
    seed: 1,
    area: 'Karun to Hadar corridor',
    onsetHours: 6,
    escalationHours: 8,
    hours: 48,
  } satisfies z.input<typeof ThreatParams>,
  fields: {
    startDate: { label: 'Start (UTC)' },
    seed: {
      label: 'Random seed',
      help: 'Any whole number from 0; the same seed gives the same data.',
    },
    area: { label: 'Area or corridor' },
    onsetHours: {
      label: 'First sign (hours)',
      help: 'Hours from the start to the first sign of the threat (level 1).',
    },
    escalationHours: {
      label: 'Escalation (hours)',
      help: 'Hours from the first sign to a serious threat (level 3).',
    },
    hours: { label: 'Hours simulated', help: '6 to 720 hours.' },
  },
  generate(p) {
    const t0 = Date.parse(p.startDate)
    const level = (h: number): number =>
      h < p.onsetHours
        ? 0
        : h < p.onsetHours + p.escalationHours / 2
          ? 1
          : h < p.onsetHours + p.escalationHours
            ? 2
            : 3
    const hours = Array.from({ length: p.hours + 1 }, (_, h) => h)
    return [
      {
        id: 'hum-threat-level',
        label: 'Simulated threat level (0 none to 3 serious), by hour',
        kind: 'series',
        shape: 'modeled-series',
        data: [
          {
            zone: p.area,
            quantity: 'threat_level',
            points: hours.map((h) => ({ time: iso(t0 + h * HOUR_MS), value: level(h) })),
          },
        ],
      },
      {
        id: 'hum-threat-events',
        label: 'Simulated threat events (ground truth)',
        kind: 'reports',
        shape: 'ground-truth',
        data: [
          {
            id: 'threat-onset',
            time: iso(t0 + p.onsetHours * HOUR_MS),
            area: p.area,
            kind: 'threat_onset',
            attrs: { level: 1 },
          },
          {
            id: 'threat-serious',
            time: iso(t0 + (p.onsetHours + p.escalationHours) * HOUR_MS),
            area: p.area,
            kind: 'threat_serious',
            attrs: { level: 3 },
          },
        ],
      },
    ] satisfies GeneratedDataset[]
  },
}

export const HUMANITARIAN_GENERATORS = [
  arrivalsGenerator,
  impactGenerator,
  threeWGenerator,
  campOutbreakGenerator,
  pipelineGenerator,
  threatGenerator,
] as unknown as SimulatedGenerator[]
