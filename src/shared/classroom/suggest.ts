// Suggested outcome mappings (#720, FR-2). A deterministic word-overlap proposal between a course
// outcome and an exercise objective; no model is involved. The instructor confirms or discards
// every suggestion, and an unconfirmed mapping never feeds a score.
import type { Outcome, OutcomeMapping } from '../schemas/classroom'

const STOP = new Set(
  (
    'a an and are as at be by for from has have in into is it its of on or that the their this to ' +
    'was were will with can could should would during after before about across within using use ' +
    'student students exercise participants team'
  ).split(' '),
)

/** Lower-cased words of four or more letters (or any acronym), stop words removed, lightly stemmed. */
export function keywords(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().match(/[a-z][a-z0-9-]*/g) ?? []) {
    if (STOP.has(raw)) continue
    const word = raw.replace(/(ing|ed|es|s)$/, (m) => (raw.length - m.length >= 4 ? '' : m))
    if (word.length >= 4) out.add(word)
  }
  return out
}

export interface ObjectiveText {
  id: string
  name: string
  text: string
}

export interface MappingSuggestion {
  outcomeId: string
  objectiveId: string
  /** Shared words, shown as the reason. */
  shared: string[]
  /** Shared words as a share of the smaller word list, 0 to 1. */
  score: number
}

/** Pairs sharing at least two words, best first, skipping pairs already mapped. */
export function suggestMappings(
  outcomes: Outcome[],
  objectives: ObjectiveText[],
  existing: Pick<OutcomeMapping, 'outcomeId' | 'kind' | 'ref'>[] = [],
): MappingSuggestion[] {
  const mapped = new Set(
    existing.filter((m) => m.kind === 'objective').map((m) => `${m.outcomeId}\0${m.ref}`),
  )
  const found: MappingSuggestion[] = []
  for (const outcome of outcomes) {
    const a = keywords(outcome.text)
    for (const objective of objectives) {
      if (mapped.has(`${outcome.id}\0${objective.id}`)) continue
      const b = keywords(`${objective.name} ${objective.text}`)
      const shared = [...a].filter((w) => b.has(w)).sort()
      if (shared.length < 2) continue
      found.push({
        outcomeId: outcome.id,
        objectiveId: objective.id,
        shared,
        score: shared.length / Math.min(a.size, b.size),
      })
    }
  }
  return found.sort((x, y) => y.score - x.score || x.outcomeId.localeCompare(y.outcomeId))
}
