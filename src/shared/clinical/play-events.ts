// Clinical events from play (issue #1131). The clinical measures compare what players did with
// what happened in the world, as ground-truth events. Some of those events come from the
// simulators (the downtime model, a patient trajectory); the rest are things players or the
// controller do during the exercise and record on a decision form:
//   - `report_unit_on_downtime` (players): a unit is working on downtime procedures;
//   - `communicate_critical_result` (players): a critical result was phoned and read back;
//   - `log_systems_event` and `log_clinical_event` (the controller's log): an event of the
//     simulated world the controller scripts by hand, such as a harm event or a triage victim.
// This turns those decisions into events, attaches communications to the critical results they
// answer, and puts decision times on the case clock. Pure: no Node imports, no clock.
import type { GroundTruthEvent, MetricDecision } from '../schemas/metrics'

const key = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v))
const names = (v: string): string[] =>
  v
    .split(/\r?\n|;|,|\band\b/i)
    .map((s) => s.replace(/^\s*\d+[.)]?\s*/, '').trim())
    .filter(Boolean)

/** The controller log's choices (option ids) and the event kind each records. */
export const SYSTEMS_LOG_KINDS: Record<string, string> = {
  unit_on_downtime_procedures: 'unit_on_downtime',
  critical_result_reported: 'critical_result',
  order_or_result_lost: 'order_result_record',
  order_or_result_delayed: 'order_result_record',
  order_or_result_duplicated: 'order_result_record',
  duplicate_record_created: 'duplicate_record_created',
}

export const CLINICAL_LOG_KINDS: Record<string, string> = {
  abnormal_early_warning_score: 'abnormal_early_warning_score',
  critical_lab_result: 'critical_lab',
  triage_victim_arrives: 'triage_victim',
  infection_case_found: 'infection_case',
  harm_event: 'harm_event',
  outage_begins: 'downtime_start',
  evacuation_priority_key: 'evacuation_priority',
}

function systemsAttrs(choice: string, d: MetricDecision): Record<string, unknown> {
  const f = d.fields
  if (choice.startsWith('order_or_result_'))
    return {
      messageClass: text(f.message_class) || 'unclassified',
      outcome: choice.replace('order_or_result_', ''),
      count: Math.max(1, Math.round(Number(f.count) || 1)),
    }
  if (choice === 'critical_result_reported')
    return { patient: text(f.patient), test: text(f.detail) }
  return {}
}

function clinicalAttrs(kind: string, d: MetricDecision): Record<string, unknown> {
  const f = d.fields
  const patient = text(f.patient)
  const detail = text(f.detail)
  const expected = text(f.expected)
  switch (kind) {
    case 'critical_lab':
      return { patient, test: detail }
    case 'triage_victim':
      return { patient, tag: expected }
    case 'infection_case':
      return {
        room: patient,
        organism: detail,
        expectedAction: expected,
        expectedPrecautions: text(f.precautions),
      }
    case 'harm_event':
      return { patient, title: detail }
    case 'downtime_start':
      return { system: detail }
    case 'evacuation_priority':
      return { order: names(expected) }
    default:
      return { patient }
  }
}

/** Events the controller logged and units players reported on downtime procedures. */
export function eventsFromDecisions(decisions: readonly MetricDecision[]): GroundTruthEvent[] {
  const out: GroundTruthEvent[] = []
  for (const d of decisions) {
    const choice = key(d.fields.event)
    const unit = text(d.fields.unit)
    const base = { id: `logged-${d.id}`, time: d.time, attrs: { logged: true } }
    if (d.kind === 'report_unit_on_downtime' && unit)
      out.push({ ...base, kind: 'unit_on_downtime', area: unit })
    else if (d.kind === 'log_systems_event' && SYSTEMS_LOG_KINDS[choice])
      out.push({
        ...base,
        kind: SYSTEMS_LOG_KINDS[choice]!,
        ...(unit ? { area: unit } : {}),
        attrs: { ...base.attrs, ...systemsAttrs(choice, d) },
      })
    else if (d.kind === 'log_clinical_event' && CLINICAL_LOG_KINDS[choice]) {
      const kind = CLINICAL_LOG_KINDS[choice]!
      out.push({ ...base, kind, attrs: { ...base.attrs, ...clinicalAttrs(kind, d) } })
    }
  }
  return out
}

/** Whether a typed patient or result names this critical result (id, record number or name). */
export function namesResult(typed: string, e: GroundTruthEvent): boolean {
  const t = typed.toLowerCase().trim()
  if (!t) return false
  if (key(t) === key(e.id)) return true
  const mrn = text(e.attrs.mrn)
  if (mrn && t.includes(mrn.toLowerCase())) return true
  const patient = text(e.attrs.patient).toLowerCase()
  if (!patient) return false
  // "TESTPATIENT, Aster (MRN 1234)": the given name is the part after the comma.
  const given = patient.split(',')[1]?.split('(')[0]?.trim()
  const bare = patient.split('(')[0]!.trim()
  return t === bare || (!!given && new RegExp(`\\b${given.replace(/[^a-z0-9-]/g, '')}\\b`).test(t))
}

/**
 * Critical results with the time each was communicated: the earliest "communicate critical
 * result" decision at or after the result that names it, each decision answering one result.
 */
export function withCommunications(
  events: readonly GroundTruthEvent[],
  decisions: readonly MetricDecision[],
): GroundTruthEvent[] {
  const calls = decisions
    .filter((d) => d.kind === 'communicate_critical_result')
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  const used = new Set<string>()
  return events.map((e) => {
    if (e.kind !== 'critical_result' || typeof e.attrs.communicatedAt === 'string') return e
    const call = calls.find(
      (c) =>
        !used.has(c.id) &&
        Date.parse(c.time) >= Date.parse(e.time) &&
        (namesResult(text(c.fields.patient), e) || namesResult(text(c.fields.test), e)),
    )
    if (!call) return e
    used.add(call.id)
    return { ...e, attrs: { ...e.attrs, communicatedAt: call.time } }
  })
}

// Decisions on the case clock: shared with every field's measures (src/shared/case-time.ts).
export { exerciseMinutes, onCaseClock } from '../case-time'
