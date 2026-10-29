// Before/after editions of a knowledge check or confidence self-assessment keep the same
// questions (same ids, same pair keys) so their results compare. Saving one edition copies
// its sections into the other; title, intro, timing and status stay per edition.
import type { Survey, SurveySection } from '@shared/schemas'

/** `sections` for the other edition: a deep copy with confidence questions re-labelled. */
export function mirroredSections(sections: SurveySection[], edition: Survey['edition']) {
  return structuredClone(sections).map((s) => ({
    ...s,
    questions: s.questions.map((q) => (q.type === 'confidence' && edition ? { ...q, edition } : q)),
  }))
}

/** Whether saving `saved` should rewrite `pair`. */
export function shouldMirror(saved: Survey, pair: Survey | undefined): pair is Survey {
  return (
    !!pair &&
    pair.pairId === saved.id &&
    saved.pairId === pair.id &&
    !!saved.edition &&
    !!pair.edition &&
    saved.edition !== pair.edition &&
    JSON.stringify(mirroredSections(saved.sections, pair.edition)) !== JSON.stringify(pair.sections)
  )
}
