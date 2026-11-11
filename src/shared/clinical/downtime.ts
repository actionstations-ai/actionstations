// Simulated downtime model and consequence rules (spec 0451 FR-7, FR-11, issue #879). For a
// fictional hospital, parameters give consistent hourly case data: arrivals, queue growth and
// drain per feed, the backlog at recovery and seeded discrepancies, all labeled simulated.
// Decisions then change that data through a small table of explainable rules; the facilitator
// sees the rule that fired and can override it. It is a rules table, not a model of real
// systems. Deterministic for a seed; pure: no Node imports, no clock.
import { makeRng } from './synthetic'

export const SIMULATED_LABEL = 'Simulated data (exercise)'

/** Messages one hundred beds generate per hour at the daytime peak, by feed (an exercise default). */
export const BASE_RATES_PER_100_BEDS: Record<string, number> = {
  lab_results: 240,
  orders: 180,
  adt: 40,
  pharmacy: 120,
  radiology: 30,
}

/** Relative load by hour of day (0 to 23): quiet at night, busy mid-morning. */
export const HOURLY_LOAD: readonly number[] = [
  0.45, 0.4, 0.4, 0.4, 0.45, 0.6, 0.85, 1.1, 1.3, 1.3, 1.25, 1.2, 1.15, 1.15, 1.1, 1.05, 1.0, 0.95,
  0.9, 0.8, 0.7, 0.6, 0.5, 0.45,
]

/** Multiple of the arrival rate a restored feed drains at. */
export const DRAIN_MULTIPLE = 3

export type FeedId = keyof typeof BASE_RATES_PER_100_BEDS

export interface DowntimeParams {
  seed: number
  beds: number
  /** Hour of day (0-23) the failure starts. */
  startHour: number
  durationHours: number
  /** Feeds that stop during the failure. */
  failedFeeds: FeedId[]
  /** Whether messages queued in the interface engine are lost when it fails. */
  dataLost: boolean
}

export interface HourRow {
  /** Hours since the failure began (0 = the first hour). */
  hour: number
  clockHour: number
  arrivals: Record<string, number>
  queue: Record<string, number>
  /** Whether the failure is in effect during this hour. */
  down: boolean
}

export interface DowntimeCase {
  label: typeof SIMULATED_LABEL
  params: DowntimeParams
  /** Scale applied to the 100-bed base rates, shown to the facilitator. */
  bedMultiplier: number
  hours: HourRow[]
  /** Queue size per feed at the moment service returns. */
  backlogAtRecovery: Record<string, number>
  /** Hours after recovery until each failed feed drains. */
  drainHours: Record<string, number>
  lost: Record<string, number>
}

export const bedMultiplier = (beds: number): number => beds / 100

export function hourlyArrivals(beds: number, clockHour: number, feed: FeedId): number {
  const base = BASE_RATES_PER_100_BEDS[feed]!
  return Math.round(base * bedMultiplier(beds) * HOURLY_LOAD[((clockHour % 24) + 24) % 24]!)
}

/** Build the hour-by-hour case: queue = previous queue + arrivals - drain, never below zero. */
export function simulateDowntime(p: DowntimeParams): DowntimeCase {
  const feeds = Object.keys(BASE_RATES_PER_100_BEDS) as FeedId[]
  const queue: Record<string, number> = Object.fromEntries(feeds.map((f) => [f, 0]))
  const lost: Record<string, number> = {}
  const hours: HourRow[] = []
  const totalHours = p.durationHours + 12
  let backlog: Record<string, number> = {}
  for (let h = 0; h < totalHours; h++) {
    const clock = (p.startHour + h) % 24
    const down = h < p.durationHours
    const arrivals: Record<string, number> = {}
    for (const f of feeds) {
      const a = hourlyArrivals(p.beds, clock, f)
      arrivals[f] = a
      if (down && p.failedFeeds.includes(f)) {
        if (p.dataLost) lost[f] = (lost[f] ?? 0) + a
        else queue[f] = queue[f]! + a
      } else {
        queue[f] = Math.max(0, queue[f]! + a - a * (1 + DRAIN_MULTIPLE))
      }
    }
    if (h === p.durationHours)
      backlog = { ...Object.fromEntries(feeds.map((f) => [f, 0])), ...hours[h - 1]?.queue }
    hours.push({ hour: h, clockHour: clock, arrivals, queue: { ...queue }, down })
  }
  const drainHours: Record<string, number> = {}
  for (const f of p.failedFeeds) {
    const back = backlog[f] ?? 0
    const rate = hourlyArrivals(p.beds, (p.startHour + p.durationHours) % 24, f) * DRAIN_MULTIPLE
    drainHours[f] = rate === 0 ? 0 : Math.ceil(back / rate)
  }
  return {
    label: SIMULATED_LABEL,
    params: p,
    bedMultiplier: bedMultiplier(p.beds),
    hours,
    backlogAtRecovery: backlog,
    drainHours,
    lost,
  }
}

// ---- seeded discrepancies --------------------------------------------------------------------

export type DiscrepancyKind = 'duplicate_record' | 'wrong_patient_result' | 'order_sent_twice'

export interface Discrepancy {
  id: string
  kind: DiscrepancyKind
  /** Indexes into the scenario's synthetic patients. */
  patients: number[]
  description: string
}

/** Seeded discrepancies for the reconciliation play: always at least one of each kind. */
export function seedDiscrepancies(seed: number, patientCount: number, extra = 0): Discrepancy[] {
  const rng = makeRng(seed ^ 0x9e3779b9)
  const idx = () => Math.floor(rng() * Math.max(1, patientCount))
  const out: Discrepancy[] = []
  const add = (kind: DiscrepancyKind, patients: number[], description: string) =>
    out.push({ id: `D${out.length + 1}`, kind, patients, description })
  add(
    'duplicate_record',
    [idx()],
    'A second record was created for a patient registered during downtime.',
  )
  const a = idx()
  add(
    'wrong_patient_result',
    [a, (a + 1) % Math.max(2, patientCount)],
    'A result filed to one patient belongs to the patient in the next bed.',
  )
  add(
    'order_sent_twice',
    [idx()],
    'An order written on paper was also entered after recovery and sent twice.',
  )
  const kinds: DiscrepancyKind[] = ['duplicate_record', 'wrong_patient_result', 'order_sent_twice']
  for (let i = 0; i < extra; i++)
    add(kinds[i % 3]!, [idx()], 'Another discrepancy found during back-entry.')
  return out
}

// ---- consequence rules -----------------------------------------------------------------------

export interface ClinicalState {
  /** Results waiting at recovery. */
  resultsBacklog: number
  /** Chance (0-100) that a released result attaches to the wrong patient. */
  wrongPatientRisk: number
  /** Duplicate records expected to be created in back-entry. */
  duplicatesExpected: number
  /** Orders recorded as at risk because their messages were discarded. */
  ordersAtRisk: number
  /** Hours results are held before release. */
  resultHoldHours: number
}

export interface RestoreDecision {
  kind: 'restore_order'
  /**
   * Systems first to last, using 'identity_check', 'lab_interface', 'ehr', 'pharmacy_interface'.
   * The toolkit's default clinician priority is that order: match downtime registrations to the
   * master patient index, let results catch up, open the chart to clinicians, then send
   * medication orders to pharmacy and the cabinets once active orders are back-entered.
   */
  order: string[]
}
export interface MessageDecision {
  kind: 'message_disposition'
  feed: string
  action: 'hold' | 'replay' | 'discard'
  queued: number
}
export interface ReleaseDecision {
  kind: 'result_release'
  action: 'release_now' | 'hold_until_validated'
  holdHours?: number
}
export type ClinicalDecision = RestoreDecision | MessageDecision | ReleaseDecision

export interface ConsequenceRule {
  id: string
  label: string
  explanation: string
  applies: (d: ClinicalDecision, s: ClinicalState) => boolean
  apply: (d: ClinicalDecision, s: ClinicalState) => ClinicalState
}

const before = (order: string[], a: string, b: string): boolean => {
  const ia = order.indexOf(a)
  const ib = order.indexOf(b)
  return ia !== -1 && (ib === -1 || ia < ib)
}

export const CONSEQUENCE_RULES: readonly ConsequenceRule[] = [
  {
    id: 'ehr_before_lab_interface',
    label: 'EHR opened to clinicians before the lab interface',
    explanation:
      'Clinicians work in a live chart that looks complete while laboratory results are still queued: results are missed and tests are ordered again, so the results backlog is larger when the interface returns.',
    applies: (d) => d.kind === 'restore_order' && before(d.order, 'ehr', 'lab_interface'),
    apply: (_d, s) => ({
      ...s,
      resultsBacklog: Math.round(s.resultsBacklog * 1.5),
    }),
  },
  {
    id: 'lab_interface_before_identity_check',
    label: 'Results flow before the identity check',
    explanation:
      'Queued results file to the chart before patients registered on paper are matched to the master patient index, so a result can attach to a temporary record or to the wrong patient.',
    applies: (d) =>
      d.kind === 'restore_order' && before(d.order, 'lab_interface', 'identity_check'),
    apply: (_d, s) => ({
      ...s,
      wrongPatientRisk: Math.min(100, s.wrongPatientRisk + 20),
    }),
  },
  {
    id: 'replay_before_identity_check',
    label: 'Messages replayed before the identity check',
    explanation:
      'Replaying queued messages before downtime registrations are checked against the master index files messages to duplicate or mismatched records.',
    applies: (d) => d.kind === 'message_disposition' && d.action === 'replay',
    apply: (d, s) => ({
      ...s,
      duplicatesExpected:
        s.duplicatesExpected + Math.max(1, Math.round(((d as MessageDecision).queued ?? 0) / 200)),
    }),
  },
  {
    id: 'discard_message_class',
    label: 'A message class was discarded',
    explanation:
      'Discarded messages are gone from the queue, so the orders and results they carried are recorded as at risk until each is found on paper or re-sent.',
    applies: (d) => d.kind === 'message_disposition' && d.action === 'discard',
    apply: (d, s) => ({
      ...s,
      ordersAtRisk: s.ordersAtRisk + ((d as MessageDecision).queued ?? 0),
    }),
  },
  {
    id: 'hold_results',
    label: 'Results held until validated',
    explanation:
      'Holding results delays care by the hold time but lets the team validate identity first, which lowers the chance of a wrong-patient result.',
    applies: (d) => d.kind === 'result_release' && d.action === 'hold_until_validated',
    apply: (d, s) => ({
      ...s,
      resultHoldHours: s.resultHoldHours + ((d as ReleaseDecision).holdHours ?? 2),
      wrongPatientRisk: Math.round(s.wrongPatientRisk * 0.4),
    }),
  },
]

export interface FiredRule {
  ruleId: string
  label: string
  explanation: string
  /** True when the facilitator overrode the rule, so its effect was not applied. */
  overridden: boolean
}

export function initialState(c: DowntimeCase): ClinicalState {
  return {
    resultsBacklog: c.backlogAtRecovery.lab_results ?? 0,
    wrongPatientRisk: 10,
    duplicatesExpected: 0,
    ordersAtRisk: 0,
    resultHoldHours: 0,
  }
}

/**
 * Apply decisions in order. Every rule that applies is listed, so the facilitator sees why;
 * rules in `overrides` are listed as overridden and change nothing.
 */
export function applyDecisions(
  start: ClinicalState,
  decisions: readonly ClinicalDecision[],
  overrides: readonly string[] = [],
): { state: ClinicalState; fired: FiredRule[] } {
  let state = start
  const fired: FiredRule[] = []
  for (const d of decisions)
    for (const rule of CONSEQUENCE_RULES) {
      if (!rule.applies(d, state)) continue
      const overridden = overrides.includes(rule.id)
      if (!overridden) state = rule.apply(d, state)
      fired.push({ ruleId: rule.id, label: rule.label, explanation: rule.explanation, overridden })
    }
  return { state, fired }
}
