// Format rules of the spill and plume toolkit (spec 0455 FR-4), registered with the field lint
// registry so they run on the injects of the types the toolkit adds and feed the repair round of
// the inject text stage. Two rules:
//  - spill.notification_order: in a notification record the Qualified Individual is told before
//    the National Response Center is called, the times do not run backward, and a call to the
//    NRC is a report, not a request for resources;
//  - spill.units: a document states volumes in one unit (barrels, gallons or cubic meters), never
//    a mix, so a conversion is done once outside the document.
// Only types the toolkit adds are named, so a scenario without it is checked as before.
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'

const QI = /\bqualified individual\b|\bQI\b/i
const NRC = /\bnational response center\b|\bNRC\b/i
const ASKS_FOR_RESOURCES =
  /\b(request(?:s|ed|ing)?|dispatch(?:es|ed)?|send(?:s|ing)?|asked? (?:for|to send))\b[^.;]{0,60}\b(responders?|boom|skimmers?|resources?|crews?|equipment|help)\b/i

interface Row {
  who: string
  time: string
  remarks: string
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

function rowsOf(fields: Record<string, unknown>): Row[] {
  const list = fields.notifications
  if (!Array.isArray(list)) return []
  return list.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>
    return { who: text(o.who), time: text(o.time), remarks: text(o.remarks) }
  })
}

/** Minutes after midnight from "2331", "23:31" or "0005"; undefined for anything else. */
export function minutesOf(t: string): number | undefined {
  const m = /^\s*([01]?\d|2[0-3]):?([0-5]\d)\s*$/.exec(t)
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined
}

export function notificationOrderIssues(fields: Record<string, unknown>): FieldLintIssue[] {
  const rows = rowsOf(fields)
  const issues: FieldLintIssue[] = []
  const qi = rows.findIndex((r) => QI.test(r.who))
  const nrc = rows.findIndex((r) => NRC.test(r.who))
  if (qi >= 0 && nrc >= 0 && nrc < qi)
    issues.push({
      path: `fields.notifications[${nrc}].who`,
      message:
        'The National Response Center is called by the responsible party after the Qualified Individual has been told; list the Qualified Individual first.',
    })
  if (nrc >= 0 && ASKS_FOR_RESOURCES.test(rows[nrc]!.remarks))
    issues.push({
      path: `fields.notifications[${nrc}].remarks`,
      message:
        'A call to the National Response Center is a report, not a request for resources: it sends no responders. Record the report number instead.',
    })
  for (let i = 1; i < rows.length; i++) {
    const a = minutesOf(rows[i - 1]!.time)
    const b = minutesOf(rows[i]!.time)
    if (a === undefined || b === undefined) continue
    // One wrap past midnight is fine; going back by more than twelve hours is not.
    if ((b - a + 1440) % 1440 > 720)
      issues.push({
        path: `fields.notifications[${i}].time`,
        message: `Notification times run backward here (${rows[i - 1]!.time} then ${rows[i]!.time}); list them in the order they were made.`,
      })
  }
  return issues
}

const UNITS: [string, RegExp][] = [
  ['barrels', /\b(?:barrels?|bbls?)\b/i],
  ['gallons', /\b(?:gallons?|gals?)\b/i],
  ['cubic meters', /\b(?:cubic met(?:er|re)s?|m3|m³)\b/i],
]

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) for (const x of v) strings(x, out)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out)
  return out
}

export function unitIssues(fields: Record<string, unknown>): FieldLintIssue[] {
  const all = strings(fields).join('\n')
  const used = UNITS.filter(([, re]) => re.test(all)).map(([name]) => name)
  if (used.length < 2) return []
  return [
    {
      path: 'fields',
      message: `Volumes are given in ${used.join(' and ')}; use one unit throughout the document (convert once, outside it).`,
    },
  ]
}

/** The inject types the toolkit adds. */
export const SPILL_TYPES = [
  'ics_232_resources_at_risk',
  'ics_233_open_action_tracker',
  'ics_234_work_analysis_matrix',
  'ics_202_incident_objectives',
  'ics_204_assignment_list',
  'uc_meeting_agenda',
  'aerial_observation_report',
  'shoreline_survey_report',
  'countermeasure_request',
  'wildlife_status_report',
  'closure_order',
  'claims_line_notice',
  'nrc_report_record',
  'prep_exercise_record',
] as const

export const spillLintRules: readonly FieldLintRule[] = [
  {
    id: 'spill.notification_order',
    injectTypes: ['nrc_report_record'],
    check: notificationOrderIssues,
  },
  { id: 'spill.units', injectTypes: SPILL_TYPES, check: unitIssues },
]

for (const r of spillLintRules) registerFieldLintRule(r)
