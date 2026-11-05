// The logistics toolkit's format rules (spec 0462 FR-4) as field lint rules, run on the injects of
// the types below so a recall letter missing its hazard or a status report whose counts do not add
// up goes back to the model with the issue named. Importing this module registers them
// (lint-rules.ts lists it). A rule with nothing structured to check reports nothing.
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import {
  checkLotCodeShapes,
  checkRecallCounts,
  checkRecallLetter,
  splitLots,
  type LogisticsLintProblem,
  type RecallCounts,
} from './lint'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string => (typeof v === 'string' ? v : '')
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

/** Lot codes an inject states: products[].lots, foods[].lots, lots[], entries[].lot. */
export function lotsOf(fields: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const key of ['products', 'foods'])
    for (const row of Array.isArray(fields[key]) ? (fields[key] as unknown[]) : [])
      if (isRecord(row)) out.push(...splitLots(text(row.lots)))
  out.push(...list(fields.lots).flatMap(splitLots))
  for (const row of Array.isArray(fields.entries) ? fields.entries : [])
    if (isRecord(row)) out.push(...splitLots(text(row.lot)))
  return out
}

const issues = (path: string, ps: LogisticsLintProblem[]): FieldLintIssue[] =>
  ps.map((p) => ({ path, message: p.message }))

const lotFormat: FieldLintRule = {
  id: 'logistics_lot_code_format',
  injectTypes: [
    'product_recall_notice',
    'recall_consignee_letter',
    'temperature_excursion_alert',
    'customer_complaint_log',
    'fda_records_request_letter',
  ],
  check: (fields) => issues('fields', checkLotCodeShapes(lotsOf(fields))),
}

const recallLetter: FieldLintRule = {
  id: 'logistics_recall_letter_complete',
  injectTypes: ['recall_consignee_letter'],
  check: (fields) =>
    issues(
      'fields',
      checkRecallLetter({
        recallClass: text(fields.recallClass),
        urgent: fields.urgent === true,
        lots: lotsOf(fields),
        reason: text(fields.reason),
        hazard: text(fields.hazard),
        instructions: list(fields.instructions),
        contact: text(fields.contact),
        replyBy: text(fields.replyBy),
      }),
    ),
}

const recallCounts: FieldLintRule = {
  id: 'logistics_recall_counts_reconcile',
  injectTypes: ['recall_status_report'],
  check(fields) {
    const c = isRecord(fields.consignees) ? fields.consignees : undefined
    const p = isRecord(fields.product) ? fields.product : undefined
    const counts: RecallCounts = {}
    if (
      c &&
      num(c.total) !== undefined &&
      num(c.notified) !== undefined &&
      num(c.responded) !== undefined
    )
      counts.consignees = {
        total: num(c.total)!,
        notified: num(c.notified)!,
        responded: num(c.responded)!,
        withProduct: num(c.withProduct),
      }
    if (
      p &&
      num(p.distributed) !== undefined &&
      num(p.recovered) !== undefined &&
      num(p.outstanding) !== undefined
    )
      counts.product = {
        distributed: num(p.distributed)!,
        recovered: num(p.recovered)!,
        outstanding: num(p.outstanding)!,
      }
    return issues('fields', checkRecallCounts(counts))
  },
}

for (const r of [lotFormat, recallLetter, recallCounts]) registerFieldLintRule(r)
