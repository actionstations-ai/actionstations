// The pharmacy metrics (spec 0463 FR-11): patients affected by a shortage, safe substitutions,
// cold chain response, diversion notice clocks, recall response and queue response. Each reads
// ground-truth events the simulated scenario wrote (the `*_model` events carry the model's own
// parameters) and the decisions of the pharmacy forms, whose form id is the decision kind. The
// shortage, queue and cold chain metrics rerun the model with the team's decisions applied and
// compare with the model left alone, so what a decision changed is shown, not guessed. Every
// result shows its inputs and what it cannot tell, and says n/a when nothing was decided.
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { addCalendarDays, nextBusinessDay } from '../../../shared/pharmacy/arithmetic'
import { QueueParams, runQueue } from '../../toolkits/pharmacy/simulate/queue'
import { ShortageParams, runShortage } from '../../toolkits/pharmacy/simulate/shortage'
import { choiceKey, decisionsOfKind, eventsOfKind, fieldText, minutesBetween } from './media-inputs'
import { minutesText, NOT_AVAILABLE, ms, type Metric, type MetricOutput } from './types'

/** Decision kinds: the ids of the pharmacy toolkit's decision forms. */
export const PHARMACY_DECISION_KINDS = {
  setAllocation: 'pharmacy_set_allocation',
  approveSubstitution: 'pharmacy_approve_substitution',
  restrictUse: 'pharmacy_restrict_use',
  sourceSupply: 'pharmacy_source_supply',
  holdOrReleaseBatch: 'pharmacy_hold_or_release_batch',
  quarantineProduct: 'pharmacy_quarantine_product',
  viabilityDecision: 'pharmacy_viability_decision',
  moveProduct: 'pharmacy_move_product',
  startInvestigation: 'pharmacy_start_investigation',
  notify: 'pharmacy_notify',
  switchWorkflow: 'pharmacy_switch_manual_workflow',
  reassignStaff: 'pharmacy_reassign_staff',
} as const
const K = PHARMACY_DECISION_KINDS

/** Event kinds the pharmacy generators write. */
export const PHARMACY_EVENT_KINDS = {
  shortageModel: 'shortage_model',
  queueModel: 'queue_model',
  coldChainModel: 'cold_chain_model',
  alarm: 'alarm',
  viability: 'product_viability',
  discovery: 'discovery',
  recallNotice: 'recall_notice',
  substitutionError: 'substitution_error',
} as const
const E = PHARMACY_EVENT_KINDS

export interface PharmacyInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const DAY_MS = 86_400_000
const MIN_MS = 60_000
const num = (d: MetricDecision, key: string): number | null => {
  const v = d.fields[key]
  const n = typeof v === 'number' ? v : Number(v)
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? null : n
}
const attrText = (e: GroundTruthEvent, key: string): string => {
  const v = e.attrs[key]
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}
const attrNum = (e: GroundTruthEvent, key: string): number | null => {
  const v = e.attrs[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const same = (a: string, b: string): boolean => choiceKey(a) === choiceKey(b)
/** Whether a notify decision's recipient (stored as an option id) contains the words. */
const recipientHas = (d: MetricDecision, words: string): boolean =>
  choiceKey(fieldText(d, 'recipient')).includes(choiceKey(words))
const round1 = (x: number): number => Math.round(x * 10) / 10

const noModel = (id: string, title: string, what: string): MetricOutput => ({
  metricId: id,
  title,
  config: {},
  inputs: [{ label: 'Scripted model', value: 'none in the scenario data' }],
  summary: [{ label: title, value: NOT_AVAILABLE }],
  caveats: [`The scenario has no ${what}, so this metric has nothing to compare decisions with.`],
  tables: [],
  data: {},
})

const NoConfig = z.object({})
type NoConfig = z.infer<typeof NoConfig>

// ---- patients affected by a shortage -------------------------------------------------------

function computeShortage(i: PharmacyInputs, config: NoConfig): MetricOutput {
  const ev = eventsOfKind(i.events, E.shortageModel)[0]
  const params = ev ? ShortageParams.safeParse(ev.attrs.params) : undefined
  if (!ev || !params?.success)
    return {
      ...noModel('pharmacy_shortage_impact', 'Patients affected by the shortage', 'shortage model'),
      config,
    }
  const p = params.data
  const t0 = ms(ev.time)
  const allocs = decisionsOfKind(i.decisions, K.setAllocation).flatMap((d) => {
    const percent = num(d, 'percent')
    return percent === null || percent < 0 || percent > 100
      ? []
      : [{ day: Math.max(0, Math.floor((ms(d.time) - t0) / DAY_MS)), percent, d }]
  })
  const baseline = runShortage(p)
  const run = runShortage({
    ...p,
    allocationChanges: [
      ...p.allocationChanges,
      ...allocs.map(({ day, percent }) => ({ day, percent })),
    ],
  })
  const sum = (key: 'restricted' | 'shortOfStock') =>
    round1(run.days.reduce((n, d) => n + d[key], 0))
  const subs = decisionsOfKind(i.decisions, K.approveSubstitution)
  const when = (d: number | undefined): string =>
    d === undefined ? `none in ${p.horizonDays} days` : `day ${d}`
  return {
    metricId: 'pharmacy_shortage_impact',
    title: 'Patients affected by the shortage',
    config,
    inputs: [
      { label: 'Drug', value: p.drug },
      { label: 'On hand and usage', value: `${p.onHand} ${p.unit}, ${p.usagePerDay} per day` },
      { label: 'Allocation decisions recorded', value: String(allocs.length) },
      { label: 'Substitutions approved', value: String(subs.length) },
    ],
    summary: [
      { label: 'Doses unmet over the period, with your decisions', value: String(run.totalUnmet) },
      { label: 'Doses unmet if nothing had been decided', value: String(baseline.totalUnmet) },
      { label: 'Held back by allocation while stock lasted', value: String(sum('restricted')) },
      { label: 'Not served because the stock was empty', value: String(sum('shortOfStock')) },
      { label: 'First day the stock ran short, with your decisions', value: when(run.stockoutDay) },
      {
        label: 'First day the stock would have run short otherwise',
        value: when(baseline.stockoutDay),
      },
      {
        label: 'Time to the first allocation decision',
        value: allocs.length
          ? minutesText(minutesBetween(ev.time, allocs[0]!.d.time))
          : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'Day by day, with your decisions',
        columns: ['Day', 'Stock at start', 'Allocation', 'Served', 'Held back', 'Short of stock'],
        rows: run.days.map((d) => [
          String(d.day),
          String(d.stock),
          `${d.allocationPercent}%`,
          String(d.served),
          String(d.restricted),
          String(d.shortOfStock),
        ]),
      },
    ],
    caveats: [
      'A teaching model, not a forecast: the same usage every day, allocation applied to all units alike, deliveries only as scripted.',
      'Restricting early holds doses back now to delay the stockout; the totals show the trade, not which patients went without. Tiers are not modeled separately.',
      'An allocation decision takes effect on the exercise day of the decision, counted from the start of the scripted model.',
    ],
    data: {
      unmetWithDecisions: run.totalUnmet,
      unmetBaseline: baseline.totalUnmet,
      stockoutDay: run.stockoutDay ?? null,
      baselineStockoutDay: baseline.stockoutDay ?? null,
    },
  }
}

export const shortageImpact: Metric<NoConfig, PharmacyInputs> = {
  id: 'pharmacy_shortage_impact',
  title: 'Patients affected by the shortage',
  configSchema: NoConfig,
  compute: computeShortage,
}

// ---- safe substitutions --------------------------------------------------------------------

const CHECKLIST = ['Passed', 'Passed with conditions', 'Failed'] as const

function computeSubstitutions(i: PharmacyInputs, config: NoConfig): MetricOutput {
  const subs = decisionsOfKind(i.decisions, K.approveSubstitution)
  const errors = eventsOfKind(i.events, E.substitutionError)
  const label = (d: MetricDecision): string =>
    CHECKLIST.find((c) => same(c, fieldText(d, 'checklist_result'))) ?? 'Not recorded'
  const passed = subs.filter(
    (d) => label(d) === 'Passed' || label(d) === 'Passed with conditions',
  ).length
  const failed = subs.filter((d) => label(d) === 'Failed').length
  const hit = (d: MetricDecision) =>
    errors.filter((e) => same(attrText(e, 'alternative'), fieldText(d, 'alternative')))
  const caused = subs.filter((d) => hit(d).length > 0)
  return {
    metricId: 'pharmacy_safe_substitutions',
    title: 'Safe substitutions',
    config,
    inputs: [
      { label: 'Substitutions approved', value: String(subs.length) },
      { label: 'Substitution errors scripted', value: String(errors.length) },
    ],
    summary: [
      {
        label: 'Approved with a passed checklist',
        value: subs.length ? `${passed} of ${subs.length}` : NOT_AVAILABLE,
      },
      {
        label: 'Approved with a failed checklist',
        value: subs.length ? String(failed) : NOT_AVAILABLE,
      },
      {
        label: 'Approvals that led to a scripted error',
        value: subs.length ? String(caused.length) : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'Approvals',
        columns: ['Time', 'Alternative', 'Checklist', 'Told', 'Scripted error'],
        rows: subs.map((d) => [
          d.time,
          fieldText(d, 'alternative') || NOT_AVAILABLE,
          label(d),
          fieldText(d, 'told') || 'Not recorded',
          hit(d).length ? 'Yes' : 'No',
        ]),
      },
    ],
    caveats: [
      'The checklist result is what the team recorded; the checklist itself is not re-run here.',
      'A scripted error is one the scenario author planted for a specific alternative; a substitution with no planted error is not proof it was safe.',
    ],
    data: { approved: subs.length, passed, failed, errorsCaused: caused.length },
  }
}

export const safeSubstitutions: Metric<NoConfig, PharmacyInputs> = {
  id: 'pharmacy_safe_substitutions',
  title: 'Safe substitutions',
  configSchema: NoConfig,
  compute: computeSubstitutions,
}

// ---- cold chain response -------------------------------------------------------------------

const VIABILITY = ['Keep', 'Discard', 'Hold for manufacturer'] as const

function computeColdChain(i: PharmacyInputs, config: NoConfig): MetricOutput {
  const alarm = eventsOfKind(i.events, E.alarm)[0]
  const truth = eventsOfKind(i.events, E.viability)
  if (!alarm && !truth.length)
    return {
      ...noModel('pharmacy_cold_chain_response', 'Cold chain response', 'cold chain failure'),
      config,
    }
  const actions = [
    ...decisionsOfKind(i.decisions, K.moveProduct),
    ...decisionsOfKind(i.decisions, K.quarantineProduct),
    ...decisionsOfKind(i.decisions, K.viabilityDecision),
  ].sort((a, b) => ms(a.time) - ms(b.time))
  const first = alarm ? actions.find((d) => ms(d.time) >= ms(alarm.time)) : undefined
  const decisions = decisionsOfKind(i.decisions, K.viabilityDecision)
  const verdict = (d: MetricDecision) =>
    VIABILITY.find((v) => same(v, fieldText(d, 'decision'))) ?? 'Not recorded'
  const rows = truth.map((t) => {
    const lot = attrText(t, 'lot')
    const d = decisions.filter((x) => same(fieldText(x, 'lot'), lot)).at(-1)
    const usable = t.attrs.usable === true
    const v = d ? verdict(d) : 'No decision'
    const outcome =
      v === 'Keep'
        ? usable
          ? 'Saved'
          : 'Kept but not usable'
        : v === 'Discard'
          ? usable
            ? 'Discarded but usable'
            : 'Discarded correctly'
          : v === 'Hold for manufacturer'
            ? 'Held'
            : 'Undecided'
    return { t, lot, doses: attrNum(t, 'doses') ?? 0, usable, v, outcome }
  })
  const sumDoses = (f: (r: (typeof rows)[number]) => boolean) =>
    rows.filter(f).reduce((n, r) => n + r.doses, 0)
  return {
    metricId: 'pharmacy_cold_chain_response',
    title: 'Cold chain response',
    config,
    inputs: [
      { label: 'Alarm scripted', value: alarm ? alarm.time : 'none' },
      { label: 'Products in the viability table', value: String(truth.length) },
      { label: 'Actions recorded (move, quarantine, viability)', value: String(actions.length) },
    ],
    summary: [
      {
        label: 'Time from alarm to first action',
        value: alarm && first ? minutesText(minutesBetween(alarm.time, first.time)) : NOT_AVAILABLE,
      },
      { label: 'Doses at risk', value: String(sumDoses(() => true)) },
      {
        label: 'Doses saved by a correct keep',
        value: String(sumDoses((r) => r.outcome === 'Saved')),
      },
      {
        label: 'Doses discarded correctly',
        value: String(sumDoses((r) => r.outcome === 'Discarded correctly')),
      },
      {
        label: 'Doses discarded that were usable',
        value: String(sumDoses((r) => r.outcome === 'Discarded but usable')),
      },
      {
        label: 'Doses kept that were not usable',
        value: String(sumDoses((r) => r.outcome === 'Kept but not usable')),
      },
      {
        label: 'Doses still undecided or held',
        value: String(sumDoses((r) => r.outcome === 'Undecided' || r.outcome === 'Held')),
      },
    ],
    tables: [
      {
        title: 'Products',
        columns: ['Product', 'Lot', 'Doses', 'Scenario table says', 'Decision', 'Outcome'],
        rows: rows.map((r) => [
          attrText(r.t, 'product'),
          r.lot,
          String(r.doses),
          r.usable ? 'Usable' : 'Not usable',
          r.v,
          r.outcome,
        ]),
      },
    ],
    caveats: [
      'The viability table is the scenario author’s fictional product table, not manufacturer data and not guidance.',
      'Patients vaccinated from the unit after the alarm are not scripted, so recontact counts are not computed.',
    ],
    data: { atRisk: sumDoses(() => true), saved: sumDoses((r) => r.outcome === 'Saved') },
  }
}

export const coldChainResponse: Metric<NoConfig, PharmacyInputs> = {
  id: 'pharmacy_cold_chain_response',
  title: 'Cold chain response',
  configSchema: NoConfig,
  compute: computeColdChain,
}

// ---- diversion notice clocks ---------------------------------------------------------------

function computeDiversion(i: PharmacyInputs, config: NoConfig): MetricOutput {
  const found = eventsOfKind(i.events, E.discovery)[0]
  if (!found)
    return {
      ...noModel('pharmacy_diversion_clocks', 'Diversion handling', 'discovery event'),
      config,
    }
  const day = found.time.slice(0, 10)
  const noticeDue = `${nextBusinessDay(day)}T23:59:59Z`
  const form106Due = `${addCalendarDays(day, 45)}T23:59:59Z`
  const investigations = decisionsOfKind(i.decisions, K.startInvestigation)
  const notices = decisionsOfKind(i.decisions, K.notify)
  const toward = (word: string) => notices.find((d) => recipientHas(d, word))
  const dea = toward('field division')
  const f106 = toward('106')
  const board = toward('board')
  const patientStep = investigations.find((d) =>
    same(fieldText(d, 'action'), 'Review patient safety'),
  )
  const status = (d: MetricDecision | undefined, due: string): string =>
    !d ? 'Not recorded' : ms(d.time) <= ms(due) ? 'On time' : 'Late'
  return {
    metricId: 'pharmacy_diversion_clocks',
    title: 'Diversion handling',
    config,
    inputs: [
      { label: 'Discovery', value: found.time },
      { label: 'Investigation steps recorded', value: String(investigations.length) },
      { label: 'Notices recorded', value: String(notices.length) },
    ],
    summary: [
      {
        label: 'Discovery to first investigation step',
        value: investigations[0]
          ? minutesText(minutesBetween(found.time, investigations[0].time))
          : NOT_AVAILABLE,
      },
      { label: 'DEA Field Division notice due (one business day)', value: noticeDue },
      { label: 'DEA Field Division notice', value: status(dea, noticeDue) },
      { label: 'Form 106 due (45 days, electronic)', value: form106Due },
      { label: 'Form 106', value: status(f106, form106Due) },
      { label: 'State board notified', value: board ? 'Yes' : 'Not recorded' },
      { label: 'Patient safety step recorded', value: patientStep ? 'Yes' : 'No' },
    ],
    tables: [
      {
        title: 'Notices',
        columns: ['Time', 'Recipient', 'Minutes from discovery'],
        rows: notices.map((d) => [
          d.time,
          fieldText(d, 'recipient') || NOT_AVAILABLE,
          String(Math.round(minutesBetween(found.time, d.time))),
        ]),
      },
    ],
    caveats: [
      'The DEA notice is due within one business day of discovery and Form 106 within 45 days (21 CFR 1301.76(b)). Business days count weekends only and the day ends at 23:59 UTC; federal holidays and time zones are not applied.',
      'State rules vary and are not scored. The app states what the cited rule says and does not give legal advice.',
    ],
    data: {
      deaOnTime: dea ? ms(dea.time) <= ms(noticeDue) : null,
      form106OnTime: f106 ? ms(f106.time) <= ms(form106Due) : null,
    },
  }
}

export const diversionClocks: Metric<NoConfig, PharmacyInputs> = {
  id: 'pharmacy_diversion_clocks',
  title: 'Diversion handling',
  configSchema: NoConfig,
  compute: computeDiversion,
}

// ---- recall response -----------------------------------------------------------------------

function computeRecall(i: PharmacyInputs, config: NoConfig): MetricOutput {
  const notice = eventsOfKind(i.events, E.recallNotice)[0]
  if (!notice)
    return { ...noModel('pharmacy_recall_response', 'Recall response', 'recall notice'), config }
  const q = decisionsOfKind(i.decisions, K.quarantineProduct).find(
    (d) => ms(d.time) >= ms(notice.time),
  )
  const patients = decisionsOfKind(i.decisions, K.notify).find(
    (d) => ms(d.time) >= ms(notice.time) && recipientHas(d, 'patient'),
  )
  const quarantined = decisionsOfKind(i.decisions, K.quarantineProduct).reduce(
    (n, d) => n + (num(d, 'count') ?? 0),
    0,
  )
  const onHand = attrNum(notice, 'onHand')
  return {
    metricId: 'pharmacy_recall_response',
    title: 'Recall response',
    config,
    inputs: [
      { label: 'Notice', value: notice.time },
      {
        label: 'Units on hand to quarantine',
        value: onHand === null ? NOT_AVAILABLE : String(onHand),
      },
      {
        label: 'Patients to contact',
        value: String(attrNum(notice, 'patientsToContact') ?? NOT_AVAILABLE),
      },
    ],
    summary: [
      {
        label: 'Notice to quarantine',
        value: q ? minutesText(minutesBetween(notice.time, q.time)) : NOT_AVAILABLE,
      },
      {
        label: 'Notice to first patient contact',
        value: patients ? minutesText(minutesBetween(notice.time, patients.time)) : NOT_AVAILABLE,
      },
      { label: 'Units recorded as quarantined', value: String(quarantined) },
      {
        label: 'Share of on-hand units quarantined',
        value: onHand
          ? `${Math.round((Math.min(quarantined, onHand) / onHand) * 100)}%`
          : NOT_AVAILABLE,
      },
    ],
    tables: [],
    caveats: [
      'Quarantine counts are what the team recorded on the quarantine form; locations are not checked against the lot log.',
      'Patient contact is the time of the first notice to patients, not how many were reached.',
    ],
    data: { quarantined },
  }
}

export const recallResponse: Metric<NoConfig, PharmacyInputs> = {
  id: 'pharmacy_recall_response',
  title: 'Recall response',
  configSchema: NoConfig,
  compute: computeRecall,
}

// ---- queue response ------------------------------------------------------------------------

function computeQueue(i: PharmacyInputs, config: NoConfig): MetricOutput {
  const ev = eventsOfKind(i.events, E.queueModel)[0]
  const params = ev ? QueueParams.safeParse(ev.attrs.params) : undefined
  if (!ev || !params?.success)
    return { ...noModel('pharmacy_queue_response', 'Queue response', 'queue model'), config }
  const p = params.data
  const t0 = ms(ev.time)
  const changes = decisionsOfKind(i.decisions, K.reassignStaff).flatMap((d) => {
    const staff = num(d, 'staff')
    return staff === null || staff < 0 || staff > 20
      ? []
      : [
          {
            atMinute: Math.max(0, Math.round((ms(d.time) - t0) / MIN_MS)),
            staff: Math.round(staff),
          },
        ]
  })
  const baseline = runQueue(p)
  const run = runQueue({ ...p, staffChanges: [...p.staffChanges, ...changes] })
  const first = (r: typeof run): string =>
    r.firstOverTarget === undefined ? 'never' : `minute ${r.firstOverTarget}`
  return {
    metricId: 'pharmacy_queue_response',
    title: 'Queue response',
    config,
    inputs: [
      { label: 'Queue', value: p.queue },
      { label: 'Target for the oldest item', value: `${p.targetMinutes} min` },
      { label: 'Staffing decisions recorded', value: String(changes.length) },
    ],
    summary: [
      {
        label: 'Oldest item at the peak, with your decisions',
        value: `${run.peak.oldestMinutes} min`,
      },
      {
        label: 'Oldest item at the peak if nothing had changed',
        value: `${baseline.peak.oldestMinutes} min`,
      },
      { label: 'First over target, with your decisions', value: first(run) },
      { label: 'First over target otherwise', value: first(baseline) },
      {
        label: 'Items waiting at the end, with your decisions',
        value: String(run.points.at(-1)!.count),
      },
    ],
    tables: [],
    caveats: [
      'A teaching model with seeded arrivals and one service time per item; staffing decisions take effect at the minute they were recorded.',
    ],
    data: { peak: run.peak.oldestMinutes, baselinePeak: baseline.peak.oldestMinutes },
  }
}

export const queueResponse: Metric<NoConfig, PharmacyInputs> = {
  id: 'pharmacy_queue_response',
  title: 'Queue response',
  configSchema: NoConfig,
  compute: computeQueue,
}

export const PHARMACY_METRICS = [
  shortageImpact,
  safeSubstitutions,
  coldChainResponse,
  diversionClocks,
  recallResponse,
  queueResponse,
] as const
