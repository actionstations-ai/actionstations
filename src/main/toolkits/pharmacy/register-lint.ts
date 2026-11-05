// The pharmacy toolkit's format rules (spec 0463 FR-4) as field lint rules: they run on the
// injects of the types named below, so an inject with an NDC of the wrong shape, a temperature
// pair that does not convert, days on hand that are not on hand over usage or a Form 106 clock
// stated as one business day goes back to the model with the issue named. Importing this module
// registers them (lint-rules.ts lists it). A rule with nothing structured to check reports nothing.
import { doseProblem } from '../../../shared/clinical/dose'
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import {
  checkConcentrationUnits,
  checkDaysOnHand,
  checkExcursionStats,
  checkLossDates,
  checkLotBalance,
  checkNdcs,
  checkNoticeWording,
  checkQueueStatus,
  checkRangeLabel,
  checkTemperaturePairs,
  ndcMentions,
  type PharmacyProblem,
} from './lint'

type Fields = Record<string, unknown>

const isRecord = (v: unknown): v is Fields =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const rows = (v: unknown): Fields[] => (Array.isArray(v) ? v.filter(isRecord) : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const numOf = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

/** Every string in `value`, depth first, skipping the `figures` field (drawn data, not prose). */
function strings(value: unknown, out: string[] = [], key = ''): string[] {
  if (key === 'figures') return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) strings(v, out)
  else if (isRecord(value)) for (const [k, v] of Object.entries(value)) strings(v, out, k)
  return out
}

/** Every string stored under a property called `name`, at any depth. */
function valuesNamed(value: unknown, name: string, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) valuesNamed(v, name, out)
  else if (isRecord(value))
    for (const [k, v] of Object.entries(value)) {
      if (k === name && typeof v === 'string') out.push(v)
      else valuesNamed(v, name, out)
    }
  return out
}

const toIssues = (path: string, problems: PharmacyProblem[]): FieldLintIssue[] =>
  problems.map((p) => ({ path, message: p.message }))

const PHARMACY_TYPES = [
  'pharmacy_shortage_board',
  'pharmacy_shortage_assessment',
  'pharmacy_allocation_memo',
  'pharmacy_substitution_checklist',
  'pharmacy_queue_report',
  'pharmacy_outage_notice',
  'pharmacy_temperature_log',
  'pharmacy_excursion_report',
  'pharmacy_diversion_report',
  'pharmacy_loss_notice',
  'pharmacy_recall_notice',
  'pharmacy_compounding_record',
  'pharmacy_patient_letter',
] as const

/** Existing prose types a pharmacy exercise also uses. */
const PROSE_TYPES = [
  'email',
  'memo',
  'sitrep',
  'phone_call',
  'text_message',
  'official_letter',
  'regulatory_notice',
  'regulatory_report_form',
  'press_release',
  'field_report',
  'status_board',
] as const

const ndcFormat: FieldLintRule = {
  id: 'pharmacy_ndc_format',
  injectTypes: [...PHARMACY_TYPES, ...PROSE_TYPES],
  check(fields) {
    const written = [...valuesNamed(fields, 'ndc'), ...strings(fields).flatMap(ndcMentions)]
    return toIssues('fields', checkNdcs([...new Set(written)]))
  },
}

const TEMPERATURE_TYPES = [
  'pharmacy_temperature_log',
  'pharmacy_excursion_report',
  'pharmacy_patient_letter',
  'pharmacy_outage_notice',
  ...PROSE_TYPES,
] as const

const temperaturePair: FieldLintRule = {
  id: 'pharmacy_temperature_pair',
  injectTypes: TEMPERATURE_TYPES,
  check(fields) {
    const out = strings(fields).flatMap((t) => checkTemperaturePairs(t))
    const low = numOf(fields.rangeLowC)
    const high = numOf(fields.rangeHighC)
    if (low !== undefined && high !== undefined && str(fields.rangeLabel))
      out.push(...checkRangeLabel(str(fields.rangeLabel), low, high))
    const seen = new Set<string>()
    return toIssues('fields', out).filter((i) => !seen.has(i.message) && !!seen.add(i.message))
  },
}

const daysOnHand: FieldLintRule = {
  id: 'pharmacy_days_on_hand',
  injectTypes: ['pharmacy_shortage_board', 'pharmacy_shortage_assessment'],
  check(fields) {
    const board = rows(fields.rows).flatMap((r) => {
      const [onHand, usage, days] = [numOf(r.onHand), numOf(r.usagePerDay), numOf(r.daysOnHand)]
      return onHand === undefined || usage === undefined || days === undefined
        ? []
        : [{ drug: str(r.drug), onHand, usagePerDay: usage, daysOnHand: days }]
    })
    const op = isRecord(fields.operational) ? fields.operational : undefined
    const single =
      op &&
      numOf(op.onHand) !== undefined &&
      numOf(op.usagePerDay) !== undefined &&
      numOf(op.daysOnHand) !== undefined
        ? [
            {
              drug: str(fields.drug),
              onHand: op.onHand as number,
              usagePerDay: op.usagePerDay as number,
              daysOnHand: op.daysOnHand as number,
            },
          ]
        : []
    return toIssues('fields', checkDaysOnHand([...board, ...single]))
  },
}

const excursionStats: FieldLintRule = {
  id: 'pharmacy_excursion_stats',
  injectTypes: ['pharmacy_temperature_log', 'pharmacy_excursion_report'],
  check(fields) {
    const [lowC, highC, minC, maxC, minutesOutside] = [
      numOf(fields.rangeLowC),
      numOf(fields.rangeHighC),
      numOf(fields.minC),
      numOf(fields.maxC),
      numOf(fields.minutesOutside),
    ]
    if ([lowC, highC, minC, maxC, minutesOutside].some((x) => x === undefined)) return []
    const readings = rows(fields.readings).flatMap((r) =>
      numOf(r.tempC) === undefined
        ? []
        : [{ time: str(r.time), tempC: r.tempC as number, state: str(r.state) }],
    )
    return toIssues(
      'fields',
      checkExcursionStats({
        lowC: lowC!,
        highC: highC!,
        minC: minC!,
        maxC: maxC!,
        minutesOutside: minutesOutside!,
        readings,
      }),
    )
  },
}

const queueStatus: FieldLintRule = {
  id: 'pharmacy_queue_status',
  injectTypes: ['pharmacy_queue_report'],
  check(fields) {
    const queues = rows(fields.queues).flatMap((q) =>
      numOf(q.oldestMinutes) === undefined || numOf(q.targetMinutes) === undefined
        ? []
        : [
            {
              name: str(q.name),
              oldestMinutes: q.oldestMinutes as number,
              targetMinutes: q.targetMinutes as number,
              status: str(q.status),
            },
          ],
    )
    return toIssues('fields.queues', checkQueueStatus(queues))
  },
}

const substitutionUnits: FieldLintRule = {
  id: 'pharmacy_substitution_units',
  injectTypes: ['pharmacy_substitution_checklist', 'pharmacy_allocation_memo'],
  check(fields) {
    const out: FieldLintIssue[] = []
    rows(fields.checks)
      .filter((c) => str(c.item) === 'Concentration')
      .forEach((c, i) =>
        out.push(
          ...toIssues(`fields.checks[${i}]`, checkConcentrationUnits(str(c.from), str(c.to))),
        ),
      )
    return out
  },
}

const dosePlausibility: FieldLintRule = {
  id: 'pharmacy_dose_plausibility',
  injectTypes: ['pharmacy_substitution_checklist'],
  check(fields) {
    const d = fields.proposedDose
    if (!isRecord(d)) return []
    const p = doseProblem({ drug: str(d.drug), dose: str(d.dose), route: str(d.route) })
    return p ? [{ path: 'fields.proposedDose.dose', message: p }] : []
  },
}

const lotBalance: FieldLintRule = {
  id: 'pharmacy_lot_balance',
  injectTypes: ['pharmacy_recall_notice'],
  check(fields) {
    const lots = rows(fields.lots).flatMap((l) => {
      const [received, dispensed, onHand, returned] = [
        l.received,
        l.dispensed,
        l.onHand,
        l.returned,
      ].map(numOf)
      return [received, dispensed, onHand, returned].some((x) => x === undefined)
        ? []
        : [
            {
              lot: str(l.lot),
              received: received!,
              dispensed: dispensed!,
              onHand: onHand!,
              returned: returned!,
              ...(numOf(l.quarantined) !== undefined
                ? { quarantined: l.quarantined as number }
                : {}),
            },
          ]
    })
    return toIssues('fields.lots', checkLotBalance(lots))
  },
}

const noticeTiming: FieldLintRule = {
  id: 'pharmacy_notice_timing',
  injectTypes: ['pharmacy_loss_notice', 'pharmacy_diversion_report', ...PROSE_TYPES],
  check(fields) {
    const out = strings(fields).flatMap((t) => checkNoticeWording(t))
    const [d, n, f] = [str(fields.discoveredOn), str(fields.noticeDueBy), str(fields.form106DueBy)]
    if (d && n && f)
      out.push(...checkLossDates({ discoveredOn: d, noticeDueBy: n, form106DueBy: f }))
    const seen = new Set<string>()
    return toIssues('fields', out).filter((i) => !seen.has(i.message) && !!seen.add(i.message))
  },
}

for (const r of [
  ndcFormat,
  temperaturePair,
  daysOnHand,
  excursionStats,
  queueStatus,
  substitutionUnits,
  dosePlausibility,
  lotBalance,
  noticeTiming,
])
  registerFieldLintRule(r)
