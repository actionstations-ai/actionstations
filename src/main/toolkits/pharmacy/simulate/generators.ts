// The pharmacy simulations as case-data generators (spec 0448 FR-10, spec 0463 FR-8). Each is a
// pure function of its parameters; the framework labels the output simulated, so none of it can
// pass as historical. Ground-truth events carry the model's own parameters (`*_model` events) so
// the metrics can rerun the model with the team's decisions and compare. Users, lots, units and
// products are fictional and say so.
import type { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../../case-data/generators'
import { cToF } from '../../../../shared/pharmacy/arithmetic'
import { ColdChainParams, runColdChain } from './coldchain'
import { DiversionParams, runDiversion } from './diversion'
import { QueueParams, runQueue } from './queue'
import { RecallParams, runRecall } from './recall'
import { ShortageParams, runShortage } from './shortage'

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const iso = (ms: number): string => new Date(ms).toISOString()

/** A ground-truth event as a text entry: the case data reports shape (see readGroundTruth). */
const event = (
  at: string,
  id: string,
  kind: string,
  attrs: Record<string, unknown> = {},
): { t: string; title: string; text: string } => ({
  t: at,
  title: id,
  text: JSON.stringify({ id, kind, attrs }),
})

const shortageGenerator: SimulatedGenerator<ShortageParams> = {
  id: 'pharmacy-shortage',
  label: 'Simulated drug shortage (stock, usage, allocation)',
  params: ShortageParams,
  description:
    "Runs one drug's stock down day by day from usage, deliveries and the allocation changes you set, and finds the stockout day. Writes stock and days on hand as a series and each day served and unmet, with the stockout, as scoring events.",
  toolkits: ['pharmacy', 'logistics'],
  example: {
    startDate: '2026-11-05T08:00:00Z',
    drug: 'Sodium chloride 0.9% injection, 1,000 mL bag',
    unit: 'containers',
    onHand: 1840,
    usagePerDay: 460,
    horizonDays: 14,
    deliveries: [
      { day: 3, quantity: 400 },
      { day: 8, quantity: 600 },
    ],
    allocationChanges: [{ day: 2, percent: 70 }],
  } satisfies z.input<typeof ShortageParams>,
  fields: {
    startDate: { label: 'Start (UTC)', help: 'Day 0 of the model.' },
    drug: {
      label: 'Drug',
      help: 'Name, strength and container, as it appears on the shortage board.',
    },
    unit: { label: 'Unit', help: 'What is counted, e.g. containers, vials or bags.' },
    onHand: { label: 'On hand', help: 'Units in stock at the start.' },
    usagePerDay: {
      label: 'Usage per day',
      help: 'Units used on a normal day, before any allocation.',
    },
    horizonDays: { label: 'Days to model', help: '2 to 60 days.' },
    deliveries: {
      label: 'Deliveries',
      help: 'Each item: day (from the start) and quantity that arrives at the start of that day.',
    },
    allocationChanges: {
      label: 'Allocation changes',
      help: 'Each item: day and percent (0 to 100) of usage served from that day on.',
    },
  },
  generate(p) {
    const run = runShortage(p)
    const t0 = Date.parse(p.startDate)
    const at = (day: number): string => iso(t0 + day * DAY_MS)
    const range = { start: at(0), end: at(p.horizonDays) }
    const events = [
      event(at(0), 'shortage-model', 'shortage_model', { params: p }),
      ...run.days.map((d) =>
        event(at(d.day), `shortage-day-${d.day}`, 'shortage_day', {
          day: d.day,
          demand: d.demand,
          served: d.served,
          unmet: d.unmet,
          allocationPercent: d.allocationPercent,
        }),
      ),
      ...(run.stockoutDay === undefined
        ? []
        : [
            event(at(run.stockoutDay), 'stockout', 'stockout', {
              day: run.stockoutDay,
              drug: p.drug,
            }),
          ]),
    ]
    return [
      {
        id: 'pharmacy-stock',
        label: `Simulated stock and days on hand, ${p.drug}`,
        kind: 'series',
        unit: p.unit,
        range,
        data: run.days.map((d) => ({
          t: at(d.day),
          v: {
            stock: d.stock,
            ...(d.daysOnHand === undefined ? {} : { daysOnHand: d.daysOnHand }),
          },
        })),
      },
      {
        id: 'pharmacy-shortage-events',
        label:
          'Simulated shortage events: each day served and unmet, and the stockout (for scoring)',
        kind: 'reports',
        range,
        data: events,
      },
    ] satisfies GeneratedDataset[]
  },
}

const queueGenerator: SimulatedGenerator<QueueParams> = {
  id: 'pharmacy-queue',
  label: 'Simulated pharmacy queue (arrivals, staff, age of the oldest item)',
  params: QueueParams,
  description:
    'Models one pharmacy work queue (verification, fill, claims) minute by minute from arrivals, surges and staff. Writes the item count and the age of the oldest item as a series, and the first time over target and the peak as scoring events.',
  toolkits: ['pharmacy'],
  example: {
    startDate: '2026-11-09T08:30:00Z',
    queue: 'Verification',
    minutes: 240,
    stepMinutes: 15,
    arrivalsPerHour: 24,
    serviceMinutes: 4,
    staff: 1,
    surges: [{ fromMinute: 30, toMinute: 120, arrivalsPerHour: 40 }],
    staffChanges: [{ atMinute: 60, staff: 3 }],
    targetMinutes: 20,
    seed: 7,
  } satisfies z.input<typeof QueueParams>,
  fields: {
    startDate: { label: 'Start (UTC)', help: 'Minute 0 of the queue.' },
    queue: { label: 'Queue', help: 'Name of the work queue, e.g. Verification or Claims.' },
    minutes: { label: 'Length (minutes)', help: '30 to 1440.' },
    stepMinutes: { label: 'Step (minutes)', help: 'Minutes between points, 5 to 60.' },
    arrivalsPerHour: {
      label: 'Arrivals per hour',
      help: 'Items that join the queue each hour, 0 to 240.',
    },
    serviceMinutes: {
      label: 'Minutes per item',
      help: 'Minutes one staff member needs for one item.',
    },
    staff: { label: 'Staff', help: 'People working the queue at the start, 0 to 20.' },
    surges: {
      label: 'Surges',
      help: 'Each item: fromMinute, toMinute and the arrivalsPerHour during that window (a backlog released, a lunch rush).',
    },
    staffChanges: {
      label: 'Staff changes',
      help: 'Each item: atMinute and the number of staff from then on.',
    },
    targetMinutes: {
      label: 'Target age (minutes)',
      help: 'The oldest item should be younger than this.',
    },
    seed: { label: 'Seed', help: 'Any whole number; the same seed gives the same queue.' },
  },
  generate(p) {
    const run = runQueue(p)
    const t0 = Date.parse(p.startDate)
    const at = (minute: number): string => iso(t0 + minute * MINUTE_MS)
    const range = { start: at(0), end: at(p.minutes) }
    return [
      {
        id: 'pharmacy-queue',
        label: `Simulated ${p.queue} queue: items and age of the oldest`,
        kind: 'series',
        unit: 'items, minutes',
        range,
        data: run.points.map((x) => ({
          t: at(x.minute),
          v: { count: x.count, oldestMinutes: x.oldestMinutes },
        })),
      },
      {
        id: 'pharmacy-queue-events',
        label: 'Simulated queue events: first time over target and the peak (for scoring)',
        kind: 'reports',
        range,
        data: [
          event(at(0), 'queue-model', 'queue_model', { params: p }),
          ...(run.firstOverTarget === undefined
            ? []
            : [
                event(at(run.firstOverTarget), 'queue-over-target', 'queue_over_target', {
                  minute: run.firstOverTarget,
                  targetMinutes: p.targetMinutes,
                }),
              ]),
          event(at(run.peak.minute), 'queue-peak', 'queue_peak', {
            oldestMinutes: run.peak.oldestMinutes,
            count: run.peak.count,
          }),
        ],
      },
    ] satisfies GeneratedDataset[]
  },
}

const coldChainGenerator: SimulatedGenerator<ColdChainParams> = {
  id: 'pharmacy-cold-chain',
  label: 'Simulated cold chain failure (unit temperature and product viability)',
  params: ColdChainParams,
  description:
    "A refrigerator or freezer holds its setpoint, warms toward the room when cooling fails and cools again if it returns. Writes the probe temperature as a series, a viability table for the scenario's fictional products, and the failure, first alarm and viability as scoring events.",
  toolkits: ['pharmacy'],
  example: {
    startDate: '2026-11-08T22:00:00Z',
    unit: 'Refrigerator R-2',
    lowC: 2,
    highC: 8,
    setpointC: 4.2,
    ambientC: 21,
    minutes: 480,
    stepMinutes: 10,
    failureMinute: 240,
    restoreMinute: 330,
    warmingTimeConstantMin: 240,
    coolingTimeConstantMin: 90,
    doorOpenings: [
      { minute: 60, bumpC: 1.5 },
      { minute: 270, bumpC: 2 },
    ],
    products: [
      {
        name: 'Pediatric vaccine A (fictional)',
        lot: 'EX-A-4410',
        doses: 60,
        maxC: 12,
        allowedMinutesAbove: 360,
      },
      {
        name: 'Pediatric vaccine B (fictional)',
        lot: 'EX-B-1187',
        doses: 40,
        maxC: 8,
        allowedMinutesAbove: 0,
      },
    ],
    seed: 11,
  } satisfies z.input<typeof ColdChainParams>,
  fields: {
    startDate: { label: 'Start (UTC)', help: 'Minute 0 of the run.' },
    unit: { label: 'Storage unit', help: 'Name of the refrigerator or freezer.' },
    lowC: { label: 'Range low (°C)', help: 'Lowest allowed temperature of the unit.' },
    highC: { label: 'Range high (°C)', help: 'Highest allowed temperature of the unit.' },
    setpointC: { label: 'Setpoint (°C)', help: 'Temperature the unit holds while cooling.' },
    ambientC: {
      label: 'Room (°C)',
      help: 'Room temperature the unit warms toward when cooling stops.',
    },
    minutes: { label: 'Length (minutes)', help: '60 to 2880.' },
    stepMinutes: { label: 'Step (minutes)', help: 'Minutes between probe readings, 1 to 60.' },
    failureMinute: {
      label: 'Failure minute',
      help: 'Minute the unit stops cooling (a tripped breaker, a compressor failure).',
    },
    restoreMinute: {
      label: 'Restore minute',
      help: 'Minute cooling returns; leave empty if it does not within the run.',
    },
    warmingTimeConstantMin: {
      label: 'Warming time (minutes)',
      help: 'Minutes for the unit to close 63 percent of the gap to the room when not cooling.',
    },
    coolingTimeConstantMin: {
      label: 'Cooling time (minutes)',
      help: 'Minutes to close 63 percent of the gap back to the setpoint once cooling returns.',
    },
    doorOpenings: {
      label: 'Door openings',
      help: 'Each item: minute and bumpC, the short rise in °C (0 to 10).',
    },
    products: {
      label: 'Products',
      help: 'Each item: name, lot, doses, maxC (highest temperature the scenario allows) and allowedMinutesAbove. Fictional exercise values, not manufacturer data.',
    },
    seed: { label: 'Seed', help: 'Any whole number; the same seed gives the same readings.' },
  },
  generate(p) {
    const run = runColdChain(p)
    const t0 = Date.parse(p.startDate)
    const at = (minute: number): string => iso(t0 + minute * MINUTE_MS)
    const range = { start: at(0), end: at(p.minutes) }
    return [
      {
        id: 'pharmacy-cold-probe',
        label: `Simulated probe temperature, ${p.unit}`,
        kind: 'series',
        unit: '°C',
        range,
        data: run.probe.map((x) => ({ t: at(x.minute), v: x.tempC })),
      },
      {
        id: 'pharmacy-cold-viability',
        label: 'Simulated viability table for the scenario’s fictional products',
        kind: 'reports',
        range,
        data: run.viability.map((v) => ({
          t: at(p.minutes),
          title: `${v.product}, lot ${v.lot}`,
          text:
            `EXERCISE ONLY. Fictional product and lot.\n${v.doses} doses; ${v.minutesAboveMax} minutes above the scenario's highest temperature.\n` +
            `Scenario table: ${v.usable ? 'usable' : 'not usable'}. Unit range ${p.lowC} to ${p.highC} °C (${Math.round(cToF(p.lowC))} to ${Math.round(cToF(p.highC))} °F).`,
        })),
      },
      {
        id: 'pharmacy-cold-events',
        label:
          'Simulated cold chain events: failure, first reading out of range, peak and viability (for scoring)',
        kind: 'reports',
        range,
        data: [
          event(at(0), 'cold-model', 'cold_chain_model', {
            params: { ...p, products: p.products },
          }),
          event(at(p.failureMinute), 'unit-failure', 'unit_failure', { unit: p.unit }),
          ...(run.firstOutOfRange === undefined
            ? []
            : [
                event(at(run.firstOutOfRange), 'alarm', 'alarm', {
                  unit: p.unit,
                  minute: run.firstOutOfRange,
                }),
              ]),
          event(at(p.minutes), 'cold-summary', 'cold_chain_summary', {
            maxC: run.maxC,
            minC: run.minC,
            minutesOutside: run.minutesOutside,
          }),
          ...run.viability.map((v) =>
            event(at(p.minutes), `viability-${v.lot}`, 'product_viability', {
              product: v.product,
              lot: v.lot,
              doses: v.doses,
              usable: v.usable,
              minutesAboveMax: v.minutesAboveMax,
            }),
          ),
        ],
      },
    ] satisfies GeneratedDataset[]
  },
}

const diversionGenerator: SimulatedGenerator<DiversionParams> = {
  id: 'pharmacy-diversion',
  label: 'Simulated controlled substance usage (one user diverges from peers)',
  params: DiversionParams,
  description:
    'Builds controlled substance removals for a unit in which one fictional user code removes more than peers, part of it explained by a float assignment or a cabinet outage. Writes removals by user and hour, and the discovery with what is explained, as scoring events.',
  toolkits: ['pharmacy'],
  example: {
    startDate: '2026-10-06T00:00:00Z',
    days: 30,
    peers: 7,
    multiple: 2.4,
    floatDays: 10,
    outageHours: 4,
    discoveryDay: 30,
    seed: 23,
  } satisfies z.input<typeof DiversionParams>,
  fields: {
    startDate: { label: 'Start (UTC)', help: 'First day of the period.' },
    days: { label: 'Days', help: 'Length of the period, 7 to 90.' },
    peers: { label: 'Peers', help: 'Number of peer users on the unit, 3 to 20.' },
    multiple: {
      label: 'Times the peer median',
      help: 'How many times the peer median the divergent user removes, 1 to 10.',
    },
    floatDays: {
      label: 'Float days',
      help: 'Days the user floated to a busier unit; that extra volume is innocent.',
    },
    outageHours: {
      label: 'Cabinet outage (hours)',
      help: 'Hours of cabinet outage in the period, when every user overrides.',
    },
    discoveryDay: {
      label: 'Discovery day',
      help: 'Day from the start on which the pattern is first reported.',
    },
    seed: { label: 'Seed', help: 'Any whole number; the same seed gives the same removals.' },
  },
  generate(p) {
    const run = runDiversion(p)
    const t0 = Date.parse(p.startDate)
    const range = { start: iso(t0), end: run.discoveryTime }
    return [
      {
        id: 'pharmacy-usage-by-user',
        label: 'Simulated controlled substance removals by user and hour (fictional user codes)',
        kind: 'reports',
        range,
        data: run.users.map((u) => ({
          t: run.discoveryTime,
          title: u.user,
          text:
            `EXERCISE ONLY. Fictional user code; presumed innocent.\n${u.total} removals; peer median ${run.peerMedianTotal}; ` +
            `${u.overrides} overrides; ${u.wastes} wastes; ${u.discrepancies} unresolved discrepancies.\nBy hour: ${u.byHour.join(', ')}`,
        })),
      },
      {
        id: 'pharmacy-diversion-events',
        label:
          'Simulated diversion events: the pattern, what the data explains and the discovery (for scoring)',
        kind: 'reports',
        range,
        data: [
          event(iso(t0), 'diversion-model', 'diversion_model', { params: p }),
          event(run.discoveryTime, 'discovery', 'discovery', {
            user: run.divergentUser,
            removals: run.users[0]!.total,
            peerMedian: run.peerMedianTotal,
            explainedByFloat: run.explainedByFloat,
            unexplained: run.unexplained,
          }),
        ],
      },
    ] satisfies GeneratedDataset[]
  },
}

const recallGenerator: SimulatedGenerator<RecallParams> = {
  id: 'pharmacy-recall',
  label: 'Simulated drug recall (lots received, dispensed, on hand and patients to contact)',
  params: RecallParams,
  description:
    'A recall notice for a fictional product with the lots received, dispensed, on hand and returned. Writes a response log by lot and the notice with the units to find and patients to contact as scoring events.',
  toolkits: ['pharmacy', 'logistics'],
  example: {
    startDate: '2026-11-05T21:30:00Z',
    product: 'Ondansetron injection, 4 mg/2 mL vial (fictional lots)',
    lots: [
      {
        lot: 'EX-30417',
        expiration: '2027-06',
        received: 600,
        dispensed: 412,
        onHand: 188,
        returned: 0,
        where: 'Central pharmacy shelf C4; ED cabinet',
      },
      {
        lot: 'EX-30418',
        expiration: '2027-06',
        received: 400,
        dispensed: 355,
        onHand: 40,
        returned: 5,
        where: 'Surgical services cabinet',
      },
    ],
    patientShare: 0.85,
  } satisfies z.input<typeof RecallParams>,
  fields: {
    startDate: { label: 'Notice received (UTC)' },
    product: { label: 'Product', help: 'Name and strength of the recalled product.' },
    lots: {
      label: 'Lots',
      help: 'Each item: lot, expiration (YYYY-MM), received, dispensed, onHand, returned and where it is stored. Dispensed, on hand and returned must add up to received.',
    },
    patientShare: {
      label: 'Patient share',
      help: 'Share of dispensed units that reached a distinct patient to contact, 0 to 1.',
    },
  },
  generate(p) {
    const run = runRecall(p)
    const range = { start: p.startDate, end: p.startDate }
    return [
      {
        id: 'pharmacy-recall-lots',
        label: 'Simulated recall response log by lot (fictional lots)',
        kind: 'reports',
        range,
        data: p.lots.map((l) => ({
          t: p.startDate,
          title: `Lot ${l.lot}`,
          text:
            `EXERCISE ONLY. Fictional lot.\n${p.product}\nReceived ${l.received}; dispensed ${l.dispensed}; on hand ${l.onHand}; returned ${l.returned}.\n` +
            `Expires ${l.expiration}. Where: ${l.where}.`,
        })),
      },
      {
        id: 'pharmacy-recall-events',
        label: 'Simulated recall events: the notice and what must be found (for scoring)',
        kind: 'reports',
        range,
        data: [
          event(p.startDate, 'recall-model', 'recall_model', { params: p }),
          event(p.startDate, 'recall-notice', 'recall_notice', {
            product: p.product,
            lots: p.lots.length,
            onHand: run.totalOnHand,
            dispensed: run.totalDispensed,
            patientsToContact: run.patientsToContact,
          }),
        ],
      },
    ] satisfies GeneratedDataset[]
  },
}

export const PHARMACY_GENERATORS = [
  shortageGenerator,
  queueGenerator,
  coldChainGenerator,
  diversionGenerator,
  recallGenerator,
] as SimulatedGenerator<never>[]
