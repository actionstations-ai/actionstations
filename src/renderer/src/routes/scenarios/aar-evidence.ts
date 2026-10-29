// Whether an exercise produced anything the AAR/IP draft could rest on (#419, FR-9).

/** True when the facilitator state holds a note, hot wash item, decision or delivered row. */
export function hasRecordEvidence(state: {
  notes: Record<string, string>
  generalNotes: string
  hotwash: unknown[]
  decisions: unknown[]
  delivered: Record<string, unknown>
}): boolean {
  return (
    Object.values(state.notes).some((n) => n.trim()) ||
    !!state.generalNotes.trim() ||
    state.hotwash.length > 0 ||
    state.decisions.length > 0 ||
    Object.keys(state.delivered).length > 0
  )
}
