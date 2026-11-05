// Decisions in Facilitate (spec 0448 FR-14): turning what the facilitator typed into a
// submission, the problems to show, and one list of every decision from the session log and the
// facilitator file. Pure, so it is tested without a window.
import { mergeDecisionRecords } from '@shared/decisions/records'
import {
  fieldProblem,
  type DecisionField,
  type DecisionForm,
  type DecisionRecord,
  type DecisionValue,
} from '@shared/schemas/decisions'

export interface EntryDraft {
  values: Readonly<Record<string, string>>
  areaId?: string | undefined
  roleId?: string | undefined
}

export const EMPTY_ENTRY: EntryDraft = { values: {} }

const asValue = (f: DecisionField, raw: string | undefined): DecisionValue | undefined => {
  const text = raw?.trim()
  if (!text) return undefined
  if (f.type !== 'number') return text
  const n = Number(text)
  return Number.isFinite(n) ? n : text
}

/** Problems by field id, for the fields that have one. */
export function entryProblems(form: DecisionForm, draft: EntryDraft): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of form.fields) {
    if (f.type === 'area') {
      if (f.required && !draft.areaId) out[f.id] = `${f.label} is required`
      continue
    }
    const problem = fieldProblem(f, asValue(f, draft.values[f.id]))
    if (problem) out[f.id] = problem
  }
  return out
}

/** The request for `live:decision-record`, without the project and scenario. */
export function entryRequest(form: DecisionForm, draft: EntryDraft) {
  const fields: Record<string, DecisionValue> = {}
  for (const f of form.fields) {
    if (f.type === 'area') continue
    const v = asValue(f, draft.values[f.id])
    if (v !== undefined) fields[f.id] = v
  }
  return {
    formId: form.id,
    fields,
    ...(draft.areaId ? { area: { areaId: draft.areaId } } : {}),
    ...(draft.roleId ? { roleId: draft.roleId } : {}),
  }
}

/** Every decision, newest first: the running session's, then the facilitator file's. */
export function allDecisions(
  live: readonly DecisionRecord[],
  saved: readonly DecisionRecord[] | undefined,
): DecisionRecord[] {
  return mergeDecisionRecords(live, saved ?? []).reverse()
}

/** One line for the list: the title, then the answers in form order. */
export function decisionSummary(record: DecisionRecord, form: DecisionForm | undefined): string {
  const parts: string[] = []
  for (const f of form?.fields ?? []) {
    if (f.type === 'area') {
      if (record.area) parts.push(record.area.name)
      continue
    }
    const v = record.fields[f.id]
    if (v === undefined) continue
    const label = f.type === 'choice' ? (f.options.find((o) => o.id === v)?.label ?? v) : v
    parts.push(f.type === 'number' && f.unit ? `${label} ${f.unit}` : String(label))
  }
  if (!form) {
    if (record.area) parts.push(record.area.name)
    for (const v of Object.values(record.fields)) parts.push(String(v))
  }
  return parts.join(' · ')
}
