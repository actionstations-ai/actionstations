// The clinical care metrics (spec 0452 FR-14): handoff quality, time to escalation, triage
// accuracy, evacuation order, staffing ratio exceedances, infection control decisions, disclosure
// timing and time to downtime workflows. Each reads ground-truth events the scenario scripted and
// the decisions of the clinical_care forms, shows its inputs and says what it cannot tell.
// The clinical judgment profile reads case study answers (clinical-judgment.ts).
import { z } from 'zod'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  CLINICAL_DECISION_KINDS as K,
  CLINICAL_EVENT_KINDS as E,
  attr,
  attrList,
  choiceStarts,
  decisionsOfKind,
  eventsOfKind,
  fieldText,
  minutesBetween,
  namesFromText,
  numberField,
  sameChoice,
  sameText,
} from './clinical-care-inputs'
import {
  mean,
  minutesText,
  NOT_AVAILABLE,
  ms,
  ratio,
  ratioText,
  type Metric,
  type MetricOutput,
} from './types'

export interface ClinicalInputs {
  events: GroundTruthEvent[]
  decisions: MetricDecision[]
}

const count = (n: number, of: number): string => `${n} of ${of}`

// ---- handoff quality --------------------------------------------------------------------------

export const HandoffQualityConfig = z.object({ decisionKind: z.string().default(K.rapidResponse) })
type HandoffQualityConfig = z.infer<typeof HandoffQualityConfig>

function computeHandoff(i: ClinicalInputs, config: HandoffQualityConfig): MetricOutput {
  const calls = decisionsOfKind(i.decisions, config.decisionKind)
  const level = (d: MetricDecision): 'complete' | 'partial' | 'none' => {
    const v = fieldText(d, 'sbar_done')
    return sameChoice(v, 'Yes, complete') ? 'complete' : choiceStarts(v, 'yes') ? 'partial' : 'none'
  }
  const rows = calls.map((d) => ({ d, level: level(d) }))
  const complete = rows.filter((r) => r.level === 'complete').length
  const partial = rows.filter((r) => r.level === 'partial').length
  return {
    metricId: 'handoff_quality',
    title: 'Handoff quality',
    config,
    inputs: [{ label: 'Rapid response calls recorded', value: String(calls.length) }],
    summary: [
      {
        label: 'Calls with a complete SBAR',
        value: calls.length ? count(complete, calls.length) : NOT_AVAILABLE,
      },
      { label: 'Calls with parts missing', value: String(partial) },
      { label: 'Calls with no SBAR', value: String(rows.length - complete - partial) },
      { label: 'Share complete', value: ratioText(ratio(complete, calls.length)) },
    ],
    tables: [
      {
        title: 'Calls',
        columns: ['Time', 'Patient', 'Trigger', 'SBAR'],
        rows: rows.map((r) => [
          r.d.time,
          fieldText(r.d, 'patient') || NOT_AVAILABLE,
          fieldText(r.d, 'trigger') || NOT_AVAILABLE,
          fieldText(r.d, 'sbar_done') || 'Not recorded',
        ]),
      },
    ],
    caveats: [
      'Completeness comes from what the caller recorded on the call form; the content of the report is not read.',
      'Read-back is not on the call form, so it is not scored here.',
    ],
    data: { calls: calls.length, complete, partial },
  }
}

export const handoffQuality: Metric<HandoffQualityConfig, ClinicalInputs> = {
  id: 'handoff_quality',
  title: 'Handoff quality',
  configSchema: HandoffQualityConfig,
  compute: computeHandoff,
}

// ---- time to escalation -----------------------------------------------------------------------

export const TimeToEscalationConfig = z.object({
  callKind: z.string().default(K.rapidResponse),
  notifyKind: z.string().default(K.notify),
  /** Words in the notified party that count as a provider. */
  providerWords: z.string().default('provider,physician,doctor,md,attending,resident'),
  /** Target minutes from the first abnormal score to the call. */
  targetMinutes: z.number().positive().default(15),
})
type TimeToEscalationConfig = z.infer<typeof TimeToEscalationConfig>

function computeEscalation(i: ClinicalInputs, config: TimeToEscalationConfig): MetricOutput {
  const abnormal = eventsOfKind(i.events, E.abnormalScore)
  const labs = eventsOfKind(i.events, E.criticalLab)
  const calls = decisionsOfKind(i.decisions, config.callKind)
  const notifies = decisionsOfKind(i.decisions, config.notifyKind)
  const words = config.providerWords.split(',').map((w) => w.trim().toLowerCase())
  const isProvider = (d: MetricDecision) =>
    words.some((w) => fieldText(d, 'who').toLowerCase().includes(w))
  const scoreRows = abnormal.map((e) => {
    const patient = attr(e, 'patient')
    const call = calls.find(
      (c) => (!patient || sameText(fieldText(c, 'patient'), patient)) && ms(c.time) >= ms(e.time),
    )
    return { e, patient, call, minutes: call ? minutesBetween(e.time, call.time) : null }
  })
  const labRows = labs.map((e) => {
    const n = notifies.find((d) => isProvider(d) && ms(d.time) >= ms(e.time))
    return { e, n, minutes: n ? minutesBetween(e.time, n.time) : null }
  })
  const scoreTimes = scoreRows.map((r) => r.minutes).filter((m): m is number => m !== null)
  const labTimes = labRows.map((r) => r.minutes).filter((m): m is number => m !== null)
  const within = scoreTimes.filter((m) => m <= config.targetMinutes).length
  return {
    metricId: 'time_to_escalation',
    title: 'Time to escalation',
    config,
    inputs: [
      { label: 'Abnormal early warning scores scripted', value: String(abnormal.length) },
      { label: 'Critical lab values scripted', value: String(labs.length) },
      { label: 'Rapid response calls recorded', value: String(calls.length) },
    ],
    summary: [
      { label: 'Abnormal scores escalated', value: count(scoreTimes.length, abnormal.length) },
      { label: 'Mean minutes, first abnormal score to call', value: minutesText(mean(scoreTimes)) },
      {
        label: `Escalated within ${config.targetMinutes} minutes`,
        value: abnormal.length ? count(within, abnormal.length) : NOT_AVAILABLE,
      },
      {
        label: 'Critical labs followed by a provider notification',
        value: count(labTimes.length, labs.length),
      },
      {
        label: 'Mean minutes, critical lab to provider notification',
        value: minutesText(mean(labTimes)),
      },
    ],
    tables: [
      {
        title: 'Early warning score to rapid response call',
        columns: ['Patient', 'First abnormal score', 'Call', 'Minutes'],
        rows: scoreRows.map((r) => [
          r.patient || NOT_AVAILABLE,
          r.e.time,
          r.call?.time ?? 'No call',
          minutesText(r.minutes),
        ]),
      },
      {
        title: 'Critical lab to provider notification',
        columns: ['Lab', 'Result time', 'Notification', 'Minutes'],
        rows: labRows.map((r) => [
          attr(r.e, 'test') || r.e.id,
          r.e.time,
          r.n?.time ?? 'None',
          minutesText(r.minutes),
        ]),
      },
    ],
    caveats: [
      'A call matches a score by the patient named on the call form; enter the same patient name as the scripted event.',
      'A provider notification is a Notify decision after the critical result whose recipient names a provider word from the configuration.',
    ],
    data: {
      escalated: scoreTimes.length,
      meanMinutesToCall: mean(scoreTimes),
      meanMinutesToProvider: mean(labTimes),
    },
  }
}

export const timeToEscalation: Metric<TimeToEscalationConfig, ClinicalInputs> = {
  id: 'time_to_escalation',
  title: 'Time to escalation',
  configSchema: TimeToEscalationConfig,
  compute: computeEscalation,
}

// ---- triage accuracy --------------------------------------------------------------------------

export const TriageAccuracyConfig = z.object({ decisionKind: z.string().default(K.triage) })
type TriageAccuracyConfig = z.infer<typeof TriageAccuracyConfig>

/** Priority for care and transport: higher means sooner. Expectant ranks below Minor by design. */
const PRIORITY = ['deceased', 'expectant', 'minor', 'delayed', 'immediate'] as const
const rank = (text: string): number => PRIORITY.findIndex((c) => choiceStarts(text, c))

function computeTriage(i: ClinicalInputs, config: TriageAccuracyConfig): MetricOutput {
  const victims = eventsOfKind(i.events, E.victim)
  const calls = decisionsOfKind(i.decisions, config.decisionKind)
  const rows = victims.map((v) => {
    const key = attr(v, 'tag') || attr(v, 'category')
    const id = attr(v, 'patient') || v.id
    const call = calls.find(
      (c) => sameText(fieldText(c, 'patient'), id) || sameText(fieldText(c, 'patient'), v.id),
    )
    const given = call ? fieldText(call, 'category') : ''
    const k = rank(key)
    const g = rank(given)
    const outcome =
      !call || g < 0 || k < 0
        ? 'not triaged'
        : g === k
          ? 'correct'
          : g < k
            ? 'under-triage'
            : 'over-triage'
    return { v, id, key, given, outcome, call }
  })
  const judged = rows.filter((r) => r.outcome !== 'not triaged')
  const n = (o: string) => rows.filter((r) => r.outcome === o).length
  return {
    metricId: 'triage_accuracy',
    title: 'Triage accuracy',
    config,
    inputs: [
      { label: 'Scripted victims', value: String(victims.length) },
      { label: 'Triage decisions recorded', value: String(calls.length) },
    ],
    summary: [
      { label: 'Victims triaged', value: count(judged.length, victims.length) },
      {
        label: 'Correct',
        value: judged.length
          ? `${n('correct')} of ${judged.length} (${ratioText(ratio(n('correct'), judged.length))})`
          : NOT_AVAILABLE,
      },
      { label: 'Under-triage (a lower priority than the key)', value: String(n('under-triage')) },
      { label: 'Over-triage (a higher priority than the key)', value: String(n('over-triage')) },
      { label: 'Not triaged', value: String(n('not triaged')) },
    ],
    tables: [
      {
        title: 'Victims',
        columns: ['Victim', 'Key', 'Triaged as', 'Outcome', 'Minutes after arrival'],
        rows: rows.map((r) => [
          r.id,
          r.key || NOT_AVAILABLE,
          r.given || 'No decision',
          r.outcome,
          r.call ? minutesText(minutesBetween(r.v.time, r.call.time)) : NOT_AVAILABLE,
        ]),
      },
    ],
    caveats: [
      'The key is the category the scenario scripted for the victim; the findings on the tag decide it under the scripted method.',
      'Priority runs Immediate, Delayed, Minor, Expectant, Deceased. Triage accuracy in comparison studies is itself imperfect; the score shows agreement with the script, not clinical truth.',
    ],
    data: {
      victims: victims.length,
      triaged: judged.length,
      correct: n('correct'),
      under: n('under-triage'),
      over: n('over-triage'),
    },
  }
}

export const triageAccuracy: Metric<TriageAccuracyConfig, ClinicalInputs> = {
  id: 'triage_accuracy',
  title: 'Triage accuracy',
  configSchema: TriageAccuracyConfig,
  compute: computeTriage,
}

// ---- evacuation order -------------------------------------------------------------------------

export const EvacuationOrderConfig = z.object({
  decisionKind: z.string().default(K.evacuationOrder),
  /** How many of the first patients in the key count as the ones that must go first. */
  topN: z.number().int().min(1).max(10).default(3),
})
type EvacuationOrderConfig = z.infer<typeof EvacuationOrderConfig>

function computeEvacuation(i: ClinicalInputs, config: EvacuationOrderConfig): MetricOutput {
  const keyEvent = eventsOfKind(i.events, E.evacuationKey)[0]
  const keyList = keyEvent ? attrList(keyEvent, 'order') : []
  const decision = decisionsOfKind(i.decisions, config.decisionKind).at(-1)
  const given = decision ? namesFromText(fieldText(decision, 'ranking')) : []
  const known = keyList.filter((k) => given.some((g) => sameText(g, k)))
  const pos = (list: string[], name: string) => list.findIndex((x) => sameText(x, name))
  // Each key patient is off by the places between the lists; a patient left out is off by the
  // whole list length. The sum over the worst case (a full reversal, n squared over two) gives a share between 0 and 1.
  const n = keyList.length
  const off = keyList.reduce(
    (sum, k, idx) => sum + (pos(given, k) < 0 ? n : Math.abs(idx - pos(given, k))),
    0,
  )
  const worst = Math.floor((n * n) / 2)
  const agreement = decision && n > 1 ? Math.max(0, 1 - off / worst) : null
  const top = keyList.slice(0, config.topN)
  const topIn = top.filter((k) => given.slice(0, config.topN).some((g) => sameText(g, k)))
  return {
    metricId: 'evacuation_order',
    title: 'Evacuation order against the priority list',
    config,
    inputs: [
      { label: 'Patients in the priority list', value: String(keyList.length) },
      { label: 'Patients in the players’ order', value: String(given.length) },
      { label: 'Order recorded', value: decision?.time ?? 'None' },
    ],
    summary: [
      {
        label: `Key's first ${config.topN} among the players' first ${config.topN}`,
        value: top.length ? count(topIn.length, top.length) : NOT_AVAILABLE,
      },
      {
        label: 'Patients in both lists',
        value: keyList.length ? count(known.length, keyList.length) : NOT_AVAILABLE,
      },
      {
        label: 'Agreement with the key order',
        value: agreement === null ? NOT_AVAILABLE : ratioText(agreement),
      },
      {
        label: 'Reasons recorded',
        value: decision && fieldText(decision, 'reasons') ? 'Yes' : decision ? 'No' : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'Order',
        columns: ['Place', 'Key', 'Players'],
        rows: Array.from({ length: Math.max(keyList.length, given.length) }, (_, n) => [
          String(n + 1),
          keyList[n] ?? '',
          given[n] ?? '',
        ]),
      },
    ],
    caveats: [
      'The priority list is a scripted key with reasons, not a formula; the AHRQ evacuation guide frames the order as a decision. A different order with sound reasons is a discussion point, not an error.',
      'Patients are matched by name as typed; enter the names as they appear on the evacuation list. The last order recorded is the one scored.',
    ],
    data: { keyCount: keyList.length, given: given.length, topMatched: topIn.length, agreement },
  }
}

export const evacuationOrder: Metric<EvacuationOrderConfig, ClinicalInputs> = {
  id: 'evacuation_order',
  title: 'Evacuation order against the priority list',
  configSchema: EvacuationOrderConfig,
  compute: computeEvacuation,
}

// ---- staffing ratio exceedances ---------------------------------------------------------------

export const StaffingRatioConfig = z.object({
  assignKind: z.string().default(K.assign),
  escalateKind: z.string().default(K.escalate),
  /** Safe patients per nurse from the plan. */
  targetRatio: z.number().positive().default(5),
})
type StaffingRatioConfig = z.infer<typeof StaffingRatioConfig>

function computeStaffing(i: ClinicalInputs, config: StaffingRatioConfig): MetricOutput {
  const assigns = decisionsOfKind(i.decisions, config.assignKind)
  const escalations = decisionsOfKind(i.decisions, config.escalateKind)
  const rows = assigns
    .map((d) => ({ d, ratio: numberField(d, 'ratio') }))
    .filter((r): r is { d: MetricDecision; ratio: number } => r.ratio !== null)
  const over = rows.filter((r) => r.ratio > config.targetRatio)
  const first = over[0]
  const escalation = first ? escalations.find((e) => ms(e.time) >= ms(first.d.time)) : undefined
  return {
    metricId: 'staffing_ratio_exceedances',
    title: 'Staffing ratio exceedances',
    config,
    inputs: [
      { label: 'Assignments with a ratio recorded', value: String(rows.length) },
      { label: 'Target patients per nurse', value: String(config.targetRatio) },
      { label: 'Escalations recorded', value: String(escalations.length) },
    ],
    summary: [
      {
        label: 'Assignments above the target',
        value: rows.length ? count(over.length, rows.length) : NOT_AVAILABLE,
      },
      {
        label: 'Highest ratio assigned',
        value: rows.length ? String(Math.max(...rows.map((r) => r.ratio))) : NOT_AVAILABLE,
      },
      { label: 'First exceedance', value: first?.d.time ?? 'None' },
      {
        label: 'Minutes from first exceedance to an escalation',
        value:
          escalation && first
            ? minutesText(minutesBetween(first.d.time, escalation.time))
            : first
              ? 'No escalation'
              : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'Assignments over time',
        columns: ['Time', 'Patient', 'Nurse', 'Patients per nurse', 'Against the target'],
        rows: rows.map((r) => [
          r.d.time,
          fieldText(r.d, 'patient'),
          fieldText(r.d, 'nurse'),
          String(r.ratio),
          r.ratio > config.targetRatio ? 'Above' : 'Within',
        ]),
      },
    ],
    caveats: [
      'Ratios come from what players recorded on each assignment; the safe ratio depends on acuity, unit and state law and is set by the plan, not by this app.',
    ],
    data: {
      assignments: rows.length,
      exceeded: over.length,
      maxRatio: rows.length ? Math.max(...rows.map((r) => r.ratio)) : null,
    },
  }
}

export const staffingRatioExceedances: Metric<StaffingRatioConfig, ClinicalInputs> = {
  id: 'staffing_ratio_exceedances',
  title: 'Staffing ratio exceedances',
  configSchema: StaffingRatioConfig,
  compute: computeStaffing,
}

// ---- infection control ------------------------------------------------------------------------

export const InfectionControlConfig = z.object({ decisionKind: z.string().default(K.isolate) })
type InfectionControlConfig = z.infer<typeof InfectionControlConfig>

function computeInfection(i: ClinicalInputs, config: InfectionControlConfig): MetricOutput {
  const cases = eventsOfKind(i.events, E.infectionCase)
  const calls = decisionsOfKind(i.decisions, config.decisionKind)
  const rows = cases.map((c) => {
    const room = attr(c, 'room') || c.id
    const call = calls.find((d) =>
      fieldText(d, 'patients').toLowerCase().includes(room.toLowerCase()),
    )
    const wantAction = attr(c, 'expectedAction')
    const wantPrec = attr(c, 'expectedPrecautions')
    const actionOk = !!call && (!wantAction || sameChoice(fieldText(call, 'action'), wantAction))
    const precOk = !!call && (!wantPrec || sameChoice(fieldText(call, 'precautions'), wantPrec))
    return { c, room, call, actionOk, precOk, wantAction, wantPrec }
  })
  const decided = rows.filter((r) => r.call)
  const right = rows.filter((r) => r.actionOk && r.precOk)
  return {
    metricId: 'infection_control_decisions',
    title: 'Infection control decisions',
    config,
    inputs: [
      { label: 'Scripted cases', value: String(cases.length) },
      { label: 'Isolate or cohort decisions recorded', value: String(calls.length) },
    ],
    summary: [
      { label: 'Cases with a decision', value: count(decided.length, cases.length) },
      {
        label: 'Action and precautions as scripted',
        value: cases.length ? count(right.length, cases.length) : NOT_AVAILABLE,
      },
      {
        label: 'Mean minutes, case recognized to decision',
        value: minutesText(
          mean(decided.map((r) => minutesBetween(r.c.time, r.call!.time)).filter((m) => m >= 0)),
        ),
      },
    ],
    tables: [
      {
        title: 'Cases',
        columns: [
          'Room',
          'Scripted action',
          'Action taken',
          'Scripted precautions',
          'Precautions taken',
          'Minutes',
        ],
        rows: rows.map((r) => [
          r.room,
          r.wantAction || NOT_AVAILABLE,
          r.call ? fieldText(r.call, 'action') : 'No decision',
          r.wantPrec || NOT_AVAILABLE,
          r.call ? fieldText(r.call, 'precautions') || NOT_AVAILABLE : NOT_AVAILABLE,
          r.call ? minutesText(minutesBetween(r.c.time, r.call.time)) : NOT_AVAILABLE,
        ]),
      },
    ],
    caveats: [
      'A decision is matched to a case when its patients field names the room. Precautions follow the scripted organism; the key is the exercise plan’s, not a guideline.',
    ],
    data: { cases: cases.length, decided: decided.length, asScripted: right.length },
  }
}

export const infectionControlDecisions: Metric<InfectionControlConfig, ClinicalInputs> = {
  id: 'infection_control_decisions',
  title: 'Infection control decisions',
  configSchema: InfectionControlConfig,
  compute: computeInfection,
}

// ---- disclosure timing ------------------------------------------------------------------------

export const DisclosureTimingConfig = z.object({
  decisionKind: z.string().default(K.disclose),
  /** Target minutes from the event being identified to the first disclosure conversation. */
  targetMinutes: z.number().positive().default(60),
})
type DisclosureTimingConfig = z.infer<typeof DisclosureTimingConfig>

function computeDisclosure(i: ClinicalInputs, config: DisclosureTimingConfig): MetricOutput {
  const events = eventsOfKind(i.events, E.harmEvent)
  const calls = decisionsOfKind(i.decisions, config.decisionKind)
  const rows = events.map((e) => {
    const call = calls.find((c) => ms(c.time) >= ms(e.time))
    return { e, call, minutes: call ? minutesBetween(e.time, call.time) : null }
  })
  const done = rows.filter((r) => r.minutes !== null)
  const onTime = done.filter(
    (r) => r.minutes! <= (Number(r.e.attrs.targetMinutes) || config.targetMinutes),
  )
  return {
    metricId: 'disclosure_timing',
    title: 'Disclosure timing',
    config,
    inputs: [
      { label: 'Harm events scripted', value: String(events.length) },
      { label: 'Disclosure conversations recorded', value: String(calls.length) },
      { label: 'Target minutes', value: String(config.targetMinutes) },
    ],
    summary: [
      { label: 'Events disclosed', value: count(done.length, events.length) },
      {
        label: 'Disclosed within the target',
        value: events.length ? count(onTime.length, events.length) : NOT_AVAILABLE,
      },
      {
        label: 'Mean minutes from event to disclosure',
        value: minutesText(mean(done.map((r) => r.minutes!))),
      },
      {
        label: 'Conversations with a named lead',
        value: calls.length
          ? count(calls.filter((c) => fieldText(c, 'who_discloses')).length, calls.length)
          : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'Events',
        columns: ['Event', 'Identified', 'Disclosure', 'Lead', 'Minutes'],
        rows: rows.map((r) => [
          attr(r.e, 'title') || r.e.id,
          r.e.time,
          r.call?.time ?? 'None',
          r.call ? fieldText(r.call, 'who_discloses') || NOT_AVAILABLE : NOT_AVAILABLE,
          minutesText(r.minutes),
        ]),
      },
    ],
    caveats: [
      'The target comes from the scenario (an event can set its own targetMinutes) or the configuration; the AHRQ CANDOR toolkit describes an initial conversation within an hour as a goal, not a rule.',
    ],
    data: {
      events: events.length,
      disclosed: done.length,
      onTime: onTime.length,
      meanMinutes: mean(done.map((r) => r.minutes!)),
    },
  }
}

export const disclosureTiming: Metric<DisclosureTimingConfig, ClinicalInputs> = {
  id: 'disclosure_timing',
  title: 'Disclosure timing',
  configSchema: DisclosureTimingConfig,
  compute: computeDisclosure,
}

// ---- downtime workflows -----------------------------------------------------------------------

export const DowntimeWorkflowConfig = z.object({
  /** The decision form that starts paper workflows (from the clinical systems toolkit). */
  decisionKind: z.string().default('declare_downtime'),
  targetMinutes: z.number().positive().default(30),
})
type DowntimeWorkflowConfig = z.infer<typeof DowntimeWorkflowConfig>

function computeDowntime(i: ClinicalInputs, config: DowntimeWorkflowConfig): MetricOutput {
  const starts = eventsOfKind(i.events, E.downtimeStart)
  const calls = decisionsOfKind(i.decisions, config.decisionKind)
  const rows = starts.map((e) => {
    const call = calls.find((c) => ms(c.time) >= ms(e.time))
    return { e, call, minutes: call ? minutesBetween(e.time, call.time) : null }
  })
  const done = rows.filter((r) => r.minutes !== null)
  return {
    metricId: 'downtime_workflow_time',
    title: 'Time to downtime workflows',
    config,
    inputs: [
      { label: 'Downtime periods scripted', value: String(starts.length) },
      { label: `Decisions of kind "${config.decisionKind}"`, value: String(calls.length) },
    ],
    summary: [
      { label: 'Periods with paper workflows started', value: count(done.length, starts.length) },
      {
        label: 'Mean minutes, outage to paper workflows',
        value: minutesText(mean(done.map((r) => r.minutes!))),
      },
      {
        label: `Started within ${config.targetMinutes} minutes`,
        value: starts.length
          ? count(done.filter((r) => r.minutes! <= config.targetMinutes).length, starts.length)
          : NOT_AVAILABLE,
      },
    ],
    tables: [
      {
        title: 'Downtime periods',
        columns: ['Outage', 'Started', 'Minutes'],
        rows: rows.map((r) => [
          attr(r.e, 'system') || r.e.id,
          r.call?.time ?? 'Not started',
          minutesText(r.minutes),
        ]),
      },
    ],
    caveats: [
      'The decision form that starts paper workflows belongs to the clinical systems toolkit; set decisionKind to its form id if the scenario uses another.',
    ],
    data: {
      periods: starts.length,
      started: done.length,
      meanMinutes: mean(done.map((r) => r.minutes!)),
    },
  }
}

export const downtimeWorkflowTime: Metric<DowntimeWorkflowConfig, ClinicalInputs> = {
  id: 'downtime_workflow_time',
  title: 'Time to downtime workflows',
  configSchema: DowntimeWorkflowConfig,
  compute: computeDowntime,
}
