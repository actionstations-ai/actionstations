/**
 * What a device knows about decision forms (spec 0448 FR-14): the forms the controller sent for
 * this seat, a draft being filled in, and what goes on the wire. Pure helpers, so the rules are
 * tested without a browser.
 */
import type { Opened } from '../../../shared/live/codec'
import type { DecisionSubmitPayload } from '../../../shared/live/schemas'
import {
  fieldProblem,
  formsForSeat,
  type AreaValue,
  type DecisionField,
  type DecisionForm,
  type DecisionValue,
} from '../../../shared/schemas/decisions'

export type FormMap = Readonly<Record<string, DecisionForm>>

/** What the person has typed or picked so far, by field id; numbers stay text until sent. */
export interface Draft {
  values: Readonly<Record<string, string>>
  /** The picked area's id. */
  areaId?: string | undefined
}

/** A decision this device sent (or queued), kept so the list can show it. */
export interface SentDecision {
  decisionId: string
  formId: string
  title: string
  at: number
  /** False while it waits in the outbox. */
  sent: boolean
}

/** Take a form from the controller. Only the host may send one. */
export function applyForm(forms: FormMap, msg: Opened<'decision.form'>): FormMap {
  if (msg.signedBy !== 'host') return forms
  const form = msg.payload.form
  return { ...forms, [form.id]: form }
}

/** The forms this seat may use, by title. */
export function formsForMe(forms: FormMap, roleId: string | undefined): DecisionForm[] {
  return formsForSeat(Object.values(forms), roleId).sort((a, b) => a.title.localeCompare(b.title))
}

export const EMPTY_DRAFT: Draft = { values: {} }

const asValue = (f: DecisionField, raw: string | undefined): DecisionValue | undefined => {
  const text = raw?.trim()
  if (!text) return undefined
  if (f.type !== 'number') return text
  const n = Number(text)
  return Number.isFinite(n) ? n : text
}

/** Per-field problems in form order, for the fields that have one. */
export function draftProblems(form: DecisionForm, draft: Draft): Record<string, string> {
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

/** The frame to send for a draft that has no problems. */
export function wireDecision(
  form: DecisionForm,
  draft: Draft,
  decisionId: string,
): DecisionSubmitPayload {
  const fields = form.fields.flatMap((f) => {
    if (f.type === 'area') return []
    const value = asValue(f, draft.values[f.id])
    return value === undefined ? [] : [{ fieldId: f.id, value }]
  })
  const area: AreaValue | undefined = draft.areaId ? { areaId: draft.areaId } : undefined
  return { decisionId, formId: form.id, fields, ...(area ? { area } : {}) }
}
