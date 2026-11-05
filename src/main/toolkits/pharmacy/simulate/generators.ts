// The pharmacy simulations as case-data generators (spec 0448 FR-10, spec 0463 FR-8). Each is a
// pure function of its parameters; the framework labels the output simulated, so none of it can
// pass as historical. Ground-truth events carry the model's own parameters (`*_model` events) so
// the metrics can rerun the model with the team's decisions and compare. Users, lots, units and
// products are fictional and say so.
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
