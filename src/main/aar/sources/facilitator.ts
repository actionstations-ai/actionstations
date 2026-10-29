// facilitator.json → the record (#419, FR-1): delivered rows, per-inject and general notes,
// the 3-Up / 3-Down items and the decision log. Refs: note:<rowId>, note:general, hw:<id>,
// dec:<id>. `byRole` becomes a role label; the state never held a person's name.
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { ExerciseRecord } from '@shared/schemas/aar'
import type { Scenario } from '@shared/schemas/scenario'

export type FacilitatorPart = Pick<ExerciseRecord, 'delivered' | 'notes' | 'hotwash' | 'decisions'>

export const GENERAL_NOTE_REF = 'note:general'

/** Role label (abbreviation, else name) for a role id; the id itself when unknown. */
export function roleLabel(
  scenario: Pick<Scenario, 'roles'>,
  roleId: string | undefined,
): string | undefined {
  if (!roleId) return undefined
  const r = scenario.roles.find((x) => x.id === roleId)
  return r ? r.abbreviation || r.name : roleId
}

/** True when the facilitator captured anything worth drafting from. */
export function hasFacilitatorEvidence(state: FacilitatorState): boolean {
  return (
    Object.values(state.notes).some((n) => n.trim()) ||
    !!state.generalNotes.trim() ||
    state.hotwash.length > 0 ||
    state.decisions.length > 0 ||
    Object.keys(state.delivered).length > 0
  )
}

export function facilitatorPart(state: FacilitatorState, scenario: Scenario): FacilitatorPart {
  const order = new Map(scenario.msel.map((r, i) => [r.id, i]))
  const pos = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER
  const delivered = Object.entries(state.delivered)
    .map(([rowId, d]) => ({ rowId, exerciseTime: d.exerciseTime, at: d.at }))
    .sort((a, b) => pos(a.rowId) - pos(b.rowId))
  const notes: ExerciseRecord['notes'] = Object.entries(state.notes)
    .filter(([, text]) => text.trim())
    .sort(([a], [b]) => pos(a) - pos(b))
    .map(([rowId, text]) => ({ ref: `note:${rowId}`, rowId, text: text.trim() }))
  if (state.generalNotes.trim()) notes.push({ ref: GENERAL_NOTE_REF, text: state.generalNotes.trim() })
  return {
    delivered,
    notes,
    hotwash: state.hotwash.map((h) => ({
      ref: `hw:${h.id}`,
      kind: h.kind,
      text: h.text,
      ...(h.objectiveRef ? { objectiveRef: h.objectiveRef } : {}),
      ...(h.rowId ? { rowId: h.rowId } : {}),
      plusOnes: 0,
      promoted: false,
    })),
    decisions: state.decisions.map((d) => {
      const byRole = roleLabel(scenario, d.byRole)
      return {
        ref: `dec:${d.id}`,
        ...(d.exerciseTime ? { exerciseTime: d.exerciseTime } : {}),
        ...(d.rowId ? { rowId: d.rowId } : {}),
        text: d.text,
        ...(byRole ? { byRole } : {}),
      }
    }),
  }
}
