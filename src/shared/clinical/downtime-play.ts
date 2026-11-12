// The downtime model in play (issue #1130). The clinical downtime generator writes the failure as
// ground-truth events (`downtimeCaseEvents`); the first, `downtime_start`, carries the model's
// parameters, so live play, Facilitate and the evaluation rebuild the same case from it
// (`downtimeSetupFrom`). The decisions players record on the toolkit's forms then run through the
// consequence rules, and the seeded reconciliation discrepancies fall due as the units report
// back-entry progress (`downtimePlayStatus`). Pure: no Node imports, no clock.
import type { GroundTruthEvent } from '../schemas/metrics'
import {
  BASE_RATES_PER_100_BEDS,
  SIMULATED_LABEL,
  applyDecisions,
  hourlyArrivals,
  initialState,
  seedDiscrepancies,
  simulateDowntime,
  type ClinicalDecision,
  type ClinicalState,
  type DowntimeCase,
  type Discrepancy,
  type DiscrepancyKind,
  type FeedId,
  type FiredRule,
  CONSEQUENCE_RULES,
} from './downtime'
import { discrepancyText, releaseThreshold } from './reconciliation'
import { LAB_RANGES } from './reference'
import { generatePatients, makeRng, type SyntheticPatient } from './synthetic'

/** The ground-truth dataset the clinical downtime generator writes. */
export const DOWNTIME_EVENTS_DATASET = 'clinical-systems-events'

/** Who the discrepancies come from when they arrive on players' devices. */
export const DISCREPANCY_PERSONA = 'Health information management'

export const FEED_LABELS: Record<string, string> = {
  lab_results: 'Laboratory results',
  orders: 'Orders',
  adt: 'Registration (ADT)',
  pharmacy: 'Pharmacy orders',
  radiology: 'Radiology',
}

export interface DowntimeSetupParams {
  seed: number
  beds: number
  /** ISO time the systems fail (case time). */
  start: string
  durationHours: number
  failedFeeds: FeedId[]
  dataLost: boolean
  units: string[]
  patientCount: number
  extraDiscrepancies: number
  criticalResults: number
}

export interface DowntimeSetup {
  params: DowntimeSetupParams
  case: DowntimeCase
  recoveryAt: string
  patients: SyntheticPatient[]
  discrepancies: Discrepancy[]
  /** Paper items each unit has to enter after recovery. */
  paperItems: Record<string, number>
}

const MIN = 60_000
const addMin = (iso: string, minutes: number): string =>
  new Date(Date.parse(iso) + minutes * MIN).toISOString()

export const patientLabel = (p: SyntheticPatient | undefined): string =>
  p ? `${p.family}, ${p.given} (MRN ${p.mrn})` : 'a patient'

/** Rebuild the case, patients and discrepancies from the generator's parameters. */
export function downtimeSetup(params: DowntimeSetupParams): DowntimeSetup {
  const c = simulateDowntime({
    seed: params.seed,
    beds: params.beds,
    startHour: new Date(params.start).getUTCHours(),
    durationHours: params.durationHours,
    failedFeeds: params.failedFeeds,
    dataLost: params.dataLost,
  })
  const patients = generatePatients(params.seed, params.patientCount, {
    asOf: params.start.slice(0, 10),
  })
  const written = c.hours
    .filter((h) => h.down)
    .reduce((n, h) => n + (h.arrivals.orders ?? 0) + (h.arrivals.adt ?? 0), 0)
  const perUnit = Math.max(1, Math.round(written / Math.max(1, params.units.length)))
  return {
    params,
    case: c,
    recoveryAt: addMin(params.start, params.durationHours * 60),
    patients,
    discrepancies: seedDiscrepancies(params.seed, patients.length, params.extraDiscrepancies),
    paperItems: Object.fromEntries(params.units.map((u) => [u, perUnit])),
  }
}

const CRITICAL_TESTS: readonly { id: string; value: number }[] = [
  { id: 'potassium', value: 6.4 },
  { id: 'glucose', value: 38 },
  { id: 'hemoglobin', value: 6.5 },
  { id: 'sodium', value: 118 },
  { id: 'platelets', value: 15 },
  { id: 'inr', value: 5.6 },
]

function criticalResultEvents(s: DowntimeSetup): GroundTruthEvent[] {
  const { params, patients } = s
  const rng = makeRng(params.seed ^ 0x5bd1e995)
  const span = params.durationHours * 60
  return Array.from({ length: params.criticalResults }, (_, i) => {
    const test = CRITICAL_TESTS[i % CRITICAL_TESTS.length]!
    const range = LAB_RANGES.find((r) => r.id === test.id)!
    const patient = patients[Math.floor(rng() * patients.length)]
    const minute = Math.floor(((i + 0.5) * span) / params.criticalResults)
    return {
      id: `CR${i + 1}`,
      time: addMin(params.start, minute),
      kind: 'critical_result',
      attrs: {
        patient: patientLabel(patient),
        mrn: patient?.mrn ?? '',
        test: range.name,
        value: `${test.value.toFixed(range.decimals)} ${range.unit}`.trim(),
        simulated: true,
      },
    }
  })
}

/** The failure as ground-truth events, in time order. All are labeled simulated. */
export function downtimeCaseEvents(params: DowntimeSetupParams): GroundTruthEvent[] {
  const s = downtimeSetup(params)
  const at = params.start
  const ev = (id: string, time: string, kind: string, attrs: Record<string, unknown> = {}) => ({
    id,
    time,
    kind,
    attrs: { ...attrs, simulated: true },
  })
  const events: GroundTruthEvent[] = [
    ev('downtime-start', at, 'downtime_start', {
      system: 'EHR and clinical interfaces',
      label: SIMULATED_LABEL,
      setup: { ...params },
    }),
    ...params.units.map((u, i) => ({ ...ev(`unit-${i + 1}`, at, 'unit_listed'), area: u })),
    ...criticalResultEvents(s),
    ev('recovery', s.recoveryAt, 'system_recovered', {
      backlog: s.case.backlogAtRecovery,
      drainHours: s.case.drainHours,
    }),
    ...params.units.map((u, i) => ({
      ...ev(`paper-${i + 1}`, s.recoveryAt, 'reconciliation', {
        done: 0,
        remaining: s.paperItems[u] ?? 0,
      }),
      area: u,
    })),
  ]
  return events.sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
}

const FEEDS = Object.keys(BASE_RATES_PER_100_BEDS) as FeedId[]

const isSetup = (v: unknown): v is DowntimeSetupParams => {
  const o = v as Partial<DowntimeSetupParams> | null
  return (
    !!o &&
    typeof o.seed === 'number' &&
    typeof o.beds === 'number' &&
    typeof o.start === 'string' &&
    Number.isFinite(Date.parse(o.start)) &&
    typeof o.durationHours === 'number' &&
    Array.isArray(o.failedFeeds) &&
    o.failedFeeds.every((f) => FEEDS.includes(f as FeedId)) &&
    Array.isArray(o.units) &&
    typeof o.patientCount === 'number'
  )
}

/** The setup the first simulated `downtime_start` event carries, if any. */
export function downtimeSetupFrom(events: readonly GroundTruthEvent[]): DowntimeSetup | undefined {
  const start = events.find((e) => e.kind === 'downtime_start' && isSetup(e.attrs.setup))
  if (!start) return undefined
  const p = start.attrs.setup as DowntimeSetupParams
  return downtimeSetup({
    ...p,
    dataLost: !!p.dataLost,
    extraDiscrepancies: Number(p.extraDiscrepancies) || 0,
    criticalResults: Number(p.criticalResults) || 0,
  })
}

/** The hourly queue by feed, for the message queue series dataset. */
export function queueSeries(s: DowntimeSetup): { t: string; v: Record<string, number> }[] {
  return s.case.hours.map((h) => ({ t: addMin(s.params.start, h.hour * 60), v: { ...h.queue } }))
}

export { hourlyArrivals }

// ---- decisions -------------------------------------------------------------------------------

/** A recorded decision as live play, Facilitate and the evaluation hold it. */
export interface PlayDecisionLike {
  id?: string
  kind: string
  time: string
  fields: Record<string, unknown>
}

const words = (v: unknown): string => String(v ?? '').toLowerCase()
const key = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** A system as the consequence rules name it: "Lab interface" and "results" are lab_interface. */
export function systemOf(text: string): string {
  const t = words(text)
  if (/identity|master patient|\bmpi\b|empi|registration match/.test(t)) return 'identity_check'
  if (/pharm|cabinet|medication/.test(t)) return 'pharmacy_interface'
  if (/\blab|result/.test(t)) return 'lab_interface'
  if (/\behr\b|chart|electronic health record|clinical documentation/.test(t)) return 'ehr'
  return key(t)
}

/** The feed a free-text interface or message class names, if any. */
export function feedOf(text: string): FeedId | undefined {
  const t = words(text)
  if (/pharm|medication|dispens/.test(t)) return 'pharmacy'
  if (/\blab|result|oru/.test(t)) return 'lab_results'
  if (/radiol|imaging/.test(t)) return 'radiology'
  if (/\badt\b|registration|admit|transfer/.test(t)) return 'adt'
  if (/order|orm/.test(t)) return 'orders'
  return undefined
}

const listOf = (text: unknown): string[] =>
  String(text ?? '')
    .split(/[,>;\n]|\bthen\b/)
    .map((s) => s.trim())
    .filter(Boolean)

const byTime = <T extends { time: string }>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))

const latest = (decisions: readonly PlayDecisionLike[], kind: string) =>
  byTime(decisions.filter((d) => d.kind === kind)).at(-1)

function dispositions(s: DowntimeSetup, decisions: readonly PlayDecisionLike[]) {
  const perFeed = new Map<FeedId, ClinicalDecision>()
  for (const d of byTime(decisions.filter((x) => x.kind === 'message_disposition'))) {
    const feed = feedOf(`${words(d.fields.feed)} ${words(d.fields.message_class)}`)
    const action = key(words(d.fields.action))
    if (!feed || (action !== 'hold' && action !== 'replay' && action !== 'discard')) continue
    const given = Number(d.fields.orders_at_risk)
    const queued =
      Number.isFinite(given) && given > 0
        ? given
        : (s.case.backlogAtRecovery[feed] ?? s.case.lost[feed] ?? 0)
    perFeed.set(feed, { kind: 'message_disposition', feed, action, queued })
  }
  return perFeed
}

/**
 * The model's view of the decisions: the latest restore order, the latest disposition of each
 * feed and the latest release decision. A revised decision replaces the one before it, so a
 * rule fires once for what the players settled on.
 */
export function clinicalDecisionsOf(
  s: DowntimeSetup,
  decisions: readonly PlayDecisionLike[],
): { decisions: ClinicalDecision[]; dispositions: Map<FeedId, ClinicalDecision> } {
  const out: ClinicalDecision[] = []
  const order = latest(decisions, 'set_restore_order')
  if (order) out.push({ kind: 'restore_order', order: listOf(order.fields.ranking).map(systemOf) })
  const perFeed = dispositions(s, decisions)
  out.push(...perFeed.values())
  const release = latest(decisions, 'result_release')
  const action = release ? key(words(release.fields.action)) : ''
  if (action === 'release_now' || action === 'hold_until_validated')
    out.push({ kind: 'result_release', action, holdHours: 2 })
  return { decisions: out, dispositions: perFeed }
}

/** A choice as live play stores it: the option id, a slug of the label cut to 40 characters. */
const optionId = (s: string): string => key(s).slice(0, 40).replace(/_+$/, '')

/** Rule ids the facilitator has overridden: the latest override decision per rule wins. */
export function overridesOf(decisions: readonly PlayDecisionLike[]): string[] {
  const state = new Map<string, boolean>()
  for (const d of byTime(decisions.filter((x) => x.kind === 'override_consequence'))) {
    const given = optionId(words(d.fields.rule))
    const rule = CONSEQUENCE_RULES.find((r) => optionId(r.label) === given || r.id === given)
    if (rule) state.set(rule.id, !key(words(d.fields.action)).startsWith('let'))
  }
  return [...state].filter(([, on]) => on).map(([id]) => id)
}

// ---- status ----------------------------------------------------------------------------------

export interface UnitBackEntry {
  unit: string
  done: number
  remaining: number
  /** False while the unit shows the simulated paper count, not a report. */
  reported: boolean
}

export interface DiscrepancyStatus {
  id: string
  kind: DiscrepancyKind
  threshold: number
  text: string
  /** When back-entry reached the threshold; absent while it is not due. */
  dueAt?: string
}

export interface DowntimePlayStatus {
  label: typeof SIMULATED_LABEL
  start: string
  recoveryAt: string
  failedFeeds: FeedId[]
  dataLost: boolean
  backlogAtRecovery: Record<string, number>
  drainHours: Record<string, number>
  lost: Record<string, number>
  baseline: ClinicalState
  state: ClinicalState
  fired: FiredRule[]
  units: UnitBackEntry[]
  percent: number
  closedAt?: string
  discrepancies: DiscrepancyStatus[]
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Back-entry by unit: the simulated paper count until a unit reports, then its latest report. */
export function backEntry(
  s: DowntimeSetup,
  decisions: readonly PlayDecisionLike[],
): UnitBackEntry[] {
  const units = new Map<string, UnitBackEntry>()
  for (const u of s.params.units)
    units.set(key(u), { unit: u, done: 0, remaining: s.paperItems[u] ?? 0, reported: false })
  for (const d of byTime(decisions.filter((x) => x.kind === 'reconcile_unit'))) {
    const name = String(d.fields.unit ?? '').trim()
    if (!name) continue
    const k = key(name)
    units.set(k, {
      unit: units.get(k)?.unit ?? name,
      done: num(d.fields.done),
      remaining: num(d.fields.remaining),
      reported: true,
    })
  }
  return [...units.values()]
}

const percentOf = (units: readonly UnitBackEntry[]): number => {
  const done = units.reduce((a, u) => a + u.done, 0)
  const total = done + units.reduce((a, u) => a + u.remaining, 0)
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

/** When each discrepancy fell due: the first progress report that reached its threshold. */
function dueTimes(
  s: DowntimeSetup,
  decisions: readonly PlayDecisionLike[],
  closedAt: string | undefined,
): Map<string, string> {
  const due = new Map<string, string>()
  const reports = byTime(decisions.filter((d) => d.kind === 'reconcile_unit'))
  const n = s.discrepancies.length
  for (const r of reports) {
    if (closedAt && Date.parse(r.time) >= Date.parse(closedAt)) break
    const upTo = decisions.filter(
      (d) => d.kind === 'reconcile_unit' && Date.parse(d.time) <= Date.parse(r.time),
    )
    const percent = percentOf(backEntry(s, upTo))
    s.discrepancies.forEach((d, i) => {
      if (!due.has(d.id) && percent >= releaseThreshold(i, n)) due.set(d.id, r.time)
    })
  }
  return due
}

/** Where the simulated downtime stands after these decisions. */
export function downtimePlayStatus(
  s: DowntimeSetup,
  decisions: readonly PlayDecisionLike[],
): DowntimePlayStatus {
  const baseline = initialState(s.case)
  const { state, fired } = applyDecisions(
    baseline,
    clinicalDecisionsOf(s, decisions).decisions,
    overridesOf(decisions),
  )
  const closedAt = byTime(decisions.filter((d) => d.kind === 'close_reconciliation'))[0]?.time
  const due = dueTimes(s, decisions, closedAt)
  const units = backEntry(s, decisions)
  return {
    label: SIMULATED_LABEL,
    start: s.params.start,
    recoveryAt: s.recoveryAt,
    failedFeeds: s.params.failedFeeds,
    dataLost: s.params.dataLost,
    backlogAtRecovery: s.case.backlogAtRecovery,
    drainHours: s.case.drainHours,
    lost: s.case.lost,
    baseline,
    state,
    fired,
    units,
    percent: percentOf(units),
    ...(closedAt ? { closedAt } : {}),
    discrepancies: s.discrepancies.map((d, i) => ({
      id: d.id,
      kind: d.kind,
      threshold: releaseThreshold(i, s.discrepancies.length),
      text: discrepancyText(d, s.patients),
      ...(due.has(d.id) ? { dueAt: due.get(d.id)! } : {}),
    })),
  }
}

// ---- events for the measures -----------------------------------------------------------------

function messageOutcome(
  s: DowntimeSetup,
  feed: FeedId,
  disposition: ClinicalDecision | undefined,
): 'lost' | 'delayed' | 'ok' {
  if (s.params.dataLost) return 'lost'
  if (disposition?.kind !== 'message_disposition') return 'delayed'
  return disposition.action === 'discard'
    ? 'lost'
    : disposition.action === 'hold'
      ? 'delayed'
      : 'ok'
}

/** Orders and results of each failed feed at recovery, by what was decided for them. */
function orderResultEvents(
  s: DowntimeSetup,
  status: DowntimePlayStatus,
  decisions: readonly PlayDecisionLike[],
): GroundTruthEvent[] {
  const perFeed = clinicalDecisionsOf(s, decisions).dispositions
  const held = status.state.resultHoldHours > 0
  const out: GroundTruthEvent[] = s.params.failedFeeds.map((feed) => {
    let outcome = messageOutcome(s, feed, perFeed.get(feed))
    if (outcome === 'ok' && feed === 'lab_results' && held) outcome = 'delayed'
    const count = s.params.dataLost
      ? (s.case.lost[feed] ?? 0)
      : (s.case.backlogAtRecovery[feed] ?? 0)
    return {
      id: `messages-${feed}`,
      time: s.recoveryAt,
      kind: 'order_result_record',
      attrs: { messageClass: FEED_LABELS[feed] ?? feed, outcome, count, simulated: true },
    }
  })
  const reordered = status.state.resultsBacklog - status.baseline.resultsBacklog
  if (reordered > 0)
    out.push({
      id: 'messages-reordered-tests',
      time: s.recoveryAt,
      kind: 'order_result_record',
      attrs: {
        messageClass: FEED_LABELS.lab_results!,
        outcome: 'duplicated',
        count: reordered,
        simulated: true,
      },
    })
  return out
}

/**
 * The events the downtime model adds for the measures once decisions are known: what happened to
 * the queued orders and results, the duplicate records that surfaced during back-entry, and how
 * many duplicates the model expected.
 */
export function downtimeDerivedEvents(
  s: DowntimeSetup,
  decisions: readonly PlayDecisionLike[],
): GroundTruthEvent[] {
  const status = downtimePlayStatus(s, decisions)
  const seededDuplicates = s.discrepancies.filter((d) => d.kind === 'duplicate_record')
  const surfaced = status.discrepancies.filter((d) => d.kind === 'duplicate_record' && d.dueAt)
  return [
    ...orderResultEvents(s, status, decisions),
    ...surfaced.map((d) => ({
      id: `duplicate-${d.id}`,
      time: d.dueAt!,
      kind: 'duplicate_record_created',
      attrs: { discrepancy: d.id, simulated: true },
    })),
    {
      id: 'duplicates-expected',
      time: s.recoveryAt,
      kind: 'duplicate_records_expected',
      attrs: { count: seededDuplicates.length + status.state.duplicatesExpected, simulated: true },
    },
  ]
}

export { CONSEQUENCE_RULES, FEEDS }
