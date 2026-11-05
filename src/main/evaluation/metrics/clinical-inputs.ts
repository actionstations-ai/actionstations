// What the clinical systems metrics read from the shared input bag (spec 0451 FR-13). They use
// the case data's ground-truth events and the decisions the session log recorded from the
// toolkit's decision forms (the form id is the decision kind). Event kinds:
//   unit_listed, unit_on_downtime (area = unit)    critical_result (attrs.communicatedAt)
//   order_result_record (attrs.messageClass, attrs.outcome)
//   reconciliation (area = unit, attrs.done, attrs.remaining), reconciliation_closed
//   duplicate_record_created
import type {
  CriticalResultInputs,
  DowntimeProceduresInputs,
  DuplicateRecordInputs,
  ReconciliationInputs,
  RestoreOrderInputs,
  SafeCareInputs,
} from './clinical'
import { listOf } from './clinical'
import { progressFromDecisions } from '@shared/clinical/reconciliation'
import type { MetricInputBag } from './registry'
import { ms } from './types'

const events = (b: MetricInputBag, kind: string) => (b.events ?? []).filter((e) => e.kind === kind)
const decisions = (b: MetricInputBag, kind: string) =>
  (b.decisions ?? []).filter((d) => d.kind === kind).sort((a, c) => ms(a.time) - ms(c.time))
const attrNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function pickDowntime(b: MetricInputBag): DowntimeProceduresInputs {
  const units = new Map<string, string | undefined>()
  for (const e of events(b, 'unit_listed')) units.set(e.area ?? e.id, undefined)
  for (const e of events(b, 'unit_on_downtime')) {
    const name = e.area ?? e.id
    const prev = units.get(name)
    units.set(name, prev && ms(prev) < ms(e.time) ? prev : e.time)
  }
  return {
    declaredAt: decisions(b, 'declare_downtime')[0]?.time ?? null,
    units: [...units]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([unit, readyAt]) => (readyAt ? { unit, readyAt } : { unit })),
  }
}

const OUTCOMES = ['ok', 'lost', 'delayed', 'duplicated'] as const

export function pickSafeCare(b: MetricInputBag): SafeCareInputs {
  return {
    records: events(b, 'order_result_record').map((e) => ({
      id: e.id,
      messageClass: String(e.attrs.messageClass ?? 'unclassified'),
      outcome: OUTCOMES.find((o) => o === e.attrs.outcome) ?? 'ok',
    })),
  }
}

export function pickCriticalResults(b: MetricInputBag): CriticalResultInputs {
  return {
    results: events(b, 'critical_result').map((e) => ({
      id: e.id,
      resultAt: e.time,
      ...(typeof e.attrs.communicatedAt === 'string'
        ? { communicatedAt: e.attrs.communicatedAt }
        : {}),
    })),
  }
}

export function pickReconciliation(b: MetricInputBag): ReconciliationInputs {
  const latest = new Map<string, { done: number; remaining: number }>()
  const all = events(b, 'reconciliation').sort((a, c) => ms(a.time) - ms(c.time))
  for (const e of all)
    latest.set(e.area ?? e.id, {
      done: attrNum(e.attrs.done),
      remaining: attrNum(e.attrs.remaining),
    })
  // Progress the units reported through the "Report reconciliation progress" decision form
  // replaces the case data's count for the same unit.
  const reports = progressFromDecisions(b.decisions ?? [])
  for (const u of reports) latest.set(u.unit, { done: u.done, remaining: u.remaining })
  const starts = [all[0]?.time, ...decisions(b, 'reconcile_unit').map((d) => d.time)].filter(
    (t): t is string => !!t,
  )
  const startedAt = starts.sort((x, y) => ms(x) - ms(y))[0]
  const closed =
    decisions(b, 'close_reconciliation')[0]?.time ??
    events(b, 'reconciliation_closed')[0]?.time ??
    decisions(b, 'return_to_normal')[0]?.time
  return {
    units: [...latest].map(([unit, v]) => ({ unit, ...v })),
    ...(startedAt ? { startedAt } : {}),
    ...(closed ? { completedAt: closed } : {}),
  }
}

export const pickDuplicates = (b: MetricInputBag): DuplicateRecordInputs => ({
  created: events(b, 'duplicate_record_created').length,
})

/** The players' latest "set restore order" decision; the priority comes from the config. */
export function pickRestoreOrder(b: MetricInputBag): RestoreOrderInputs {
  const last = decisions(b, 'set_restore_order').at(-1)
  return { order: listOf(last?.fields.ranking), priority: [] }
}
